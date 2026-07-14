create table if not exists public.coach_calls (
  id uuid primary key default gen_random_uuid(),
  ccpbx_id text unique not null,
  started_at timestamptz not null,
  duration_sec int not null default 0,
  direction text,
  from_number text,
  to_number text,
  agent_user text,
  agent_name text,
  agent_email text,
  deal_id text,
  contact_name text,
  status text,
  recording_url text,
  transcript text,
  analysis jsonb,
  score numeric(3,1),
  raw jsonb,
  synced_at timestamptz not null default now(),
  analyzed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coach_calls_started_idx on public.coach_calls(started_at desc);
create index if not exists coach_calls_agent_idx on public.coach_calls(agent_email);
create index if not exists coach_calls_deal_idx on public.coach_calls(deal_id);
grant select, insert, update, delete on public.coach_calls to authenticated;
grant all on public.coach_calls to service_role;
alter table public.coach_calls enable row level security;
drop policy if exists "coach_calls admin all" on public.coach_calls;
create policy "coach_calls admin all" on public.coach_calls for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "coach_calls read own" on public.coach_calls;
create policy "coach_calls read own" on public.coach_calls for select to authenticated using (agent_email = (auth.jwt() ->> 'email'));