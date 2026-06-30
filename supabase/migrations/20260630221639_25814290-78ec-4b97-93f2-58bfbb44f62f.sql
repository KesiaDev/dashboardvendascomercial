DROP POLICY IF EXISTS "Users can update their own sales" ON public.manual_sales;
DROP POLICY IF EXISTS "Users can delete their own sales" ON public.manual_sales;
CREATE POLICY "Team can update any sale" ON public.manual_sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team can delete any sale" ON public.manual_sales FOR DELETE TO authenticated USING (true);