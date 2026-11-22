ALTER TABLE membres
    ADD COLUMN IF NOT EXISTS carte_verification_id VARCHAR(36);

ALTER TABLE femmes
    ADD COLUMN IF NOT EXISTS carte_verification_id VARCHAR(36);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membres_carte_verification_id
    ON membres(carte_verification_id) WHERE carte_verification_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_femmes_carte_verification_id
    ON femmes(carte_verification_id) WHERE carte_verification_id IS NOT NULL;

UPDATE membres AS m
SET carte_verification_id = v.new_id::text
FROM (
    SELECT id AS row_id, gen_random_uuid() AS new_id
    FROM membres
    WHERE carte_verification_id IS NULL
) AS v
WHERE m.id = v.row_id;

UPDATE femmes AS f
SET carte_verification_id = v.new_id::text
FROM (
    SELECT id AS row_id, gen_random_uuid() AS new_id
    FROM femmes
    WHERE carte_verification_id IS NULL
) AS v
WHERE f.id = v.row_id;
