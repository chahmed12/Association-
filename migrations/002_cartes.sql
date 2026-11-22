ALTER TABLE femmes
    ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS numero_adherent VARCHAR(30),
    ADD COLUMN IF NOT EXISTS carte_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS carte_expire_le DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_femmes_numero_adherent ON femmes(numero_adherent) WHERE numero_adherent IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_femmes_carte_token ON femmes(carte_token) WHERE carte_token IS NOT NULL;

UPDATE membres
SET numero_adherent = 'MEM-' || LPAD(id::text, 4, '0')
WHERE numero_adherent IS NULL;

UPDATE femmes
SET numero_adherent = 'MEM-' || LPAD((2000 + id)::text, 4, '0')
WHERE numero_adherent IS NULL;

UPDATE membres
SET carte_token = md5('membre-' || id::text || clock_timestamp()::text || random()::text) || md5(random()::text || clock_timestamp()::text || id::text)
WHERE carte_token IS NULL;

UPDATE femmes
SET carte_token = md5('femme-' || id::text || clock_timestamp()::text || random()::text) || md5(random()::text || clock_timestamp()::text || id::text)
WHERE carte_token IS NULL;

UPDATE membres SET carte_expire_le = (NOW() + INTERVAL '1 year')::date WHERE carte_expire_le IS NULL;
UPDATE femmes SET carte_expire_le = (NOW() + INTERVAL '1 year')::date WHERE carte_expire_le IS NULL;
