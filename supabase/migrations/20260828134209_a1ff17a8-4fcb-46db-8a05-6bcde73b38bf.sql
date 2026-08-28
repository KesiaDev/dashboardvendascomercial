CREATE OR REPLACE FUNCTION public.conversao_deals_agg(_from date, _to date)
RETURNS TABLE (origin_name text, user_name text, leads bigint, lost bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.origin_name,
         d.user_name,
         count(*) FILTER (WHERE d.created_at >= _from::timestamptz AND d.created_at < (_to + 1)::timestamptz) AS leads,
         count(*) FILTER (WHERE d.status = 'LOST' AND d.lost_at >= _from::timestamptz AND d.lost_at < (_to + 1)::timestamptz) AS lost
  FROM public.clint_deals d
  WHERE (d.created_at >= _from::timestamptz AND d.created_at < (_to + 1)::timestamptz)
     OR (d.status = 'LOST' AND d.lost_at >= _from::timestamptz AND d.lost_at < (_to + 1)::timestamptz)
  GROUP BY 1, 2
$$;

GRANT EXECUTE ON FUNCTION public.conversao_deals_agg(date, date) TO authenticated, service_role;