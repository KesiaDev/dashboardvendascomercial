UPDATE public.sales
SET origem_checkout = COALESCE(
  NULLIF(origem_checkout, ''),
  raw->'data'->'purchase'->'origin'->>'sck',
  raw->'purchase'->'origin'->>'sck',
  raw->'data'->'purchase'->'origin'->>'src',
  raw->'purchase'->'origin'->>'src'
)
WHERE (origem_checkout IS NULL OR origem_checkout = '')
  AND raw IS NOT NULL
  AND COALESCE(
    raw->'data'->'purchase'->'origin'->>'sck',
    raw->'purchase'->'origin'->>'sck',
    raw->'data'->'purchase'->'origin'->>'src',
    raw->'purchase'->'origin'->>'src'
  ) IS NOT NULL;