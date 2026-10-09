-- Database rules tests for multi-tenancy. Run ONLY through `bash scripts/rehearse.sh`, which
-- applies the migrations and then this file inside one transaction that ends in ROLLBACK.
-- Any failed check raises, which aborts the run; the last line reports success.
--
-- Fixture ids (fixed so later tests can use them as literals):
--   prefix aaaaaaaa = admin A (max_leagues 2, all features), league a-league
--   prefix bbbbbbbb = admin B (all features), league b-league
--   prefix cccccccc = superadmin S
--   prefix dddddddd = admin D (disabled; d-league is created in the security rules tests)
--   (prefix eeeeeeee is no longer used)
--   suffix ...0001 user, ...0002 league, ...0003 / ...0004 players, ...0005 session,
--          ...0006 / ...0007 / ...0008 teams (green / blue / yellow), ...0009 match
--          (team 1 vs team 2, team 3 waiting), ...0010 match event, ...0011 open vote,
--          ...0012 coach board. S only has ...0001.
-- Acting as a user: SELECT pg_temp.act_as('<user id>'); ... RESET role;
-- Acting as a visitor: SELECT pg_temp.act_as(NULL); ... RESET role;

-- ===== Helpers

-- Runs `sql` and requires it to fail with an error message containing `needle`.
CREATE FUNCTION pg_temp.expect_error(sql text, needle text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(needle IN SQLERRM) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'expected error containing "%" from: % -- got: %', needle, sql, SQLERRM;
  END;
  RAISE EXCEPTION 'expected error containing "%" from: % -- it succeeded', needle, sql;
END $$;

-- Runs a DML statement and requires it to affect exactly `n` rows.
CREATE FUNCTION pg_temp.expect_count(sql text, n int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got int;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS got = ROW_COUNT;
  IF got IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'expected % row(s) from: % -- got %', n, sql, got;
  END IF;
END $$;

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'check failed: %', label; END IF;
END $$;

-- Switches to the `authenticated` role with the given user's JWT, or to `anon` when uid is
-- NULL, until `RESET role` (or the end of the transaction).
CREATE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF uid IS NULL THEN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  ELSE
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  END IF;
END $$;

-- ===== Every row belongs to a league (checked before the fixture adds rows)

DO $$
DECLARE
  t text;
  eagles uuid := (SELECT id FROM public.leagues WHERE slug = 'eagles');
  nulls bigint;
BEGIN
  PERFORM pg_temp.expect(eagles IS NOT NULL, 'league eagles exists');
  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards',
    'lineups', 'lineup_players'
  ] LOOP
    EXECUTE format('SELECT count(*) FILTER (WHERE league_id IS NULL) FROM public.%I', t) INTO nulls;
    PERFORM pg_temp.expect(nulls = 0, t || ': no NULL league_id');
  END LOOP;
END $$;

SELECT pg_temp.expect(
  (SELECT p.role = 'admin' AND NOT p.is_disabled AND p.email = 'info@codorasoft.com'
   FROM public.admin_profiles p JOIN auth.users u ON u.id = p.user_id
   WHERE u.email = 'info@codorasoft.com'),
  'info@codorasoft.com is an enabled admin');

SELECT pg_temp.expect(
  (SELECT true FROM public.leagues l JOIN auth.users u ON u.id = l.owner_id
   WHERE l.slug = 'eagles' AND u.email = 'info@codorasoft.com'),
  'eagles belongs to info@codorasoft.com');

-- ===== Fixture

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'tenancy-a@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'tenancy-b@test.invalid'),
  ('cccccccc-0000-4000-8000-000000000001', 'tenancy-s@test.invalid'),
  ('dddddddd-0000-4000-8000-000000000001', 'tenancy-d@test.invalid');

INSERT INTO public.admin_profiles (user_id, role, email, display_name, max_leagues, features, is_disabled)
SELECT u.id, v.role, u.email, v.display_name, v.max_leagues, v.features, v.is_disabled
FROM auth.users u JOIN (VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'admin', 'Admin A', 2, '{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board}'::text[], false),
  ('bbbbbbbb-0000-4000-8000-000000000001'::uuid, 'admin', 'Admin B', 1, '{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board}'::text[], false),
  ('cccccccc-0000-4000-8000-000000000001'::uuid, 'superadmin', 'Superadmin S', 0, '{}'::text[], false),
  ('dddddddd-0000-4000-8000-000000000001'::uuid, 'admin', 'Admin D', 1, '{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board}'::text[], true)
) AS v(id, role, display_name, max_leagues, features, is_disabled) ON v.id = u.id;

