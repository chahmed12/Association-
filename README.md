# 🌟 Association de la Jeunesse de Jeddetta (AJJ)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Framework: Express](https://img.shields.io/badge/framework-Express-blue)](https://expressjs.com/)
[![Database: MySQL](https://img.shields.io/badge/database-MySQL-orange)](https://www.mysql.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

Une application web complète et sécurisée pour la gestion des membres, des cotisations et des activités de l'**Association de la Jeunesse de Jeddetta** (Mauritanie).

---

## 🚀 Fonctionnalités

- 🔐 **Administration Sécurisée** : Authentification avec hachage Bcrypt et protection contre les attaques brute-force.
- 👥 **Gestion des Membres** : Inscription dynamique pour les hommes et les femmes.
- 💰 **Suivi Financier** : Gestion des cotisations mensuelles (Toggle API) et suivi des dépenses.
- 📰 **Actualités & Médias** : Système d'upload d'images sécurisé pour les nouveautés de l'association.
- 📱 **Interface Moderne** : Design "Glassmorphism" responsive avec TailwindCSS et EJS.

---

## 🛡️ Sécurité (Hardened Core)

Le projet a été audité et renforcé avec les standards industriels :
- **Helmet.js** : Protection des headers HTTP contre les vulnérabilités courantes (XSS, Clickjacking).
- **Bcrypt** : Hachage des mots de passe avec sel (SaltRounds: 10).
- **Joi Validation** : Validation stricte des schémas de données (Entrées API).
- **Express Rate Limit** : Limitation des requêtes pour prévenir les dénis de service (DoS) et le brute-force.
- **MySQL Sessions** : Stockage sécurisé des sessions côté serveur.

---

## 🏗️ Architecture Modulaire

L'application suit une structure **MVC-light** pour une maintenance simplifiée :

```text
/
├── config/             # Configuration Base de données (Pool)
├── middleware/         # Auth, Validators, Security
├── routes/             # Endpoints API (Auth, Membres, Dépenses...)
├── views/              # Templates EJS (Partials, Pages)
├── public/             # Assets statiques (CSS, Images, Uploads)
├── prive/              # Pages HTML protégées (Admin)
└── server.js           # Point d'entrée (Slim & Clean)
```

---

## 🛠️ Installation & Configuration

### 1. Prérequis
- Node.js (v18+)
- MySQL Server

### 2. Installation
```bash
git clone [votre-repo]
cd association
npm install
```

### 3. Variables d'Environnement (`.env`)
Créez un fichier `.env` à la racine :
```env
MYSQLHOST=localhost
MYSQLUSER=root
MYSQLPASSWORD=votre_password
MYSQLDATABASE=association_db
MYSQLPORT=3306
PORT=3000
SESSION_SECRET=votre_secret_tres_long_et_aleatoire
```

### 4. Initialisation
Démarrez le serveur et accédez à `/init` (une fois connecté ou temporairement déprotégé) pour créer automatiquement les tables SQL.

---

## 🚀 Déploiement (Production)

Pour une mise en production robuste, utilisez **PM2** et **Nginx** :

```bash
# Lancer avec PM2
npm install -g pm2
pm2 start server.js --name "ajj-app"

# Configuration Nginx recommandée (Reverse Proxy)
# location / {
#     proxy_pass http://localhost:3000;
#     proxy_set_header Host $host;
# }
```

---

## 📝 Auteur
**Cheikh Ahmed Zenvour** - *Ingénieur Développement*

---
✨ *Développé avec passion pour la Jeunesse de Jeddetta.*
