-- 0003 — Med-spa prospects + self-pay wellness prescribers (Wasatch Front)
--
-- medspa              : Overture Maps places, theme=places, release 2026-08-19.0
--                       CDLA-Permissive 2.0 — redistributable, no caching expiry
--                       (this is why Overture and not Google Places, whose ToS
--                       forbids retaining anything but place_id past 30 days).
-- wellness_prescriber : CMS Part D by-Provider-and-Drug + by-Provider (DY2024)
--                       joined to the DAC National Downloadable File for
--                       num_org_mem (group size), scored for the small self-pay
--                       wellness signature. Public federal data — NOT PHI.
--
-- Both are login-gated the same way as every other data table: RLS on,
-- read_auth policy for `authenticated`, anon revoked (see 0001_init.sql).

create table if not exists medspa (
  id                  text primary key,          -- Overture GERS id, stable across releases
  name                text,
  tier                text,                      -- A_medspa | B_aesthetic_svc | C_derm_plastics | D_name_match
  cat                 text,                      -- Overture primary category
  alt_cats            text,
  confidence          numeric,
  street              text,
  city                text,
  state               text,
  zip                 text,
  phone               text,
  website             text,
  lat                 numeric,
  lon                 numeric,
  locations_same_name int,                       -- 1 = independent; >1 = chain (has its own med director)
  source              text default 'overture',
  scraped_at          timestamptz,
  last_seen           date,
  is_active           boolean default true
);

create table if not exists wellness_prescriber (
  npi                 text primary key,
  name                text,
  specialty           text,
  street              text,
  city                text,
  zip                 text,
  in_corridor         text,                      -- Y = Nephi -> Brigham City
  glp1_clms           int,
  total_partd_clms    int,
  glp1_share          numeric,                   -- glp1_clms / total_partd_clms
  drugs               text,
  dac_group_size      int,                       -- num_org_mem; null = in no Medicare group
  dac_facility        text,
  is_big_chain        text,                      -- Y = IHC / U of U / Revere / MountainStar / ...
  medicare_assign     text,                      -- Y | N | not_in_DAC ; N = cash-pay tell
  testosterone_clms   int,
  hormone_clms        int,
  npis_at_address     int,                       -- co-location count; 1 = solo site
  medspa_at_address   text,                      -- matched med spa(s) at the same street+zip
  bene_avg_age        numeric,
  bene_risk           numeric,
  wellness_score      numeric,                   -- heuristic; raw columns kept so it can be re-ranked
  scraped_at          timestamptz,
  last_seen           date,
  is_active           boolean default true
);

create index if not exists medspa_city_idx      on medspa (city);
create index if not exists medspa_tier_idx      on medspa (tier);
create index if not exists wp_score_idx         on wellness_prescriber (wellness_score desc);
create index if not exists wp_corridor_idx      on wellness_prescriber (in_corridor, is_big_chain);

alter table medspa              enable row level security;
alter table wellness_prescriber enable row level security;

drop policy if exists read_auth on medspa;
create policy read_auth on medspa for select to authenticated using (true);
drop policy if exists read_auth on wellness_prescriber;
create policy read_auth on wellness_prescriber for select to authenticated using (true);

revoke all on medspa              from anon;
revoke all on wellness_prescriber from anon;
