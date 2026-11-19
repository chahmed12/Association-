# Association de la Jeunesse de Jeddetta (AJJ)

Application web de gestion des membres, cotisations, dépenses, actualités, notifications et événements (agenda / RSVP).

## Stack

- Node.js 20+, Express 4, EJS
- PostgreSQL (données et sessions)
- Cloudinary (upload et suppression d'images)
- Helmet, express-rate-limit, Bcrypt, Joi
- PDFKit (reçus et cartes de membre), utilitaires locaux (`utils/phone.js`, `utils/csv.js`, `public/js/utils.js`)

## Prérequis

- Node.js 20+ (voir `.nvmrc`)
- PostgreSQL 14+
- Un compte Cloudinary pour les images

## Installation

```bash
git clone https://github.com/chahmed12/Association-.git
cd Association-
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm start
```

Sous Windows : `copy .env.example .env` puis renseignez le fichier.

`npm run db:migrate` applique l'unique fichier `migrations/001_init.sql` : tables, colonnes, index et contraintes. Cette migration est idempotente et peut être relancée sans perdre de données.

`npm run db:seed` crée le compte administrateur avec `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Variables d'environnement

| Variable | Description |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Connexion PostgreSQL |
| `PORT` | Port HTTP (défaut `3000`) |
| `NODE_ENV` | `production` active les cookies sécurisés |
| `SESSION_SECRET` | Obligatoire, chaîne aléatoire longue |
| `CORS_ORIGIN` | Origines autorisées séparées par des virgules (vide = même origine) |
| `CLOUDINARY_URL` | Format `cloudinary://api_key:api_secret@cloud_name` (valeurs à renseigner localement) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Compte créé par `npm run db:seed` (`ADMIN_PASSWORD` requis au seed) |
| `PAYMENT_AUTOMATION_KEY` | Réservé à `/api/paiement-auto`, route non implémentée (voir `AUTOMATISATION.md`) |

Aucune valeur secrète réelle n'est versionnée : `.env` reste local et `.env.example` ne contient que des modèles.

## Scripts

| Commande | Rôle |
|---|---|
| `npm start` | Démarrer le serveur |
| `npm run dev` | Démarrer avec rechargement automatique |
| `npm run db:migrate` | Appliquer `migrations/001_init.sql` (idempotent) |
| `npm run db:seed` | Créer ou mettre à jour le compte admin |
| `npm run finance:reset` | Attention : destructif. `TRUNCATE payments, depenses` puis 9 périodes (déc. 2026 → août 2027) pour tous les membres actifs ; sauvegarder la base avant |
| `npm run lint` | Vérifier le code avec ESLint |
| `npm test` | Lancer les tests automatisés |

## Fonctionnalités et API

Sauf indication contraire, les routes ci-dessous exigent une session administrateur. Les pages de `prive/` sont protégées par la même session ; les pages publiques sont servies depuis `public/`.

### Membres (admin)

| Route | Rôle |
|---|---|
| `GET /api/membres` | Liste filtrable (`q`, `actif`, `limit`, `page`) |
| `POST /api/membres` | Création, numéro adhérent `MEM-xxxx` |
| `GET /api/membres/:id` | Détail d'un membre |
| `PUT /api/membres/:id` | Mise à jour |
| `DELETE /api/membres/:id` | Soft delete (`actif = false`, `deleted_at`), sans suppression physique |
| `GET /api/membres/:id/preferences` | Préférences de notification |
| `PUT /api/membres/:id/preferences` | Mise à jour des préférences (`whatsapp_optin`, `email_optin`, `locale`) |

Le numéro WhatsApp est normalisé à l'écriture via `utils/phone.js`. Il n'existe pas d'unicité globale sur `telephone` : le numéro factice `00000000` reste légitime. La contrainte d'unicité porte sur `(membre_id, annee, mois)` dans `payments`.

### Exports CSV et reçus PDF (admin)

| Route | Rôle |
|---|---|
| `GET /api/export/membres.csv` | Membres (`q`, `actif`, `from`, `to`) |
| `GET /api/export/cotisations.csv` | Cotisations (`q`, `mois`, `annee`) |
| `GET /api/export/depenses.csv` | Dépenses (`from`, `to`) |
| `GET /api/recus/:id` | Reçu d'un paiement |
| `GET /api/recus/membre/:id?mois=&annee=` | Reçu d'un membre pour une période |

Les CSV sont générés avec BOM UTF-8 et échappement des cellules via `utils/csv.js` (les valeurs commençant par `=`, `+`, `-` ou `@` sont neutralisées) ; chaque téléchargement est tracé dans `export_logs`. Les reçus utilisent le montant figé `montant_snapshot` lorsqu'il existe.

### Notifications et rappels (admin)

| Route | Rôle |
|---|---|
| `GET /api/notifications` | File de notifications (`statut`, `canal`) |
| `POST /api/notifications` | Création d'une notification planifiée |
| `POST /api/notifications/rappels-cotisations` | Rappels des membres actifs ayant un WhatsApp et sans paiement sur la période (`mois`, `annee`) |
| `PATCH /api/notifications/:id` | Action `envoye`, `annule` ou `retry` |

Page associée : `/gestion-notifications.html`. Le serveur génère un lien wa.me prérempli (numéro normalisé + message encodé) : **aucun envoi automatique n'est effectué**. L'administrateur ouvre le lien et met le statut à jour manuellement.

### Inscriptions publiques modérées

| Route | Rôle |
|---|---|
| `POST /api/inscriptions` | Inscription publique (consentement obligatoire, réponse `202` avec token, `409` si doublon en attente) |
| `GET /api/inscriptions` | File admin (`statut`) |
| `POST /api/inscriptions/:id/valider` | Validation : création du membre, numéro adhérent et token de carte |
| `POST /api/inscriptions/:id/rejeter` | Rejet avec motif obligatoire |

Page associée : `/gestion-inscriptions.html`. L'ancienne route `/api/inscrire` est conservée pour les formulaires historiques (inscription directe, sans modération).

### Carte de membre

| Route | Rôle |
|---|---|
| `GET /api/carte/:token` | Informations publiques de la carte (`nom`, `numero_adherent`, `statut`, `expire_le`, `annee`) |
| `GET /api/carte/:token.pdf` | Carte au format PDF |
| `POST /api/membres/:id/carte/token` | Régénération admin du token (64 caractères hexadécimaux, validité d'un an) |

Page publique : `/carte.html` (munie d'un token). Il n'y a pas de QR code : l'accès se fait par le token / le lien de la carte.

### Agenda et RSVP

| Route | Rôle |
|---|---|
| `GET /api/evenements` | Événements publiés (`avenir=1`) |
| `GET /api/evenements/:id` | Détail public d'un événement publié |
| `GET /api/admin/evenements` | Administration des événements (`statut`, compteur de RSVP `oui`) |
| `GET /api/evenements/:id/rsvps` | Liste des RSVP (admin) |
| `POST /api/evenements` | Création (brouillon par défaut, image via Cloudinary) |
| `PUT /api/evenements/:id` | Mise à jour |
| `DELETE /api/evenements/:id` | Suppression |
| `POST /api/evenements/:id/rsvp` | RSVP public (`oui`, `non`, `peut_etre`), avec token d'annulation |
| `POST /api/rsvp/:token/annuler` | Annulation par token |

Pages associées : `/agenda.html` (publique) et `/gestion-evenements.html` (admin). La capacité bloque les nouveaux RSVP `oui`, mais pas la mise à jour d'une réponse existante. Les doublons sont évités par membre ou par téléphone pour un même événement.

### Pages

- Publiques : `/`, `/inscription-hommes.html`, `/inscription-femmes.html`, `/suivi-dons.html`, `/nouveautes.html`, `/agenda.html`, `/carte.html`, `/login.html`.
- Admin (session requise) : `/admin.html`, `/liste-membres.html`, `/gestion-cotisations.html`, `/gestion-depenses.html`, `/gestion-nouveautes.html`, `/gestion-notifications.html`, `/gestion-inscriptions.html`, `/gestion-evenements.html`.

## Sécurité

- Les sessions sont stockées dans PostgreSQL via `connect-pg-simple`.
- `SESSION_SECRET` est obligatoire au démarrage ; aucun secret codé en dur.
- La session est régénérée lors d'un `/api/login` réussi (protection contre la fixation de session).
- Helmet applique une CSP, CORS est désactivé par défaut et les cookies utilisent `SameSite=Lax` (`Secure` en production).
- Trois limiteurs de débit : global sur `/api`, `/api/login` (par IP et utilisateur) et RSVP.
- Les routes de membres, femmes, cotisations, dépenses et notifications, la file d'inscriptions et l'administration des événements exigent une session admin. `/liste-membres.html` et les pages `gestion-*.html` sont protégées de la même manière.
- Les visiteurs utilisent uniquement `/api/login`, `/api/check-auth`, `/api/public/stats`, `/api/public/cotisations`, `/api/nouveautes`, `/api/carte/:token`, `/api/carte/:token.pdf`, `/api/evenements`, `/api/inscriptions` et les routes RSVP publiques ; les routes publiques ne renvoient ni montants, ni numéros de téléphone, ni jetons d'administration.
- Les mots de passe sont hachés avec Bcrypt et les entrées validées avec Joi (membres, exports, notifications, inscriptions, carte, événements, RSVP).
- Les pages échappent les données injectées dans le DOM via `escapeHtml` / `escapeJs` (`public/js/utils.js`).
- Soft delete des membres (`actif`, `deleted_at`), unicité `(membre_id, annee, mois)` sur `payments`, et aucune contrainte d'unicité globale sur `telephone` (le numéro factice `00000000` reste valide).

## Base de données

Le schéma est entièrement décrit par `migrations/001_init.sql`, appliqué par `npm run db:migrate` (idempotent). Il comprend les tables `membres`, `femmes`, `payments`, `depenses`, `nouveautes`, `admins`, `paiement_logs`, `export_logs`, `notifications`, `notification_preferences`, `inscriptions`, `evenements` et `rsvps`.

Colonnes ajoutées aux membres : `whatsapp`, `actif`, `deleted_at`, `updated_at`, `email`, `photo_url`, `numero_adherent`, `source`, `carte_token`, `carte_expire_le`. Colonnes ajoutées aux paiements : `annee`, `created_at`, `numero_recu`, `montant_snapshot`. Les index et contraintes couvrent notamment l'unicité du numéro adhérent et du token de carte, la périodicité des notifications, les inscriptions en attente par téléphone et les RSVP par membre ou téléphone.

`npm run finance:reset` est un outil de démonstration : il vide `payments` et `depenses` puis génère 9 mois de cotisations pour chaque membre actif. Commande destructive : sauvegarder la base avant et ne pas l'exécuter en production sans sauvegarde.

## Déploiement

Déployer sur Render (Web Service + PostgreSQL managée) :

1. Build : `npm ci`
2. Release : `npm run db:migrate`
3. Start : `npm start`
4. Définir toutes les variables d'environnement ci-dessus, avec `NODE_ENV=production` et `CLOUDINARY_URL`.
5. Créer le compte admin avec `npm run db:seed`.

Derrière Nginx, faire un reverse proxy vers `http://localhost:3000`.

Voir `DEPLOIEMENT.md` pour le détail et `AUTOMATISATION.md` pour l'état des paiements automatisés (route non implémentée).

## Tests

```bash
npm run lint
npm test
npm audit
```
