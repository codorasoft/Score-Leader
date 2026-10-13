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
--          ...0012 coach board. S only has ...0001, plus the catalog it owns:
--          ...0013 training type, ...0014 / ...0015 its videos. ...0016 training (league Z only;
--          A's training gets a generated id, kept in the setting test.a_training).
--          ...0017 schedule item (repeating), ...0018 schedule item (a task).
--          Push devices have no fixed ids; they are told apart by their address
--          (https://push.test/a1, a2, ...).
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
    'lineups', 'lineup_players', 'trainings', 'training_items', 'schedule_items'
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
  ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'admin', 'Admin A', 2, '{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board,training,schedule}'::text[], false),
  ('bbbbbbbb-0000-4000-8000-000000000001'::uuid, 'admin', 'Admin B', 1, '{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board,training,schedule}'::text[], false),
  ('cccccccc-0000-4000-8000-000000000001'::uuid, 'superadmin', 'Superadmin S', 0, '{}'::text[], false),
  ('dddddddd-0000-4000-8000-000000000001'::uuid, 'admin', 'Admin D', 1, '{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board,training,schedule}'::text[], true)
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

SELECT pg_temp.expect(public.valid_features('{cards,swaps,smart_balancing,awards,voting,leaderboard,potm,profiles,badges,records,player_cards,photos,summary_share,coach_board,training,schedule}'::text[]), 'all 16 features are valid');
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

-- A board's formation and its substitutes
SELECT pg_temp.expect_count(
  $sql$UPDATE public.lineups SET formation = '4-3-2-1' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 1);
SELECT pg_temp.expect_error(
  $sql$UPDATE public.lineups SET formation = '4-4-7' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 'lineups_formation_check');
SELECT pg_temp.expect_error(
  $sql$UPDATE public.lineups SET formation = '1-1-1-1-1-1' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 'lineups_formation_check');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.lineup_players SET bench_order = 0 WHERE lineup_id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 1);
SELECT pg_temp.expect_error(
  $sql$UPDATE public.lineup_players SET bench_order = -1 WHERE lineup_id = 'aaaaaaaa-0000-4000-8000-000000000012'$sql$, 'lineup_players_bench_order_check');
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

-- ===== Training: catalog by the superadmin, trainings by the owner with training

SELECT pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.training_types (id, name, sort_order)
       VALUES ('cccccccc-0000-4000-8000-000000000013', 'Passing', 0)$sql$,
  1);
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.training_videos (id, type_id, title, youtube_id, sort_order) VALUES
       ('cccccccc-0000-4000-8000-000000000014', 'cccccccc-0000-4000-8000-000000000013', 'Rondo', 'dQw4w9WgXcQ', 0),
       ('cccccccc-0000-4000-8000-000000000015', 'cccccccc-0000-4000-8000-000000000013', 'Wall pass', 'aqz-KE-bpKQ', 1)$sql$,
  2);
SELECT pg_temp.expect_count(
  $sql$UPDATE public.training_types SET name = 'Passing drills' WHERE id = 'cccccccc-0000-4000-8000-000000000013'$sql$,
  1);
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.training_videos (type_id, title, youtube_id, sort_order)
       VALUES ('cccccccc-0000-4000-8000-000000000013', 'Rondo again', 'dQw4w9WgXcQ', 2)$sql$,
  'training_videos_type_id_youtube_id_key');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.training_videos (type_id, title, youtube_id, sort_order)
       VALUES ('cccccccc-0000-4000-8000-000000000013', 'Too short', 'short', 2)$sql$,
  'youtube_id');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.training_videos (type_id, title, youtube_id, sort_order)
       VALUES ('cccccccc-0000-4000-8000-000000000013', 'A link, not an id', 'https://youtu.be/dQw4w9WgXcQ', 2)$sql$,
  'youtube_id');
RESET role;

