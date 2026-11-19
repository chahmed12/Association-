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

Renseignez au moins `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `SESSION_SECRET`, `CLOUDINARY_URL`, `ADMIN_USERNAME` et `ADMIN_PASSWORD`. `PAYMENT_AUTOMATION_KEY` est reserve a une route non implementee (voir `AUTOMATISATION.md`). Ne mettez jamais de secret reel dans la documentation ou le depot.

## 3. Installation et base de donnees

```bash
npm ci
npm run db:migrate
npm run db:seed
npm start
```

`npm run db:migrate` est idempotent : vous pouvez le relancer sans perdre de donnees. Il applique l'unique fichier `migrations/001_init.sql` (tables, colonnes, index et contraintes, y compris notifications, inscriptions, evenements et RSVP). `npm run db:seed` cree le compte admin a partir de `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## 4. Acces

- Accueil : http://localhost:3000
- Inscription hommes : http://localhost:3000/inscription-hommes.html
- Inscription femmes : http://localhost:3000/inscription-femmes.html
- Actualites : http://localhost:3000/nouveautes.html
- Suivi des dons : http://localhost:3000/suivi-dons.html
- Agenda et RSVP : http://localhost:3000/agenda.html
- Carte de membre (avec un token) : http://localhost:3000/carte.html
- Administration : http://localhost:3000/admin.html
- Membres : http://localhost:3000/liste-membres.html
- Notifications : http://localhost:3000/gestion-notifications.html
- Inscriptions a moderer : http://localhost:3000/gestion-inscriptions.html
- Evenements : http://localhost:3000/gestion-evenements.html
- Cotisations, depenses et actualites : `/gestion-cotisations.html`, `/gestion-depenses.html`, `/gestion-nouveautes.html`

Les pages d'administration redirigent vers `/login.html` sans session.

## 5. Parcours rapides

- Membres : CRUD admin via `/api/membres`, WhatsApp normalise, preferences via `/api/membres/:id/preferences` et soft delete via `DELETE /api/membres/:id`.
- Inscriptions : le formulaire public poster sur `/api/inscriptions` (consentement requis), puis validation ou rejet depuis `/gestion-inscriptions.html`. L'ancienne route `/api/inscrire` reste disponible.
- Carte : consultation publique via `/api/carte/:token` et `/api/carte/:token.pdf`, regeneration du token via `POST /api/membres/:id/carte/token`. Pas de QR code.
- Rappels : `/api/notifications` et `/api/notifications/rappels-cotisations` creent des liens wa.me ; aucun envoi automatique, le statut est mis a jour manuellement via `PATCH /api/notifications/:id`.
- Exports et recus : `/api/export/membres.csv`, `/api/export/cotisations.csv`, `/api/export/depenses.csv`, `/api/recus/:id`, `/api/recus/membre/:id?mois=&annee=`.
- Evenements : administration via `/api/admin/evenements`, RSVP public via `POST /api/evenements/:id/rsvp` et annulation par token via `POST /api/rsvp/:token/annuler`.

Attention : `npm run finance:reset` vide `payments` et `depenses` puis genere 9 mois de cotisations pour les membres actifs. Sauvegardez la base avant de l'utiliser.