INSERT INTO public.leagues (id, owner_id, name, slug) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'League A', 'a-league'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'League B', 'b-league');

INSERT INTO public.players (id, league_id, name, position, skill_rating) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 'A Player 1', 'MID', 3),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002', 'A Player 2', 'GK', 3),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'B Player 1', 'MID', 3),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'B Player 2', 'GK', 3);

INSERT INTO public.sessions (id, league_id, date, share_token) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000002', '2026-10-06', 'tenancy-test-a'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000002', '2026-10-06', 'tenancy-test-b');

-- Child rows are inserted without league_id, as the app does: the triggers fill it in
INSERT INTO public.teams (id, session_id, color) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000005', 'green'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000005', 'blue'),
  ('aaaaaaaa-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000005', 'yellow'),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000005', 'green'),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000005', 'blue'),
  ('bbbbbbbb-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000005', 'yellow');

INSERT INTO public.session_players (session_id, player_id) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000003'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000004'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000003'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000004');

INSERT INTO public.team_players (team_id, player_id) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000003'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000004'),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000003'),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000004');

-- The a-league match is inserted in the tests below (inheritance test)
INSERT INTO public.matches (id, session_id, match_number, team1_id, team2_id, waiting_team_id) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-000000000005', 1,
   'bbbbbbbb-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000008');

-- ===== Feature list CHECK

SELECT pg_temp.expect(public.valid_features('{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board}'::text[]), 'all 14 features are valid');
SELECT pg_temp.expect(public.valid_features('{}'), 'no features is valid');
SELECT pg_temp.expect(public.valid_features('{voting,awards}'), 'voting with awards is valid');
SELECT pg_temp.expect(NOT public.valid_features('{voting}'), 'voting needs awards');
SELECT pg_temp.expect(NOT public.valid_features('{potm}'), 'potm needs leaderboard');
SELECT pg_temp.expect(NOT public.valid_features('{badges}'), 'badges needs profiles');
SELECT pg_temp.expect(NOT public.valid_features('{cards,cards}'), 'duplicates are rejected');
SELECT pg_temp.expect(NOT public.valid_features('{nope}'), 'unknown keys are rejected');
SELECT pg_temp.expect_error(
  $sql$UPDATE public.admin_profiles SET features = '{voting}' WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001'$sql$,
  'admin_profiles_features_check');

-- ===== Slug rules

SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'X', 'Eagles')$sql$,
  'leagues_slug_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'X', 'ab')$sql$,
  'leagues_slug_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'X', 'players')$sql$,
  'leagues_slug_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'X', 'eagles')$sql$,
  'leagues_slug_key');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '   ', 'blank-name')$sql$,
  'leagues_name_check');

-- ===== League limit and owner

SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'League A2', 'a-league-2')$sql$,
  1);
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'League A3', 'a-league-3')$sql$,
  'league limit reached');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('dddddddd-0000-4000-8000-000000000001', 'League D', 'd-league')$sql$,
  'enabled admin');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('cccccccc-0000-4000-8000-000000000001', 'League S', 's-league')$sql$,
  'enabled admin');
DELETE FROM public.leagues WHERE slug = 'a-league-2';

-- ===== League identity is fixed

SELECT pg_temp.expect_error(
  $sql$UPDATE public.leagues SET slug = 'a-league-renamed' WHERE slug = 'a-league'$sql$,
  'slug and owner cannot change');