-- An admin reads the catalog and changes none of it
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM public.training_types WHERE id = 'cccccccc-0000-4000-8000-000000000013')
  AND (SELECT count(*) = 2 FROM public.training_videos WHERE type_id = 'cccccccc-0000-4000-8000-000000000013'),
  'an admin with training reads the catalog');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.training_types (name, sort_order) VALUES ('Mine', 5)$sql$,
  'row-level security');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.training_videos (type_id, title, youtube_id, sort_order)
       VALUES ('cccccccc-0000-4000-8000-000000000013', 'Mine', 'abcdefghijk', 5)$sql$,
  'row-level security');
SELECT pg_temp.expect_count($sql$UPDATE public.training_types SET name = 'Hacked'$sql$, 0);
SELECT pg_temp.expect_count($sql$UPDATE public.training_videos SET title = 'Hacked'$sql$, 0);
SELECT pg_temp.expect_count($sql$DELETE FROM public.training_videos$sql$, 0);
SELECT pg_temp.expect_count($sql$DELETE FROM public.training_types$sql$, 0);

-- Saving: a blank title is no title; each video once, in the order first given; an id that is
-- not in the catalog is skipped
SELECT pg_temp.expect(
  public.save_training(NULL, 'aaaaaaaa-0000-4000-8000-000000000002', '2026-10-12', '   ', ARRAY[
    'cccccccc-0000-4000-8000-000000000015', 'cccccccc-0000-4000-8000-000000000014',
    'cccccccc-0000-4000-8000-000000000015', 'eeeeeeee-0000-4000-8000-000000000099']::uuid[]) IS NOT NULL,
  'A saves a new training');
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(title IS NULL AND training_date = '2026-10-12')
   FROM public.trainings WHERE league_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'one training in a-league, its blank title stored as none');
SELECT pg_temp.expect(
  (SELECT array_agg(video_id ORDER BY position) = ARRAY[
            'cccccccc-0000-4000-8000-000000000015', 'cccccccc-0000-4000-8000-000000000014']::uuid[]
      AND array_agg(position ORDER BY position) = ARRAY[0, 1]
      AND bool_and(league_id = 'aaaaaaaa-0000-4000-8000-000000000002')
   FROM public.training_items),
  'two items in first-given order, with the league of their training');
SELECT set_config('test.a_training',
  (SELECT id::text FROM public.trainings WHERE league_id = 'aaaaaaaa-0000-4000-8000-000000000002'), true);

-- Saving again replaces the videos; the league given is ignored, a training never moves
SELECT pg_temp.expect(
  public.save_training(current_setting('test.a_training')::uuid, 'bbbbbbbb-0000-4000-8000-000000000002',
    '2026-10-13', ' Passing ', ARRAY['cccccccc-0000-4000-8000-000000000014']::uuid[])
    = current_setting('test.a_training')::uuid,
  'saving an existing training returns its id');
SELECT pg_temp.expect(
  (SELECT title = 'Passing' AND training_date = '2026-10-13' AND league_id = 'aaaaaaaa-0000-4000-8000-000000000002'
   FROM public.trainings WHERE id = current_setting('test.a_training')::uuid)
  AND (SELECT count(*) = 1 AND min(position) = 0 AND bool_and(video_id = 'cccccccc-0000-4000-8000-000000000014')
       FROM public.training_items WHERE training_id = current_setting('test.a_training')::uuid),
  'the second save changed the date, title and videos, not the league');
RESET role;

-- Another admin neither sees nor changes it
SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM public.trainings) AND (SELECT count(*) = 0 FROM public.training_items),
  'B cannot read A''s trainings');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_training(current_setting('test.a_training')::uuid, 'bbbbbbbb-0000-4000-8000-000000000002',
         '2026-11-01', 'Stolen', '{}')$sql$,
  'training not found');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_training(NULL, 'aaaaaaaa-0000-4000-8000-000000000002', '2026-11-01', 'Planted', '{}')$sql$,
  'row-level security');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.training_items (training_id, video_id, position)
       VALUES (current_setting('test.a_training')::uuid, 'cccccccc-0000-4000-8000-000000000015', 5)$sql$,
  'row-level security');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.trainings SET title = 'Hacked' WHERE id = current_setting('test.a_training')::uuid$sql$, 0);
