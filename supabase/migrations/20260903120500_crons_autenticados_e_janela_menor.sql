-- ─────────────────────────────────────────────────────────────────────────────
-- Reagenda os dois crons: (a) enviando x-api-key, agora que os endpoints exigem
-- autenticação, e (b) reduzindo a janela do sync da Clint de 90 para 2 dias.
--
-- ⚠️ PRÉ-REQUISITO MANUAL — sem isto os crons passam a receber 401 em silêncio:
--
--   1. Guarde o segredo no Vault (uma vez, no SQL Editor do Supabase):
--
--        select vault.create_secret('<valor-de-INTERNAL_API_KEY>', 'INTERNAL_API_KEY');
--
--      O valor tem que ser o MESMO da variável de ambiente INTERNAL_API_KEY no
--      painel do Lovable. Se ela ainda não existe lá, crie primeiro (qualquer
--      string aleatória longa serve) e faça o deploy antes de rodar isto.
--
--   2. Confirme depois com:
--        select jobname, schedule from cron.job;
--        select status, count(*) from cron.job_run_details
--         where start_time > now() - interval '1 hour' group by 1;
-- ─────────────────────────────────────────────────────────────────────────────

-- Idempotente: remove os jobs antigos antes de recriar.
select cron.unschedule('clint-sync-every-30min')
  where exists (select 1 from cron.job where jobname = 'clint-sync-every-30min');
select cron.unschedule('coach-auto-sync-analise-15min')
  where exists (select 1 from cron.job where jobname = 'coach-auto-sync-analise-15min');

-- Sync da Clint: janela de 2 dias em vez de 90.
--
-- runFullClintSync({ full: false }) usa sinceDays: 2 (era 90). Rodando de 30 em 30
-- minutos, 90 dias significava reescrever dezenas de milhares de linhas 48x por dia
-- via upsert — a causa raiz do bloat crescente. Para um recarregamento completo,
-- chame o endpoint manualmente com ?full=true.
select cron.schedule(
  'clint-sync-every-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://dashboardvendascomercial.lovable.app/api/public/sync/trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', (select decrypted_secret from vault.decrypted_secrets
                     where name = 'INTERNAL_API_KEY')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'coach-auto-sync-analise-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://dashboardvendascomercial.lovable.app/api/public/sync/coach-auto?sinceDays=3&max=8',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', (select decrypted_secret from vault.decrypted_secrets
                     where name = 'INTERNAL_API_KEY')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