SELECT pg_temp.expect_error(
  $sql$UPDATE public.leagues SET owner_id = 'bbbbbbbb-0000-4000-8000-000000000001' WHERE slug = 'a-league'$sql$,
  'slug and owner cannot change');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.leagues SET name = 'League A', logo_url = NULL WHERE slug = 'a-league'$sql$,
  1);

-- ===== Child rows take their parent's league (offline outbox inserts never send league_id)

INSERT INTO public.matches (id, session_id, match_number, team1_id, team2_id, waiting_team_id) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000005', 1,
   'aaaaaaaa-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000008');
SELECT pg_temp.expect(
  (SELECT league_id = 'aaaaaaaa-0000-4000-8000-000000000002' FROM public.matches WHERE id = 'aaaaaaaa-0000-4000-8000-000000000009'),
  'match without league_id gets its session''s league');

INSERT INTO public.match_events (id, match_id, player_id, team_id, event_type) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000010', 'aaaaaaaa-0000-4000-8000-000000000009',
   'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000006', 'goal');
SELECT pg_temp.expect(
  (SELECT league_id = 'aaaaaaaa-0000-4000-8000-000000000002' FROM public.match_events WHERE id = 'aaaaaaaa-0000-4000-8000-000000000010'),
  'match event without league_id gets its match''s league');

SELECT pg_temp.expect(
  NOT EXISTS (
    SELECT 1 FROM public.teams t JOIN public.sessions s ON s.id = t.session_id WHERE t.league_id <> s.league_id
    UNION ALL
    SELECT 1 FROM public.team_players tp JOIN public.teams t ON t.id = tp.team_id WHERE tp.league_id <> t.league_id
    UNION ALL
    SELECT 1 FROM public.session_players sp JOIN public.sessions s ON s.id = sp.session_id WHERE sp.league_id <> s.league_id),
  'teams, team players and session players have their parent''s league');

-- A re-sent outbox insert still ends in a duplicate-key error (the outbox treats it as sent)
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.match_events (id, match_id, player_id, team_id, event_type) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000010', 'aaaaaaaa-0000-4000-8000-000000000009',
     'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000006', 'goal')$sql$,
  'duplicate key');

SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.match_events (match_id, player_id, team_id, event_type) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-000000000003',
     'aaaaaaaa-0000-4000-8000-000000000006', 'goal')$sql$,
  'player belongs to another league');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.session_players (session_id, player_id) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000003')$sql$,
  'player belongs to another league');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.match_events (league_id, match_id, player_id, team_id, event_type) VALUES
    ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000009',
     'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000006', 'goal')$sql$,
  'league mismatch');

-- Teams a match or event points at must be in its league too: a match in A pointing at B's team
-- would otherwise stop B (and even the superadmin) deleting B's session or league
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.matches (session_id, match_number, team1_id, team2_id, period) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000005', 2,
     'bbbbbbbb-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000007', 1)$sql$,
  'team belongs to another league');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.matches (session_id, match_number, team1_id, team2_id, period) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000005', 2,
     'aaaaaaaa-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000007', 1)$sql$,
  'team belongs to another league');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.matches (session_id, match_number, team1_id, team2_id, waiting_team_id, queue, period) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000005', 2,
     'aaaaaaaa-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000007',
     'bbbbbbbb-0000-4000-8000-000000000008', ARRAY['bbbbbbbb-0000-4000-8000-000000000008']::uuid[], 1)$sql$,
  'team belongs to another league');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.matches (session_id, match_number, team1_id, team2_id, queue, period) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000005', 2,
     'aaaaaaaa-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000007',
     ARRAY['aaaaaaaa-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000008']::uuid[], 1)$sql$,
  'team belongs to another league');
SELECT pg_temp.expect_error(
  $sql$UPDATE public.matches SET winner_team_id = 'bbbbbbbb-0000-4000-8000-000000000006'
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000009'$sql$,
  'team belongs to another league');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.match_events (match_id, player_id, team_id, event_type) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000003',
     'bbbbbbbb-0000-4000-8000-000000000006', 'goal')$sql$,
  'team belongs to another league');
