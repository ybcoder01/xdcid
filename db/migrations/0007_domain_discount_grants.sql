CREATE TABLE IF NOT EXISTS domain_discount_grants (
  id varchar(64) PRIMARY KEY,
  authorization_hash varchar(66) NOT NULL,
  chain_id integer NOT NULL,
  registrar_address varchar(42) NOT NULL,
  authorization_contract varchar(42) NOT NULL,
  beneficiary_fingerprint varchar(64) NOT NULL,
  name_fingerprint varchar(64) NOT NULL,
  product integer NOT NULL,
  term_years integer NOT NULL,
  discount_bps integer NOT NULL,
  max_uses integer NOT NULL,
  valid_after timestamptz NOT NULL,
  deadline timestamptz NOT NULL,
  encrypted_payload text NOT NULL,
  signature text NOT NULL,
  created_by_fingerprint varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS domain_discount_grants_lookup_idx
ON domain_discount_grants (
  chain_id, registrar_address, beneficiary_fingerprint,
  name_fingerprint, product, term_years, deadline
);
