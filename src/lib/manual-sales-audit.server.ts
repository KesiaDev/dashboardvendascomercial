// Auditoria automática do fechamento manual.
// 1) Reconfere vendas pendentes contra a Hotmart (mesma lógica do botão manual).
// 2) Gera/atualiza alertas em `commission_alerts` para pendências > 24h e
//    divergência de afiliado.
// IMPORTANTE: nada aqui bloqueia bônus, roleta ou pagamento — só sinaliza.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PENDING_HOURS = 24;

function normEmail(e: string | null | undefined) {
  return (e ?? "").trim().toLowerCase();
}

function firstNameNorm(name: string | null | undefined) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)[0] ?? "";
}

export function isAffiliateMismatch(sellerName: string, nomeAfiliado: string | null | undefined) {
  const afiliado = firstNameNorm(nomeAfiliado);
  if (!afiliado) return false;
  return firstNameNorm(sellerName) !== afiliado;
}

export async function findHotmartMatch(email: string, saleDate: string) {
  const em = normEmail(email);
  if (!em) return null;
  const d = new Date(saleDate);
  const from = new Date(d); from.setDate(d.getDate() - 7);
  const to = new Date(d); to.setDate(d.getDate() + 7);
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select("id,faturamento_liquido_brl,nome_afiliado")
    .eq("email_cliente", em)
    .in("status", ["Aprovado", "Completo", "APPROVED"])
    .gte("data_venda", from.toISOString().slice(0, 10))
    .lte("data_venda", to.toISOString().slice(0, 10))
    .order("data_venda", { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0] ?? null;
}

/** Reconfere todas as vendas pendentes contra a Hotmart. */
export async function reconfirmPending() {
  const { data: pending, error } = await supabaseAdmin
    .from("manual_sales")
    .select("id,client_email,sale_date,seller_name")
    .eq("confirmation_status", "pendente")
    .not("client_email", "is", null);
  if (error) throw new Error(error.message);

  let confirmed = 0;
  let mismatches = 0;
  for (const row of pending ?? []) {
    if (!row.client_email) continue;
    const match = await findHotmartMatch(row.client_email, row.sale_date);
    if (!match) continue;
    const mismatch = isAffiliateMismatch(row.seller_name, match.nome_afiliado);
    if (mismatch) mismatches++;
    await supabaseAdmin
      .from("manual_sales")
      .update({
        confirmation_status: "confirmado_hotmart",
        confirmed_hotmart_sale_id: match.id,
        confirmed_hotmart_valor_brl: match.faturamento_liquido_brl,
        affiliate_mismatch: mismatch,
        hotmart_nome_afiliado: match.nome_afiliado,
      })
      .eq("id", row.id);
    confirmed++;
  }
  return { total: (pending ?? []).length, confirmed, mismatches };
}

type AlertRow = {
  sale_id: string;
  type: "pendente_24h" | "afiliado_divergente";
  severity: string;
  message: string;
  seller_name: string | null;
  client_name: string | null;
  client_email: string | null;
  sale_date: string | null;
  value_eur: number | null;
  hotmart_nome_afiliado: string | null;
  hours_pending: number | null;
};

/** Gera/atualiza os alertas de auditoria. Retorna quantos alertas abertos existem. */
export async function refreshCommissionAlerts() {
  const now = Date.now();

  // Só vendas cuja parcela já venceu (sale_date <= hoje) — parcelas futuras
  // ficam legitimamente pendentes e não devem alertar.
  const today = new Date(now).toISOString().slice(0, 10);

  const { data: rows, error } = await supabaseAdmin
    .from("manual_sales")
    .select(
      "id,seller_name,client_name,client_email,sale_date,value_eur,created_at,confirmation_status,affiliate_mismatch,hotmart_nome_afiliado",
    )
    .lte("sale_date", today)
    .or("confirmation_status.eq.pendente,affiliate_mismatch.eq.true");
  if (error) throw new Error(error.message);

  const alerts: AlertRow[] = [];
  for (const r of rows ?? []) {
    const base = {
      sale_id: r.id,
      seller_name: r.seller_name,
      client_name: r.client_name,
      client_email: r.client_email,
      sale_date: r.sale_date,
      value_eur: r.value_eur,
      hotmart_nome_afiliado: r.hotmart_nome_afiliado,
    };

    if (r.confirmation_status === "pendente") {
      // Conta a partir do lançamento (created_at) ou da data da venda, o que for mais recente:
      // uma parcela futura só começa a "envelhecer" depois de vencer.
      const ref = Math.max(
        new Date(r.created_at).getTime(),
        new Date(`${r.sale_date}T00:00:00Z`).getTime(),
      );
      const hours = Math.floor((now - ref) / 3_600_000);
      if (hours >= PENDING_HOURS) {
        alerts.push({
          ...base,
          type: "pendente_24h",
          severity: hours >= 72 ? "alta" : "media",
          hours_pending: hours,
          message: `Venda de ${r.client_name ?? r.client_email ?? "cliente"} (${r.seller_name}) está pendente há ${Math.floor(hours / 24)}d ${hours % 24}h sem correspondência na Hotmart.`,
        });
      }
    }

    if (r.affiliate_mismatch) {
      alerts.push({
        ...base,
        type: "afiliado_divergente",
        severity: "alta",
        hours_pending: null,
        message: `Afiliado da Hotmart ("${r.hotmart_nome_afiliado ?? "—"}") não bate com o vendedor lançado (${r.seller_name}).`,
      });
    }
  }

  if (alerts.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("commission_alerts")
      .upsert(alerts, { onConflict: "sale_id,type" });
    if (upErr) throw new Error(upErr.message);
  }

  // Fecha automaticamente alertas cuja condição deixou de existir.
  const stillOpenKeys = new Set(alerts.map((a) => `${a.sale_id}|${a.type}`));
  const { data: open } = await supabaseAdmin
    .from("commission_alerts")
    .select("id,sale_id,type")
    .eq("resolved", false);
  const toClose = (open ?? [])
    .filter((a) => !stillOpenKeys.has(`${a.sale_id}|${a.type}`))
    .map((a) => a.id);
  if (toClose.length > 0) {
    await supabaseAdmin
      .from("commission_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .in("id", toClose);
  }

  return { alerts: alerts.length, autoResolvidos: toClose.length };
}

/** Ciclo completo: reconfere pendentes e atualiza os alertas. */
export async function runManualSalesAudit() {
  const reconfirm = await reconfirmPending();
  const alerts = await refreshCommissionAlerts();
  return { ok: true, reconfirm, alerts, ran_at: new Date().toISOString() };
}
