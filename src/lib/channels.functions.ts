import { createServerFn } from "@tanstack/react-start";
import { fetchChannelsFn } from "@/lib/data.functions";
import type { Channel } from "@/lib/channels";

export type ChannelRow = {
  id: string;
  label: string;
  tipo: string;
  clint_group_names: string[];
  sck_prefixes: string[];
};

export async function fetchChannels(): Promise<ChannelRow[]> {
  return (await fetchChannelsFn()) as ChannelRow[];
}

/**
 * Garante que todo canal definido em CHANNELS (src/lib/channels.ts) tenha uma
 * linha em bi_channels — sempre sobrescreve, porque o dicionário hoje só é
 * editado via código (não há tela de edição ainda).
 */
export const syncChannels = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { CHANNELS } = await import("@/lib/channels");

  const rows = (CHANNELS as Channel[]).map((c) => ({
    id: c.id,
    label: c.label,
    tipo: c.tipo,
    clint_group_names: c.clintGroupNames,
    sck_prefixes: c.sckPrefixes,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin.from("bi_channels").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return { synced: rows.length };
});