SELECT pg_temp.expect_count(
  $sql$DELETE FROM public.training_items WHERE training_id = current_setting('test.a_training')::uuid$sql$, 0);
SELECT pg_temp.expect_count(
  $sql$DELETE FROM public.trainings WHERE id = current_setting('test.a_training')::uuid$sql$, 0);
RESET role;

SELECT pg_temp.expect(
  (SELECT title = 'Passing' AND training_date = '2026-10-13'
   FROM public.trainings WHERE id = current_setting('test.a_training')::uuid)
  AND (SELECT count(*) = 1 FROM public.training_items WHERE training_id = current_setting('test.a_training')::uuid),
  'A''s training is unchanged after B''s attempts');

-- The superadmin counts where a video is used, and nothing more
SELECT pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM public.training_items WHERE video_id = 'cccccccc-0000-4000-8000-000000000014')
  AND (SELECT count(*) = 0 FROM public.trainings),
  'the superadmin counts uses of a video and reads no trainings');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.training_items (training_id, video_id, position)
       VALUES (current_setting('test.a_training')::uuid, 'cccccccc-0000-4000-8000-000000000015', 5)$sql$,
  'row-level security');
SELECT pg_temp.expect_count($sql$DELETE FROM public.training_items$sql$, 0);
RESET role;

SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM public.training_types) AND (SELECT count(*) = 0 FROM public.training_videos)
  AND (SELECT count(*) = 0 FROM public.trainings) AND (SELECT count(*) = 0 FROM public.training_items),
  'visitors read no catalog and no trainings');
RESET role;

-- Without the feature: no catalog, no trainings
UPDATE public.admin_profiles SET features = array_remove(features, 'training')
WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001';

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM public.training_types) AND (SELECT count(*) = 0 FROM public.training_videos)
  AND (SELECT count(*) = 0 FROM public.trainings) AND (SELECT count(*) = 0 FROM public.training_items),
  'without training A reads no catalog and no trainings');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_training(NULL, 'aaaaaaaa-0000-4000-8000-000000000002', '2026-11-01', 'No feature', '{}')$sql$,
  'row-level security');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_training(current_setting('test.a_training')::uuid, 'aaaaaaaa-0000-4000-8000-000000000002',
         '2026-11-01', 'No feature', '{}')$sql$,
  'training not found');
RESET role;

UPDATE public.admin_profiles SET features = array_append(features, 'training')
WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Deleting a catalog video takes it out of trainings and keeps the training
SELECT pg_temp.expect_count(
  $sql$DELETE FROM public.training_videos WHERE id = 'cccccccc-0000-4000-8000-000000000014'$sql$, 1);
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM public.trainings WHERE id = current_setting('test.a_training')::uuid)
  AND (SELECT count(*) = 0 FROM public.training_items WHERE training_id = current_setting('test.a_training')::uuid),
  'the training stays, without the deleted video');

-- ===== Schedule: owner only, and only with schedule

SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.schedule_items (id, league_id, kind, title, item_date, start_time, end_time, note, repeat_days, repeat_until)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000017', 'aaaaaaaa-0000-4000-8000-000000000002', 'training', 'Team training', '2026-10-11', '18:00', '19:30', 'Bring bibs', '{0,2}', '2026-12-31')$sql$,
  1);
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.schedule_items (id, league_id, kind, title, item_date)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000018', 'aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Book the pitch', '2026-10-12')$sql$,
  1);
