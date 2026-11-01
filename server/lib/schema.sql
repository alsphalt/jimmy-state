-- JIMMY STATE schema.
--
-- Idempotent: every statement is safe to run on every cold start and every deploy.
-- Applied by server/lib/db.js on first use and by `npm run db:migrate`.
--
-- Design note: there is no per-user or per-event table on purpose. Identifications are
-- counted in daily buckets, so trending can be computed without keeping a trail of who
-- identified what, or when.

create table if not exists track_counts (
  day          date        not null,
  track_key    text        not null,
  title        text        not null,
  artist       text        not null default '',
  artwork_url  text,
  hits         integer     not null default 0,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  primary key (day, track_key)
);

create index if not exists track_counts_key_idx on track_counts (track_key);
create index if not exists track_counts_day_idx on track_counts (day desc);

-- Fixed-window counters, so a limit applies across every serverless instance instead of
-- per instance. Buckets store a hashed client key, never a raw address.
create table if not exists rate_windows (
  bucket        text        not null,
  window_start  timestamptz not null,
  hits          integer     not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_windows_start_idx on rate_windows (window_start);
