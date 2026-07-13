
ALTER VIEW IF EXISTS public.coach_weekly_summary SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

DROP POLICY IF EXISTS "authenticated read weekly_results" ON public.bi_weekly_results;
DROP POLICY IF EXISTS "authenticated write weekly_results" ON public.bi_weekly_results;
CREATE POLICY "Admins manage bi_weekly_results" ON public.bi_weekly_results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "authenticated read monthly_overrides" ON public.bi_monthly_overrides;
DROP POLICY IF EXISTS "authenticated write monthly_overrides" ON public.bi_monthly_overrides;
CREATE POLICY "Admins manage bi_monthly_overrides" ON public.bi_monthly_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "clint_raw_auth_all" ON public.clint_events_raw;
CREATE POLICY "Admins manage clint_events_raw" ON public.clint_events_raw
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_conv_auth_all" ON public.coach_conversations;
CREATE POLICY "Admins manage coach_conversations" ON public.coach_conversations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_msg_auth_all" ON public.coach_messages;
CREATE POLICY "Admins manage coach_messages" ON public.coach_messages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_analyses_auth_all" ON public.coach_analyses;
CREATE POLICY "Admins manage coach_analyses" ON public.coach_analyses
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_meet_auth_all" ON public.coach_meetings;
CREATE POLICY "Admins manage coach_meetings" ON public.coach_meetings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_meet_ana_auth_all" ON public.coach_meeting_analyses;
CREATE POLICY "Admins manage coach_meeting_analyses" ON public.coach_meeting_analyses
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_alerts_auth_all" ON public.coach_alerts;
CREATE POLICY "Admins manage coach_alerts" ON public.coach_alerts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_config_auth_all" ON public.coach_config;
CREATE POLICY "Admins manage coach_config" ON public.coach_config
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "coach_logs_auth_all" ON public.coach_integration_logs;
CREATE POLICY "Admins manage coach_integration_logs" ON public.coach_integration_logs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view all referrals" ON public.referrals;
DROP POLICY IF EXISTS "Authenticated can update referrals" ON public.referrals;
DROP POLICY IF EXISTS "Authenticated can insert referrals" ON public.referrals;
CREATE POLICY "Users read own or admin reads all referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (created_by_email = (auth.jwt() ->> 'email') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own referrals" ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (created_by_email = (auth.jwt() ->> 'email') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own or admin updates all referrals" ON public.referrals
  FOR UPDATE TO authenticated
  USING (created_by_email = (auth.jwt() ->> 'email') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by_email = (auth.jwt() ->> 'email') OR public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bi_channels','bi_commission_bonuses','bi_commission_periods','bi_commission_rates',
    'bi_followup_activities','bi_pipeline_areas','bi_product_config','bi_seller_config',
    'bi_targets','bi_team_activity','bi_wise_payments',
    'clint_deals','clint_lost_statuses','clint_origin_stages','clint_origins','clint_sync_log','clint_users',
    'sales','weekly_imports'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %I" ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY "Admins manage %I" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''));',
      t, t
    );
  END LOOP;
END $$;