SELECT pg_temp.expect(
  (SELECT repeats FROM public.schedule_items WHERE id = 'aaaaaaaa-0000-4000-8000-000000000017')
  AND (SELECT NOT repeats AND repeat_days = '{}' AND skipped_dates = '{}' AND done_dates = '{}' AND start_time IS NULL
       FROM public.schedule_items WHERE id = 'aaaaaaaa-0000-4000-8000-000000000018'),
  'repeats follows repeat_days; a plain item is all day and repeats on no day');
SELECT pg_temp.expect_count(
  $sql$UPDATE public.schedule_items SET done_dates = '{2026-10-12}', skipped_dates = '{2026-10-13}'
       WHERE id = 'aaaaaaaa-0000-4000-8000-000000000018'$sql$,
  1);

-- Every check refuses its bad row
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'party', 'Party', '2026-10-12')$sql$,
  'schedule_items_kind_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', '   ', '2026-10-12')$sql$,
  'schedule_items_title_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, end_time) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'End without start', '2026-10-12', '10:00')$sql$,
  'schedule_items_times_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, start_time, end_time) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Ends before it starts', '2026-10-12', '10:00', '09:00')$sql$,
  'schedule_items_times_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, start_time, end_time) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Ends when it starts', '2026-10-12', '10:00', '10:00')$sql$,
  'schedule_items_times_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_days) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Day 7', '2026-10-12', '{7}')$sql$,
  'schedule_items_repeat_days_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_days) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Same day twice', '2026-10-12', '{1,1}')$sql$,
  'schedule_items_repeat_days_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_days, repeat_until) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Until before start', '2026-10-12', '{1}', '2026-10-11')$sql$,
  'schedule_items_repeat_until_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_until) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Until without repeat', '2026-10-12', '2026-12-31')$sql$,
  'schedule_items_repeat_until_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, note) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Long note', '2026-10-12', repeat('x', 501))$sql$,
  'schedule_items_note_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date) VALUES ('bbbbbbbb-0000-4000-8000-000000000002', 'task', 'Planted', '2026-10-12')$sql$,
  'row-level security');
-- Repeats every two weeks, and every month
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_days, repeat_every)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'training', 'Every other week', '2026-10-11', '{0,2}', 2)$sql$,
  1);
SELECT pg_temp.expect_count(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_monthly, repeat_until)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'other', 'Every month', '2026-10-31', true, '2027-06-30')$sql$,
  1);
SELECT pg_temp.expect(
  (SELECT repeats AND repeat_every = 2 AND NOT repeat_monthly FROM public.schedule_items WHERE title = 'Every other week')
  AND (SELECT repeats AND repeat_every = 1 AND repeat_monthly AND repeat_days = '{}' FROM public.schedule_items WHERE title = 'Every month')
  AND (SELECT NOT repeats AND repeat_every = 1 AND NOT repeat_monthly FROM public.schedule_items WHERE id = 'aaaaaaaa-0000-4000-8000-000000000018'),
  'repeats is true for weekly, two-weekly and monthly items, and false for a plain one');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_every) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Two weeks, no days', '2026-10-12', 2)$sql$,
  'schedule_items_repeat_every_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_days, repeat_every) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Every 5 weeks', '2026-10-12', '{1}', 5)$sql$,
  'schedule_items_repeat_every_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_days, repeat_every) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Every 0 weeks', '2026-10-12', '{1}', 0)$sql$,
  'schedule_items_repeat_every_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_days, repeat_monthly) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Weekly and monthly', '2026-10-12', '{1}', true)$sql$,
  'schedule_items_repeat_monthly_check');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date, repeat_monthly, repeat_until) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Monthly, until before', '2026-10-12', true, '2026-10-11')$sql$,
  'schedule_items_repeat_until_check');
SELECT pg_temp.expect_count(
  $sql$DELETE FROM public.schedule_items WHERE title IN ('Every other week', 'Every month')$sql$, 2);
SELECT pg_temp.expect((SELECT count(*) = 2 FROM public.schedule_items), 'A reads the two items of a-league');
RESET role;

