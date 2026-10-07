-- Peladinhas: database schema for Supabase (Postgres).
-- Run the whole file once in Supabase > SQL Editor > New query > Run.
-- It is safe to run again: tables are only created if missing, and
-- functions and policies are replaced.
--
-- Data-safety rules enforced here (not only in the app):
--   * Nobody can delete rows through the API. Matches are "deleted" by
--     setting deleted_at (and can be restored); players are deactivated.
--   * Only users listed in public.admins can write.
--   * Every edit of an existing match stores a snapshot of the previous
--     version in match_revisions.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Two players cannot share the same name (case-insensitive).
create unique index if not exists players_name_key on public.players (lower(btrim(name)));

create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  starts_at   timestamptz not null,
  location    text not null default '',
  status      text not null default 'scheduled'
              check (status in ('scheduled', 'played', 'cancelled')),
  score_a     smallint check (score_a >= 0),
  score_b     smallint check (score_b >= 0),
  notes       text not null default '',
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint played_needs_score
    check (status <> 'played' or (score_a is not null and score_b is not null))
);

create index if not exists matches_starts_at_idx on public.matches (starts_at);

-- One row per player called up for a match. For played matches, team says
-- which side the player was on; goals/own_goals are that player's tally.
create table if not exists public.match_players (
  match_id    uuid not null references public.matches (id) on delete restrict,
  player_id   uuid not null references public.players (id) on delete restrict,
  team        text check (team in ('A', 'B')),
  confirmed   boolean not null default false,
  goals       smallint not null default 0 check (goals >= 0),
  own_goals   smallint not null default 0 check (own_goals >= 0),
  primary key (match_id, player_id)
);

create index if not exists match_players_player_idx on public.match_players (player_id);

-- Previous versions of a match, written automatically on every edit.
create table if not exists public.match_revisions (
  id          bigint generated always as identity primary key,
  match_id    uuid not null references public.matches (id) on delete restrict,
  snapshot    jsonb not null,
  saved_at    timestamptz not null default now(),
  saved_by    uuid
);

create index if not exists match_revisions_match_idx on public.match_revisions (match_id);

-- Supabase Auth users allowed to write. Add yourself after creating your
-- user (see README):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists matches_touch_updated_at on public.matches;
create trigger matches_touch_updated_at
  before update on public.matches
  for each row execute function public.touch_updated_at();

-- Snapshot of a match and its line-up, used for match_revisions.
create or replace function public.match_snapshot(p_match_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(m) || jsonb_build_object(
           'players',
           coalesce((select jsonb_agg(to_jsonb(mp) order by mp.player_id)
                     from public.match_players mp
                     where mp.match_id = m.id), '[]'::jsonb))
  from public.matches m
  where m.id = p_match_id;
$$;

-- ---------------------------------------------------------------------------
-- save_match: creates or updates a match and its line-up in one transaction.
--   p_match:   {id?, starts_at, location, status, score_a, score_b, notes}
--   p_players: [{player_id, team, confirmed, goals, own_goals}, ...]
-- Returns the match id.
-- ---------------------------------------------------------------------------

create or replace function public.save_match(p_match jsonb, p_players jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := nullif(p_match ->> 'id', '')::uuid;
  v_status  text := coalesce(nullif(p_match ->> 'status', ''), 'scheduled');
  v_played  boolean := v_status = 'played';
  v_score_a smallint := case when v_played then (p_match ->> 'score_a')::smallint end;
  v_score_b smallint := case when v_played then (p_match ->> 'score_b')::smallint end;
  v_team_a  int;
  v_team_b  int;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão para guardar jogos.' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.matches (starts_at, location, status, score_a, score_b, notes)
    values ((p_match ->> 'starts_at')::timestamptz,
            coalesce(btrim(p_match ->> 'location'), ''),
            v_status, v_score_a, v_score_b,
            coalesce(btrim(p_match ->> 'notes'), ''))
    returning id into v_id;
  else
    insert into public.match_revisions (match_id, snapshot, saved_by)
    select v_id, public.match_snapshot(v_id), auth.uid()
    where exists (select 1 from public.matches where id = v_id);

    if not found then
      raise exception 'Jogo não encontrado.' using errcode = 'P0002';
    end if;

    update public.matches
       set starts_at = (p_match ->> 'starts_at')::timestamptz,
           location  = coalesce(btrim(p_match ->> 'location'), ''),
           status    = v_status,
           score_a   = v_score_a,
           score_b   = v_score_b,
           notes     = coalesce(btrim(p_match ->> 'notes'), '')
     where id = v_id;
  end if;

  -- Replace the line-up (rows only ever change inside this transaction,
  -- and the previous version is in match_revisions).
  delete from public.match_players where match_id = v_id;

  insert into public.match_players (match_id, player_id, team, confirmed, goals, own_goals)
  select v_id,
         (p ->> 'player_id')::uuid,
         nullif(p ->> 'team', ''),
         coalesce((p ->> 'confirmed')::boolean, false),
         case when v_played then coalesce((p ->> 'goals')::smallint, 0) else 0 end,
         case when v_played then coalesce((p ->> 'own_goals')::smallint, 0) else 0 end
  from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) as p;

  if v_played then
    select count(*) filter (where team = 'A'), count(*) filter (where team = 'B')
      into v_team_a, v_team_b
      from public.match_players
     where match_id = v_id;

    if v_team_a = 0 or v_team_b = 0 then
      raise exception 'Um jogo jogado precisa de jogadores nas duas equipas.'
        using errcode = '23514';
    end if;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_backup: restores a JSON export made by the app. Inserts missing
-- rows and overwrites existing ones with the backup version; it never
-- deletes players or matches. Line-ups of the matches in the backup are
-- replaced by the backup's line-ups (previous versions go to
-- match_revisions).
-- ---------------------------------------------------------------------------

