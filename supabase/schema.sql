-- ============================================================================
-- SENTRA ANGLER – DIGITAL CASH MANAGEMENT
-- Database Schema, Triggers, Row Level Security (RLS) & Realtime Setup
-- Jalankan script ini di Supabase SQL Editor (Project -> SQL Editor -> New Query)
-- ============================================================================

-- Ekstensi UUID
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TABEL PROFILES (Pengguna & Role: bendahara | anggota)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'anggota' check (role in ('bendahara', 'anggota')),
  whatsapp text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. TABEL MEMBERS (Database Anggota Komunitas - Maksimal 30 Anggota)
-- ============================================================================
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null unique,
  full_name text not null,
  whatsapp text not null,
  avatar_url text,
  join_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 3. TABEL CATEGORIES (Kategori Pemasukan & Pengeluaran)
-- ============================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('pemasukan', 'pengeluaran')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (name, type)
);

-- ============================================================================
-- 4. TABEL TRANSACTIONS (Buku Kas Digital + Soft Delete)
-- ============================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_code text not null unique,
  transaction_date date not null default current_date,
  type text not null check (type in ('pemasukan', 'pengeluaran')),
  category_id uuid references public.categories(id) on delete restrict,
  category_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  member_id uuid references public.members(id) on delete set null,
  event_id uuid,
  related_party text not null default '-',
  description text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_name text,
  delete_reason text
);

create index if not exists idx_transactions_date on public.transactions(transaction_date desc);
create index if not exists idx_transactions_type on public.transactions(type);
create index if not exists idx_transactions_member on public.transactions(member_id);
create index if not exists idx_transactions_deleted on public.transactions(deleted_at);

-- ============================================================================
-- 5. TABEL ATTACHMENTS (Bukti Transaksi)
-- ============================================================================
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text,
  mime_type text not null default 'image/jpeg',
  file_size integer not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 6. TABEL AUDIT_LOGS (Jejak Audit Aktivitas Bendahara - Append Only)
-- ============================================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('CREATE', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'INITIAL_BALANCE', 'ROLE_CHANGE', 'MEMBER_CHANGE', 'CATEGORY_CHANGE', 'EVENT_CHANGE')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  before_data jsonb,
  after_data jsonb,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);

-- ============================================================================
-- 7. TABEL SETTINGS (Konfigurasi Komunitas & Saldo Awal Resmi)
-- ============================================================================
create table if not exists public.settings (
  id text primary key default 'community_cash',
  community_name text not null default 'SENTRA ANGLER',
  tagline text not null default 'Transparansi Kas, Solidaritas Anggota',
  max_members integer not null default 30 check (max_members = 30),
  initial_balance numeric(14,2) not null default 0 check (initial_balance >= 0),
  initial_balance_set boolean not null default false,
  initial_balance_note text,
  initial_balance_set_at timestamptz,
  initial_balance_set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.settings (id, community_name, tagline, max_members, initial_balance, initial_balance_set)
values ('community_cash', 'SENTRA ANGLER', 'Transparansi Kas, Solidaritas Anggota', 30, 0, false)
on conflict (id) do nothing;

-- ============================================================================
-- SEED KATEGORI STANDAR SENTRA ANGLER
-- ============================================================================
insert into public.categories (name, type, is_default, sort_order) values
  ('Iuran anggota', 'pemasukan', true, 1),
  ('Donasi', 'pemasukan', true, 2),
  ('Sponsor', 'pemasukan', true, 3),
  ('Kontribusi anggota', 'pemasukan', true, 4),
  ('Hasil kegiatan', 'pemasukan', true, 5),
  ('Penjualan', 'pemasukan', true, 6),
  ('Pemasukan lainnya', 'pemasukan', true, 7),
  ('Kegiatan mancing', 'pengeluaran', true, 1),
  ('Konsumsi', 'pengeluaran', true, 2),
  ('Transportasi', 'pengeluaran', true, 3),
  ('Sewa tempat', 'pengeluaran', true, 4),
  ('Peralatan mancing', 'pengeluaran', true, 5),
  ('Hadiah', 'pengeluaran', true, 6),
  ('Dokumentasi', 'pengeluaran', true, 7),
  ('Operasional', 'pengeluaran', true, 8),
  ('Pengeluaran lainnya', 'pengeluaran', true, 9)
on conflict (name, type) do nothing;

-- ============================================================================
-- FUNGSI HELPER & TRIGGER KEAMANAN DATABASE
-- ============================================================================

-- Cek apakah user yang login adalah Bendahara aktif
create or replace function public.is_bendahara()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'bendahara'
      and is_active = true
  );
$$;

-- Trigger update timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists trg_members_updated on public.members;
create trigger trg_members_updated before update on public.members for each row execute function public.set_updated_at();

drop trigger if exists trg_transactions_updated on public.transactions;
create trigger trg_transactions_updated before update on public.transactions for each row execute function public.set_updated_at();

-- Batasi jumlah anggota maksimal 30 orang di level database
create or replace function public.enforce_max_30_members()
returns trigger
language plpgsql
as $$
declare
  total_count integer;
begin
  select count(*) into total_count from public.members;
  if total_count >= 30 then
    raise exception 'Batas maksimal 30 anggota komunitas SENTRA ANGLER telah tercapai.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_max_members on public.members;
create trigger trg_enforce_max_members before insert on public.members for each row execute function public.enforce_max_30_members();

-- Auto-create profile saat user baru mendaftar via Supabase Auth
-- User pertama otomatis menjadi 'bendahara', user berikutnya menjadi 'anggota'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
  assigned_role text;
