-- Enums
CREATE TYPE player_position AS ENUM ('GK', 'DEF', 'MID', 'ATT');
CREATE TYPE team_color AS ENUM ('red', 'blue', 'yellow');
CREATE TYPE session_status AS ENUM ('draft', 'active', 'completed');
CREATE TYPE match_status AS ENUM ('pending', 'active', 'completed');
CREATE TYPE timer_status AS ENUM ('running', 'paused', 'stopped');
CREATE TYPE event_type AS ENUM ('goal', 'assist', 'yellow_card', 'red_card', 'penalty_goal');
CREATE TYPE award_type AS ENUM ('mvp', 'best_goalkeeper', 'best_assister', 'best_goalscorer', 'fair_play');
CREATE TYPE award_decided_by AS ENUM ('auto_stat', 'admin_direct', 'vote');

-- Players
CREATE TABLE players (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  position player_position NOT NULL,
  skill_rating int NOT NULL CHECK (skill_rating BETWEEN 1 AND 5),
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sessions
CREATE TABLE sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  status session_status NOT NULL DEFAULT 'draft',
  share_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Session players (attendance)
CREATE TABLE session_players (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, player_id)
);

-- Teams
CREATE TABLE teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  color team_color NOT NULL,
  name text
);

-- Team players
CREATE TABLE team_players (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, player_id)
);

-- Matches
CREATE TABLE matches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  match_number int NOT NULL,
  team1_id uuid NOT NULL REFERENCES teams(id),
  team2_id uuid NOT NULL REFERENCES teams(id),
  waiting_team_id uuid NOT NULL REFERENCES teams(id),
  status match_status NOT NULL DEFAULT 'pending',
  team1_score int NOT NULL DEFAULT 0,
  team2_score int NOT NULL DEFAULT 0,
  winner_team_id uuid REFERENCES teams(id),
  is_draw boolean NOT NULL DEFAULT false,
  draw_resolved_by text CHECK (draw_resolved_by IN ('penalties', 'late_team')),
  timer_started_at timestamptz,
  timer_elapsed_seconds int NOT NULL DEFAULT 0,
  timer_status timer_status NOT NULL DEFAULT 'stopped',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Match events (goals, assists, cards)
CREATE TABLE match_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  event_type event_type NOT NULL,
  related_event_id uuid REFERENCES match_events(id),
  minute int,
  suspension_minutes int CHECK (suspension_minutes IN (2, 3)),
  suspension_started_at timestamptz,
  suspension_ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Award votes (mvp / fair_play voting)
CREATE TABLE award_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  award_type text NOT NULL CHECK (award_type IN ('mvp', 'fair_play')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  winner_player_id uuid REFERENCES players(id),
  decided_by text NOT NULL CHECK (decided_by IN ('admin_direct', 'vote')),
  vote_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Award vote nominations
CREATE TABLE award_vote_nominations (
  award_vote_id uuid NOT NULL REFERENCES award_votes(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id),
  PRIMARY KEY (award_vote_id, player_id)
);

-- Award vote entries (individual votes)
CREATE TABLE award_vote_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  award_vote_id uuid NOT NULL REFERENCES award_votes(id) ON DELETE CASCADE,
  voter_fingerprint text NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (award_vote_id, voter_fingerprint)
);

-- Session awards (final results)
CREATE TABLE session_awards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  award_type award_type NOT NULL,
  winner_player_id uuid NOT NULL REFERENCES players(id),
  decided_by award_decided_by NOT NULL,
  is_tied boolean NOT NULL DEFAULT false
);