SELECT pg_temp.expect_error(
  $sql$UPDATE public.match_events SET team_id = 'bbbbbbbb-0000-4000-8000-000000000006'
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000010'$sql$,
  'team belongs to another league');
-- The league's own teams are still fine, in every column
SELECT pg_temp.expect_count(
  $sql$UPDATE public.matches SET winner_team_id = 'aaaaaaaa-0000-4000-8000-000000000006',
         queue = ARRAY['aaaaaaaa-0000-4000-8000-000000000008']::uuid[]
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000009'$sql$,
  1);
UPDATE public.matches SET winner_team_id = NULL WHERE id = 'aaaaaaaa-0000-4000-8000-000000000009';

-- ===== Helper functions and the public directory

SELECT pg_temp.expect(
  (SELECT is_available AND features = (SELECT p.features FROM public.admin_profiles p
                                        JOIN public.leagues l ON l.owner_id = p.user_id WHERE l.slug = 'eagles')
   FROM public.league_directory WHERE slug = 'eagles'),
  'league_directory shows eagles as available with its owner''s features');

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect(public.owns_league('aaaaaaaa-0000-4000-8000-000000000002'), 'A owns a-league');
SELECT pg_temp.expect(NOT public.owns_league('bbbbbbbb-0000-4000-8000-000000000002'), 'A does not own b-league');
SELECT pg_temp.expect(NOT public.is_superadmin(), 'A is not superadmin');
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM public.league_directory WHERE slug = 'b-league'),
  'authenticated users can read league_directory');
RESET role;

SELECT pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.expect(public.is_superadmin(), 'S is superadmin');
SELECT pg_temp.expect(NOT public.owns_league('aaaaaaaa-0000-4000-8000-000000000002'), 'S owns no league');
RESET role;

SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM public.league_directory WHERE slug = 'eagles'),
  'visitors can read league_directory');
RESET role;

SELECT pg_temp.expect(public.league_has_feature('bbbbbbbb-0000-4000-8000-000000000002', 'voting'), 'b-league has voting');
SELECT pg_temp.expect(NOT public.league_has_feature('bbbbbbbb-0000-4000-8000-000000000002', 'nope'), 'unknown feature is off');
SELECT pg_temp.expect(public.league_is_available('bbbbbbbb-0000-4000-8000-000000000002'), 'b-league is available');
UPDATE public.admin_profiles SET is_disabled = true WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001';
SELECT pg_temp.expect(NOT public.league_is_available('bbbbbbbb-0000-4000-8000-000000000002'), 'disabled owner makes b-league unavailable');
SELECT pg_temp.expect(
  (SELECT NOT is_available FROM public.league_directory WHERE slug = 'b-league'),
  'league_directory shows b-league as unavailable');
UPDATE public.admin_profiles SET is_disabled = false WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001';

-- ===== Open votes (...0011) with one nominee each, used by the tests below

INSERT INTO public.award_votes (id, session_id, award_type, status, decided_by, vote_token) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000005', 'mvp', 'open', 'vote', 'tenancy-vote-a'),
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000005', 'mvp', 'open', 'vote', 'tenancy-vote-b');
INSERT INTO public.award_vote_nominations (award_vote_id, player_id) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000003'),
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000003');

-- ===== Child-row checks also run on UPDATE (the vote winner is only ever set by UPDATE)

SELECT pg_temp.expect_error(
  $sql$UPDATE public.award_votes SET winner_player_id = 'bbbbbbbb-0000-4000-8000-000000000003'
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000011'$sql$,
  'player belongs to another league');
SELECT pg_temp.expect_error(
  $sql$UPDATE public.match_events SET league_id = 'bbbbbbbb-0000-4000-8000-000000000002'
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000010'$sql$,
  'league mismatch');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.award_votes SET winner_player_id = 'aaaaaaaa-0000-4000-8000-000000000003'
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000011'$sql$,
  1);
UPDATE public.award_votes SET winner_player_id = NULL WHERE id = 'aaaaaaaa-0000-4000-8000-000000000011';

