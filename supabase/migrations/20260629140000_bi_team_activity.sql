-- Atividade do time (ligações, e-mails, tarefas, reuniões, WhatsApp, negócios
-- trabalhados) por vendedor e período. A API da Clint não expõe esse dado
-- (módulo de atividades sem suporte via API, confirmado pelo suporte) -- só
-- entra por export manual em /import, periodicamente (ex.: semanal).
CREATE TABLE public.bi_team_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  user_name text NOT NULL,
  ligacoes integer NOT NULL DEFAULT 0,
  emails integer NOT NULL DEFAULT 0,
  tarefas integer NOT NULL DEFAULT 0,
  reunioes_agendadas integer NOT NULL DEFAULT 0,
  whatsapp integer NOT NULL DEFAULT 0,
  negocios_trabalhados integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo_inicio, periodo_fim, user_name)
);

CREATE INDEX idx_bi_team_activity_periodo ON public.bi_team_activity(periodo_inicio, periodo_fim);

REVOKE ALL ON public.bi_team_activity FROM anon, authenticated;
GRANT ALL ON public.bi_team_activity TO service_role;

ALTER TABLE public.bi_team_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_team_activity FORCE ROW LEVEL SECURITY;

-- Contagem de atividades por tipo/tag (gráfico de follow-up), agregado para
-- todo o time, sem quebra por vendedor.
CREATE TABLE public.bi_followup_activities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  titulo_atividade text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo_inicio, periodo_fim, titulo_atividade)
);

CREATE INDEX idx_bi_followup_activities_periodo ON public.bi_followup_activities(periodo_inicio, periodo_fim);

REVOKE ALL ON public.bi_followup_activities FROM anon, authenticated;
GRANT ALL ON public.bi_followup_activities TO service_role;

ALTER TABLE public.bi_followup_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_followup_activities FORCE ROW LEVEL SECURITY;
