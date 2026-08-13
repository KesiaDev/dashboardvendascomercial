CREATE OR REPLACE VIEW public.coach_conv_outbound_sources
WITH (security_invoker = true) AS
SELECT
  m.conversation_id,
  count(*) FILTER (WHERE m.clint_source IN ('AUTOMATION','CAMPAIGN','AI_CONVERSATION')
                      OR m.sender_name ILIKE '%IA%') AS bot_out,
  count(*) FILTER (WHERE m.clint_source = 'CHAT') AS human_out,
  count(*) FILTER (WHERE m.clint_source IS NULL) AS unknown_out
FROM public.coach_messages m
WHERE m.direction = 'outbound'
GROUP BY m.conversation_id;

GRANT SELECT ON public.coach_conv_outbound_sources TO authenticated;
GRANT ALL ON public.coach_conv_outbound_sources TO service_role;