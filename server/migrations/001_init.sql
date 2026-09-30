-- 001_init.sql
-- FellowSafe schema per Plan §6 (backend-only)

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  name text not null,
  phone_e164 text,
  phone_verified_at timestamptz,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_phone_e164_key on users (phone_e164) where phone_e164 is not null;

create table if not exists trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  phone_e164 text not null,
  relationship text,
  status text not null default 'PENDING' check (status in ('PENDING','LINKED','REMOVED')),
  linked_user_id uuid references users(id) on delete set null,
  last_notified_at timestamptz,
  last_notify_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, phone_e164)
);
create index if not exists trusted_contacts_link_lookup on trusted_contacts (phone_e164) where status <> 'REMOVED';
create index if not exists trusted_contacts_linked_user on trusted_contacts (linked_user_id) where status = 'LINKED';

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists sos_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RESOLVED')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_latitude float8,
  last_longitude float8,
  last_accuracy float8,
  last_speed float8,
  last_location_at timestamptz,
  battery_level int,
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists sos_one_active_per_user on sos_sessions (user_id) where status = 'ACTIVE';
create index if not exists sos_sessions_user_recent on sos_sessions (user_id, started_at desc);

create table if not exists sos_locations (
  id bigserial primary key,
  sos_id uuid not null references sos_sessions(id) on delete cascade,
  latitude float8 not null check (latitude between -90 and 90),
  longitude float8 not null check (longitude between -180 and 180),
  accuracy float8,
  speed float8,
  heading float8,
  battery_level int,
  recorded_at timestamptz not null
);
create index if not exists sos_locations_sos_time on sos_locations (sos_id, recorded_at desc);
create index if not exists sos_locations_recorded_at on sos_locations (recorded_at);

create table if not exists sos_responses (
  id uuid primary key default gen_random_uuid(),
  sos_id uuid not null references sos_sessions(id) on delete cascade,
  contact_id uuid not null references trusted_contacts(id) on delete no action,
  status text not null default 'RESPONDING' check (status in ('RESPONDING','ARRIVED')),
  responded_at timestamptz not null default now(),
  unique (sos_id, contact_id)
);
