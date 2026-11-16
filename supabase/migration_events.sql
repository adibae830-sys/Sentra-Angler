-- ============================================================================
-- MIGRASI MODUL ACARA, RAB & PESERTA (SENTRA ANGLER)
-- Jalankan script ini di Supabase SQL Editor jika tabel awal sudah dibuat sebelumnya
-- ============================================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  event_date date not null,
  location text not null default '',
  description text not null default '',
  target_participants integer not null default 20 check (target_participants >= 1 and target_participants <= 30),
  fee_per_member numeric(14,2) not null default 0 check (fee_per_member >= 0),
  status text not null default 'planned' check (status in ('planned', 'ongoing', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_budget_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  type text not null check (type in ('pemasukan', 'pengeluaran')),
  category_id uuid not null references public.categories(id) on delete restrict,
  category_name text not null,
  item_name text not null,
  estimated_amount numeric(14,2) not null check (estimated_amount >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  is_attending boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);

alter table public.transactions
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists idx_transactions_event on public.transactions(event_id);

-- Update constraint action pada audit_logs agar mendukung EVENT_CHANGE
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in ('CREATE', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'INITIAL_BALANCE', 'ROLE_CHANGE', 'MEMBER_CHANGE', 'CATEGORY_CHANGE', 'EVENT_CHANGE'));

drop trigger if exists trg_events_updated on public.events;
create trigger trg_events_updated before update on public.events for each row execute function public.set_updated_at();

-- RLS Policies
alter table public.events enable row level security;
alter table public.event_budget_items enable row level security;
alter table public.event_participants enable row level security;

drop policy if exists "Authenticated users can view events" on public.events;
create policy "Authenticated users can view events"
  on public.events for select to authenticated using (true);

drop policy if exists "Only bendahara can manage events" on public.events;
create policy "Only bendahara can manage events"
  on public.events for all to authenticated
  using (public.is_bendahara()) with check (public.is_bendahara());

drop policy if exists "Authenticated users can view event budget items" on public.event_budget_items;
create policy "Authenticated users can view event budget items"
  on public.event_budget_items for select to authenticated using (true);

drop policy if exists "Only bendahara can manage event budget items" on public.event_budget_items;
create policy "Only bendahara can manage event budget items"
  on public.event_budget_items for all to authenticated
  using (public.is_bendahara()) with check (public.is_bendahara());

drop policy if exists "Authenticated users can view event participants" on public.event_participants;
create policy "Authenticated users can view event participants"
  on public.event_participants for select to authenticated using (true);

drop policy if exists "Only bendahara can manage event participants" on public.event_participants;
create policy "Only bendahara can manage event participants"
  on public.event_participants for all to authenticated
  using (public.is_bendahara()) with check (public.is_bendahara());
