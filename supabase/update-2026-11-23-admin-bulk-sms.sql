-- Apply to the MEZZO STAFF database, not Battle Arena.
-- Client roles cannot access campaign phone numbers or alter sending claims.
create table if not exists public.sms_campaigns (
 id uuid primary key,
 created_by uuid not null,
 title text not null,
 message text not null check (length(message) between 1 and 1600),
 recipients jsonb not null check (jsonb_typeof(recipients)='array' and jsonb_array_length(recipients) between 1 and 1000),
 recipient_count integer not null check (recipient_count between 1 and 1000),
 total_segments integer not null,
 content_hash text not null,
 created_at timestamptz not null default now()
);
create index if not exists sms_campaigns_created_at_idx on public.sms_campaigns(created_at desc);
create table if not exists public.sms_batches (
 id uuid primary key,
 campaign_id uuid not null references public.sms_campaigns(id),
 batch_index integer not null check (batch_index>=0),
 recipient_count integer not null check (recipient_count between 1 and 25),
 status text not null check (status in ('processing','accepted','rejected','unknown')),
 created_at timestamptz not null default now(),
 unique(campaign_id,batch_index)
);
alter table public.sms_campaigns enable row level security;
alter table public.sms_batches enable row level security;
revoke all on public.sms_campaigns, public.sms_batches from public,anon,authenticated;
grant all on public.sms_campaigns, public.sms_batches to service_role;
