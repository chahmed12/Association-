# Automatisation des paiements WhatsApp vers l'association

## Contexte

- Groupe WhatsApp de 100+ membres qui envoient chaque mois une capture Bankily.
- Traitement manuel actuel : verification du screenshot puis enregistrement sur le site.
- Objectif : interception, OCR, association au membre et stockage automatiques, avec validation humaine des cas ambigus.

## Projets impliques

| Projet | Technologie | Role |
|---|---|---|
| `Association-` | Node.js / Express / PostgreSQL | Site de gestion des membres, cotisations et depenses |
| `fintech-shield` | Python / OpenCV / Tesseract | OCR et detection de fraude sur les recus Bankily |

## Architecture

```
Groupe WhatsApp
    | capture PHOTO-*.jpg
    v
Bot whatsapp-web.js (processus separe)
    | expediteur WhatsApp + image
    v
Pipeline Python fintech-shield
    | montant, date, id_transaction, confidence
    v
POST /api/paiement-auto (cle API + signature HMAC)
    | matching membre, verification montant/mois, idempotence
    v
paiement_logs + payments
    |
    v
Dashboard admin : file "a verifier"
```

Le bot et le pipeline OCR restent hors du serveur web : `whatsapp-web.js` embarque Puppeteer et ne doit pas etre une dependance de l'application.

## Contrat API

`POST /api/paiement-auto`

En-tetes obligatoires :

- `x-automation-key` : cle API longue et aleatoire, stockee uniquement cote serveur dans `PAYMENT_AUTOMATION_KEY`.
- `x-automation-signature` : HMAC-SHA256 du corps brut avec cette cle.

Corps JSON :

| Champ | Type | Regle |
|---|---|---|
| `whatsapp` | string | 8 a 15 chiffres |
| `montant` | number | positif, egal a 1000 ou 2000 |
| `date` | string | date ISO |
| `id_transaction` | string | unique, 3 a 30 caractères |
| `confidence` | number | entre 0 et 1 |

Reponses :

- `200 { success: true, status: "auto_valide" | "en_attente", membre, mois }`
- `400` donnees invalides, membre inconnu ou montant incoherent
- `401` cle ou signature invalide
- `409` transaction deja enregistree (idempotence)

Le routeur doit utiliser `validate()` de `middleware/validators.js`, un limiteur de debit dedie, et ne jamais renvoyer de details techniques.

## Regles de matching

1. Normaliser le numero WhatsApp (suppression des espaces, du `+` et du prefixe `00`).
2. Rechercher le membre via `membres.whatsapp`.
3. Verifier que le montant correspond a sa situation (2000 pour `نعم`, 1000 sinon).
4. Determiner le mois de la transaction.
5. Refuser un doublon sur `id_transaction` ou sur le couple `(membre_id, mois)`.
6. Accepter automatiquement si `confidence >= 0.9` et aucune ambiguite ; sinon `en_attente`.
7. Ecrire un `paiement_logs` pour chaque tentative, y compris les rejets.

## Schema PostgreSQL

Le script `migrations/001_init.sql` contient deja :

```sql
ALTER TABLE membres ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_membres_whatsapp ON membres(whatsapp);

CREATE TABLE IF NOT EXISTS paiement_logs (
    id SERIAL PRIMARY KEY,
    membre_id INTEGER REFERENCES membres(id) ON DELETE SET NULL,
    montant NUMERIC(12,2) NOT NULL,
    mois INTEGER NOT NULL,
    id_transaction VARCHAR(30) UNIQUE,
    confidence NUMERIC(5,4),
    source VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    status VARCHAR(20) NOT NULL DEFAULT 'en_attente'
        CHECK (status IN ('auto_valide', 'en_attente', 'rejete')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`payments` possede deja une contrainte d'unicite sur `(membre_id, mois)`.

## Options d'interception

| Option | Fiabilite | Complexite | Cout | Note |
|---|---|---|---|---|
| whatsapp-web.js | moyenne | faible | 0 | risque de ban du numero |
| WhatsApp Business API | haute | moyenne | environ 50 EUR/mois | officiel |
| Email IMAP | haute | faible | 0 | changer le canal d'envoi |
| Telegram Bot | haute | faible | 0 | migrer le groupe |

## Cas non geres

| Situation | Action |
|---|---|
| Membre inconnu | log `en_attente` + notification admin |
| Montant incorrect | log `en_attente` + notification admin |
| OCR illisible | rejet + alerte admin |
| Doublon | `409`, aucun nouvel enregistrement |
| Fraude detectee | `status = 'rejete'` + blocage |
| Bot deconnecte | heartbeat et notification de reconnexion |

## Feuille de route

1. Collecter et normaliser les numeros WhatsApp des membres.
2. Ajouter la route securisee `/api/paiement-auto` et ses tests.
3. Ecrire le pont Python `auto_payment.py` vers fintech-shield.
4. Developper le bot dans un depot separe.
5. Ajouter l'ecran admin de validation des logs.
6. Tests de bout en bout et deploiement.
