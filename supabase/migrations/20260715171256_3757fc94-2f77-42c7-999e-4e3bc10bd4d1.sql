SELECT cron.schedule(
  'clint-sync-every-30min',
  '*/30 * * * *',
  $$SELECT net.http_post(
      url:='https://dashboardvendascomercial.lovable.app/api/public/sync/trigger',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;$$
);