CREATE TABLE IF NOT EXISTS membres (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    telephone VARCHAR(50) NOT NULL,
    situation VARCHAR(50) NOT NULL,
    montant INTEGER NOT NULL,
    whatsapp VARCHAR(20),
    date_inscription TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membres_telephone ON membres(telephone);

CREATE TABLE IF NOT EXISTS femmes (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    telephone VARCHAR(50) NOT NULL,
    date_inscription TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    membre_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
    mois INTEGER NOT NULL,
    annee INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS annee INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_membre_mois_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_membre_annee_mois_unique'
    ) THEN
        ALTER TABLE payments
            ADD CONSTRAINT payments_membre_annee_mois_unique UNIQUE (membre_id, annee, mois);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS depenses (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    montant NUMERIC(12,2) NOT NULL,
    categorie VARCHAR(50) NOT NULL DEFAULT 'autre',
    date DATE,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nouveautes (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255),
    url VARCHAR(500) NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS paiement_logs (
    id SERIAL PRIMARY KEY,
    membre_id INTEGER REFERENCES membres(id) ON DELETE SET NULL,
    montant NUMERIC(12,2) NOT NULL,
    mois INTEGER NOT NULL,
    id_transaction VARCHAR(30) UNIQUE,
    confidence NUMERIC(5,4),
    source VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    status VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (status IN ('auto_valide', 'en_attente', 'rejete')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE membres ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_membres_whatsapp ON membres(whatsapp);
CREATE INDEX IF NOT EXISTS idx_paiement_logs_status ON paiement_logs(status);