-- Another admin, the superadmin and visitors get nothing
SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT pg_temp.expect((SELECT count(*) = 0 FROM public.schedule_items), 'B cannot read A''s schedule');
SELECT pg_temp.expect_count($sql$UPDATE public.schedule_items SET title = 'Hacked'$sql$, 0);
SELECT pg_temp.expect_count($sql$DELETE FROM public.schedule_items$sql$, 0);
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'Planted', '2026-10-12')$sql$,
  'row-level security');
RESET role;

SELECT pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.expect((SELECT count(*) = 0 FROM public.schedule_items), 'the superadmin reads no schedule');
RESET role;

SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect((SELECT count(*) = 0 FROM public.schedule_items), 'visitors read no schedule');
RESET role;

SELECT pg_temp.expect(
  (SELECT title = 'Team training' FROM public.schedule_items WHERE id = 'aaaaaaaa-0000-4000-8000-000000000017')
  AND (SELECT count(*) = 2 FROM public.schedule_items WHERE league_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'A''s schedule is unchanged after the others'' attempts');

-- Without the feature: nothing
UPDATE public.admin_profiles SET features = array_remove(features, 'schedule') WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect((SELECT count(*) = 0 FROM public.schedule_items), 'without schedule A reads no items');
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.schedule_items (league_id, kind, title, item_date) VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'task', 'No feature', '2026-10-12')$sql$,
  'row-level security');
SELECT pg_temp.expect_count($sql$DELETE FROM public.schedule_items$sql$, 0);
RESET role;
UPDATE public.admin_profiles SET features = array_append(features, 'schedule') WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ===== Morning push: a coach's devices (push_subscriptions) are written only by
-- save_push_subscription, read and deleted only by their own coach; the job that calls the
-- server function stays quiet until there is a device and its two Vault values

-- What the live database holds after the rollout is put aside here (and comes back with the
-- ROLLBACK), so these checks give the same answer before and after it
DELETE FROM public.push_subscriptions;
DELETE FROM vault.secrets WHERE name IN ('morning_push_url', 'morning_push_secret');

SELECT pg_temp.expect(
  (SELECT count(*) = 2 FROM public.admin_profiles
   WHERE user_id IN ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001')
     AND 'schedule' = ANY (features) AND NOT is_disabled),
  'A and B are enabled and have schedule before the push tests');

-- The job: nobody has a device yet, so nothing is asked even with both values set
SELECT vault.create_secret('https://example.test/fn', 'morning_push_url');
SELECT vault.create_secret('s3cret', 'morning_push_secret');
SELECT public.kick_morning_push();
SELECT pg_temp.expect(
  (SELECT count(*) = 0 FROM net.http_request_queue WHERE url = 'https://example.test/fn'),
  'the job asks nothing while there is no device');

-- A coach saves a device, and saving it again changes that one row
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a1', 'key', 'auth', 'Asia/Riyadh', 7, 'ar');
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(user_id = 'aaaaaaaa-0000-4000-8000-000000000001' AND p256dh = 'key' AND auth = 'auth'
     AND time_zone = 'Asia/Riyadh' AND notify_hour = 7 AND language = 'ar' AND last_sent_on IS NULL)
   FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'A saves a device and reads it back');
SELECT public.save_push_subscription('https://push.test/a1', 'key2', 'auth2', 'Europe/Berlin', 9, 'en');
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(p256dh = 'key2' AND auth = 'auth2' AND time_zone = 'Europe/Berlin' AND notify_hour = 9 AND language = 'en')
   FROM public.push_subscriptions),
  'saving the same address again changes that row, and adds none');

-- No way round the function
SELECT pg_temp.expect_error(
  $sql$INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, time_zone, notify_hour, language)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'https://push.test/direct', 'k', 'a', 'UTC', 7, 'en')$sql$,
  'permission denied');
