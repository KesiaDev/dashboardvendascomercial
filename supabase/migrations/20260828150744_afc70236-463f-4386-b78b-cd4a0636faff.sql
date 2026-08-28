CREATE INDEX IF NOT EXISTS idx_clint_deals_created_cover
  ON public.clint_deals (created_at) INCLUDE (origin_name, user_name);

CREATE INDEX IF NOT EXISTS idx_clint_deals_lost_cover
  ON public.clint_deals (lost_at) INCLUDE (origin_name, user_name)
  WHERE status = 'LOST';

ANALYZE public.clint_deals;