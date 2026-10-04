-- Enable RLS on all tables and grant anon read, authenticated full access

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'players','sessions','session_players','teams','team_players',
    'matches','match_events','award_votes','award_vote_nominations',
    'award_vote_entries','session_awards'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "public read" ON %I FOR SELECT TO anon USING (true)', t);
    EXECUTE format('CREATE POLICY "admin write" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$$;
