ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS categoria_produto text,
  ADD COLUMN IF NOT EXISTS conta_meta boolean NOT NULL DEFAULT false;

ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS categoria_produto text,
  ADD COLUMN IF NOT EXISTS conta_meta boolean NOT NULL DEFAULT false;

-- Scalar: categoria
CREATE OR REPLACE FUNCTION public.categoria_produto(nome text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE n text;
BEGIN
  n := lower(coalesce(nome, ''));
  IF n LIKE '%renova%' THEN RETURN 'RENOVACAO'; END IF;
  IF n LIKE '%reset relacional%' THEN RETURN 'RESET_RELACIONAL'; END IF;
  IF n LIKE '%mentoria%' AND (n LIKE '%tráfego%' OR n LIKE '%trafego%') THEN RETURN 'GESTOR_TRAFEGO'; END IF;
  IF (n LIKE '%formação%redes sociais%' OR n LIKE '%formacao%redes sociais%') THEN RETURN 'REDES_SOCIAIS'; END IF;
  IF n LIKE '%accelerator%' THEN RETURN 'ACCELERATOR'; END IF;
  IF (n LIKE '%master and scale%' OR n LIKE '%master and scala%') THEN RETURN 'MASTER_SCALE'; END IF;
  IF (n LIKE '%traffic master%' OR n LIKE '%tráfico master%') THEN RETURN 'TRAFFIC_MASTER'; END IF;
  IF n LIKE '%estrategista%infoproduto%' THEN RETURN 'ESTRATEGISTA'; END IF;
  RETURN 'OUTROS';
END $$;

-- Scalar: conta meta
CREATE OR REPLACE FUNCTION public.produto_conta_meta(cat text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT cat = 'GESTOR_TRAFEGO';
$$;

CREATE OR REPLACE FUNCTION public.set_sales_categoria()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.categoria_produto := public.categoria_produto(NEW.produto_original);
  NEW.conta_meta := public.produto_conta_meta(NEW.categoria_produto);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_sales_categoria ON public.sales;
CREATE TRIGGER trg_set_sales_categoria
  BEFORE INSERT OR UPDATE OF produto_original ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_categoria();

CREATE OR REPLACE FUNCTION public.set_manual_sales_categoria()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.categoria_produto := public.categoria_produto(NEW.product);
  NEW.conta_meta := public.produto_conta_meta(NEW.categoria_produto);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_manual_sales_categoria ON public.manual_sales;
CREATE TRIGGER trg_set_manual_sales_categoria
  BEFORE INSERT OR UPDATE OF product ON public.manual_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_manual_sales_categoria();

UPDATE public.sales
SET categoria_produto = public.categoria_produto(produto_original),
    conta_meta = public.produto_conta_meta(public.categoria_produto(produto_original));

UPDATE public.manual_sales
SET categoria_produto = public.categoria_produto(product),
    conta_meta = public.produto_conta_meta(public.categoria_produto(product));

CREATE INDEX IF NOT EXISTS idx_sales_categoria ON public.sales(categoria_produto);
CREATE INDEX IF NOT EXISTS idx_sales_conta_meta ON public.sales(conta_meta) WHERE conta_meta = true;
CREATE INDEX IF NOT EXISTS idx_manual_sales_categoria ON public.manual_sales(categoria_produto);