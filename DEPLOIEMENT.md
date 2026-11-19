# Guide de deploiement

## Architecture cible

- Web Service Node.js (Render, Railway ou VPS)
- PostgreSQL managée (Render, Railway, Supabase)
- Cloudinary pour les images

La base locale exposee sur Internet est deconseillee : stabilite, securite et performances.

Le schema est applique par `npm run db:migrate` depuis l'unique fichier `migrations/001_init.sql` : tables membres, cotisations, depenses, actualites, notifications, inscriptions, evenements et RSVP. Cette migration est idempotente et peut etre relancee sans perte de donnees.

## Rendu sur Render

1. Creer une PostgreSQL et recuperer sa chaine de connexion.
2. Creer un Web Service :
   - Build command : `npm ci`
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
| `SESSION_SECRET` | chaine aleatoire longue |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://votre-domaine.example` |
| `CLOUDINARY_URL` | `cloudinary://...` |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | mot de passe genere |
| `PAYMENT_AUTOMATION_KEY` | reserve a `/api/paiement-auto`, route non implementee (voir `AUTOMATISATION.md`) |

Ne jamais ecrire de secret reel dans la documentation ou le depot : seuls les modeles de `.env.example` sont versionnes.

4. Creer le compte admin apres le premier deploiement :

```bash
npm run db:seed
```

La commande utilise `ADMIN_USERNAME` et `ADMIN_PASSWORD` presents dans l'environnement (`ADMIN_PASSWORD` est obligatoire).

## Acces et protections

- Pages publiques : `/`, inscriptions hommes/femmes, `/suivi-dons.html`, `/nouveautes.html`, `/agenda.html`, `/carte.html` (avec un token de carte), `/login.html`.
- Pages admin (session requise) : `/admin.html`, `/liste-membres.html`, `/gestion-cotisations.html`, `/gestion-depenses.html`, `/gestion-nouveautes.html`, `/gestion-notifications.html`, `/gestion-inscriptions.html`, `/gestion-evenements.html`.
- Les routes d'administration `/api/membres`, `/api/export/*.csv`, `/api/recus/*`, `/api/notifications`, `/api/inscriptions`, `/api/admin/evenements` et `/api/evenements/:id/rsvps` exigent la meme session.
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
npm run lint
npm test
npm audit
curl https://votre-domaine.example/api/public/stats
```

Verifier aussi apres connexion admin : `/api/check-auth`, `/api/membres`, `/api/export/membres.csv`, `/api/notifications`, `/api/inscriptions`, `/api/admin/evenements`, puis `/agenda.html` et `/carte.html` cote public.

## Sauvegarde et finance:reset

`npm run finance:reset` est un outil de demonstration : il execute `TRUNCATE TABLE payments, depenses RESTART IDENTITY` puis genere 9 periodes (dec. 2026 → aout 2027) pour chaque membre actif.

Commande destructive : sauvegarder la base avant, et ne jamais l'executer en production sans sauvegarde verifiee.
