CREATE OR REPLACE FUNCTION public.categoria_produto(nome text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE n text;
BEGIN
  n := lower(coalesce(nome, ''));
  IF n LIKE '%renova%' THEN RETURN 'RENOVACAO'; END IF;
  IF n LIKE '%reset relacional%' THEN RETURN 'RESET_RELACIONAL'; END IF;
  -- Mentoria de tráfego (aceita "mentoria" ou "mentor" + tráfego/trafego)
  IF (n LIKE '%mentor%') AND (n LIKE '%tráfego%' OR n LIKE '%trafego%' OR n LIKE '%tráfico%' OR n LIKE '%trafico%') THEN
    RETURN 'GESTOR_TRAFEGO';
  END IF;
  IF (n LIKE '%formação%redes sociais%' OR n LIKE '%formacao%redes sociais%') THEN RETURN 'REDES_SOCIAIS'; END IF;
  IF n LIKE '%accelerator%' THEN RETURN 'ACCELERATOR'; END IF;
  IF (n LIKE '%master and scale%' OR n LIKE '%master and scala%') THEN RETURN 'MASTER_SCALE'; END IF;
  IF (n LIKE '%traffic master%' OR n LIKE '%tráfico master%') THEN RETURN 'TRAFFIC_MASTER'; END IF;
  IF n LIKE '%estrategista%infoproduto%' THEN RETURN 'ESTRATEGISTA'; END IF;
  RETURN 'OUTROS';
END $function$;

-- Reclassifica todas as vendas existentes com a nova regra
UPDATE public.manual_sales
SET categoria_produto = public.categoria_produto(product),
    conta_meta = public.produto_conta_meta(public.categoria_produto(product));

UPDATE public.sales
SET categoria_produto = public.categoria_produto(produto_original),
    conta_meta = public.produto_conta_meta(public.categoria_produto(produto_original));