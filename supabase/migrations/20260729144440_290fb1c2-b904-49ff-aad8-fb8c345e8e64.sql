CREATE TABLE public.bi_okr_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  lider text,
  equipes text,
  ano int NOT NULL,
  trimestre int NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bi_okr_key_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.bi_okr_objectives(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  meta numeric,
  unidade text,
  metrica text,
  progresso_manual numeric,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bi_okr_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_result_id uuid NOT NULL REFERENCES public.bi_okr_key_results(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  responsavel text,
  status text NOT NULL DEFAULT 'todo',
  prazo date,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_okr_objectives TO authenticated;
GRANT ALL ON public.bi_okr_objectives TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_okr_key_results TO authenticated;
GRANT ALL ON public.bi_okr_key_results TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_okr_initiatives TO authenticated;
GRANT ALL ON public.bi_okr_initiatives TO service_role;

ALTER TABLE public.bi_okr_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_okr_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_okr_initiatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "okr_obj_select" ON public.bi_okr_objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "okr_obj_admin" ON public.bi_okr_objectives FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "okr_kr_select" ON public.bi_okr_key_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "okr_kr_admin" ON public.bi_okr_key_results FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "okr_init_select" ON public.bi_okr_initiatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "okr_init_admin" ON public.bi_okr_initiatives FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_okr_obj_updated BEFORE UPDATE ON public.bi_okr_objectives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_okr_kr_updated BEFORE UPDATE ON public.bi_okr_key_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_okr_init_updated BEFORE UPDATE ON public.bi_okr_initiatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();