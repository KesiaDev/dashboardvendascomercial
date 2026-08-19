import { createServerFn } from "@tanstack/react-start";
import type { ConversaProva } from "@/lib/conversa-prova.server";

export type { ConversaProva };

export const fetchConversaProvaFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<ConversaProva> => {
    const { loadConversaProva } = await import("@/lib/conversa-prova.server");
    return loadConversaProva(data.id);
  });