SELECT pg_temp.expect_error($sql$UPDATE public.push_subscriptions SET notify_hour = 3$sql$, 'permission denied');
RESET role;

-- Nobody else sees it or can remove it
SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT pg_temp.expect((SELECT count(*) = 0 FROM public.push_subscriptions), 'B reads none of A''s devices');
SELECT pg_temp.expect_count($sql$DELETE FROM public.push_subscriptions$sql$, 0);
RESET role;
SELECT pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.expect((SELECT count(*) = 0 FROM public.push_subscriptions), 'the superadmin reads no devices');
SELECT pg_temp.expect_count($sql$DELETE FROM public.push_subscriptions$sql$, 0);
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/s1', 'k', 'a', 'UTC', 7, 'en')$sql$,
  'schedule feature needed');
RESET role;
SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect_error($sql$SELECT count(*) FROM public.push_subscriptions$sql$, 'permission denied');
SELECT pg_temp.expect_error($sql$DELETE FROM public.push_subscriptions$sql$, 'permission denied');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/v1', 'k', 'a', 'UTC', 7, 'en')$sql$,
  'permission denied');
RESET role;
SELECT pg_temp.expect((SELECT count(*) = 1 FROM public.push_subscriptions), 'A''s device is untouched after the others'' attempts');

-- The day already handled is kept for the same coach
UPDATE public.push_subscriptions SET last_sent_on = '2026-10-13' WHERE endpoint = 'https://push.test/a1';
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a1', 'key2', 'auth2', 'Asia/Riyadh', 8, 'ar');
RESET role;
SELECT pg_temp.expect(
  (SELECT last_sent_on = '2026-10-13' AND notify_hour = 8 FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'the same coach saving again keeps the day already handled');

-- Whoever holds the address holds the device: another coach on the same browser takes it over
SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a1', 'key3', 'auth3', 'Asia/Riyadh', 6, 'en');
RESET role;
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(user_id = 'bbbbbbbb-0000-4000-8000-000000000001' AND last_sent_on IS NULL AND notify_hour = 6)
   FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'B saving A''s address becomes its owner, and the day handled is forgotten');
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect((SELECT count(*) = 0 FROM public.push_subscriptions), 'A no longer reads the device B took over');

-- What the function refuses
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a2', 'k', 'a', 'UTC', 24, 'en')$sql$,
  'push_subscriptions_hour_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a2', 'k', 'a', 'UTC', -1, 'en')$sql$,
  'push_subscriptions_hour_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a2', 'k', 'a', 'UTC', 7, 'fr')$sql$,
  'push_subscriptions_language_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('http://push.test/a2', 'k', 'a', 'UTC', 7, 'en')$sql$,
  'push_subscriptions_endpoint_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/' || repeat('x', 2000), 'k', 'a', 'UTC', 7, 'en')$sql$,
  'push_subscriptions_endpoint_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a2', 'k', 'a', 'Not a zone!', 7, 'en')$sql$,
  'push_subscriptions_time_zone_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a2', '', 'a', 'UTC', 7, 'en')$sql$,
  'push_subscriptions_keys_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a2', 'k', repeat('a', 201), 'UTC', 7, 'en')$sql$,
  'push_subscriptions_keys_check');

-- A coach removes his own device
SELECT public.save_push_subscription('https://push.test/a2', 'k', 'a', 'America/Argentina/Buenos_Aires', 0, 'en');
SELECT pg_temp.expect_count($sql$DELETE FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a2'$sql$, 1);
RESET role;

-- Without schedule, and for a disabled admin: no device
UPDATE public.admin_profiles SET features = array_remove(features, 'schedule') WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a3', 'k', 'a', 'UTC', 7, 'en')$sql$,
  'schedule feature needed');
RESET role;
UPDATE public.admin_profiles SET features = array_append(features, 'schedule') WHERE user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
SELECT pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/d1', 'k', 'a', 'UTC', 7, 'en')$sql$,
  'schedule feature needed');
