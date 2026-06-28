ALTER TABLE public.clint_deals
  ADD COLUMN won_by_user_id UUID,
  ADD COLUMN won_by_name TEXT,
  ADD COLUMN won_by_email TEXT;

CREATE INDEX idx_clint_deals_won_by_user_id ON public.clint_deals(won_by_user_id);
