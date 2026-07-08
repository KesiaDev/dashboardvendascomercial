import { createServerFn } from "@tanstack/react-start";

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ─── Categorias legíveis ─────────────────────────────────────────────────────
export const CATEGORIA_LABEL: Record<string, string> = {
  GESTOR_TRAFEGO: "Gestor de Tráfego",
  REDES_SOCIAIS: "Redes Sociais",
  ACCELERATOR: "Programa Accelerator",
  MASTER_SCALE: "Master and Scale",
  TRAFFIC_MASTER: "Traffic Master",
  ESTRATEGISTA: "Estrategista de Infoprodutos",
  RESET_RELACIONAL: "Reset Relacional",
  RENOVACAO: "Renovação",
  OUTROS: "Outros",
};

export const CATEGORIA_COLOR: Record<string, string> = {
  GESTOR_TRAFEGO: "#6366f1",
  REDES_SOCIAIS: "#06b6d4",
  ACCELERATOR: "#10b981",
  MASTER_SCALE: "#ec4899",
  TRAFFIC_MASTER: "#8b5cf6",
  ESTRATEGISTA: "#f59e0b",
  RESET_RELACIONAL: "#94a3b8",
  RENOVACAO: "#3b82f6",
  OUTROS: "#64748b",
};

// Status agrupados
const APROVADOS = ["Aprovado", "Completo", "APPROVED", "COMPLETE"];
const CANCEL_EFETIVADO = ["Chargeback", "Reembolsado", "CHARGEBACK", "REFUNDED"];
const CANCEL_PENDENTE = ["Dispute", "DISPUTE", "Em análise", "UNDER_ANALISYS"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function monthRange(monthYYYYMM: string): { start: string; end: string } {
  const [y, m] = monthYYYYMM.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, end };
}

// ─── Faturamento por Produto ────────────────────────────────────────────────
export const getFaturamentoPorProdutoFn = createServerFn({ method: "GET" })
  .inputValidator((d: { month?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const db = await adminDb();
    const month = data.month ?? new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);

    const { data: rows, error } = await db
      .from("sales")
      .select("categoria_produto,conta_meta,faturamento_liquido_brl,status,produto_original")
      .gte("data_venda", start)
      .lt("data_venda", end)
      .in("status", APROVADOS);
    if (error) throw new Error(error.message);

    const agg = new Map<
      string,
      { categoria: string; label: string; qtd: number; faturamento: number; conta_meta: boolean }
    >();
    let total = 0;
    for (const r of rows ?? []) {
      const cat = r.categoria_produto ?? "OUTROS";
      const brl = Number(r.faturamento_liquido_brl ?? 0);
      total += brl;
      const cur = agg.get(cat) ?? {
        categoria: cat,
        label: CATEGORIA_LABEL[cat] ?? cat,
        qtd: 0,
        faturamento: 0,
        conta_meta: cat === "GESTOR_TRAFEGO",
      };
      cur.qtd += 1;
      cur.faturamento += brl;
      agg.set(cat, cur);
    }
    const arr = Array.from(agg.values())
      .map((x) => ({ ...x, pct: total > 0 ? x.faturamento / total : 0 }))
      .sort((a, b) => b.faturamento - a.faturamento);
    return { month, total, produtos: arr };
  });

// ─── Renovações ──────────────────────────────────────────────────────────────
export const getRenovacoesFn = createServerFn({ method: "GET" })
  .inputValidator((d: { month?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const db = await adminDb();
    const month = data.month ?? new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);

    const { data: rows, error } = await db
      .from("sales")
      .select("id,data_venda,produto_original,nome_cliente,email_cliente,nome_afiliado,faturamento_liquido_brl,status")
      .eq("categoria_produto", "RENOVACAO")
      .gte("data_venda", start)
      .lt("data_venda", end)
      .in("status", APROVADOS)
      .order("data_venda", { ascending: false });
    if (error) throw new Error(error.message);

    const total = (rows ?? []).reduce((s, r) => s + Number(r.faturamento_liquido_brl ?? 0), 0);
    return { month, total, renovacoes: rows ?? [] };
  });