RESET role;

-- Deleting a coach removes his devices
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(confdeltype = 'c' AND confrelid = 'public.admin_profiles'::regclass)
   FROM pg_constraint WHERE conrelid = 'public.push_subscriptions'::regclass AND contype = 'f'),
  'push_subscriptions has one foreign key, to the coach, deleted with him');

-- The minutes of the time, in quarters. At this point one device is left: a1, taken over by B.
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM pg_proc WHERE proname = 'save_push_subscription' AND pronamespace = 'public'::regnamespace),
  'there is one save_push_subscription, not an old and a new one side by side');
SELECT pg_temp.expect(
  (SELECT notify_minute = 0 FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'a device saved without minutes is on the hour');

SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a1', 'key3', 'auth3', 'Asia/Riyadh', 7, 'en', 30);
RESET role;
SELECT pg_temp.expect(
  (SELECT notify_hour = 7 AND notify_minute = 30 FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'the minutes are saved with the hour');

-- The app from before minutes existed names none: they stay as they are
SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a1', 'key3', 'auth3', 'Asia/Riyadh', 8, 'en');
RESET role;
SELECT pg_temp.expect(
  (SELECT notify_hour = 8 AND notify_minute = 30 FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'a save that names no minutes keeps them');

-- As the app calls it, by name; and back to the hour
SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT public.save_push_subscription(
  p_endpoint => 'https://push.test/a1', p_p256dh => 'key3', p_auth => 'auth3', p_time_zone => 'Asia/Riyadh',
  p_notify_hour => 8, p_language => 'en', p_notify_minute => 0);
RESET role;
SELECT pg_temp.expect(
  (SELECT notify_minute = 0 FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'the minutes can be set back to the hour');

SELECT pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a1', 'key3', 'auth3', 'Asia/Riyadh', 8, 'en', 45);
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a1', 'key3', 'auth3', 'Asia/Riyadh', 8, 'en', 10)$sql$,
  'push_subscriptions_minute_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a1', 'key3', 'auth3', 'Asia/Riyadh', 8, 'en', 60)$sql$,
  'push_subscriptions_minute_check');
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/a1', 'key3', 'auth3', 'Asia/Riyadh', 8, 'en', -15)$sql$,
  'push_subscriptions_minute_check');
RESET role;
SELECT pg_temp.expect(
  (SELECT notify_minute = 45 FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'a refused save leaves the minutes as they were');

-- Another coach taking the device over without naming minutes does not inherit the first one's
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a1', 'key4', 'auth4', 'Asia/Riyadh', 9, 'en');
RESET role;
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(user_id = 'aaaaaaaa-0000-4000-8000-000000000001' AND notify_hour = 9 AND notify_minute = 0)
   FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a1'),
  'a coach who takes a device over without naming minutes starts on the hour');

-- A new device without minutes is on the hour, and a visitor still cannot save one
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT public.save_push_subscription('https://push.test/a5', 'k', 'a', 'UTC', 7, 'en');
SELECT pg_temp.expect(
  (SELECT notify_minute = 0 FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a5'),
  'a new device saved without minutes is on the hour');
SELECT pg_temp.expect_count($sql$DELETE FROM public.push_subscriptions WHERE endpoint = 'https://push.test/a5'$sql$, 1);
RESET role;
SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect_error(
  $sql$SELECT public.save_push_subscription('https://push.test/v2', 'k', 'a', 'UTC', 7, 'en', 15)$sql$,
  'permission denied');
RESET role;

-- The server function works as the service role: it reads the devices and what is on a day,
-- marks a device's day and removes one whose address is gone. A missing right would only
-- show on the live system, as a notification repeated every 15 minutes.
SELECT pg_temp.expect(
  has_table_privilege('service_role', 'public.push_subscriptions', 'SELECT')
  AND has_table_privilege('service_role', 'public.push_subscriptions', 'UPDATE')
  AND has_table_privilege('service_role', 'public.push_subscriptions', 'DELETE'),
  'the service role can read, mark and remove devices');
SELECT pg_temp.expect(
  (SELECT bool_and(has_table_privilege('service_role', t, 'SELECT'))
   FROM unnest(ARRAY['public.admin_profiles', 'public.leagues', 'public.schedule_items', 'public.sessions', 'public.trainings']) AS t),
  'the service role can read the coaches, their leagues and what is on a day');
SELECT pg_temp.expect(
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'),
  'the service role is not held back by the row rules');

-- The job: not for the app's users; with a device and both values it asks once, with the
-- secret as its bearer token; with a value missing it asks nothing more
SELECT pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error($sql$SELECT public.kick_morning_push()$sql$, 'permission denied');
RESET role;
SELECT pg_temp.act_as(NULL);
SELECT pg_temp.expect_error($sql$SELECT public.kick_morning_push()$sql$, 'permission denied');
RESET role;
SELECT pg_temp.expect((SELECT count(*) = 1 FROM public.push_subscriptions), 'one device is left for the job tests');
SELECT public.kick_morning_push();
SELECT pg_temp.expect(
  (SELECT count(*) = 1 AND bool_and(headers ->> 'Authorization' = 'Bearer s3cret' AND method = 'POST')
   FROM net.http_request_queue WHERE url = 'https://example.test/fn'),
  'with a device and both values the job asks the function once, with its secret');
DELETE FROM vault.secrets WHERE name = 'morning_push_secret';
SELECT public.kick_morning_push();
SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM net.http_request_queue WHERE url = 'https://example.test/fn'),
  'without its secret the job asks nothing');

