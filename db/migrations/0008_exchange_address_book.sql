CREATE TABLE IF NOT EXISTS private_vault_challenges (
  id varchar(32) PRIMARY KEY,
  address varchar(42) NOT NULL,
  message_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS private_vault_challenges_expires_idx
ON private_vault_challenges (expires_at);

CREATE TABLE IF NOT EXISTS exchange_address_book_entries (
  id varchar(40) PRIMARY KEY,
  owner_fingerprint varchar(64) NOT NULL,
  encrypted_payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_address_book_owner_idx
ON exchange_address_book_entries (owner_fingerprint, updated_at DESC);
