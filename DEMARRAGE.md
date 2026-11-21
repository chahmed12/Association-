# Demarrage rapide

## 1. PostgreSQL

Avec Docker :

```bash
docker run --name association-pg \
  -e POSTGRES_PASSWORD=remplacez_moi \
  -e POSTGRES_DB=association_db \
  -p 5432:5432 -d postgres:16
```

Ou utilisez une PostgreSQL existante.

## 2. Configuration

```bash
cp .env.example .env
```

Renseignez au moins `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `SESSION_SECRET`, `CLOUDINARY_URL`, `ADMIN_USERNAME` et `ADMIN_PASSWORD`. `PAYMENT_AUTOMATION_KEY` est reserve a une route non implementee (voir `AUTOMATISATION.md`). `INSCRIPTIONS_OPEN=false` garde les inscriptions publiques fermees par defaut ; passer a `true` pour les ouvrir. Ne mettez jamais de secret reel dans la documentation ou le depot.

## 3. Installation et base de donnees

```bash
npm ci
npm run build
npm run db:migrate
npm run db:seed
npm start
```

`npm run build` (ou `npm run build:css` seul) compile `src/input.css` avec Tailwind et ecrit `public/css/app.css`, la feuille de styles minifiee servie par l'application. Ce fichier doit exister et etre non vide avant de lancer le serveur.

`npm run db:migrate` est idempotent : vous pouvez le relancer sans perdre de donnees. Il applique l'unique fichier `migrations/001_init.sql` (tables, colonnes, index et contraintes, y compris notifications, inscriptions, evenements et RSVP). `npm run db:seed` cree le compte admin a partir de `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## 4. Acces

- Accueil (avec carte Google Maps) : http://localhost:3000
- Inscription hommes : http://localhost:3000/inscription-hommes.html
- Inscription femmes : http://localhost:3000/inscription-femmes.html
- Actualites : http://localhost:3000/nouveautes.html
- Membres (noms seuls) : http://localhost:3000/membres.html
- Agenda et RSVP : http://localhost:3000/agenda.html
- Carte de membre (avec un token) : http://localhost:3000/carte.html
- Administration : http://localhost:3000/admin.html
- Membres (administration) : http://localhost:3000/liste-membres.html
- Suivi des cotisations (admin) : http://localhost:3000/suivi-cotisations.html
- Notifications : http://localhost:3000/gestion-notifications.html
- Inscriptions a moderer : http://localhost:3000/gestion-inscriptions.html
- Evenements : http://localhost:3000/gestion-evenements.html
- Cotisations, depenses et actualites : `/gestion-cotisations.html`, `/gestion-depenses.html`, `/gestion-nouveautes.html`
- Journal a moderer : `/gestion-journal.html`

Les pages d'administration redirigent vers `/login.html` sans session.

## 5. Parcours rapides

- Membres publics : `GET /api/public/membres` renvoie les noms seuls, sans montant, telephone, email ni token. `GET /api/public/stats` fournit les statistiques aggregatees. L'ancienne route `/api/public/cotisations` a ete supprimee.
- Membres admin : CRUD via `/api/membres`, WhatsApp normalise, preferences via `/api/membres/:id/preferences` et soft delete via `DELETE /api/membres/:id`.
- Preuves admin-only : `GET /api/membres/:id/preuves` liste les preuves d'un membre et `GET /api/preuves/:id` recupere une preuve ; la page `/suivi-cotisations.html` exige aussi la session admin.
- Inscriptions : fermees par defaut avec `INSCRIPTIONS_OPEN=false`. Une fois ouvertes, le formulaire public poste sur `/api/inscriptions` (consentement requis), puis validation ou rejet depuis `/gestion-inscriptions.html`. L'ancienne route `/api/inscrire` reste disponible.
- Carte : consultation publique via `/api/carte/:token` et `/api/carte/:token.pdf`, regeneration du token via `POST /api/membres/:id/carte/token`. Pas de QR code.
- Rappels : `/api/notifications` et `/api/notifications/rappels-cotisations` creent des liens wa.me ; aucun envoi automatique, le statut est mis a jour manuellement via `PATCH /api/notifications/:id`.
- Exports et recus : `/api/export/membres.csv`, `/api/export/cotisations.csv`, `/api/export/depenses.csv`, `/api/recus/:id`, `/api/recus/membre/:id?mois=&annee=`.
- Evenements : administration via `/api/admin/evenements`, RSVP public via `POST /api/evenements/:id/rsvp` et annulation par token via `POST /api/rsvp/:token/annuler`.
- Journal : lecture/depot public via `GET`/`POST /api/journal`, moderation via `GET`/`PATCH`/`DELETE /api/admin/journal`, page `/gestion-journal.html`.

Attention : `npm run finance:reset` vide `payments` et `depenses` puis genere 9 mois de cotisations pour les membres actifs. Sauvegardez la base avant de l'utiliser.
