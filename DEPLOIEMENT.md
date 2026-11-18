# Guide de deploiement

## Architecture cible

- Web Service Node.js (Render, Railway ou VPS)
- PostgreSQL managée (Render, Railway, Supabase)
- Cloudinary pour les images

La base locale exposee sur Internet est deconseillee : stabilite, securite et performances.

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

4. Creer le compte admin apres le premier deploiement :

```bash
npm run db:seed
```

La commande utilise `ADMIN_USERNAME` et `ADMIN_PASSWORD` presents dans l'environnement.

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
