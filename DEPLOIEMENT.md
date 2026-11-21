# Guide de deploiement

## Architecture cible

- Express en Vercel Function (ou Web Service Render/Railway/VPS)
- PostgreSQL managée Neon (ou Render/Railway/Supabase)
- Cloudinary pour les images

La base locale exposee sur Internet est deconseillee : stabilite, securite et performances.

Le schema est applique par `npm run db:migrate` depuis l'unique fichier `migrations/001_init.sql` : tables membres, cotisations, depenses, actualites, notifications, inscriptions, evenements, RSVP et journal. Cette migration est idempotente et peut etre relancee sans perte de donnees.

## Rendu sur Vercel

Le projet est detecte automatiquement comme application Express : `server.js` exporte l'application et ne lance `listen` qu'en local. Aucun `api/index.js` et aucun rewrite general ne sont necessaires. `vercel.json` definit en revanche `buildCommand: npm run build` : Tailwind compile `src/input.css` vers `public/css/app.css`, fichier genere qui doit rester inclus dans le deploiement (non exclu par `.vercelignore`).

1. Creer le projet Vercel depuis le depot GitHub et choisir le preset Express (detection automatique).
2. Conserver `vercel.json` : il lance `npm run build` (CSS Tailwind), inclut `views/**/*` et `prive/**/*` dans la Function avec `functions.includeFiles`, et redirige `/index.html` vers `/`.
3. Les fichiers de `public/**` sont servis par le CDN Vercel ; `express.static` est ignore. L'ancienne page publique est renommee `public/legacy-index.html` pour que `/` rende bien `premium.ejs`.
4. `public/index-3d-test.html` est exclu du deploiement via `.vercelignore`.
5. Definir les variables d'environnement du projet :

| Variable | Valeur |
|---|---|
| `PGHOST` | host pooler Neon |
| `PGPORT` | `5432` |
| `PGUSER`, `PGPASSWORD`, `PGDATABASE` | identifiants Neon apres rotation |
| `PGSSLMODE` | `require` |
| `SESSION_SECRET` | chaine aleatoire longue |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | domaine Vercel |
| `CLOUDINARY_URL` | veritable URL Cloudinary, jamais de placeholder |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | compte admin utilise par le seed |
| `INSCRIPTIONS_OPEN` | `false` par defaut : inscriptions publiques fermees ; `true` pour les ouvrir |

`PORT` et `PAYMENT_AUTOMATION_KEY` ne sont pas necessaires sur Vercel. Ne pas copier `.env.production.local` tel quel : il contient un `CLOUDINARY_URL` placeholder et un mot de passe admin desynchronise.

6. Vercel n'ayant pas de release command, appliquer la migration puis le seed manuellement avant le premier deploiement :

```bash
npm run db:migrate
npm run db:seed
```

7. Deployer une preview, valider la checklist de la section Verification, puis promouvoir en production.

## Rendu sur Render

1. Creer une PostgreSQL et recuperer sa chaine de connexion.
2. Creer un Web Service :
   - Build command : `npm ci && npm run build` (genere `public/css/app.css`)
   - Release command : `npm run db:migrate`
   - Start command : `npm start`
   - Node version : 20 (`.nvmrc`)
3. Definir les variables d'environnement :

| Variable | Exemple |
|---|---|
| `PGHOST` | `dpg-xxx.region.onrender.com` |
| `PGPORT` | `5432` |
| `PGUSER` | `association_user` |
| `PGPASSWORD` | mot de passe genere |
| `PGDATABASE` | `association_db` |
| `PGSSLMODE` | `require` si l'hebergeur l'exige |
| `SESSION_SECRET` | chaine aleatoire longue |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://votre-domaine.example` |
| `CLOUDINARY_URL` | `cloudinary://...` |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | mot de passe genere |
| `PAYMENT_AUTOMATION_KEY` | reserve a `/api/paiement-auto`, route non implementee (voir `AUTOMATISATION.md`) |
| `INSCRIPTIONS_OPEN` | `false` (defaut) garde les inscriptions publiques fermees ; `true` les ouvre |