-- ===== Security rules: an admin writes only in their own league

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.players (league_id, name, position, skill_rating)
       VALUES ('bbbbbbbb-0000-4000-8000-000000000002', 'Intruder', 'MID', 3)$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.players SET name = 'Renamed' WHERE id = 'bbbbbbbb-0000-4000-8000-000000000003'$sql$,
  0);
SELECT pg_temp.expect_count(
  $sql$DELETE FROM public.sessions WHERE id = 'bbbbbbbb-0000-4000-8000-000000000005'$sql$,
  0);
SELECT pg_temp.expect_count(
  $sql$UPDATE public.players SET name = 'A Player 1' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003'$sql$,
  1);
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.players (league_id, name, position, skill_rating)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'A Player 3', 'MID', 3)$sql$,
  1);
-- No league_id: refused (no default league any more)
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.players (name, position, skill_rating) VALUES ('No League', 'MID', 3)$sql$,
  'row-level security');
-- Reading another available league is allowed (public pages)
SELECT pg_temp.expect(
  (SELECT count(*) = 2 FROM public.players WHERE league_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'A can read b-league players');
RESET role;

-- ===== After the rollout (temporary defaults dropped) a root row without league_id is refused

SELECT pg_temp.expect(
  (SELECT bool_and(column_default IS NULL) FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'league_id' AND table_name IN ('players', 'sessions', 'lineups')),
  'no temporary league_id defaults remain');
SELECT pg_temp.act_as((SELECT id FROM auth.users WHERE email = 'info@codorasoft.com'));
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.players (name, position, skill_rating) VALUES ('No League', 'MID', 3)$sql$,
  'row-level security');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.sessions (date, share_token) VALUES ('2026-10-06', 'tenancy-test-no-league')$sql$,
  'row-level security');
RESET role;

-- ===== Admin accounts and leagues

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.admin_profiles SET max_leagues = 5 WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$sql$,
  0);
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM public.admin_profiles WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  AND (SELECT count(*) = 1 FROM public.admin_profiles),
  'A reads only own profile');
SELECT pg_temp.expect(
  (SELECT array_agg(slug) = '{a-league}' FROM public.leagues),
  'A reads only own league');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.leagues SET name = 'Taken' WHERE id = 'bbbbbbbb-0000-4000-8000-000000000002'$sql$,
  0);
SELECT pg_temp.expect_count(
  $sql$UPDATE public.leagues SET name = 'League A' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$sql$,
  1);
SELECT pg_temp.expect_count(
  $sql$DELETE FROM public.leagues WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'$sql$,
  0);
RESET role;
-- B gets room for a 2nd league, so only the security rule can refuse A creating it for B
UPDATE public.admin_profiles SET max_leagues = 2 WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001';
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'For B', 'for-b')$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.leagues (owner_id, name, slug) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'League A2', 'a-league-2')$sql$,
  1);
RESET role;
DELETE FROM public.leagues WHERE slug = 'a-league-2';
UPDATE public.admin_profiles SET max_leagues = 1 WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001';

SELECT pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.admin_profiles SET max_leagues = 2 WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$sql$,
  1);
SELECT pg_temp.expect(
  (SELECT count(*) >= 5 FROM public.admin_profiles) AND (SELECT count(*) >= 3 FROM public.leagues),
  'superadmin reads every profile and league');
SELECT pg_temp.expect_count(
  $sql$DELETE FROM public.leagues WHERE id = 'bbbbbbbb-0000-4000-8000-000000000002'$sql$,
  0);
RESET role;

SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM public.admin_profiles) AND (SELECT count(*) = 0 FROM public.leagues),
  'visitors read no profiles or leagues');
RESET role;

-- ===== A disabled admin's league (d-league, ...0002) is closed to everyone but the superadmin

