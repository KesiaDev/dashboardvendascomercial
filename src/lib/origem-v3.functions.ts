import { createServerFn } from "@tanstack/react-start";

export type OrigemRow = {
  origem: string;
  leads: number;
  abertos: number;
  perdidos: number;
  /** Vendas do fechamento manual atribuídas ao funil onde a venda foi realmente convertida. */
  ganhos: number;
  /** Valor em € das vendas atribuídas. */
  valor: number;
  /** Vendas atribuídas sem conversa registrada com vendedor humano (já contam em "Vendas"). */
  ganhosSemContato: number;
  valorSemContato: number;
  /** Leads que tiveram pelo menos 1 mensagem enviada por um vendedor humano. */
  atendidos: number;
  /** Leads que só tiveram conversa da automação / Agente IA. */
  soIa: number;
  campanhas: { campanha: string; leads: number; ganhos: number; atendidos: number }[];
};

/** Uma linha da auditoria automática: onde o cliente entrou e onde a venda converteu. */
export type AuditoriaVendaRow = {
  saleId: string;
  saleDate: string;
  cliente: string;
  email: string | null;
  produto: string;
  vendedor: string;
  valor: number;
  /** Funil de CAPTAÇÃO (primeiro contato do cliente na Clint). */
  origem: string;
  /** Funil onde a venda foi convertida (ganho na Clint / negócio do vendedor / SCK). */
  funilConversao: string;
  /** Como a plataforma decidiu o funil de conversão. */
  metodo: "ganho-clint" | "negocio-vendedor" | "ultimo-toque" | "sck-hotmart" | "declarado";
  /** Funil declarado pelo vendedor no fechamento manual. */
  funilDeclarado: string | null;
  /** SCK do checkout Hotmart, quando a venda foi encontrada na Hotmart. */
  sck: string | null;
  /** Nome do afiliado na Hotmart. */
  afiliado: string | null;
  /** Funil onde o cliente entrou pela 1ª vez na Clint. */
  funilEntrada: string | null;
  /** Data do primeiro registro do cliente na Clint. */
  primeiroContato: string | null;
  /** Dono do negócio na Clint no primeiro contato. */
  donoClint: string | null;
  tags: string[];
  /** Como o cliente foi encontrado na Clint. */
  match: "email" | "telefone" | "nome" | "sem-match";
  /** Se houve mensagem de vendedor humano com esse cliente. */
  falouComVendedor: boolean;
};

export type OrigemV3Result = { rows: OrigemRow[]; auditoria: AuditoriaVendaRow[] };

const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const normName = (n: unknown) =>
  String(n ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
const normPhone = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-9);

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Detalhamento de origem dos leads do V3 + auditoria automática de vendas.
 *
 * Leads = negócios criados no período nos funis V3 e já delegados a um vendedor.
 * Vendas = fechamento manual do período, atribuído ao funil onde a venda foi
 * realmente convertida (ganho na Clint → negócio do próprio vendedor → último
 * toque antes da venda → SCK/afiliado da Hotmart → funil declarado).
 */
