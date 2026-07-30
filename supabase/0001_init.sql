-- SEGE Marketing + Recruiting — initial schema
-- Postgres (Supabase). Non-PHI business/marketing data only.
-- Percentages/derived metrics are computed at query time, never stored.
-- Apply from the mini:  psql "$SUPABASE_DB_URL" -f 0001_init.sql

begin;

-- ─────────────────────────────────────────────────────────────
-- reference / status
-- ─────────────────────────────────────────────────────────────
create table if not exists data_refresh (
  source       text primary key,          -- 'nppes' | 'snf' | 'freida'
  last_run     timestamptz,
  row_count    integer,
  status       text,                       -- 'ok' | 'failed'
  note         text
);

-- ─────────────────────────────────────────────────────────────
-- SNF marketing targets (CMS Care Compare) — national, ~15k rows
-- ─────────────────────────────────────────────────────────────
create table if not exists snf (
  ccn                     text primary key,
  facility_name           text,
  legal_name              text,
  chain_name              text,
  chain_id                text,
  facilities_in_chain     integer,
  address                 text,
  city                    text,
  state                   text,
  zip                     text,
  county                  text,
  phone                   text,
  latitude                double precision,
  longitude               double precision,
  ownership_type          text,
  primary_owner           text,
  owner_type              text,
  provider_type           text,
  urban_rural             text,
  ccrc                    boolean,
  certified_beds          integer,
  avg_daily_census        numeric,
  medicare_approved       boolean,
  overall_rating          smallint,
  health_inspection_rating smallint,
  staffing_rating         smallint,
  qm_rating               smallint,
  longstay_qm_rating      smallint,
  shortstay_qm_rating     smallint,
  chain_overall_rating    numeric,
  updated_at              timestamptz default now()
);
create index if not exists snf_state_idx  on snf(state);
create index if not exists snf_rating_idx on snf(overall_rating);
create index if not exists snf_chain_idx  on snf(chain_name);

-- ─────────────────────────────────────────────────────────────
-- Residency programs (FREIDA) — national, ~14k rows
-- ─────────────────────────────────────────────────────────────
create table if not exists residency_program (
  program_id            text primary key,
  program_name          text,
  program_url           text,
  last_updated          text,
  accredited_length     text,
  required_length       text,
  address               text,
  address2              text,
  org_name              text,
  city                  text,
  state                 text,
  zip                   text,
  latitude              double precision,
  longitude             double precision,
  facebook              text,
  instagram             text,
  twitter               text,
  specialty             text,
  specialty_designation text,
  sponsor_institution   text,
  institution_beds      integer,
  program_website       text,
  avg_hours_week_y1     numeric,
  max_hours_week_y1     numeric,
  night_float           text,
  call_schedule         text,
  moonlighting_allowed  text,
  first_year_positions  integer,
  total_positions       integer,
  first_year_salary     numeric,
  updated_at            timestamptz default now()
);
create index if not exists rp_state_idx     on residency_program(state);
create index if not exists rp_specialty_idx on residency_program(specialty);

-- ─────────────────────────────────────────────────────────────
-- Providers (NPPES, filtered to recruiting states) — PARTITIONED BY STATE
-- trimmed to recruiting-relevant columns; full 330-col CSVs stay archived on the mini.
-- Big states (e.g. TX) can be sub-partitioned by region later.
-- ─────────────────────────────────────────────────────────────
create table if not exists provider (
  npi                bigint      not null,
  state              text        not null,           -- practice location state (partition key)
  entity_type        smallint,                        -- 1 individual, 2 org
  first_name         text,
  last_name          text,
  middle_name        text,
  credential         text,                            -- MD, DO, NP, PA...
  org_name           text,
  primary_taxonomy   text,
  primary_specialty  text,
  address1           text,
  address2           text,
  city               text,
  zip                text,
  county             text,
  phone              text,
  fax                text,
  gender             text,
  sole_proprietor    boolean,
  enumeration_date   date,
  npi_last_updated   date,
  -- enrichment (from run_daily.py / linkedin.py / doximity.py / phone_lookup.py)
  email              text,
  mobile_phone       text,
  linkedin_url       text,
  doximity_url       text,
  region             text,                            -- optional sub-split label (e.g. TX_North)
  updated_at         timestamptz default now(),
  primary key (npi, state)
) partition by list (state);

