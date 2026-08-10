ALTER TABLE forwarding_recoveries
ADD COLUMN IF NOT EXISTS source_chain_id integer NOT NULL DEFAULT 50;

CREATE INDEX IF NOT EXISTS forwarding_recoveries_source_idx
ON forwarding_recoveries (source_chain_id);
