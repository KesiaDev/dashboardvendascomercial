CREATE INDEX IF NOT EXISTS idx_clint_deals_origin_created ON public.clint_deals (origin_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clint_deals_contact_email ON public.clint_deals (contact_email);
CREATE INDEX IF NOT EXISTS idx_clint_deals_contact_name ON public.clint_deals (contact_name);
CREATE INDEX IF NOT EXISTS idx_sales_email_cliente ON public.sales (email_cliente);
CREATE INDEX IF NOT EXISTS idx_coach_messages_author ON public.coach_messages (author);