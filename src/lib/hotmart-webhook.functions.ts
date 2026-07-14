import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Retorna o token do webhook Hotmart. Protegido por auth (apenas usuários logados).
export const getHotmartWebhookTokenFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = process.env.HOTMART_WEBHOOK_TOKEN ?? "";
    return { token };
  });
