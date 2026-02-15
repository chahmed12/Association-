const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session'); // Module de session

const app = express();
const PORT = 3000;

// 1. CONFIGURATION SPÉCIALE NGROK
// Dit à Express de faire confiance au HTTPS fourni par Ngrok
app.set('trust proxy', 1);

// --- Configuration du stockage des images (Multer) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- MIDDLEWARES GLOBAUX ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 2. CONFIGURATION DE LA SESSION (Version Ngrok/HTTPS)
app.use(session({
    secret: 'votre_secret_tres_complique_et_long_2026',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: true,       // OBLIGATOIRE car Ngrok est en HTTPS
        sameSite: 'none',   // OBLIGATOIRE pour que Chrome accepte le cookie via Ngrok
        maxAge: 24 * 60 * 60 * 1000 // Le cookie expire après 24h
    }
}));

// Servir les fichiers publics (login, index, images...)
// Note : admin.html n'est pas ici, donc il est protégé par défaut.
app.use(express.static(path.join(__dirname, 'public')));

// --- CONNEXION BASE DE DONNÉES ---
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'zenvour', // Votre mot de passe
    database: 'association_db'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Erreur de connexion MySQL :', err);
        return;
    }
    console.log('✅ Connecté à MySQL avec succès !');
});

// --- 3. FONCTION DE SÉCURITÉ (Le Vigile) ---
function isAuthenticated(req, res, next) {
    if (req.session.loggedin) {
        return next();
    } else {
        // Si l'utilisateur n'est pas connecté, on le renvoie au login
        res.redirect('/login.html');
    }
}

// ================= ROUTES =================

// Route Accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- AUTHENTIFICATION ---

// Login (Reçoit les infos du formulaire)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Requête SQL pour vérifier l'admin
    const sql = "SELECT * FROM admins WHERE username = ? AND password = ?";

    db.query(sql, [username, password], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Erreur serveur' });
        }

        if (results.length > 0) {
            // SUCCÈS : On crée la session
            req.session.loggedin = true;
            req.session.username = username;

            // On dit au front-end de rediriger vers l'admin
            res.json({ success: true, redirect: '/admin.html' });
        } else {
            // ÉCHEC
            res.json({ success: false, message: 'Identifiants incorrects' });
        }
    });
});

// Logout (Déconnexion)
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- ZONE ADMINISTRATIVE (PROTÉGÉE) ---

// Page Admin (Sert le fichier caché dans 'prive')
app.get('/admin.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'prive', 'admin.html'));
});

// 🆕 Route protégée pour liste des membres (avec impression PDF fonctionnelle)
app.get('/liste-membres.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'prive', 'liste-membres.html'));
});

// Ajout de Nouveauté (Protégé + Upload image)
app.post('/api/nouveautes', isAuthenticated, upload.single('image'), (req, res) => {
    const { titre } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!imageUrl) {
        return res.status(400).json({ success: false, message: 'Image requise.' });
    }

    const sql = "INSERT INTO nouveautes (titre, url, date) VALUES (?, ?, NOW())";

    db.query(sql, [titre || 'Sans titre', imageUrl], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Erreur serveur.' });
        }
        res.json({ success: true, message: 'Nouveauté ajoutée avec succès!' });
    });
});

// --- API PUBLIQUES (Lecture seule) ---

app.get('/api/nouveautes', (req, res) => {
    const sql = "SELECT * FROM nouveautes ORDER BY date DESC";
    db.query(sql, (err, results) => {
        if (err) res.status(500).json({ success: false });
        else res.json({ success: true, images: results });
    });
});

// Pour l'inscription des membres (hommes)
app.post('/api/inscrire', (req, res) => {
    const { nom, telephone, situation } = req.body;
    if (!nom || !telephone || !situation) return res.status(400).json({ success: false });

    // Vérifier si le numéro de téléphone existe déjà
    const checkSql = "SELECT * FROM membres WHERE telephone = ?";
    db.query(checkSql, [telephone], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        }

        if (results.length > 0) {
            return res.status(400).json({ success: false, message: 'هذا الرقم مسجل مسبقاً!' });
        }

        // Si pas de doublon, procéder à l'insertion
        let montant = (situation === 'نعم') ? 2000 : 1000;
        const sql = "INSERT INTO membres (nom, telephone, situation, montant) VALUES (?, ?, ?, ?)";
        db.query(sql, [nom, telephone, situation, montant], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            else res.json({ success: true, message: 'تم التسجيل بنجاح!' });
        });
    });
});

// Pour l'inscription des femmes
app.post('/api/inscrire-femme', (req, res) => {
    const { nom, telephone } = req.body;
    if (!nom || !telephone) return res.status(400).json({ success: false });

    // Vérifier si le numéro de téléphone existe déjà
    const checkSql = "SELECT * FROM femmes WHERE telephone = ?";
    db.query(checkSql, [telephone], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        }

        if (results.length > 0) {
            return res.status(400).json({ success: false, message: 'هذا الرقم مسجل مسبقاً!' });
        }

        // Si pas de doublon, procéder à l'insertion
        const sql = "INSERT INTO femmes (nom, telephone) VALUES (?, ?)";
        db.query(sql, [nom, telephone], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            else res.json({ success: true, message: 'تم التسجيل بنجاح!' });
        });
    });
});
app.get('/api/membres', (req, res) => {
    const sql = "SELECT * FROM membres ORDER BY date_inscription DESC";
    db.query(sql, (err, results) => {
        if (err) res.status(500).json({ success: false });
        else res.json({ success: true, membres: results });
    });
});

app.get('/api/femmes', (req, res) => {
    const sql = "SELECT * FROM femmes ORDER BY date_inscription DESC";
    db.query(sql, (err, results) => {
        if (err) res.status(500).json({ success: false });
        else res.json({ success: true, femmes: results });
    });
});

// --- DÉMARRAGE ---
app.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
    console.log(`🔒 Mode Sécurisé (Ngrok/HTTPS) activé`);
    console.log(`📄 Liste des membres protégée et accessible via /liste-membres.html`);
});