REVOKE ALL ON TABLE public.sales FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sales FROM authenticated;
GRANT SELECT ON TABLE public.sales TO authenticated;
GRANT ALL ON TABLE public.sales TO service_role;

DROP POLICY IF EXISTS "authenticated_read_sales" ON public.sales;
DROP POLICY IF EXISTS "admin_read_sales" ON public.sales;

CREATE POLICY "admin_read_sales"
ON public.sales
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));