Ne jamais ecrire de secret reel dans la documentation ou le depot : seuls les modeles de `.env.example` sont versionnes.

4. Creer le compte admin apres le premier deploiement :

```bash
npm run db:seed
```

La commande utilise `ADMIN_USERNAME` et `ADMIN_PASSWORD` presents dans l'environnement (`ADMIN_PASSWORD` est obligatoire).

## Acces et protections

- Pages publiques : `/` (avec carte Google Maps integree), inscriptions hommes/femmes, `/nouveautes.html`, `/agenda.html`, `/carte.html` (avec un token de carte), `/membres.html` (noms des membres), `/login.html`.
- Pages admin (session requise) : `/admin.html`, `/liste-membres.html`, `/suivi-cotisations.html`, `/gestion-cotisations.html`, `/gestion-depenses.html`, `/gestion-nouveautes.html`, `/gestion-notifications.html`, `/gestion-inscriptions.html`, `/gestion-evenements.html`, `/gestion-journal.html`.
- Routes publiques : `GET /api/public/stats` (statistiques aggregatees) et `GET /api/public/membres` (noms seuls). L'ancienne route `GET /api/public/cotisations` a ete supprimee : aucun montant ni cotisation n'est expose au public.
- Les preuves sont admin-only : `GET /api/membres/:id/preuves` et `GET /api/preuves/:id` exigent la session administrateur, comme la page `/suivi-cotisations.html`.
- Les routes d'administration `/api/membres`, `/api/export/*.csv`, `/api/recus/*`, `/api/notifications`, `/api/inscriptions`, `/api/admin/evenements`, `/api/evenements/:id/rsvps` et `/api/admin/journal` exigent la meme session.
- `/api/journal` est public en lecture et creation ; seules la publication, le rejet et la suppression passent par `/api/admin/journal`.
- Les inscriptions publiques restent fermees tant que `INSCRIPTIONS_OPEN=false` (valeur par defaut) ; passer a `true` pour les ouvrir.
- Aucun envoi WhatsApp n'est automatique : les rappels generent des liens wa.me a valider manuellement depuis `/gestion-notifications.html`.
- La route `/api/paiement-auto` (HMAC + OCR + idempotence) n'est pas implementee ; voir `AUTOMATISATION.md`.

## Reverse proxy Nginx

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

`app.set('trust proxy', 1)` permet a Express de respecter `X-Forwarded-Proto` pour les cookies securises.

## Verification

```bash
npm run build:css
npm run lint
npm test
npm audit
curl https://votre-domaine.example/
curl https://votre-domaine.example/css/app.css
curl https://votre-domaine.example/api/public/stats
curl https://votre-domaine.example/api/public/membres
curl https://votre-domaine.example/api/journal
```

`npm run build:css` doit produire un `public/css/app.css` non vide, servi ensuite par le CDN Vercel.

Verifier aussi apres connexion admin : `/api/check-auth`, `/api/membres`, `/api/membres/:id/preuves`, `/api/preuves/:id`, `/api/export/membres.csv`, `/api/notifications`, `/api/inscriptions`, `/api/admin/evenements`, `/api/admin/journal` et `/suivi-cotisations.html`, puis `/agenda.html`, `/carte.html`, `/membres.html`, la carte Google Maps de `/` et les images de `/images/galerie/` cote public.

## Sauvegarde et finance:reset

`npm run finance:reset` est un outil de demonstration : il execute `TRUNCATE TABLE payments, depenses RESTART IDENTITY` puis genere 9 periodes (dec. 2026 → aout 2027) pour chaque membre actif.

Commande destructive : sauvegarder la base avant, et ne jamais l'executer en production sans sauvegarde verifiee.