SELECT pg_temp.expect(
  (SELECT count(*) = 1 FROM cron.job WHERE jobname = 'morning-push' AND schedule = '*/15 * * * *' AND command = 'SELECT public.kick_morning_push()' AND active)
  AND (SELECT count(*) = 1 FROM cron.job WHERE jobname = 'purge-cron-history' AND schedule = '0 3 * * *' AND active),
  'the two jobs are scheduled: every 15 minutes, and the daily clean-up of their history');

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
INSERT INTO public.trainings (id, league_id, training_date) VALUES
  ('99999999-0000-4000-8000-000000000016', '99999999-0000-4000-8000-000000000002', '2026-10-12');
INSERT INTO public.training_items (training_id, video_id, position) VALUES
  ('99999999-0000-4000-8000-000000000016', 'cccccccc-0000-4000-8000-000000000015', 0);
INSERT INTO public.schedule_items (id, league_id, kind, title, item_date) VALUES
  ('99999999-0000-4000-8000-000000000017', '99999999-0000-4000-8000-000000000002', 'other', 'Z item', '2026-10-12');

DO $$
DECLARE
  t text;
  z uuid := '99999999-0000-4000-8000-000000000002';
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards',
    'lineups', 'lineup_players', 'trainings', 'training_items', 'schedule_items'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE league_id = $1', t) INTO n USING z;
    PERFORM pg_temp.expect(n > 0, t || ': fixture league has rows before delete');
  END LOOP;

  DELETE FROM public.leagues WHERE id = z;

  FOREACH t IN ARRAY ARRAY[
    'players', 'sessions', 'session_players', 'teams', 'team_players', 'matches', 'match_events',
    'award_votes', 'award_vote_nominations', 'award_vote_entries', 'session_awards',
    'lineups', 'lineup_players', 'trainings', 'training_items', 'schedule_items'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE league_id = $1', t) INTO n USING z;
    PERFORM pg_temp.expect(n = 0, t || ': no rows left after the league is deleted');
  END LOOP;
END $$;

-- Later tests go above this line.
SELECT 'TENANCY TESTS PASSED' AS result;