export const fetchOrigemV3Fn = createServerFn({ method: "GET" })
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data }): Promise<OrigemV3Result> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { V3_ORIGIN_NAMES, classifyOrigemV3, sckFunnel, sameSeller, tagBucket, SEM_TAG } = await import(
      "@/lib/origem-v3.server"
    );

    const pageSize = 1000;
    const rows: any[] = [];
    for (let page = 0; page < 20; page++) {
      const { data: c, error } = await supabaseAdmin
        .from("clint_deals")
        .select("id,origin_name,status,value,created_at,contact_email,raw,contact_tags,user_name")
        .eq("origin_name", "PIPELINE_COMERCIAL-V3")
        .gte("created_at", data.from)
        .lte("created_at", `${data.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      rows.push(...(c ?? []));
      if ((c ?? []).length < pageSize) break;
    }


    // --- Vendas do fechamento manual do período (fonte de verdade de "venda") ---
    const { data: salesRows } = await supabaseAdmin
      .from("manual_sales")
      .select(
        "id,client_name,client_email,value_eur,product,seller_name,sale_date,installment_number,funnel,hotmart_nome_afiliado",
      )
      .eq("installment_number", 1)
      .gte("sale_date", data.from)
      .lte("sale_date", data.to)
      .order("sale_date", { ascending: true })
      .limit(20000);
    const sales = salesRows ?? [];

    const saleEmails = Array.from(new Set(sales.map((s: any) => normEmail(s.client_email)).filter(Boolean)));
    const saleNames = Array.from(new Set(sales.map((s: any) => normName(s.client_name)).filter(Boolean)));

    // --- Todos os negócios do cliente na Clint (não só o primeiro) ---
    type Touch = {
      origin_name: string | null;
      created_at: string | null;
      won_at: string | null;
      status: string | null;
      raw: any;
      contact_tags: string[] | null;
      user_name: string | null;
    };
    const byEmail = new Map<string, Touch[]>();
    const byName = new Map<string, Touch[]>();
    const byPhone = new Map<string, Touch[]>();
    const push = (m: Map<string, Touch[]>, k: string, t: Touch) => {
      if (!k) return;
      const arr = m.get(k);
      if (arr) arr.push(t);
      else m.set(k, [t]);
    };

    const ingest = (deals: any[]) => {
      for (const d of deals) {
        const t: Touch = {
          origin_name: d.origin_name,
          created_at: d.created_at,
          won_at: d.won_at ?? null,
          status: d.status ?? null,
          raw: d.raw,
          contact_tags: d.contact_tags,
          user_name: d.user_name,
        };
        push(byEmail, normEmail(d.contact_email), t);
        push(byName, normName(d.contact_name), t);
        push(byPhone, normPhone(d.contact_phone), t);
      }
    };

    const dealCols =
      "origin_name,created_at,won_at,status,raw,contact_tags,user_name,contact_email,contact_name,contact_phone";
    for (const part of chunk(saleEmails, 100)) {
      const { data: c } = await supabaseAdmin.from("clint_deals").select(dealCols).in("contact_email", part);
      ingest(c ?? []);
    }
    for (const part of chunk(saleNames, 100)) {
      const { data: c } = await supabaseAdmin.from("clint_deals").select(dealCols).in("contact_name", part);
      ingest(c ?? []);
    }

    // --- Vendas Hotmart (SCK / afiliado) para cruzar com o fechamento manual ---
    const hotByEmail = new Map<string, { sck: string | null; afiliado: string | null; data: string | null }>();
    for (const part of chunk(saleEmails, 100)) {
      const { data: h } = await supabaseAdmin
        .from("sales")
        .select("email_cliente,origem_checkout,nome_afiliado,data_venda")
        .in("email_cliente", part)
        .order("data_venda", { ascending: false });
      for (const r of h ?? []) {
        const k = normEmail((r as any).email_cliente);
        if (!k || hotByEmail.has(k)) continue;
        hotByEmail.set(k, {
          sck: (r as any).origem_checkout ?? null,
          afiliado: (r as any).nome_afiliado ?? null,
          data: (r as any).data_venda ?? null,
        });
      }
    }

    // --- Interação real com vendedor (mensagem enviada por humano) ---
    const convRows: any[] = [];
    for (let page = 0; page < 10; page++) {
      const { data: c } = await supabaseAdmin
        .from("coach_conversations")
        .select("id,contact_email,contact_name,is_ai_conversation")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      convRows.push(...(c ?? []));
      if ((c ?? []).length < pageSize) break;
    }
    const humanConvIds = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const { data: c } = await supabaseAdmin
        .from("coach_messages")
        .select("conversation_id")
        .eq("author", "vendedor")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      for (const m of c ?? []) humanConvIds.add((m as any).conversation_id);
      if ((c ?? []).length < pageSize) break;
    }
    const humanEmails = new Set<string>();
    const humanNames = new Set<string>();
    const anyConvEmails = new Set<string>();
    for (const c of convRows) {
      const e = normEmail(c.contact_email);
      const human = !c.is_ai_conversation && humanConvIds.has(c.id);
      if (e) {
        anyConvEmails.add(e);
        if (human) humanEmails.add(e);
      }
      if (human) humanNames.add(normName(c.contact_name));
    }

    // --- Agregação de leads por origem ---
    type Acc = OrigemRow & { camp: Map<string, { leads: number; ganhos: number; atendidos: number }> };
    const map = new Map<string, Acc>();
    const ensure = (origem: string): Acc => {
      let r = map.get(origem);
      if (!r) {
        r = {
          origem,
          leads: 0,
          abertos: 0,
          perdidos: 0,
          ganhos: 0,
          valor: 0,
          ganhosSemContato: 0,
          valorSemContato: 0,
          atendidos: 0,
          soIa: 0,
          campanhas: [],
          camp: new Map(),
        };
        map.set(origem, r);
      }
      return r;
    };

    // Leads recebidos no PIPELINE_COMERCIAL-V3, agrupados pelas tags reais da Clint.
    const bucketByEmail = new Map<string, string>();
    for (const d of rows) {
      const hit = tagBucket(d.contact_tags);
      if (!hit) continue;
      const r = ensure(hit.bucket);
      const email = normEmail(d.contact_email);
      if (email) bucketByEmail.set(email, hit.bucket);

      r.leads++;
      if (email && humanEmails.has(email)) r.atendidos++;
      else r.soIa++;
      if (d.status === "LOST") r.perdidos++;
      else r.abertos++;


      let c = r.camp.get(hit.tag);
      if (!c) {
        c = { leads: 0, ganhos: 0, atendidos: 0 };
        r.camp.set(hit.tag, c);
      }
      c.leads++;

    }



    const funnelLabel = (t: Touch) =>
      V3_ORIGIN_NAMES.includes(t.origin_name ?? "")
        ? classifyOrigemV3(t.origin_name, t.raw, t.contact_tags).origem
        : (t.origin_name ?? "Sem funil (entrada manual)");

    // --- Auditoria: captação (1º toque) + conversão (onde a venda aconteceu) ---
    const auditoria: AuditoriaVendaRow[] = [];
    for (const s of sales as any[]) {
      const email = normEmail(s.client_email);
      const nome = normName(s.client_name);
      let touches = (email ? byEmail.get(email) : undefined) ?? [];
      let match: AuditoriaVendaRow["match"] = touches.length ? "email" : "sem-match";
      if (!touches.length && nome) {
        touches = byName.get(nome) ?? [];
        if (touches.length) match = "nome";
      }

      const sorted = [...touches].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
      const first = sorted[0];
      const saleDay = String(s.sale_date);
      const hot = email ? hotByEmail.get(email) : undefined;

      // 1) negócio GANHO na Clint perto da data da venda
      const won = sorted
        .filter((t) => t.status === "WON" && t.won_at)
        .sort((a, b) => String(b.won_at).localeCompare(String(a.won_at)))
        .find((t) => Math.abs(new Date(t.won_at!).getTime() - new Date(`${saleDay}T12:00:00Z`).getTime()) < 60 * 864e5);
      // 2) negócio do próprio vendedor que fechou, aberto antes da venda
      const doVendedor = [...sorted]
        .reverse()
        .find((t) => sameSeller(t.user_name, s.seller_name) && String(t.created_at ?? "") <= `${saleDay}T23:59:59`);
      // 3) último toque antes da venda
      const ultimo = [...sorted].reverse().find((t) => String(t.created_at ?? "") <= `${saleDay}T23:59:59`);

      let funilConversao: string;
      let metodo: AuditoriaVendaRow["metodo"];
      if (won) {
        funilConversao = funnelLabel(won);
        metodo = "ganho-clint";
      } else if (doVendedor) {
        funilConversao = funnelLabel(doVendedor);
        metodo = "negocio-vendedor";
      } else if (ultimo) {
        funilConversao = funnelLabel(ultimo);
        metodo = "ultimo-toque";
      } else if (sckFunnel(hot?.sck)) {
        funilConversao = sckFunnel(hot?.sck)!;
        metodo = "sck-hotmart";
      } else {
        funilConversao = String(s.funnel ?? "Sem funil (entrada manual)");
        metodo = "declarado";
      }

      const captacao = first ? funnelLabel(first) : "Sem origem (entrada manual)";
      const falou = (email && humanEmails.has(email)) || (nome && humanNames.has(nome)) || false;

      auditoria.push({
        saleId: String(s.id),
        saleDate: saleDay,
        cliente: String(s.client_name ?? "—"),
        email: s.client_email ?? null,
        produto: String(s.product ?? "—"),
        vendedor: String(s.seller_name ?? "—"),
        valor: Number(s.value_eur ?? 0),
        origem: captacao,
        funilConversao,
        metodo,
        funilDeclarado: s.funnel ?? null,
        sck: hot?.sck ?? null,
        afiliado: hot?.afiliado ?? s.hotmart_nome_afiliado ?? null,
        funilEntrada: first?.origin_name ?? null,
        primeiroContato: first?.created_at ?? null,
        donoClint: first?.user_name ?? null,
        tags: first?.contact_tags ?? [],
        match,
        falouComVendedor: Boolean(falou),
      });

      // Vendas = fechamento manual declarado como PIPELINE_COMERCIAL-V3 (bate com
      // o fechamento dos vendedores), agrupadas pela tag do negócio V3 do cliente
      // — mesmo que o lead tenha entrado em meses anteriores.
      const declaradoV3 = /pipeline[\s_-]*comercial[\s_-]*v3/i.test(String(s.funnel ?? ""));
      if (!declaradoV3) continue;
      const v3Touch = [...sorted]
        .reverse()
        .find(
          (t) =>
            t.origin_name === "PIPELINE_COMERCIAL-V3" &&
            String(t.created_at ?? "") <= `${saleDay}T23:59:59` &&
            Boolean(tagBucket(t.contact_tags)),
        );
      const hitTag = v3Touch ? tagBucket(v3Touch.contact_tags) : null;
      // Sem tag identificada na Clint → conta como Sessão Estratégica (padrão do V3).
      const linha = hitTag?.bucket ?? (email ? bucketByEmail.get(email) : undefined) ?? "Sessão Estratégica";
      const r = ensure(linha);
      r.ganhos++;
      r.valor += Number(s.value_eur ?? 0);
      if (hitTag) {
        let c = r.camp.get(hitTag.tag);
        if (!c) {
          c = { leads: 0, ganhos: 0, atendidos: 0 };
          r.camp.set(hitTag.tag, c);
        }
        c.ganhos++;
      }

      if (!falou) {
        r.ganhosSemContato++;
        r.valorSemContato += Number(s.value_eur ?? 0);
      }

    }




    const result = Array.from(map.values())
      .map(({ camp, ...r }) => ({
        ...r,
        campanhas: Array.from(camp.entries())
          .map(([campanha, v]) => ({ campanha, ...v }))
          .sort((a, b) => b.leads - a.leads || b.ganhos - a.ganhos),
      }))
      .sort((a, b) => b.leads - a.leads || b.ganhos - a.ganhos);

    return {
      rows: result,
      auditoria: auditoria.sort((a, b) => (a.saleDate < b.saleDate ? 1 : -1)),
    };
  });
