import { createServerFn } from "@tanstack/react-start";
import type { FunilAgg, FunilId, VendedorAgg } from "@/lib/plano-metas.server";

export type PlanoMetasData = {
  desde: string;
  hoje: string;
  funis: FunilAgg[];
  vendedores: VendedorAgg[];
  temPropostas: boolean;
};

export const fetchPlanoMetasFn = createServerFn({ method: "GET" })
  .inputValidator((d: { desde: string; hoje: string }) => d)
  .handler(async ({ data }): Promise<PlanoMetasData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      funilPrincipal,
      pagedSelect,
      emptyFunil,
      monthKey,
      canonicalSellerName,
      isVendedorExcluido,
      FUNIL_LABEL,
    } = await import("@/lib/plano-metas.server");

    const desde = data.desde;
    const hoje = data.hoje;
    const d30 = new Date(new Date(`${hoje}T00:00:00Z`).getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const d7 = new Date(new Date(`${hoje}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);

    const [deals, sales, agenda] = await Promise.all([
      pagedSelect(
        supabaseAdmin,
        "clint_deals",
        "origin_name,user_name,created_at",
        "created_at",
        `${desde}T00:00:00Z`,
        `${hoje}T23:59:59Z`,
      ),
      pagedSelect(
        supabaseAdmin,
        "manual_sales",
        "funnel,seller_name,sale_date,installment_number,categoria_produto,conta_meta",
        "sale_date",
        desde,
        hoje,
      ),
      pagedSelect(
        supabaseAdmin,
        "seller_agenda",
        "seller_name,seller_email,scheduled_at,status",
        "scheduled_at",
        `${desde}T00:00:00Z`,
        `${hoje}T23:59:59Z`,
      ),
    ]);

    const ids: FunilId[] = ["WEBINAR", "V3", "SESSAO"];
    const funis = new Map<FunilId, FunilAgg>(ids.map((id) => [id, emptyFunil(id)]));
    const vendMap = new Map<string, VendedorAgg>();
    const vend = (raw: string | null | undefined) => {
      const seller = canonicalSellerName(raw);
      let v = vendMap.get(seller);
      if (!v) {
        v = {
          seller,
          leads: 0,
          reunioesAgendadas: 0,
          reunioesRealizadas: 0,
          vendas: 0,
          porFunil: { WEBINAR: 0, V3: 0, SESSAO: 0 },
        };
        vendMap.set(seller, v);
      }
      return v;
    };

    for (const d of deals) {
      const id = funilPrincipal(d.origin_name);
      if (!id || !d.user_name) continue; // só leads assumidos por vendedor
      const f = funis.get(id)!;
      const day = String(d.created_at).slice(0, 10);
      f.leads++;
      if (day >= d30) f.leads30++;
      if (day >= d7) f.leads7++;
      const mk = monthKey(day);
      const m = (f.meses[mk] ??= { leads: 0, vendas: 0 });
      m.leads++;
      vend(d.user_name).leads++;
    }

    for (const s of sales) {
      if (Number(s.installment_number ?? 1) !== 1) continue;
      const id = funilPrincipal(s.funnel);
      const v = vend(s.seller_name);
      v.vendas++;
      if (!id) continue;
      v.porFunil[id]++;
      const f = funis.get(id)!;
      const day = String(s.sale_date).slice(0, 10);
      f.vendas++;
      if (day >= d30) f.vendas30++;
      if (day >= d7) f.vendas7++;
      const mk = monthKey(day);
      const m = (f.meses[mk] ??= { leads: 0, vendas: 0 });
      m.vendas++;
    }

    for (const a of agenda) {
      const v = vend(a.seller_name ?? a.seller_email);
      v.reunioesAgendadas++;
      if (["realizada", "done", "concluida", "concluída"].includes(String(a.status ?? "").toLowerCase()))
        v.reunioesRealizadas++;
    }

    const vendedores = Array.from(vendMap.values())
      .filter((v) => !isVendedorExcluido(v.seller) && v.seller !== "— sem vendedor —")
      .filter((v) => v.leads + v.vendas + v.reunioesAgendadas > 0)
      .sort((a, b) => b.vendas - a.vendas || b.leads - a.leads);

    return {
      desde,
      hoje,
      funis: ids.map((id) => ({ ...funis.get(id)!, label: FUNIL_LABEL[id] })),
      vendedores,
      temPropostas: false,
    };
  });

export const diagnosticoPlanoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { resumo: string }) => d)
  .handler(async ({ data }): Promise<{ texto: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é head comercial. Responda em PT-BR, direto e objetivo, em tópicos numerados de 1 a 10, " +
              "usando SOMENTE os números fornecidos. Responda: 1) funil mais distante da meta; 2) maior potencial; " +
              "3) problema é volume ou conversão; 4) vendas adicionais necessárias; 5) leads adicionais necessários; " +
              "6) quanto cada vendedor precisa produzir; 7) vendedor acima da meta; 8) vendedor abaixo; " +
              "9) maior oportunidade de melhoria; 10) o ritmo atual permite bater a meta até a data final? " +
              "Termine com 3 ações práticas para a semana.",
          },
          { role: "user", content: data.resumo },
        ],
      }),
    });
    if (!res.ok) throw new Error(`IA falhou (${res.status})`);
    const json: any = await res.json();
    return { texto: json?.choices?.[0]?.message?.content ?? "Sem resposta." };
  });
