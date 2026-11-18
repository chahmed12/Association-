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

Renseignez au moins `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `SESSION_SECRET`, `CLOUDINARY_URL` et `ADMIN_PASSWORD`.

## 3. Installation et base de donnees

```bash
npm ci
npm run db:migrate
npm run db:seed
npm start
```

## 4. Acces

- Accueil : http://localhost:3000
- Inscription hommes : http://localhost:3000/inscription-hommes.html
- Inscription femmes : http://localhost:3000/inscription-femmes.html
- Nouveautes : http://localhost:3000/nouveautes.html
- Administration : http://localhost:3000/admin.html

`npm run db:migrate` est idempotent : vous pouvez le relancer sans perdre de donnees.
