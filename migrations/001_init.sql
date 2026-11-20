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

ALTER TABLE membres
    ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS numero_adherent VARCHAR(30),
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS carte_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS carte_expire_le DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_membres_numero_adherent ON membres(numero_adherent) WHERE numero_adherent IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membres_carte_token ON membres(carte_token) WHERE carte_token IS NOT NULL;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS numero_recu VARCHAR(50),
    ADD COLUMN IF NOT EXISTS montant_snapshot NUMERIC(12,2);

UPDATE payments p
SET montant_snapshot = m.montant
FROM membres m
WHERE p.membre_id = m.id AND p.montant_snapshot IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_numero_recu ON payments(numero_recu) WHERE numero_recu IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_periode ON payments(annee, mois);

CREATE TABLE IF NOT EXISTS export_logs (
    id SERIAL PRIMARY KEY,
    admin_username VARCHAR(50),
    format VARCHAR(20) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    rows_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    membre_id INTEGER REFERENCES membres(id) ON DELETE SET NULL,
    canal VARCHAR(20) NOT NULL CHECK (canal IN ('whatsapp', 'email', 'internal')),
    template VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    statut VARCHAR(20) NOT NULL DEFAULT 'a_envoyer' CHECK (statut IN ('a_envoyer', 'envoye', 'echoue', 'annule')),
    periode VARCHAR(7),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    tentatives INTEGER NOT NULL DEFAULT 0,
    erreur TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_uniq ON notifications(membre_id, template, periode) WHERE membre_id IS NOT NULL AND periode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_statut ON notifications(statut);

CREATE TABLE IF NOT EXISTS notification_preferences (
    membre_id INTEGER PRIMARY KEY REFERENCES membres(id) ON DELETE CASCADE,
    whatsapp_optin BOOLEAN NOT NULL DEFAULT FALSE,
    email_optin BOOLEAN NOT NULL DEFAULT FALSE,
    locale VARCHAR(5) NOT NULL DEFAULT 'ar',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inscriptions (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    telephone VARCHAR(50) NOT NULL,
    situation VARCHAR(50) NOT NULL,
    montant INTEGER,
    whatsapp VARCHAR(20),
    email VARCHAR(255),
    consentement BOOLEAN NOT NULL DEFAULT FALSE,
    statut VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'valide', 'rejete')),
    token VARCHAR(64) UNIQUE,
    motif_rejet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    traite_at TIMESTAMPTZ,
    traite_par INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    membre_id INTEGER REFERENCES membres(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inscriptions_telephone_pending ON inscriptions(telephone) WHERE statut = 'en_attente';

CREATE TABLE IF NOT EXISTS evenements (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    lieu VARCHAR(255),
    date_debut TIMESTAMPTZ NOT NULL,
    date_fin TIMESTAMPTZ,
    image_url VARCHAR(500),
    capacite INTEGER CHECK (capacite IS NULL OR capacite > 0),
    statut VARCHAR(20) NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'publie', 'annule')),
    created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evenements_date_statut ON evenements(date_debut, statut);

CREATE TABLE IF NOT EXISTS rsvps (
    id SERIAL PRIMARY KEY,
    evenement_id INTEGER NOT NULL REFERENCES evenements(id) ON DELETE CASCADE,
    membre_id INTEGER REFERENCES membres(id) ON DELETE SET NULL,
    nom_invite VARCHAR(255),
    telephone VARCHAR(50),
    reponse VARCHAR(20) NOT NULL CHECK (reponse IN ('oui', 'non', 'peut_etre')),
    note TEXT,
    token VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rsvps_identite_check CHECK (membre_id IS NOT NULL OR nom_invite IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_membre ON rsvps(evenement_id, membre_id) WHERE membre_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_telephone ON rsvps(evenement_id, telephone) WHERE membre_id IS NULL AND telephone IS NOT NULL;

CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    statut VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'publie', 'rejete')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publie_at TIMESTAMPTZ,
    traite_at TIMESTAMPTZ,
    traite_par VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_statut_created_at ON journal_entries(statut, created_at DESC);