// ─── Cancelamentos ───────────────────────────────────────────────────────────
export const getCancelamentosFn = createServerFn({ method: "GET" })
  .inputValidator((d: { month?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const db = await adminDb();
    const month = data.month ?? new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);

    const { data: rows, error } = await db
      .from("sales")
      .select("id,data_venda,produto_original,categoria_produto,nome_cliente,email_cliente,nome_afiliado,faturamento_liquido_brl,status")
      .in("status", [...CANCEL_EFETIVADO, ...CANCEL_PENDENTE])
      .gte("data_venda", start)
      .lt("data_venda", end)
      .order("data_venda", { ascending: false });
    if (error) throw new Error(error.message);

    const efetivados = (rows ?? []).filter((r) => CANCEL_EFETIVADO.includes(r.status));
    const pendentes = (rows ?? []).filter((r) => CANCEL_PENDENTE.includes(r.status));
    const totalEfetivado = efetivados.reduce((s, r) => s + Number(r.faturamento_liquido_brl ?? 0), 0);
    const totalPendente = pendentes.reduce((s, r) => s + Number(r.faturamento_liquido_brl ?? 0), 0);

    return { month, totalEfetivado, totalPendente, efetivados, pendentes };
  });

// ─── Vendas por Vendedor ─────────────────────────────────────────────────────
// Usa manual_sales (lançamentos do vendedor) + confirmed_hotmart_valor_brl
// quando confirmado, senão value_eur convertido em BRL (assumindo 1 EUR ≈ 6 BRL).
// Também traz breakdown por categoria e faturamento que conta para meta.
export const getVendasPorVendedorFn = createServerFn({ method: "GET" })
  .inputValidator((d: { month?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const db = await adminDb();
    const month = data.month ?? new Date().toISOString().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
    const endDate = `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`;

    const { data: rows, error } = await db
      .from("manual_sales")
      .select(
        "id,seller_name,product,categoria_produto,conta_meta,value_eur,confirmed_hotmart_valor_brl,confirmation_status,sale_date,client_name,client_email",
      )
      .gte("sale_date", startDate)
      .lt("sale_date", endDate)
      .order("sale_date", { ascending: false });
    if (error) throw new Error(error.message);

    type Bucket = {
      seller: string;
      qtdTotal: number;
      qtdMeta: number;
      faturamentoTotal: number;
      faturamentoMeta: number;
      renovacoes: number;
      valorRenovacoes: number;
      porCategoria: Record<string, { qtd: number; valor: number }>;
    };
    const bySeller = new Map<string, Bucket>();

    for (const r of rows ?? []) {
      const cat = r.categoria_produto ?? "OUTROS";
      // Valor: se confirmado com Hotmart, usa BRL confirmado; senão EUR * 6.
      const brl = Number(r.confirmed_hotmart_valor_brl ?? Number(r.value_eur) * 6);
      const b =
        bySeller.get(r.seller_name) ??
        ({
          seller: r.seller_name,
          qtdTotal: 0,
          qtdMeta: 0,
          faturamentoTotal: 0,
          faturamentoMeta: 0,
          renovacoes: 0,
          valorRenovacoes: 0,
          porCategoria: {},
        } as Bucket);
      b.qtdTotal += 1;
      b.faturamentoTotal += brl;
      if (r.conta_meta) {
        b.qtdMeta += 1;
        b.faturamentoMeta += brl;
      }
      if (cat === "RENOVACAO") {
        b.renovacoes += 1;
        b.valorRenovacoes += brl;
      }
      const pc = b.porCategoria[cat] ?? { qtd: 0, valor: 0 };
      pc.qtd += 1;
      pc.valor += brl;
      b.porCategoria[cat] = pc;
      bySeller.set(r.seller_name, b);
    }

    const vendedores = Array.from(bySeller.values()).sort(
      (a, b) => b.faturamentoMeta - a.faturamentoMeta,
    );
    const totais = vendedores.reduce(
      (acc, v) => ({
        qtdTotal: acc.qtdTotal + v.qtdTotal,
        qtdMeta: acc.qtdMeta + v.qtdMeta,
        faturamentoTotal: acc.faturamentoTotal + v.faturamentoTotal,
        faturamentoMeta: acc.faturamentoMeta + v.faturamentoMeta,
      }),
      { qtdTotal: 0, qtdMeta: 0, faturamentoTotal: 0, faturamentoMeta: 0 },
    );

    return { month, vendedores, totais };
  });
