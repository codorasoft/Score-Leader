-- Team colours are now green / blue / yellow; 'red' stays in the enum only because Postgres cannot drop enum values.
ALTER TYPE team_color ADD VALUE IF NOT EXISTS 'green';
