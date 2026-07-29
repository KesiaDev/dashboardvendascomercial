ALTER TABLE public.bi_wise_payments
  ADD COLUMN IF NOT EXISTS email_cliente text,
  ADD COLUMN IF NOT EXISTS situacao text,
  ADD COLUMN IF NOT EXISTS inadimplente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sheet_tab text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

DELETE FROM public.bi_wise_payments a
USING public.bi_wise_payments b
WHERE a.id > b.id
  AND a.data_pagamento = b.data_pagamento
  AND a.cliente = b.cliente
  AND a.valor_eur = b.valor_eur
  AND coalesce(a.descricao,'') = coalesce(b.descricao,'');

CREATE UNIQUE INDEX IF NOT EXISTS bi_wise_payments_dedupe_idx
  ON public.bi_wise_payments (data_pagamento, cliente, valor_eur, coalesce(descricao,''));

CREATE INDEX IF NOT EXISTS bi_wise_payments_inadimplente_idx
  ON public.bi_wise_payments (inadimplente, data_pagamento DESC);