select cron.schedule(
  'coach-auto-sync-analise-15min',
  '*/15 * * * *',
  $$ select net.http_post(
      url:='https://dashboardvendascomercial.lovable.app/api/public/sync/coach-auto?sinceDays=3&max=8',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id; $$
);