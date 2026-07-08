import { createServerFn } from "@tanstack/react-start";
import { mapProductToGroup } from "@/lib/product-groups";

// ─── Hotmart API ──────────────────────────────────────────────────────────────
// Docs: https://developers.hotmart.com/docs/en/v1/sales/sales-history/
// Auth: OAuth2 client credentials contra api-sec-vlc.hotmart.com
// Dados: developers.hotmart.com/payments/api/v1/sales/history

const AUTH_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const API_BASE = "https://developers.hotmart.com/payments/api/v1";

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.HOTMART_CLIENT_ID;
  const clientSecret = process.env.HOTMART_CLIENT_SECRET;
  const basic = process.env.HOTMART_BASIC_TOKEN;
  if (!clientId || !clientSecret || !basic) {
    throw new Error("Credenciais Hotmart ausentes no backend.");
  }
  const basicHeader = basic.trim().toLowerCase().startsWith("basic ")
    ? basic.trim()
    : `Basic ${basic.trim()}`;

  const url = `${AUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(
    clientId,
  )}&client_secret=${encodeURIComponent(clientSecret)}`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: basicHeader } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Hotmart auth ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return json.access_token;
}

// ─── Mapeamento de status ────────────────────────────────────────────────────
function mapStatus(s: string | undefined | null): string {
  const raw = (s ?? "").toString().toUpperCase().trim();
  const map: Record<string, string> = {
    APPROVED: "Aprovado",
    COMPLETE: "Completo",
    COMPLETED: "Completo",
    CANCELLED: "Cancelado",
    CANCELED: "Cancelado",
    REFUNDED: "Reembolsado",
    CHARGEBACK: "Chargeback",
    DISPUTE: "Chargeback",
    EXPIRED: "Expirado",
    NO_FUNDS: "Sem saldo",
    OVERDUE: "Vencido",
    BLOCKED: "Bloqueado",
    STARTED: "Iniciado",
    UNDER_ANALISYS: "Em análise",
    WAITING_PAYMENT: "Aguardando pagamento",
    PRE_ORDER: "Pré-venda",
  };
  return map[raw] ?? (raw || "Desconhecido");
}

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
  return null;
}