begin
  select count(*) into user_count from public.profiles;
  if user_count = 0 then
    assigned_role := 'bendahara';
  else
    assigned_role := coalesce(new.raw_user_meta_data->>'role', 'anggota');
    if assigned_role not in ('bendahara', 'anggota') then
      assigned_role := 'anggota';
    end if;
    -- Hanya user pertama yang boleh auto-claim bendahara saat signup publik
    assigned_role := 'anggota';
  end if;

  insert into public.profiles (id, email, full_name, role, whatsapp)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    assigned_role,
    new.raw_user_meta_data->>'whatsapp'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- View perhitungan saldo resmi dari database (Saldo Akhir = Saldo Awal + Total Pemasukan - Total Pengeluaran)
create or replace view public.cash_summary as
select
  s.initial_balance,
  s.initial_balance_set,
  coalesce(sum(case when t.type = 'pemasukan' and t.deleted_at is null then t.amount else 0 end), 0) as total_income,
  coalesce(sum(case when t.type = 'pengeluaran' and t.deleted_at is null then t.amount else 0 end), 0) as total_expense,
  s.initial_balance
    + coalesce(sum(case when t.type = 'pemasukan' and t.deleted_at is null then t.amount else 0 end), 0)
    - coalesce(sum(case when t.type = 'pengeluaran' and t.deleted_at is null then t.amount else 0 end), 0) as current_balance
from public.settings s
left join public.transactions t on true
where s.id = 'community_cash'
group by s.id, s.initial_balance, s.initial_balance_set;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Hanya Bendahara yang dapat mengelola transaksi, anggota, kategori, dan setting
-- Semua anggota terautentikasi dapat membaca seluruh informasi keuangan
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;

-- PROFILES
create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own non-role profile fields"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

create policy "Bendahara can manage all profiles"
  on public.profiles for all
  to authenticated
  using (public.is_bendahara())
  with check (public.is_bendahara());

-- MEMBERS
create policy "Authenticated users can view members"
  on public.members for select
  to authenticated
  using (true);

create policy "Only bendahara can manage members"
  on public.members for all
  to authenticated
  using (public.is_bendahara())
  with check (public.is_bendahara());

-- CATEGORIES
create policy "Authenticated users can view categories"
  on public.categories for select
  to authenticated
  using (true);

create policy "Only bendahara can manage categories"
  on public.categories for all
  to authenticated
  using (public.is_bendahara())
  with check (public.is_bendahara());

-- TRANSACTIONS (Soft-delete only via UPDATE; hard DELETE diblokir!)
create policy "Authenticated users can view transactions"
  on public.transactions for select
  to authenticated
  using (true);

create policy "Only bendahara can insert transactions"
  on public.transactions for insert
  to authenticated
  with check (public.is_bendahara());

create policy "Only bendahara can update or soft-delete transactions"
  on public.transactions for update
  to authenticated
  using (public.is_bendahara())
  with check (public.is_bendahara());

-- ATTACHMENTS
create policy "Authenticated users can view attachments"
  on public.attachments for select
  to authenticated
  using (true);

create policy "Only bendahara can manage attachments"
  on public.attachments for all
  to authenticated
  using (public.is_bendahara())
  with check (public.is_bendahara());

-- AUDIT LOGS (Append-only)
create policy "Authenticated users can view audit logs"
  on public.audit_logs for select
  to authenticated
  using (true);

create policy "Only bendahara can insert audit logs"
  on public.audit_logs for insert
  to authenticated
  with check (public.is_bendahara());

-- SETTINGS
create policy "Authenticated users can view settings"
  on public.settings for select
  to authenticated
  using (true);

create policy "Only bendahara can update settings"
  on public.settings for update
  to authenticated
  using (public.is_bendahara())
  with check (public.is_bendahara());

-- ============================================================================
-- STORAGE BUCKET BUKTI TRANSAKSI
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

create policy "Public read receipts"
  on storage.objects for select
  using (bucket_id = 'receipts');

create policy "Only bendahara can upload receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts' and public.is_bendahara());

create policy "Only bendahara can delete receipts"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'receipts' and public.is_bendahara());

-- ============================================================================
-- REALTIME PUBLICATION (Notifikasi Real-Time Transaksi Masuk & Keluar)
-- ============================================================================
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.settings;

-- ============================================================================
-- MODUL ACARA, RAB & DAFTAR PESERTA
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
  drop constraint if exists fk_transactions_event;
alter table public.transactions
  add constraint fk_transactions_event foreign key (event_id) references public.events(id) on delete set null;
create index if not exists idx_transactions_event on public.transactions(event_id);

drop trigger if exists trg_events_updated on public.events;
create trigger trg_events_updated before update on public.events for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_budget_items enable row level security;
alter table public.event_participants enable row level security;

create policy "Authenticated users can view events"
  on public.events for select to authenticated using (true);
create policy "Only bendahara can manage events"
  on public.events for all to authenticated
  using (public.is_bendahara()) with check (public.is_bendahara());

create policy "Authenticated users can view event budget items"
  on public.event_budget_items for select to authenticated using (true);
create policy "Only bendahara can manage event budget items"
  on public.event_budget_items for all to authenticated
  using (public.is_bendahara()) with check (public.is_bendahara());

create policy "Authenticated users can view event participants"
  on public.event_participants for select to authenticated using (true);
create policy "Only bendahara can manage event participants"
  on public.event_participants for all to authenticated
  using (public.is_bendahara()) with check (public.is_bendahara());

