CREATE INDEX IF NOT EXISTS clint_deals_pending_tags_idx
ON public.clint_deals (created_at DESC)
WHERE contact_tags IS NULL AND contact_id IS NOT NULL;