# Association de la Jeunesse de Jeddetta (AJJ)

Application web de gestion des membres, cotisations, dépenses et actualités.

## Stack

- Node.js 20+, Express 4, EJS
- PostgreSQL (données et sessions)
- Cloudinary (upload et suppression d'images)
- Helmet, express-rate-limit, Bcrypt, Joi

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

`npm run db:seed` crée le compte administrateur avec `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Variables d'environnement

| Variable | Description |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Connexion PostgreSQL |
| `PORT` | Port HTTP (défaut `3000`) |
| `NODE_ENV` | `production` active les cookies sécurisés |
| `SESSION_SECRET` | Obligatoire, chaîne aléatoire longue |
| `CORS_ORIGIN` | Origines autorisées séparées par des virgules (vide = même origine) |
| `CLOUDINARY_URL` | `cloudinary://api_key:api_secret@cloud_name` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Compte créé par `npm run db:seed` |
| `PAYMENT_AUTOMATION_KEY` | Clé HMAC pour `/api/paiement-auto` (voir `AUTOMATISATION.md`) |

## Scripts

| Commande | Rôle |
|---|---|
| `npm start` | Démarrer le serveur |
| `npm run dev` | Démarrer avec rechargement automatique |
| `npm run db:migrate` | Créer/mettre à jour le schéma PostgreSQL |
| `npm run db:seed` | Créer ou mettre à jour le compte admin |
| `npm run finance:reset` | Vider cotisations/dépenses et générer déc. 2026 → août 2027 |
| `npm run lint` | Vérifier le code avec ESLint |
| `npm test` | Lancer les tests automatisés |

## Sécurité

- Les sessions sont stockées dans PostgreSQL via `connect-pg-simple`.
- `SESSION_SECRET` est obligatoire au démarrage ; aucun secret codé en dur.
- Helmet applique une CSP, CORS est désactivé par défaut et les cookies utilisent `SameSite=Lax`.
- Les lectures de membres, femmes, cotisations et dépenses exigent une session admin.
- Les visiteurs utilisent uniquement `/api/public/stats` et `/api/public/cotisations`, qui ne renvoient ni montants ni numéros de téléphone.
- `/liste-membres.html` est réservé aux administrateurs.
- Les mots de passe sont hachés avec Bcrypt, les entrées validées avec Joi et les routes API sont limitées en débit.

## Déploiement

Déployer sur Render (Web Service + PostgreSQL managée) :

1. Build : `npm ci`
2. Release : `npm run db:migrate`
3. Start : `npm start`
4. Définir toutes les variables d'environnement ci-dessus, avec `NODE_ENV=production` et `CLOUDINARY_URL`.

Derrière Nginx, faire un reverse proxy vers `http://localhost:3000`.

## Tests

```bash
npm run lint
npm test
npm audit
```
