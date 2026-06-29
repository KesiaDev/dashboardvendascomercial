-- Seed inicial de bi_channels via SQL (não depende de abrir /areas antes de rodar
-- a migration seguinte, que tem FK em bi_targets.channel_id). O app re-sincroniza
-- essas linhas a cada visita à aba "Canais" — este INSERT só garante que elas já
-- existam a tempo do seed de bi_targets.
INSERT INTO public.bi_channels (id, label, tipo, clint_group_names, sck_prefixes) VALUES
  ('igt', 'IGT', 'aquisicao', ARRAY['IGT'], ARRAY['igt']),
  ('fgrs', 'FGRS', 'aquisicao', ARRAY['FGRS'], ARRAY['fgrs']),
  ('webinar_mentoria', 'Webinar Mentoria', 'aquisicao', ARRAY['WGT'], ARRAY[]::text[]),
  ('perpetuo_mentoria', 'Perpétuo Mentoria', 'aquisicao', ARRAY['FUNIS PERPETUOS', 'MGT'], ARRAY['mse']),
  ('webinar_fgrs', 'Webinar FGRS', 'aquisicao', ARRAY[]::text[], ARRAY[]::text[]),
  ('ldp', 'LDP (Live Direto ao Ponto)', 'aquisicao', ARRAY['INFOEDITORA'], ARRAY['ldp']),
  ('mas', 'Master and Scale', 'aquisicao', ARRAY['MASTER AND SCALE'], ARRAY['mas']),
  ('accelerator', 'Accelerator (perpétuo)', 'aquisicao', ARRAY['Accelerator'], ARRAY[]::text[]),
  ('evento_presencial', 'Evento Presencial', 'aquisicao', ARRAY[]::text[], ARRAY[]::text[]),
  ('perpetuo_ia', 'Perpétuo IA', 'aquisicao', ARRAY[]::text[], ARRAY[]::text[]),
  ('renovacao', 'Renovação', 'renovacao', ARRAY['SUCESSO DO CLIENTE'], ARRAY[]::text[]),
  ('outros', 'Outros / não classificado', 'outro', ARRAY[]::text[], ARRAY[]::text[])
ON CONFLICT (id) DO NOTHING;
