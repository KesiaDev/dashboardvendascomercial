REVOKE INSERT, UPDATE, DELETE ON public.sales FROM anon, authenticated;
REVOKE SELECT ON public.sales FROM anon;
DROP POLICY IF EXISTS "open_read_sales" ON public.sales;
DROP POLICY IF EXISTS "open_write_sales" ON public.sales;
DROP POLICY IF EXISTS "open_update_sales" ON public.sales;
DROP POLICY IF EXISTS "open_delete_sales" ON public.sales;
CREATE POLICY "authenticated_read_sales" ON public.sales
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.clint_origins FROM anon, authenticated;
REVOKE SELECT ON public.clint_origins FROM anon;
DROP POLICY IF EXISTS open_all_clint_origins ON public.clint_origins;
CREATE POLICY "authenticated_read_clint_origins" ON public.clint_origins
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.clint_origin_stages FROM anon, authenticated;
REVOKE SELECT ON public.clint_origin_stages FROM anon;
DROP POLICY IF EXISTS open_all_clint_origin_stages ON public.clint_origin_stages;
CREATE POLICY "authenticated_read_clint_origin_stages" ON public.clint_origin_stages
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.clint_lost_statuses FROM anon, authenticated;
REVOKE SELECT ON public.clint_lost_statuses FROM anon;
DROP POLICY IF EXISTS open_all_clint_lost_statuses ON public.clint_lost_statuses;
CREATE POLICY "authenticated_read_clint_lost_statuses" ON public.clint_lost_statuses
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.bi_pipeline_areas FROM anon, authenticated;
REVOKE SELECT ON public.bi_pipeline_areas FROM anon;
DROP POLICY IF EXISTS open_all_bi_pipeline_areas ON public.bi_pipeline_areas;
CREATE POLICY "authenticated_read_bi_pipeline_areas" ON public.bi_pipeline_areas
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.weekly_imports FROM anon, authenticated;
REVOKE SELECT ON public.weekly_imports FROM anon;
DROP POLICY IF EXISTS "open_all_imports" ON public.weekly_imports;
CREATE POLICY "authenticated_read_weekly_imports" ON public.weekly_imports
  FOR SELECT TO authenticated USING (true);