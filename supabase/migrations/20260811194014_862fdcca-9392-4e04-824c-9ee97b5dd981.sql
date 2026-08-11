ALTER TABLE public.clint_deals ADD COLUMN IF NOT EXISTS contact_tags text[];
CREATE INDEX IF NOT EXISTS idx_clint_deals_contact_tags ON public.clint_deals USING gin (contact_tags);