create or replace function public.import_backup(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_players int;
  v_matches int;
  v_lineups int;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão para restaurar cópias.' using errcode = '42501';
  end if;

  insert into public.players (id, name, active, created_at)
  select r.id, btrim(r.name), coalesce(r.active, true), coalesce(r.created_at, now())
  from jsonb_populate_recordset(null::public.players, coalesce(p_data -> 'players', '[]')) as r
  on conflict (id) do update
    set name = excluded.name, active = excluded.active;
  get diagnostics v_players = row_count;

  insert into public.match_revisions (match_id, snapshot, saved_by)
  select m.id, public.match_snapshot(m.id), auth.uid()
  from public.matches m
  where m.id in (select (x ->> 'id')::uuid
                 from jsonb_array_elements(coalesce(p_data -> 'matches', '[]')) as x);

  insert into public.matches (id, starts_at, location, status, score_a, score_b,
                              notes, deleted_at, created_at, updated_at)
  select r.id, r.starts_at, coalesce(r.location, ''), coalesce(r.status, 'scheduled'),
         r.score_a, r.score_b, coalesce(r.notes, ''), r.deleted_at,
         coalesce(r.created_at, now()), coalesce(r.updated_at, now())
  from jsonb_populate_recordset(null::public.matches, coalesce(p_data -> 'matches', '[]')) as r
  on conflict (id) do update
    set starts_at  = excluded.starts_at,
        location   = excluded.location,
        status     = excluded.status,
        score_a    = excluded.score_a,
        score_b    = excluded.score_b,
        notes      = excluded.notes,
        deleted_at = excluded.deleted_at;
  get diagnostics v_matches = row_count;

  delete from public.match_players
  where match_id in (select (x ->> 'id')::uuid
                     from jsonb_array_elements(coalesce(p_data -> 'matches', '[]')) as x);

  insert into public.match_players (match_id, player_id, team, confirmed, goals, own_goals)
  select r.match_id, r.player_id, r.team, coalesce(r.confirmed, false),
         coalesce(r.goals, 0), coalesce(r.own_goals, 0)
  from jsonb_populate_recordset(null::public.match_players,
                                coalesce(p_data -> 'match_players', '[]')) as r
  on conflict (match_id, player_id) do update
    set team = excluded.team, confirmed = excluded.confirmed,
        goals = excluded.goals, own_goals = excluded.own_goals;
  get diagnostics v_lineups = row_count;

  return jsonb_build_object('players', v_players, 'matches', v_matches,
                            'match_players', v_lineups);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: everyone can read, only admins can write, nobody can
-- delete through the API.
-- ---------------------------------------------------------------------------

alter table public.players         enable row level security;
alter table public.matches         enable row level security;
alter table public.match_players   enable row level security;
alter table public.match_revisions enable row level security;
alter table public.admins          enable row level security;

drop policy if exists "players are public" on public.players;
create policy "players are public" on public.players
  for select to anon, authenticated using (true);

drop policy if exists "admins add players" on public.players;
create policy "admins add players" on public.players
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins edit players" on public.players;
create policy "admins edit players" on public.players
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "matches are public" on public.matches;
create policy "matches are public" on public.matches
  for select to anon, authenticated using (deleted_at is null or public.is_admin());

drop policy if exists "admins add matches" on public.matches;
create policy "admins add matches" on public.matches
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins edit matches" on public.matches;
create policy "admins edit matches" on public.matches
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Line-ups follow the visibility of their match (deleted matches are hidden).
drop policy if exists "line-ups are public" on public.match_players;
create policy "line-ups are public" on public.match_players
  for select to anon, authenticated
  using (exists (select 1 from public.matches m where m.id = match_id));

drop policy if exists "admins add line-ups" on public.match_players;
create policy "admins add line-ups" on public.match_players
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins edit line-ups" on public.match_players;
create policy "admins edit line-ups" on public.match_players
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read revisions" on public.match_revisions;
create policy "admins read revisions" on public.match_revisions
  for select to authenticated using (public.is_admin());

-- Explicit privileges (no DELETE for API roles on any table).
revoke all on public.players, public.matches, public.match_players,
              public.match_revisions, public.admins from anon, authenticated;
grant select on public.players, public.matches, public.match_players to anon, authenticated;
grant insert, update on public.players, public.matches, public.match_players to authenticated;
grant select on public.match_revisions to authenticated;

revoke execute on function public.is_admin(), public.save_match(jsonb, jsonb),
                           public.import_backup(jsonb), public.match_snapshot(uuid),
                           public.touch_updated_at()
  from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.save_match(jsonb, jsonb) to authenticated;
grant execute on function public.import_backup(jsonb) to authenticated;

commit;