UPDATE public.admin_profiles SET is_disabled = false WHERE user_id = 'dddddddd-0000-4000-8000-000000000001';
INSERT INTO public.leagues (id, owner_id, name, slug) VALUES
  ('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'League D', 'd-league');
UPDATE public.admin_profiles SET is_disabled = true WHERE user_id = 'dddddddd-0000-4000-8000-000000000001';
INSERT INTO public.players (id, league_id, name, position, skill_rating) VALUES
  ('dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 'D Player 1', 'MID', 3);
INSERT INTO public.sessions (id, league_id, date, share_token) VALUES
  ('dddddddd-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000002', '2026-10-06', 'tenancy-test-d');
INSERT INTO public.award_votes (id, session_id, award_type, status, decided_by, vote_token) VALUES
  ('dddddddd-0000-4000-8000-000000000011', 'dddddddd-0000-4000-8000-000000000005', 'mvp', 'open', 'vote', 'tenancy-vote-d');
INSERT INTO public.award_vote_nominations (award_vote_id, player_id) VALUES
  ('dddddddd-0000-4000-8000-000000000011', 'dddddddd-0000-4000-8000-000000000003');

SELECT pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.players (league_id, name, position, skill_rating)
       VALUES ('dddddddd-0000-4000-8000-000000000002', 'D Player 2', 'MID', 3)$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.players SET name = 'Renamed' WHERE id = 'dddddddd-0000-4000-8000-000000000003'$sql$,
  0);
RESET role;

SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM public.players WHERE league_id = 'dddddddd-0000-4000-8000-000000000002'),
  'visitors cannot read a disabled admin''s players');
SELECT pg_temp.expect(
  (SELECT count(*) = 3 FROM public.players WHERE league_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'visitors can read an available league''s players');
-- Review Focus 3: owner disabled
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.award_vote_entries (award_vote_id, voter_fingerprint, player_id)
       VALUES ('dddddddd-0000-4000-8000-000000000011', 'fp-d', 'dddddddd-0000-4000-8000-000000000003')$sql$,
  'row-level security');
RESET role;

SELECT pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM public.players WHERE league_id = 'dddddddd-0000-4000-8000-000000000002'),
  'superadmin reads a disabled admin''s players');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.players SET name = 'Renamed' WHERE id = 'dddddddd-0000-4000-8000-000000000003'$sql$,
  0);
RESET role;

-- ===== Voting (Review Focus 3: voting off)

UPDATE public.admin_profiles SET features = array_remove(array_remove(features, 'voting'), 'awards')
WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001';

SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.award_vote_entries (award_vote_id, voter_fingerprint, player_id)
       VALUES ('bbbbbbbb-0000-4000-8000-000000000011', 'fp-b', 'bbbbbbbb-0000-4000-8000-000000000003')$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.award_vote_entries (award_vote_id, voter_fingerprint, player_id)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000011', 'fp-a', 'aaaaaaaa-0000-4000-8000-000000000003')$sql$,
  1);
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.award_vote_entries (award_vote_id, voter_fingerprint, player_id)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000011', 'fp-a2', 'aaaaaaaa-0000-4000-8000-000000000004')$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.award_votes SET status = 'closed' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000011'$sql$,
  0);
RESET role;
SELECT pg_temp.expect(
  (SELECT league_id = 'aaaaaaaa-0000-4000-8000-000000000002' FROM public.award_vote_entries WHERE voter_fingerprint = 'fp-a'),
  'a visitor''s vote takes the vote''s league');

SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.award_votes (session_id, award_type, status, decided_by, vote_token)
       VALUES ('bbbbbbbb-0000-4000-8000-000000000005', 'fair_play', 'open', 'vote', 'tenancy-vote-b2')$sql$,
  'row-level security');
-- Spec 5: the voting check is for opening votes only; an open vote can still be closed
SELECT pg_temp.expect_count(
  $sql$UPDATE public.award_votes SET status = 'closed', winner_player_id = 'bbbbbbbb-0000-4000-8000-000000000003'
       WHERE id = 'bbbbbbbb-0000-4000-8000-000000000011'$sql$,
  1);
RESET role;

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.award_votes (session_id, award_type, status, decided_by, vote_token)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000005', 'fair_play', 'open', 'vote', 'tenancy-vote-a2')$sql$,
  1);
