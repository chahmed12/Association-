# Association de la Jeunesse de Jeddetta (AJJ)

Application web de gestion associative pour les membres, les cotisations, les dépenses, les actualités, les inscriptions, l'agenda et les notifications.

## Sommaire

- [Présentation](#présentation)
- [Démarrage rapide](#démarrage-rapide)
- [Configuration](#configuration)
- [Scripts disponibles](#scripts-disponibles)
- [Services et API](#services-et-api)
- [Modèle de sécurité](#modèle-de-sécurité)
- [Données et maintenance](#données-et-maintenance)
- [Déploiement](#déploiement)
- [Qualité et vérification](#qualité-et-vérification)
- [Documentation associée](#documentation-associée)

## Présentation

### Pile technique

| Composant | Technologie |
|---|---|
| Serveur | Node.js 20+, Express 4, EJS |
| Base de données | PostgreSQL 14+ ; sessions stockées avec `connect-pg-simple` |
| Médias | Cloudinary pour l'envoi et la suppression d'images |
| Sécurité | Helmet, `express-rate-limit`, Bcrypt, Joi |
| Documents | PDFKit pour les reçus et les cartes de membre |
| Utilitaires | `utils/phone.js`, `utils/csv.js`, `public/js/utils.js` |

### Périmètre fonctionnel

| Domaine | État |
|---|---|
| Gestion des membres, cotisations, dépenses et actualités | Opérationnel |
| Exports CSV et reçus PDF | Opérationnel |
| Rappels de cotisation par lien WhatsApp | Opérationnel, sans envoi automatique |
| Inscriptions publiques modérées | Opérationnel |
| Carte de membre PDF avec token | Opérationnel, sans QR code |
| Agenda et RSVP | Opérationnel |
| Paiements automatisés par webhook | Prévu, non implémenté |

## Démarrage rapide

```bash
git clone https://github.com/chahmed12/Association-.git
cd Association-
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm start
```

Sous Windows, utiliser `copy .env.example .env` puis renseigner le fichier avant de lancer la migration.

`npm run db:migrate` applique l'unique fichier `migrations/001_init.sql`. Cette migration est idempotente et peut être relancée sans perte de données. `npm run db:seed` crée ou met à jour le compte administrateur défini par `ADMIN_USERNAME` et `ADMIN_PASSWORD`.

## Configuration

| Variable | Description |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Connexion PostgreSQL |
| `PORT` | Port HTTP, valeur par défaut `3000` |
| `NODE_ENV` | `production` active les cookies sécurisés |
| `SESSION_SECRET` | Obligatoire au démarrage ; chaîne aléatoire longue |
| `CORS_ORIGIN` | Origines autorisées séparées par des virgules ; vide signifie même origine |
| `CLOUDINARY_URL` | Format `cloudinary://api_key:api_secret@cloud_name` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Identifiants utilisés par `npm run db:seed` |
| `PAYMENT_AUTOMATION_KEY` | Réservé à la route `/api/paiement-auto`, actuellement non implémentée |

Aucune valeur secrète réelle n'est versionnée. `.env` reste local et `.env.example` ne contient que des modèles.

## Scripts disponibles

| Commande | Rôle |
|---|---|
| `npm start` | Démarrer le serveur |
| `npm run dev` | Démarrer avec rechargement automatique |
| `npm run db:migrate` | Appliquer le schéma PostgreSQL |
| `npm run db:seed` | Créer ou mettre à jour le compte administrateur |
| `npm run finance:reset` | Réinitialiser les cotisations et dépenses puis générer décembre 2026 à août 2027 |
| `npm run lint` | Vérifier le code avec ESLint |
| `npm test` | Exécuter les tests automatisés |

`npm run finance:reset` est une commande destructive : elle vide `payments` et `depenses` avant de régénérer neuf périodes pour les membres actifs. Sauvegarder la base avant toute exécution, en particulier en production.

## Services et API

Sauf indication contraire, les routes ci-dessous exigent une session administrateur. Les pages de `prive/` sont protégées par la même session ; les pages publiques sont servies depuis `public/`.

### Membres

| Route | Rôle |
|---|---|
| `GET /api/membres` | Liste filtrable avec `q`, `actif`, `limit` et `page` |
| `POST /api/membres` | Création avec attribution d'un numéro adhérent `MEM-xxxx` |
| `GET /api/membres/:id` | Détail d'un membre |
| `PUT /api/membres/:id` | Mise à jour |
| `DELETE /api/membres/:id` | Archivage logique avec `actif = false` et `deleted_at` |
| `GET /api/membres/:id/preferences` | Lecture des préférences de notification |
| `PUT /api/membres/:id/preferences` | Mise à jour de `whatsapp_optin`, `email_optin` et `locale` |

Les numéros WhatsApp sont normalisés à l'écriture par `utils/phone.js`. Aucune contrainte d'unicité globale n'est appliquée à `telephone` : le numéro factice `00000000` reste valide pour plusieurs membres. L'unicité des cotisations porte sur `(membre_id, annee, mois)`.

### Exports et reçus

| Route | Rôle |
|---|---|
| `GET /api/export/membres.csv` | Export des membres avec `q`, `actif`, `from` et `to` |
| `GET /api/export/cotisations.csv` | Export des cotisations avec `q`, `mois` et `annee` |
| `GET /api/export/depenses.csv` | Export des dépenses avec `from` et `to` |
| `GET /api/recus/:id` | Reçu d'un paiement |
| `GET /api/recus/membre/:id?mois=&annee=` | Reçu d'un membre pour une période |

Les CSV incluent un BOM UTF-8 et échappent les cellules via `utils/csv.js`; les valeurs commençant par `=`, `+`, `-` ou `@` sont neutralisées. Chaque téléchargement est tracé dans `export_logs`. Les reçus utilisent `montant_snapshot` lorsqu'il est disponible afin de préserver le montant historique.

### Notifications

| Route | Rôle |
|---|---|
| `GET /api/notifications` | File de notifications filtrable par `statut` et `canal` |
| `POST /api/notifications` | Création d'une notification planifiée |
| `POST /api/notifications/rappels-cotisations` | Génération des rappels pour une période |
| `PATCH /api/notifications/:id` | Passage aux statuts `envoye`, `annule` ou `retry` |

La page associée est `/gestion-notifications.html`. Le serveur produit un lien `wa.me` prérempli à partir du numéro normalisé et d'un message encodé. Aucun message n'est envoyé automatiquement : l'administrateur ouvre le lien puis met le statut à jour manuellement.

### Inscriptions

| Route | Rôle |
|---|---|
| `POST /api/inscriptions` | Inscription publique avec consentement obligatoire ; retour `202` avec token et `409` en cas de doublon en attente |
| `GET /api/inscriptions` | File administrative filtrable par `statut` |
| `POST /api/inscriptions/:id/valider` | Validation avec création du membre, numéro adhérent et token de carte |
| `POST /api/inscriptions/:id/rejeter` | Rejet avec motif obligatoire |

La file de modération est disponible sur `/gestion-inscriptions.html`. L'ancienne route `/api/inscrire` reste active pour les formulaires historiques qui créent directement un membre.

### Carte de membre

| Route | Rôle |
|---|---|
| `GET /api/carte/:token` | Informations publiques : `nom`, `numero_adherent`, `statut`, `expire_le` et `annee` |
| `GET /api/carte/:token.pdf` | Carte au format PDF |
| `POST /api/membres/:id/carte/token` | Régénération administrative du token |

La page publique `/carte.html` permet de vérifier un token et de télécharger la carte. Le token comporte 64 caractères hexadécimaux et la validité est d'un an. Aucun QR code n'est utilisé.

### Agenda et RSVP

| Route | Rôle |
|---|---|
| `GET /api/evenements` | Événements publiés, avec filtre `avenir=1` |
| `GET /api/evenements/:id` | Détail public d'un événement publié |
| `GET /api/admin/evenements` | Administration des événements avec compteur de RSVP positifs |
| `GET /api/evenements/:id/rsvps` | Liste administrative des RSVP |
| `POST /api/evenements` | Création d'un événement, image optionnelle via Cloudinary |
| `PUT /api/evenements/:id` | Mise à jour |
| `DELETE /api/evenements/:id` | Suppression de l'événement et de son image distante |
| `POST /api/evenements/:id/rsvp` | RSVP public avec token d'annulation |
| `POST /api/rsvp/:token/annuler` | Annulation d'un RSVP par token |

Les pages associées sont `/agenda.html` pour le public et `/gestion-evenements.html` pour l'administration. La capacité bloque les nouveaux RSVP `oui` mais autorise la mise à jour d'une réponse existante. Les doublons sont évités par membre ou par numéro de téléphone pour un même événement.

### Pages

| Type | Pages |
|---|---|
| Publiques | `/`, `/inscription-hommes.html`, `/inscription-femmes.html`, `/suivi-dons.html`, `/nouveautes.html`, `/agenda.html`, `/carte.html`, `/login.html` |
| Administrateur | `/admin.html`, `/liste-membres.html`, `/gestion-cotisations.html`, `/gestion-depenses.html`, `/gestion-nouveautes.html`, `/gestion-notifications.html`, `/gestion-inscriptions.html`, `/gestion-evenements.html` |

## Modèle de sécurité

- `SESSION_SECRET` est obligatoire au démarrage et aucune valeur secrète n'est codée en dur.
- Une session est régénérée après un `/api/login` réussi afin de prévenir la fixation de session.
- Helmet applique une politique de sécurité ; CORS est désactivé par défaut et les cookies utilisent `SameSite=Lax`, avec l'attribut `Secure` en production.
- Trois limiteurs de débit protègent l'API globale, `/api/login` et les RSVP publics.
- Les écritures membres, la gestion des cotisations, des dépenses, des actualités, des notifications, des inscriptions et des événements exigent une session administrateur.
- Les visiteurs accèdent uniquement aux routes publiques : statistiques, cotisations agrégées, actualités, inscriptions, carte, événements et RSVP.
- Les routes publiques n'exposent ni montants, ni numéros de téléphone, ni jetons d'administration.
- Les mots de passe sont hachés avec Bcrypt et les entrées validées avec Joi.
- Les données injectées dans le DOM sont échappées avec `escapeHtml` et `escapeJs` via `public/js/utils.js`.
- Les suppressions de membres sont logiques, ce qui conserve l'historique des cotisations.

## Données et maintenance

Le schéma complet est décrit dans `migrations/001_init.sql`. Il couvre les tables `membres`, `femmes`, `payments`, `depenses`, `nouveautes`, `admins`, `paiement_logs`, `export_logs`, `notifications`, `notification_preferences`, `inscriptions`, `evenements` et `rsvps`.

Les colonnes ajoutées aux membres sont `whatsapp`, `actif`, `deleted_at`, `updated_at`, `email`, `photo_url`, `numero_adherent`, `source`, `carte_token` et `carte_expire_le`. Les colonnes ajoutées aux paiements sont `annee`, `created_at`, `numero_recu` et `montant_snapshot`.

Les index et contraintes couvrent notamment l'unicité du numéro adhérent et du token de carte, la périodicité des notifications, les inscriptions en attente par téléphone et les RSVP par membre ou téléphone.

## Déploiement

Pour un déploiement sur Render avec un Web Service et une base PostgreSQL managée :

1. Installer les dépendances avec `npm ci`.
2. Appliquer le schéma avec `npm run db:migrate`.
3. Démarrer le service avec `npm start`.
4. Définir l'ensemble des variables d'environnement, avec `NODE_ENV=production` et `CLOUDINARY_URL`.
5. Créer le compte administrateur avec `npm run db:seed`.

Derrière Nginx, configurer un reverse proxy vers `http://localhost:3000`. Le détail figure dans `DEPLOIEMENT.md`.

## Qualité et vérification

```bash
npm run lint
npm test
npm audit
```

La suite de tests couvre notamment la confidentialité des routes publiques, les redirections des pages protégées, la validation des inscriptions, l'accès aux cartes, la génération des PDF, les exports CSV et le cycle de vie des événements et RSVP.

## Documentation associée

- `DEMARRAGE.md` : configuration locale et parcours rapides.
- `DEPLOIEMENT.md` : procédure de mise en production et sauvegardes.
- `AUTOMATISATION.md` : état actuel et contrat prévu de `/api/paiement-auto`.
