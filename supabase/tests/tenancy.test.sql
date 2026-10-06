-- Database rules tests for multi-tenancy. Run ONLY through `bash scripts/rehearse.sh`, which
-- applies the migrations and then this file inside one transaction that ends in ROLLBACK.
-- Any failed check raises, which aborts the run; the last line reports success.
--
-- Fixture ids (fixed so later tests can use them as literals):
--   prefix aaaaaaaa = admin A (max_leagues 2, all features), league a-league
--   prefix bbbbbbbb = admin B (all features), league b-league
--   prefix cccccccc = superadmin S
--   prefix dddddddd = admin D (disabled, owns no league)
--   suffix ...0001 user, ...0002 league, ...0003 / ...0004 players, ...0005 session,
--          ...0006 / ...0007 / ...0008 teams (green / blue / yellow), ...0009 match
--          (team 1 vs team 2, team 3 waiting). S and D only have ...0001.
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

-- ===== Backfill (checked before the fixture adds rows in other leagues)

DO $$
DECLARE
  t text;
  eagles uuid := (SELECT id FROM public.leagues WHERE slug = 'eagles');
  nulls bigint;
  elsewhere bigint;
BEGIN
  PERFORM pg_temp.expect(eagles IS NOT NULL, 'league eagles exists');
  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards',
    'lineups', 'lineup_players'
  ] LOOP
    EXECUTE format('SELECT count(*) FILTER (WHERE league_id IS NULL),
                           count(*) FILTER (WHERE league_id IS DISTINCT FROM $1)
                    FROM public.%I', t)
      INTO nulls, elsewhere USING eagles;
    PERFORM pg_temp.expect(nulls = 0, t || ': no NULL league_id');
    PERFORM pg_temp.expect(elsewhere = 0, t || ': every existing row is in eagles');
  END LOOP;
END $$;

SELECT pg_temp.expect(
  (SELECT p.role = 'admin' AND cardinality(p.features) = 14 AND p.max_leagues = 1 AND NOT p.is_disabled
          AND p.email = 'info@codorasoft.com' AND p.display_name = 'Eagles admin'
   FROM public.admin_profiles p JOIN auth.users u ON u.id = p.user_id
   WHERE u.email = 'info@codorasoft.com'),
  'info@codorasoft.com is an enabled admin with 14 features and max_leagues 1');

SELECT pg_temp.expect(
  (SELECT l.name = 'Eagles' AND l.logo_url IS NULL
   FROM public.leagues l JOIN auth.users u ON u.id = l.owner_id
   WHERE l.slug = 'eagles' AND u.email = 'info@codorasoft.com'),
  'Eagles belongs to info@codorasoft.com and has no logo');

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

-- ===== Helper functions and the public directory

SELECT pg_temp.expect(
  (SELECT cardinality(features) = 14 AND is_available AND name = 'Eagles' AND logo_url IS NULL
   FROM public.league_directory WHERE slug = 'eagles'),
  'league_directory shows eagles as available with 14 features');

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

-- Later tests go above this line.
SELECT 'TENANCY TESTS PASSED' AS result;
