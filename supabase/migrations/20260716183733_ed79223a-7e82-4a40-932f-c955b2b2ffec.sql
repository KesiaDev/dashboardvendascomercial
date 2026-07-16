
ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS installment_number int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_total int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_sale_id uuid REFERENCES public.manual_sales(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS installment_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS installment_paid_at timestamptz;

ALTER TABLE public.manual_sales
  DROP CONSTRAINT IF EXISTS manual_sales_installment_total_check;
ALTER TABLE public.manual_sales
  ADD CONSTRAINT manual_sales_installment_total_check
  CHECK (installment_total BETWEEN 1 AND 3 AND installment_number BETWEEN 1 AND installment_total);

CREATE INDEX IF NOT EXISTS manual_sales_parent_sale_idx ON public.manual_sales(parent_sale_id);
