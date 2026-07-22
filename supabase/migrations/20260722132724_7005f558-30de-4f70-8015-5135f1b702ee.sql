
-- Arena Comercial IA — Fase 1
CREATE TABLE public.arena_personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona JSONB NOT NULL,
  difficulty TEXT NOT NULL,
  product TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_personas TO authenticated;
GRANT ALL ON public.arena_personas TO service_role;
ALTER TABLE public.arena_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own personas" ON public.arena_personas FOR ALL TO authenticated
  USING (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arena_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES public.arena_personas(id) ON DELETE CASCADE,
  mission_id UUID,
  status TEXT NOT NULL DEFAULT 'open',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  score NUMERIC,
  xp_earned INT NOT NULL DEFAULT 0,
  outcome TEXT,
  evaluation JSONB,
  current_emotion TEXT NOT NULL DEFAULT 'neutro'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_simulations TO authenticated;
GRANT ALL ON public.arena_simulations TO service_role;
ALTER TABLE public.arena_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sims" ON public.arena_simulations FOR ALL TO authenticated
  USING (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'));
CREATE INDEX arena_sims_seller_idx ON public.arena_simulations(seller_user_id, started_at DESC);

CREATE TABLE public.arena_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  simulation_id UUID NOT NULL REFERENCES public.arena_simulations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  emotion_after TEXT,
  ai_comment JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_messages TO authenticated;
GRANT ALL ON public.arena_messages TO service_role;
ALTER TABLE public.arena_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own msgs" ON public.arena_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.arena_simulations s WHERE s.id = simulation_id AND (s.seller_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.arena_simulations s WHERE s.id = simulation_id AND (s.seller_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE INDEX arena_msgs_sim_idx ON public.arena_messages(simulation_id, sent_at);

CREATE TABLE public.arena_missions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_date DATE NOT NULL,
  spec JSONB NOT NULL,
  completed_simulation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_user_id, mission_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_missions TO authenticated;
GRANT ALL ON public.arena_missions TO service_role;
ALTER TABLE public.arena_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own missions" ON public.arena_missions FOR ALL TO authenticated
  USING (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arena_progress (
  seller_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp INT NOT NULL DEFAULT 0,
  league TEXT NOT NULL DEFAULT 'Bronze',
  streak_days INT NOT NULL DEFAULT 0,
  last_played_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_progress TO authenticated;
GRANT ALL ON public.arena_progress TO service_role;
ALTER TABLE public.arena_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress read" ON public.arena_progress FOR SELECT TO authenticated
  USING (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own progress write" ON public.arena_progress FOR ALL TO authenticated
  USING (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = seller_user_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arena_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arena_knowledge TO authenticated;
GRANT ALL ON public.arena_knowledge TO service_role;
ALTER TABLE public.arena_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read knowledge" ON public.arena_knowledge FOR SELECT TO authenticated USING (true);
