-- Best goalkeeper can now be decided by vote, like MVP and fair play.
ALTER TABLE public.award_votes DROP CONSTRAINT IF EXISTS award_votes_award_type_check;
ALTER TABLE public.award_votes
  ADD CONSTRAINT award_votes_award_type_check CHECK (award_type IN ('mvp', 'fair_play', 'best_goalkeeper'));

-- Voters use the public vote link without signing in. They may only add a vote to an
-- open vote, for a nominated player; one vote per device is enforced by the existing
-- UNIQUE (award_vote_id, voter_fingerprint).
DROP POLICY IF EXISTS "public vote" ON public.award_vote_entries;
CREATE POLICY "public vote" ON public.award_vote_entries
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.award_votes v
      WHERE v.id = award_vote_entries.award_vote_id AND v.status = 'open'
    )
    AND EXISTS (
      SELECT 1 FROM public.award_vote_nominations n
      WHERE n.award_vote_id = award_vote_entries.award_vote_id AND n.player_id = award_vote_entries.player_id
    )
  );