RESET role;

-- ===== Coach board: owner only, and only with coach_board

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.lineups (id, league_id, name)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000002', 'A Board')$sql$,
  1);
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.lineup_players (lineup_id, player_id, x, y)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000003', 0.5, 0.5)$sql$,
  1);
RESET role;

UPDATE public.admin_profiles SET features = array_remove(features, 'coach_board')
WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001';

SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.lineups (league_id, name) VALUES ('bbbbbbbb-0000-4000-8000-000000000002', 'B Board')$sql$,
  'row-level security');
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM public.lineups) AND (SELECT count(*) = 0 FROM public.lineup_players),
  'B cannot read A''s coach boards');
RESET role;

SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM public.lineups) AND (SELECT count(*) = 0 FROM public.lineup_players),
  'visitors read no coach boards');
RESET role;

-- ===== Storage: the first folder is a league the caller owns (and has photos, for player photos)

SELECT pg_temp.expect(
  (SELECT public AND file_size_limit = 2097152 AND allowed_mime_types = '{image/jpeg,image/png,image/webp}'
   FROM storage.buckets WHERE id = 'league-logos'),
  'league-logos is public, 2 MB, jpeg/png/webp');

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('player-photos', 'aaaaaaaa-0000-4000-8000-000000000002/players/x.jpg')$sql$,
  1);
SELECT pg_temp.expect_error(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('player-photos', 'bbbbbbbb-0000-4000-8000-000000000002/players/x.jpg')$sql$,
  'row-level security');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('player-photos', 'players/x.jpg')$sql$,
  'row-level security');
-- 36 characters of [0-9a-f-] but not a uuid: denied, not a cast error
SELECT pg_temp.expect_error(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('player-photos', '------------------------------------/players/x.jpg')$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('league-logos', 'aaaaaaaa-0000-4000-8000-000000000002/logo-1.jpg')$sql$,
  1);
SELECT pg_temp.expect_error(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('league-logos', 'bbbbbbbb-0000-4000-8000-000000000002/logo-1.jpg')$sql$,
  'row-level security');
RESET role;

UPDATE public.admin_profiles SET features = array_remove(features, 'photos')
WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001';

SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('player-photos', 'bbbbbbbb-0000-4000-8000-000000000002/players/y.jpg')$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO storage.objects (bucket_id, name) VALUES ('league-logos', 'bbbbbbbb-0000-4000-8000-000000000002/logo-1.jpg')$sql$,
  1);
-- The storage API deletes with WHERE ... RETURNING, so the owner must also be able to see the file.
-- Another league's files stay untouched.
-- (the Storage API sets this flag before deleting; plain SQL deletes are blocked without it)
SELECT set_config('storage.allow_delete_query', 'true', true);
SELECT pg_temp.expect_count(
  $sql$DELETE FROM storage.objects WHERE bucket_id = 'league-logos' AND name = 'aaaaaaaa-0000-4000-8000-000000000002/logo-1.jpg'$sql$,
  0);
RESET role;

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$DELETE FROM storage.objects WHERE bucket_id = 'player-photos' AND name = 'aaaaaaaa-0000-4000-8000-000000000002/players/x.jpg' RETURNING name$sql$,
  1);
SELECT pg_temp.expect_count(
  $sql$DELETE FROM storage.objects WHERE bucket_id = 'league-logos' AND name = 'aaaaaaaa-0000-4000-8000-000000000002/logo-1.jpg' RETURNING name$sql$,
  1);
RESET role;

-- ===== Deleting a league cascades to every table that holds its rows (run as postgres)

