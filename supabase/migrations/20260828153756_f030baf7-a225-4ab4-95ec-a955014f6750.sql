CREATE OR REPLACE FUNCTION public.conversao_deals_agg(_from date, _to date)
 RETURNS TABLE(origin_name text, user_name text, leads bigint, lost bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '55s'
AS $function$
  WITH parts AS (
    SELECT d.origin_name, d.user_name, 1::bigint AS leads, 0::bigint AS lost
    FROM public.clint_deals d
    WHERE d.created_at >= _from::timestamptz
      AND d.created_at < (_to + 1)::timestamptz
    UNION ALL
    SELECT d.origin_name, d.user_name, 0::bigint, 1::bigint
    FROM public.clint_deals d
    WHERE d.status = 'LOST'
      AND d.lost_at >= _from::timestamptz
      AND d.lost_at < (_to + 1)::timestamptz
  )
  SELECT p.origin_name, p.user_name, sum(p.leads), sum(p.lost)
  FROM parts p
  GROUP BY 1, 2
$function$;