// ─── Extrai faturamento líquido em BRL (comissão do produtor) ────────────────
// A API traz `commissions` (ou `commission_as`) por participante. Para o
// produtor a chave é PRODUCER (às vezes source === 'PRODUCER'). Fallback: se
// a venda é BRL, usa price.value.
function extractProducerBRL(purchase: any, commissions: any[]): number | null {
  const list = Array.isArray(commissions) ? commissions : [];
  const producer = list.find((c: any) => {
    const src = String(c?.source ?? c?.role ?? c?.commission_as ?? "").toUpperCase();
    return src.includes("PRODUCER") || src === "SELLER";
  });
  if (producer) {
    const v = Number(producer?.value ?? producer?.amount ?? producer?.exchange?.value);
    const cur = String(producer?.currency_code ?? producer?.currency ?? "").toUpperCase();
    if (Number.isFinite(v)) {
      if (cur === "BRL") return v;
      // se veio conversão em BRL
      if (Number.isFinite(Number(producer?.exchange?.value)) &&
          String(producer?.exchange?.currency_code ?? "").toUpperCase() === "BRL") {
        return Number(producer.exchange.value);
      }
    }
  }
  const price = purchase?.price;
  if (price && String(price.currency_value ?? price.currency_code ?? "").toUpperCase() === "BRL") {
    const v = Number(price.value);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function mapItemToSale(item: any) {
  const purchase = item?.purchase ?? {};
  const product = item?.product ?? {};
  const buyer = item?.buyer ?? {};
  const commissions: any[] =
    item?.commissions ?? item?.commission ?? item?.producer?.commissions ?? [];
  const affiliates: any[] = item?.affiliates ?? [];
  const address = buyer?.address ?? {};

  const transacao = purchase?.transaction ?? purchase?.order_ref ?? item?.transaction;
  if (!transacao) return null;

  const produto_original = String(product?.name ?? "").trim() || "—";
  const currency =
    purchase?.price?.currency_value ?? purchase?.price?.currency_code ?? null;
  const priceVal = Number(purchase?.price?.value);
  const offerVal = Number(purchase?.offer?.value ?? purchase?.price?.value);
  const installments = Number(
    purchase?.payment?.installments_number ?? purchase?.payment?.installments ?? 0,
  );

  return {
    transacao: String(transacao),
    produto_original,
    produto_grupo: mapProductToGroup(produto_original),
    status: mapStatus(purchase?.status),
    data_venda: isoOrNull(purchase?.order_date),
    data_confirmacao: isoOrNull(purchase?.approved_date),
    moeda_original: currency ? String(currency) : null,
    preco_oferta: Number.isFinite(offerVal) ? offerVal : null,
    preco_total: Number.isFinite(priceVal) ? priceVal : null,
    faturamento_liquido_brl: extractProducerBRL(purchase, commissions),
    valor_recebido_convertido: (() => {
      const v = Number(commissions?.[0]?.exchange?.value);
      return Number.isFinite(v) ? v : null;
    })(),
    moeda_recebimento: commissions?.[0]?.exchange?.currency_code ?? null,
    meio_pagamento: purchase?.payment?.type ?? null,
    nome_cliente: buyer?.name ?? null,
    email_cliente: buyer?.email ? String(buyer.email).trim().toLowerCase() : null,
    pais: address?.country ?? null,
    estado: address?.state ?? null,
    cidade: address?.city ?? null,
    numero_parcela: Number.isFinite(installments) && installments > 0 ? installments : null,
    tem_coproducao: Array.isArray(item?.producer?.co_productions) &&
      item.producer.co_productions.length > 0
      ? "Sim"
      : null,
    cupom: purchase?.offer?.code ?? null,
    origem_checkout: purchase?.tracking?.source_sck ?? purchase?.tracking?.source ?? null,
    nome_afiliado: affiliates?.[0]?.name ?? null,
    raw: item,
  };
}

// ─── Loop paginado sobre sales/history ───────────────────────────────────────
async function fetchAllSales(startEpochMs: number, endEpochMs: number) {
  const token = await getAccessToken();
  const all: any[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  do {
    const params = new URLSearchParams();
    params.set("start_date", String(startEpochMs));
    params.set("end_date", String(endEpochMs));
    params.set("max_results", "50");
    if (pageToken) params.set("page_token", pageToken);
    const url = `${API_BASE}/sales/history?${params.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text();
      console.error("Hotmart fail url:", url, "status:", res.status, "body:", body);
      throw new Error(`Hotmart /sales/history ${res.status} url=${url}: ${body}`);
    }
    const json = (await res.json()) as { items?: any[]; page_info?: { next_page_token?: string } };
    if (json.items?.length) all.push(...json.items);
    pageToken = json.page_info?.next_page_token ?? null;
    pages++;
    if (pages > 600) break; // guarda-corpo: até 30k vendas por sync
  } while (pageToken);
  return all;
}

// ─── Sync principal ──────────────────────────────────────────────────────────
// windowDays = 3 (default) pega a janela dos últimos 3 dias para pegar
// mudanças de status (aprovado→cancelado, chargeback). Backfill maior é opcional.
export async function runHotmartSync(opts?: { windowDays?: number; startDate?: string; endDate?: string }) {
  const now = Date.now();
  let start: number;
  let end: number;
  if (opts?.startDate && opts?.endDate) {
    start = new Date(opts.startDate + "T00:00:00Z").getTime();
    end = new Date(opts.endDate + "T23:59:59Z").getTime();
  } else {
    const days = opts?.windowDays ?? 3;
    end = now;
    start = now - days * 24 * 60 * 60 * 1000;
  }

  const items = await fetchAllSales(start, end);
  const mapped = items.map(mapItemToSale).filter((r): r is NonNullable<ReturnType<typeof mapItemToSale>> => !!r);

  const db = await adminDb();
  const txs = mapped.map((r) => r.transacao);
  const existing = new Set<string>();
  const batchSize = 500;
  for (let i = 0; i < txs.length; i += batchSize) {
    const chunk = txs.slice(i, i + batchSize);
    const { data, error } = await db.from("sales").select("transacao").in("transacao", chunk);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) existing.add((r as { transacao: string }).transacao);
  }

  const upBatch = 500;
  for (let i = 0; i < mapped.length; i += upBatch) {
    const chunk = mapped.slice(i, i + upBatch).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await db.from("sales").upsert(chunk, { onConflict: "transacao" });
    if (error) throw new Error(error.message);
  }

  const newRows = mapped.filter((r) => !existing.has(r.transacao)).length;
  const updatedRows = mapped.length - newRows;
  const dates = mapped
    .map((r) => r.data_venda)
    .filter((d): d is string => !!d)
    .sort();

  await db.from("weekly_imports").insert({
    filename: `Hotmart API — ${new Date(start).toISOString().slice(0, 10)} → ${new Date(end).toISOString().slice(0, 10)}`,
    total_rows: mapped.length,
    new_rows: newRows,
    updated_rows: updatedRows,
    period_start: dates[0] ?? null,
    period_end: dates[dates.length - 1] ?? null,
  });

  return {
    ok: true as const,
    fetched: items.length,
    imported: mapped.length,
    newRows,
    updatedRows,
    window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
  };
}

// ─── ServerFn callable from UI ───────────────────────────────────────────────
export const syncHotmartFn = createServerFn({ method: "POST" })
  .inputValidator((d: { windowDays?: number; startDate?: string; endDate?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => runHotmartSync(data));
