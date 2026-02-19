# 🌟 Système de Gestion d'Association (Mauritanie-Tunisie)

Une plateforme web moderne et intuitive pour la gestion des membres, des cotisations et des événements d'une association.

![Tech Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20MySQL%20%7C%20Tailwind-blue)
![Status](https://img.shields.io/badge/Status-Actif-success)

## 📋 Table des Matières
- [Aperçu](#-aperçu)
- [Fonctionnalités](#-fonctionnalités)
- [Stack Technique](#-stack-technique)
- [Installation](#-installation)
- [Structure du Projet](#-structure-du-projet)
- [Configuration](#-configuration)

---

## 🚀 Aperçu
Cette application permet de centraliser la gestion d'une association, facilitant l'inscription des membres, le suivi des dons, et la communication des actualités (nouveautés). Elle dispose d'un espace sécurisé pour l'administration.

## ✨ Fonctionnalités

### 👥 Espace Public
- **🏠 Accueil Dynamique** : Présentation professionnelle avec accès rapide aux services.
- **📝 Inscriptions Différenciées** :
  - **Hommes** : Calcul automatique des cotisations (Travaillant: 2000 UM, Sans emploi: 1000 UM).
  - **Femmes** : Formulaire d'inscription simplifié.
- **💰 Suivi des Dons** : Visualisation transparente des contributions.
- **📸 Galerie de Nouveautés** : Affichage des derniers événements et annonces.
- **📋 Liste des Membres** : Consultation des membres enregistrés.
- **ℹ️ À Propos** : Informations détaillées sur l'association.

### 🔐 Espace Administration (Privé)
- **🛠️ Dashboard Admin** : Point d'entrée central pour la gestion.
- **📰 Gestion des Nouveautés** : Ajout d'événements avec support pour l'upload d'images.
- **💳 Gestion des Cotisations** : Suivi rigoureux des paiements des membres.
- **🔑 Session Sécurisée** : Authentification requise pour accéder aux outils de gestion.

## 🛠️ Stack Technique
- **Frontend** : HTML5, CSS3 (Tailwind CSS), JavaScript (Vanilla).
- **Backend** : Node.js, Express.js.
- **Base de données** : MySQL.
- **Gestion de fichiers** : Multer (pour les uploads d'images).
- **Sessions** : Express-session avec support MySQL.

## ⚙️ Installation

### 1. Prérequis
- [Node.js](https://nodejs.org/) (v14+)
- [XAMPP](https://www.apachefriends.org/) ou serveur MySQL équivalent.

### 2. Configuration SQL
1. Lancez MySQL via XAMPP.
2. Créez la base de données : `CREATE DATABASE association_db;`.
3. Importez le schéma : `mysql -u root association_db < database.sql`.

### 3. Installation du Serveur
```bash
# Entrer dans le répertoire
cd /association

# Installer les dépendances
npm install

# Lancer l'application
node server.js
```

L'application sera accessible sur : `http://localhost:3000`

## 📂 Structure du Projet
```
association/
├── prive/                # Espace administration (Accès protégé)
│   ├── admin.html
│   ├── gestion-cotisations.html
│   └── gestion-nouveautes.html
├── public/               # Fichiers publics (Accessibles à tous)
│   ├── index.html        # Accueil
│   ├── suivi-dons.html   # Suivi des dons
│   ├── images/           # Logo et assets statiques
│   └── uploads/          # Images postées par l'admin
├── server.js             # Logique backend & API
├── database.sql          # Schéma de la base de données
└── package.json          # Dépendances Node.js
```

## 🔧 Configuration
Pour modifier la connexion à la base de données, éditez le fichier `server.js` :
```javascript
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'votre_mot_de_passe',
    database: 'association_db'
});
```

---
*Développé pour l'Association des jeunes de jeddeta.*