-- active recruiting states today; add partitions as states come online
create table if not exists provider_tx  partition of provider for values in ('TX');
create table if not exists provider_tn  partition of provider for values in ('TN');
create table if not exists provider_co  partition of provider for values in ('CO');
create table if not exists provider_ky  partition of provider for values in ('KY');
create table if not exists provider_ut  partition of provider for values in ('UT');
create table if not exists provider_nv  partition of provider for values in ('NV');
create table if not exists provider_ne  partition of provider for values in ('NE');
create table if not exists provider_id  partition of provider for values in ('ID');
create table if not exists provider_default partition of provider default;

create index if not exists provider_specialty_idx on provider(primary_specialty);
create index if not exists provider_cred_idx      on provider(credential);
create index if not exists provider_name_idx      on provider(lower(last_name), lower(first_name));

-- ─────────────────────────────────────────────────────────────
-- Current Togo facilities (existing-customer exclusion / overlay)
-- ─────────────────────────────────────────────────────────────
create table if not exists current_facility (
  id            text primary key,
  facility_name text,
  ccn           text references snf(ccn),
  state         text,
  city          text,
  status        text,
  notes         text
);

-- ─────────────────────────────────────────────────────────────
-- Outreach: campaigns, events, opt-out suppression
-- ─────────────────────────────────────────────────────────────
create table if not exists opt_out (
  contact     text primary key,     -- normalized phone (E.164) or email
  channel     text,                 -- 'sms' | 'email'
  reason      text,
  created_at  timestamptz default now()
);

create table if not exists campaign (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  channel      text not null,               -- 'sms' | 'email'
  target_type  text not null,               -- 'snf' | 'provider' | 'residency'
  segment      jsonb not null default '{}', -- the filter that defines the audience
  template     text,
  ab_variants  jsonb,
  status       text not null default 'draft', -- draft|queued|sending|sent|paused
  created_by   text,
  created_at   timestamptz default now(),
  approved_by  text,                         -- must be set before sending
  approved_at  timestamptz
);

create table if not exists outreach_event (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references campaign(id),
  target_type  text,                         -- snf|provider|residency
  target_ref   text,                         -- ccn | npi | program_id
  channel      text,
  to_contact   text,
  ab_variant   text,
  status       text not null default 'queued', -- queued|sent|delivered|failed|replied|opted_out
  message_sid  text,
  body         text,
  reply_text   text,
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz default now()
);
create index if not exists oe_campaign_idx on outreach_event(campaign_id);
create index if not exists oe_status_idx   on outreach_event(status);
create index if not exists oe_target_idx   on outreach_event(target_type, target_ref);

-- ─────────────────────────────────────────────────────────────
-- RLS — enable now; the scraper uses the service/secret key (bypasses RLS).
-- Browser uses the publishable/anon key under Supabase Auth. Policies tighten
-- once staff auth + roles are configured; start read-for-authenticated.
-- ─────────────────────────────────────────────────────────────
alter table snf               enable row level security;
alter table residency_program enable row level security;
alter table provider          enable row level security;
alter table current_facility  enable row level security;
alter table campaign          enable row level security;
alter table outreach_event    enable row level security;
alter table opt_out           enable row level security;
alter table data_refresh      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['snf','residency_program','provider','current_facility','campaign','outreach_event','opt_out','data_refresh']
  loop
    execute format('drop policy if exists read_auth on %I', t);
    execute format('create policy read_auth on %I for select to authenticated using (true)', t);
  end loop;
end $$;
-- campaigns/opt_out writable by authenticated staff (sending still gated in app + Edge Function)
drop policy if exists campaign_write on campaign;
create policy campaign_write on campaign for all to authenticated using (true) with check (true);
drop policy if exists optout_write on opt_out;
create policy optout_write on opt_out for all to authenticated using (true) with check (true);

commit;
