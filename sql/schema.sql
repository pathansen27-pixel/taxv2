-- Bills we index (curated list, plus metadata pulled from Congress.gov)
create table if not exists bills (
  id bigserial primary key,
  bill_key text not null unique,          -- e.g. "118:hr:4366"
  congress int not null,
  bill_type text not null,                -- hr, s, hjres, etc
  bill_number int not null,
  bill_id_display text not null,          -- "HR4366"
  title text not null,
  policy_area text null,
  sponsor text null,
  latest_action text null,
  summary_text text null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_bills_congress_type_num on bills(congress, bill_type, bill_number);

-- Roll call votes (one row per roll call we ingest)
create table if not exists roll_calls (
  id bigserial primary key,
  rollcall_key text not null unique,      -- stable key we compute: "house:118:2024-03-22:123" etc
  chamber text not null,                  -- "house" or "senate"
  congress int not null,
  rollcall_number int null,
  vote_date date null,
  question text null,
  result text null,
  vote_url text not null,
  source text not null default 'congress.gov',
  fetched_at timestamptz not null default now()
);

create index if not exists idx_roll_calls_chamber_congress on roll_calls(chamber, congress);

-- Bridge: which roll calls are associated with which bill
create table if not exists bill_roll_calls (
  id bigserial primary key,
  bill_id bigint not null references bills(id) on delete cascade,
  roll_call_id bigint not null references roll_calls(id) on delete cascade,
  vote_type text null,                    -- passage, cloture, motion, etc if known
  unique(bill_id, roll_call_id)
);

create index if not exists idx_bill_roll_calls_bill on bill_roll_calls(bill_id);

-- Members (we keep a minimal dimension table)
create table if not exists members (
  id bigserial primary key,
  bioguide_id text not null unique,
  name text null,
  party text null,
  state text null,
  chamber text null,
  updated_at timestamptz not null default now()
);

-- Member votes per roll call
create table if not exists member_votes (
  id bigserial primary key,
  roll_call_id bigint not null references roll_calls(id) on delete cascade,
  bioguide_id text not null,
  vote_cast text not null,                -- Yea, Nay, Not Voting, Present, etc
  unique(roll_call_id, bioguide_id)
);

create index if not exists idx_member_votes_rollcall on member_votes(roll_call_id);

-- Optional: cache for computed summaries, stats, and party splits
create table if not exists roll_call_stats (
  roll_call_id bigint primary key references roll_calls(id) on delete cascade,
  yea int not null default 0,
  nay int not null default 0,
  not_voting int not null default 0,
  present int not null default 0,
  updated_at timestamptz not null default now()
);