INSERT INTO public.leagues (id, owner_id, name, slug) VALUES
  ('99999999-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'League Z', 'z-league');
INSERT INTO public.players (id, league_id, name, position, skill_rating) VALUES
  ('99999999-0000-4000-8000-000000000003', '99999999-0000-4000-8000-000000000002', 'Z Player 1', 'MID', 3),
  ('99999999-0000-4000-8000-000000000004', '99999999-0000-4000-8000-000000000002', 'Z Player 2', 'GK', 3);
INSERT INTO public.sessions (id, league_id, date, share_token) VALUES
  ('99999999-0000-4000-8000-000000000005', '99999999-0000-4000-8000-000000000002', '2026-10-06', 'tenancy-test-z');
INSERT INTO public.teams (id, session_id, color) VALUES
  ('99999999-0000-4000-8000-000000000006', '99999999-0000-4000-8000-000000000005', 'green'),
  ('99999999-0000-4000-8000-000000000007', '99999999-0000-4000-8000-000000000005', 'blue'),
  ('99999999-0000-4000-8000-000000000008', '99999999-0000-4000-8000-000000000005', 'yellow');
INSERT INTO public.session_players (session_id, player_id) VALUES
  ('99999999-0000-4000-8000-000000000005', '99999999-0000-4000-8000-000000000003'),
  ('99999999-0000-4000-8000-000000000005', '99999999-0000-4000-8000-000000000004');
INSERT INTO public.team_players (team_id, player_id) VALUES
  ('99999999-0000-4000-8000-000000000006', '99999999-0000-4000-8000-000000000003'),
  ('99999999-0000-4000-8000-000000000007', '99999999-0000-4000-8000-000000000004');
INSERT INTO public.matches (id, session_id, match_number, team1_id, team2_id, waiting_team_id) VALUES
  ('99999999-0000-4000-8000-000000000009', '99999999-0000-4000-8000-000000000005', 1,
   '99999999-0000-4000-8000-000000000006', '99999999-0000-4000-8000-000000000007', '99999999-0000-4000-8000-000000000008');
INSERT INTO public.match_events (id, match_id, player_id, team_id, event_type) VALUES
  ('99999999-0000-4000-8000-000000000010', '99999999-0000-4000-8000-000000000009',
   '99999999-0000-4000-8000-000000000003', '99999999-0000-4000-8000-000000000006', 'goal');
INSERT INTO public.award_votes (id, session_id, award_type, status, decided_by, vote_token) VALUES
  ('99999999-0000-4000-8000-000000000011', '99999999-0000-4000-8000-000000000005', 'mvp', 'open', 'vote', 'tenancy-vote-z');
INSERT INTO public.award_vote_nominations (award_vote_id, player_id) VALUES
  ('99999999-0000-4000-8000-000000000011', '99999999-0000-4000-8000-000000000003');
INSERT INTO public.award_vote_entries (award_vote_id, voter_fingerprint, player_id) VALUES
  ('99999999-0000-4000-8000-000000000011', 'tenancy-z-voter', '99999999-0000-4000-8000-000000000003');
INSERT INTO public.session_awards (session_id, award_type, winner_player_id, decided_by, is_tied) VALUES
  ('99999999-0000-4000-8000-000000000005', 'best_goalscorer', '99999999-0000-4000-8000-000000000003', 'auto_stat', false);
INSERT INTO public.lineups (id, league_id, name) VALUES
  ('99999999-0000-4000-8000-000000000012', '99999999-0000-4000-8000-000000000002', 'Z Board');
INSERT INTO public.lineup_players (lineup_id, player_id, x, y) VALUES
  ('99999999-0000-4000-8000-000000000012', '99999999-0000-4000-8000-000000000003', 0.5, 0.5);

DO $$
DECLARE
  t text;
  z uuid := '99999999-0000-4000-8000-000000000002';
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards',
    'lineups', 'lineup_players'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE league_id = $1', t) INTO n USING z;
    PERFORM pg_temp.expect(n > 0, t || ': fixture league has rows before delete');
  END LOOP;

  DELETE FROM public.leagues WHERE id = z;

  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards',
    'lineups', 'lineup_players'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE league_id = $1', t) INTO n USING z;
    PERFORM pg_temp.expect(n = 0, t || ': no rows left after the league is deleted');
  END LOOP;
END $$;

-- Later tests go above this line.
SELECT 'TENANCY TESTS PASSED' AS result;
