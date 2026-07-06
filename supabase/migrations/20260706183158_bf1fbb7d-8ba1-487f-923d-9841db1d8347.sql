-- Fase 1: campos para roleta, bônus semanal e sinalização de divergência de afiliado

ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS roleta_type text,
  ADD COLUMN IF NOT EXISTS bonus_semanal_eur integer,
  ADD COLUMN IF NOT EXISTS affiliate_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hotmart_nome_afiliado text;

-- Validação por trigger (evita CHECK que dificulta migrations futuras)
CREATE OR REPLACE FUNCTION public.validate_manual_sale_extras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.roleta_type IS NOT NULL AND NEW.roleta_type NOT IN ('mentoria','accelerator') THEN
    RAISE EXCEPTION 'roleta_type inválido: %', NEW.roleta_type;
  END IF;
  IF NEW.bonus_semanal_eur IS NOT NULL AND NEW.bonus_semanal_eur NOT IN (30, 60) THEN
    RAISE EXCEPTION 'bonus_semanal_eur deve ser 30 ou 60';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_manual_sale_extras_trg ON public.manual_sales;
CREATE TRIGGER validate_manual_sale_extras_trg
  BEFORE INSERT OR UPDATE ON public.manual_sales
  FOR EACH ROW EXECUTE FUNCTION public.validate_manual_sale_extras();
