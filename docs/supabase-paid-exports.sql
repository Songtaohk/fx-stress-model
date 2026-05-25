create extension if not exists pgcrypto;

create table if not exists public.paid_exports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  email text not null,
  kind text not null check (kind in ('current', 'full')),
  expected_amount numeric not null,
  expected_currency text not null check (expected_currency in ('RMB', 'HKD', 'USD')),
  payment_method text not null check (payment_method in ('stripe', 'alipay_hk', 'alipay_cn', 'zelle')),
  payment_reference text,
  stripe_session_id text,
  selection jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
);

alter table public.paid_exports add column if not exists stripe_session_id text;
alter table public.paid_exports drop constraint if exists paid_exports_payment_method_check;
alter table public.paid_exports add constraint paid_exports_payment_method_check check (payment_method in ('stripe', 'alipay_hk', 'alipay_cn', 'zelle'));

create index if not exists paid_exports_email_idx on public.paid_exports (email);
create index if not exists paid_exports_status_idx on public.paid_exports (status);
create index if not exists paid_exports_stripe_session_id_idx on public.paid_exports (stripe_session_id);
create index if not exists paid_exports_created_at_idx on public.paid_exports (created_at desc);

alter table public.paid_exports enable row level security;

-- The website API uses SUPABASE_SERVICE_ROLE_KEY on Vercel serverless functions.
-- Do not expose the service role key in browser code.
