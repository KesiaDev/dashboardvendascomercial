import { isApproved } from "@/lib/sales-status";
import { resolveSaleSeller } from "@/lib/sck-attribution";
import { eurBrlRate } from "@/lib/eur-rate";
import { roletaSpinFor, isPrimeiraVenda, valorCheioEur } from "@/lib/commission-rules";

/**
 * Geração automática de giros de roleta a partir das vendas da Hotmart.
 *
 * Regra confirmada em 04/09/2026: uma venda gera UM giro quando o produto é um
 * dos principais, o valor cheio é ≥ €200 e é primeira venda. Roleta Y a partir
 * de €1.000, senão X. O giro nasce com status "pendente"; o VALOR do prêmio
 * continua sendo lançado à mão na página da Roleta — é o único input manual
 * regular do processo.
 *
 * IDEMPOTÊNCIA: `source_sale_id` guarda a `transacao` da Hotmart, e antes de
 * inserir conferimos quais já existem. Rodar de novo não duplica. Isso importa
 * porque o webhook da Hotmart reenvia o mesmo evento em caso de falha, e o sync
 * reprocessa janelas que se sobrepõem.
 *
 * Nada aqui altera a ingestão de vendas: é uma etapa que roda DEPOIS do upsert
 * em `sales`, e uma falha aqui não pode derrubar o recebimento da venda.
 */

type PeriodRow = {
  id: number;
  data_inicio: string;
  data_fim: string;
  cotacao_eur: number | null;
};

type SaleForSpin = {
  transacao: string;
  produto_grupo: string;
  produto_original: string | null;
  status: string;
  data_venda: string | null;
  nome_afiliado: string | null;
  origem_checkout: string | null;
  nome_cliente: string | null;
  preco_total: number | null;
  moeda_original: string | null;
};

const SALE_COLS =
  "transacao,produto_grupo,produto_original,status,data_venda,nome_afiliado,origem_checkout,nome_cliente,preco_total,moeda_original";

export type RoletaSyncResult = {
  criados: number;
  /** Vendas elegíveis que já tinham giro — o caso normal ao reprocessar. */
  jaExistiam: number;
  /** Vendas que passariam na regra mas o período delas não tem cotação. */
  semCotacao: number;
  /** Vendas elegíveis sem vendedor identificável (afiliado nem SCK). */
  semVendedor: number;
};

const vazio = (): RoletaSyncResult => ({
  criados: 0,
  jaExistiam: 0,
  semCotacao: 0,
  semVendedor: 0,
});

/**
 * Gera os giros pendentes das vendas de uma janela de datas.
 *
 * @param db      client Supabase com privilégio de escrita
 * @param from    data inicial (YYYY-MM-DD), inclusive
 * @param to      data final (YYYY-MM-DD), inclusive
 */
export async function syncRoletaSpinsFromSales(
  db: any,
  from: string,
  to: string,
): Promise<RoletaSyncResult> {
  const out = vazio();

  const { data: salesRows, error } = await db
    .from("sales")
    .select(SALE_COLS)
    .gte("data_venda", from)
    .lte("data_venda", `${to}T23:59:59`)
    .limit(20000);
  if (error) throw new Error(error.message);
  const sales = (salesRows ?? []) as SaleForSpin[];
  if (sales.length === 0) return out;

  // Períodos que cobrem a janela — cada venda entra no período em que caiu, e a
  // cotação usada para o corte de €200/€1.000 é a DAQUELE período.
  const { data: periodRows, error: pe } = await db
    .from("bi_commission_periods")
    .select("id,data_inicio,data_fim,cotacao_eur")
    .lte("data_inicio", `${to}T23:59:59`)
    .gte("data_fim", from)
    .limit(200);
  if (pe) throw new Error(pe.message);
  const periods = (periodRows ?? []) as PeriodRow[];
  const periodOf = (dataVenda: string): PeriodRow | null => {
    const d = dataVenda.slice(0, 10);
    return periods.find((p) => d >= p.data_inicio && d <= p.data_fim) ?? null;
  };

  type Candidate = {
    transacao: string;
    period_id: number;
    seller_name: string;
    spin_date: string;
    wheel: string;
    client_name: string | null;
    product: string | null;
  };
  const candidatos: Candidate[] = [];

  for (const s of sales) {
    if (!isApproved(s.status) || !s.data_venda) continue;

    const period = periodOf(s.data_venda);
    if (!period) continue; // venda fora de qualquer período cadastrado

    const cotacao = eurBrlRate(period);
    if (cotacao === null) {
      // Sem cotação não dá para saber se a venda passa dos €200 — e inventar um
      // número aqui criaria ou deixaria de criar giros silenciosamente.
      out.semCotacao += 1;
      continue;
    }

    const wheel = roletaSpinFor({
      produto_grupo: s.produto_grupo,
      valor_cheio_eur: valorCheioEur(s.preco_total, s.moeda_original, cotacao),
      primeira_venda: isPrimeiraVenda(s.produto_grupo, s.produto_original),
    });
    if (!wheel) continue;

    const { seller } = resolveSaleSeller(s.nome_afiliado, s.origem_checkout);
    if (!seller) {
      out.semVendedor += 1;
      continue;
    }

    candidatos.push({
      transacao: s.transacao,
      period_id: period.id,
      seller_name: seller,
      spin_date: s.data_venda.slice(0, 10),
      wheel,
      client_name: s.nome_cliente,
      product: s.produto_original,
    });
  }

  if (candidatos.length === 0) return out;

  // Idempotência: não recriar giro de transação que já tem um.
  const ids = candidatos.map((c) => c.transacao);
  const existentes = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ex, error: ee } = await db
      .from("bi_roleta_spins")
      .select("source_sale_id")
      .in("source_sale_id", ids.slice(i, i + 200))
      .limit(400);
    if (ee) throw new Error(ee.message);
    for (const r of ex ?? []) if (r.source_sale_id) existentes.add(r.source_sale_id);
  }

  const novos = candidatos
    .filter((c) => !existentes.has(c.transacao))
    .map((c) => ({
      period_id: c.period_id,
      seller_name: c.seller_name,
      spin_date: c.spin_date,
      wheel: c.wheel,
      source: "hotmart",
      source_sale_id: c.transacao,
      client_name: c.client_name,
      product: c.product,
      // O prêmio é lançado à mão depois, na página da Roleta.
      status: "pendente",
    }));

  out.jaExistiam = candidatos.length - novos.length;
  if (novos.length === 0) return out;

  const { error: ie } = await db.from("bi_roleta_spins").insert(novos);
  if (ie) throw new Error(ie.message);
  out.criados = novos.length;
  return out;
}
