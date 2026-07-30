-- SEGE Command Center — Salesforce-style Accounts + Checklists + Tasks
-- Unified model: every business / facility / provider is an "account" that runs a role-owned
-- checklist; each checklist item becomes a task with state + assignee, so staff always see the
-- next needed step. Seeded from the "Business Protocols" sheet. Idempotent (safe to re-run).

begin;

do $$ begin
  create type account_type as enum ('business','facility','provider');
exception when duplicate_object then null; end $$;
do $$ begin
  create type task_state as enum ('not_started','in_progress','complete','na','blocked');
exception when duplicate_object then null; end $$;

create table if not exists account (
  id           uuid primary key default gen_random_uuid(),
  type         account_type not null,
  name         text not null,
  state        text,
  portfolio    text,                         -- Venza / Utah / Sweetwater ... (facilities/providers)
  status       text,                         -- live | go_live_soon | scheduled | prospect ...
  owner        text,                         -- primary responsible person
  ref_ccn      text,                         -- optional link -> snf.ccn
  ref_npi      bigint,                       -- optional link -> provider.npi
  ref_program  text,                         -- optional link -> residency_program.program_id
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists account_type_idx on account(type);
create index if not exists account_state_idx on account(state);

-- checklist TEMPLATE (the process), one set per account_type, phased + role-owned
create table if not exists checklist_item (
  id          uuid primary key default gen_random_uuid(),
  applies_to  account_type not null,
  phase       text not null,
  label       text not null,
  role        text,                          -- default responsible role/person
  ord         int not null,
  unique (applies_to, phase, label)
);

-- TASK instances: one per account per checklist item
create table if not exists task (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade,
  item_id     uuid not null references checklist_item(id) on delete cascade,
  state       task_state not null default 'not_started',
  assignee    text,
  due_date    date,
  notes       text,
  updated_at  timestamptz default now(),
  updated_by  text,
  unique (account_id, item_id)
);
create index if not exists task_account_idx on task(account_id);
create index if not exists task_state_idx   on task(state);

-- progress % per account (computed, never stored)
create or replace view v_account_progress as
select a.id as account_id, a.type, a.name,
       count(t.*) filter (where t.state <> 'na')                      as applicable,
       count(t.*) filter (where t.state = 'complete')                as done,
       coalesce(round(100.0*count(t.*) filter (where t.state='complete')
                      / nullif(count(t.*) filter (where t.state<>'na'),0)),0) as pct
from account a
left join task t on t.account_id = a.id
group by a.id;

-- the single NEXT needed step per account (lowest-ord incomplete item for its type)
create or replace view v_next_action as
select distinct on (a.id)
       a.id as account_id, a.type, a.name, ci.phase, ci.label, ci.role,
       coalesce(t.state,'not_started') as state, t.assignee
from account a
join checklist_item ci on ci.applies_to = a.type
left join task t on t.account_id = a.id and t.item_id = ci.id
where coalesce(t.state,'not_started') not in ('complete','na')
order by a.id, ci.ord;

-- ── seed checklist templates from the Business Protocols sheet ──
insert into checklist_item (applies_to, phase, label, role, ord) values
 -- BUSINESS · Entity Setup
 ('business','Entity Setup','SEGE Management contract','Riley/CEO',10),
 ('business','Entity Setup','Provider Group Entity','Riley/CEO',20),
 ('business','Entity Setup','EIN — Provider Group','Riley/CEO',30),
 ('business','Entity Setup','PC / PLLC / LLC type','Riley/CEO',40),
 ('business','Entity Setup','Bank Account — Provider Group','Riley/CEO',50),
 ('business','Entity Setup','Physician owner (y/n)','Riley/CEO',60),
 ('business','Entity Setup','Board of Directors','Riley/CEO',70),
 ('business','Entity Setup','MSO Entity','Riley/CEO',80),
 ('business','Entity Setup','EIN — MSO','Riley/CEO',90),
 ('business','Entity Setup','MSO LLC','Riley/CEO',100),
 ('business','Entity Setup','Bank Account — MSO','Riley/CEO',110),
 ('business','Entity Setup','Owner information','Riley/CEO',120),
 ('business','Entity Setup','Owner percentages','Riley/CEO',130),
 -- BUSINESS · Agreements
 ('business','Agreements','Subcontract MSA — SEGE Management','Riley/CEO',210),
 ('business','Agreements','Subcontract — Togo Health','Riley/CEO',220),
 ('business','Agreements','Subcontract — PMG (billing)','Riley/CEO',230),
 ('business','Agreements','Subcontract — Zamp (PEO)','Riley/CEO',240),
 ('business','Agreements','Subcontract — Day Group / Instamobile','Riley/CEO',250),
 ('business','Agreements','Continuity Planning Agreement','CCO',260),
 ('business','Agreements','Medical Advisor Agreement','CCO',270),
 ('business','Agreements','PC Owner Agreement','CCO',280),
 ('business','Agreements','PC Owner Employment Agreement','Riley/CEO',290),
 ('business','Agreements','Provider (Employee) Agreements','Grace/Robin',300),
 ('business','Agreements','PC Operating Agreement','Riley/CEO',310),
 ('business','Agreements','Deficit Funding Loan Agreement','Riley/CEO',320),
 ('business','Agreements','MSO Operating Agreement','Riley/CEO',330),
 -- BUSINESS · Insurance & Ops
 ('business','Insurance & Ops','Malpractice','Riley',410),
 ('business','Insurance & Ops','GL / PL','Riley',420),
 ('business','Insurance & Ops','Workers Comp','Riley',430),
 ('business','Insurance & Ops','BAA with MSO / Togo / PMG','Riley',440),
 ('business','Insurance & Ops','Buy domain per entity','Riley',450),
 ('business','Insurance & Ops','Domain on admin email app','Riley',460),
 ('business','Insurance & Ops','Provider emails set up','Riley',470),
 ('business','Insurance & Ops','Indeed account (SEGE)','Riley',480),
 ('business','Insurance & Ops','QuickBooks','Robin',490),
 ('business','Insurance & Ops','Billing contracts (PMG)','Robin',500),
 -- FACILITY · Setup
 ('facility','Facility Setup','Facility Contract','Riley',10),
 ('facility','Facility Setup','Facility Onboarding Form','CCO',20),
 ('facility','Facility Setup','Facility EMR access','CCO',30),
 ('facility','Facility Setup','Stipend amount confirmed','Riley',40),
 ('facility','Facility Setup','Lab — login','CCO',50),
 ('facility','Facility Setup','Imaging — login','CCO',60),
 ('facility','Facility Setup','Pharmacy connection','CCO',70),
 ('facility','Facility Setup','Togo patient charts setup','Jordan/CCO',80),
 -- FACILITY · Marketing & Launch
 ('facility','Marketing & Launch','Pens','CFO',110),
 ('facility','Marketing & Launch','Banner','CFO',120),
 ('facility','Marketing & Launch','Marketing TVs','CFO',130),
 ('facility','Marketing & Launch','Meet regional team','CCO',140),
 ('facility','Marketing & Launch','Meet facility management team','CCO',150),
 -- PROVIDER · Onboarding (high-level; detailed 8-phase pipeline lives in sege-staffing)
 ('provider','Provider Onboarding','Generic offer letter','Riley',10),
 ('provider','Provider Onboarding','Provider onboarding','Grace',20),
 ('provider','Provider Onboarding','Licensing','Grace',30),
 ('provider','Provider Onboarding','Privileges','PMG',40),
 ('provider','Provider Onboarding','Credentialing','PMG',50),
 ('provider','Provider Onboarding','iPrescribe','TOGO',60),
 ('provider','Provider Onboarding','EMR login','TOGO',70),
 ('provider','Provider Onboarding','EMR profile','TOGO',80),
 ('provider','Provider Onboarding','Pictures','Riley',90),
 ('provider','Provider Onboarding','Badge','Riley',100),
 ('provider','Provider Onboarding','Training','CCO',110),
 ('provider','Provider Onboarding','Provider employee file','Grace',120)
on conflict (applies_to, phase, label) do update set role=excluded.role, ord=excluded.ord;

-- RLS (auth-gated; tighten to per-facility for facility logins later)
alter table account        enable row level security;
alter table checklist_item enable row level security;
alter table task           enable row level security;
do $$ declare t text; begin
  foreach t in array array['account','checklist_item','task'] loop
    execute format('drop policy if exists rw_auth on %I', t);
    execute format('create policy rw_auth on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

commit;
