CREATE TABLE IF NOT EXISTS public.clint_events_raw (
  id          bigserial PRIMARY KEY,
  external_id text UNIQUE,
  event_type  text,
  payload     jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'received'
               CHECK (status IN ('received','processed','error','skipped')),
  error_msg   text
);
CREATE INDEX IF NOT EXISTS idx_clint_raw_ext ON public.clint_events_raw(external_id);
CREATE INDEX IF NOT EXISTS idx_clint_raw_rcv ON public.clint_events_raw(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_clint_raw_status ON public.clint_events_raw(status);
GRANT SELECT, INSERT, UPDATE ON public.clint_events_raw TO authenticated;
GRANT ALL ON public.clint_events_raw TO service_role;
ALTER TABLE public.clint_events_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clint_raw_auth_all" ON public.clint_events_raw
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS author     text CHECK (author IN ('cliente','vendedor','pendente_revisao')),
  ADD COLUMN IF NOT EXISTS seller_id  text,
  ADD COLUMN IF NOT EXISTS lead_phone text;
UPDATE public.coach_messages
   SET author = CASE direction WHEN 'outbound' THEN 'vendedor' ELSE 'cliente' END
 WHERE author IS NULL;

ALTER TABLE public.coach_analyses
  ADD COLUMN IF NOT EXISTS prompt_version      text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS triggered_by        text NOT NULL DEFAULT 'manual'
               CHECK (triggered_by IN ('manual','auto_timer','stage_change','upload')),
  ADD COLUMN IF NOT EXISTS justificativa_nota  text,
  ADD COLUMN IF NOT EXISTS pontos_fortes       jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pontos_melhoria     jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.coach_alerts
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'aberto'
               CHECK (state IN ('aberto','visto','resolvido'));
UPDATE public.coach_alerts SET state = 'resolvido' WHERE resolved = true AND state = 'aberto';

ALTER TABLE public.coach_config
  ADD COLUMN IF NOT EXISTS seller_phones          jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_analysis          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS analysis_interval_hours int NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.sync_alert_state()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.resolved = true AND NEW.state = 'aberto' THEN NEW.state := 'resolvido';
  ELSIF NEW.resolved = false AND NEW.state = 'resolvido' THEN NEW.state := 'aberto';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_alert_state ON public.coach_alerts;
CREATE TRIGGER trg_sync_alert_state BEFORE UPDATE ON public.coach_alerts
  FOR EACH ROW EXECUTE FUNCTION public.sync_alert_state();

CREATE OR REPLACE VIEW public.coach_weekly_summary AS
SELECT cc.seller_name, cc.seller_email,
  date_trunc('week', ca.analyzed_at)::date AS week_start,
  count(*) AS convs_analyzed,
  round(avg(ca.score_geral)::numeric, 1) AS avg_score,
  round(avg(ca.tempo_medio_resposta_min)::numeric, 0) AS avg_resp_min,
  sum(CASE WHEN ca.tentou_fechar THEN 1 ELSE 0 END) AS total_fechamentos,
  round(100.0 * sum(CASE WHEN ca.tentou_fechar THEN 1 ELSE 0 END) / NULLIF(count(*),0), 0) AS pct_fechamento
FROM public.coach_analyses ca
JOIN public.coach_conversations cc ON cc.id = ca.conversation_id
WHERE ca.status = 'ok' AND ca.analyzed_at >= now() - interval '12 weeks'
GROUP BY cc.seller_name, cc.seller_email, date_trunc('week', ca.analyzed_at)::date
ORDER BY week_start DESC, avg_score DESC;
GRANT SELECT ON public.coach_weekly_summary TO authenticated;
GRANT SELECT ON public.coach_weekly_summary TO service_role;