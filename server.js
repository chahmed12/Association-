const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const app = express();
const PORT = 3000;

// 1. CONFIGURATION SPÉCIALE NGROK
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

// --- CONNEXION BASE DE DONNÉES ---
const dbOptions = {
    host: 'localhost',
    user: 'root',
    password: 'zenvour',
    database: 'association_db'
};
const db = mysql.createConnection(dbOptions);

db.connect((err) => {
    if (err) {
        console.error('❌ Erreur de connexion MySQL :', err);
        return;
    }
    console.log('✅ Connecté à MySQL avec succès !');
});

// 2. CONFIGURATION DE LA SESSION (MySQL Store)
const sessionStore = new MySQLStore({}, db);

app.use(session({
    key: 'session_cookie_name',
    secret: 'votre_secret_tres_complique_et_long_2026',
    store: sessionStore,
    resave: false,
    saveUninitialized: false, // Optimisation: ne pas créer de session vide
    cookie: {
        secure: true,       // OBLIGATOIRE car Ngrok est en HTTPS
        sameSite: 'none',   // OBLIGATOIRE pour que Chrome accepte le cookie via Ngrok
        maxAge: 24 * 60 * 60 * 1000 // 24 heures
    }
}));

// Servir les fichiers publics
app.use(express.static(path.join(__dirname, 'public')));

// --- 3. FONCTION DE SÉCURITÉ (Auth Guard) ---
function isAuthenticated(req, res, next) {
    if (req.session.loggedin) {
        return next();
    } else {
        res.redirect('/login.html');
    }
}

// ================= ROUTES =================

// Route Accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- AUTHENTIFICATION ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM admins WHERE username = ? AND password = ?";

    db.query(sql, [username, password], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Erreur serveur' });
        }

        if (results.length > 0) {
            req.session.loggedin = true;
            req.session.username = username;
            res.json({ success: true, redirect: '/admin.html' });
        } else {
            res.json({ success: false, message: 'Identifiants incorrects' });
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- ZONE ADMINISTRATIVE (PROTÉGÉE) ---

// Dashboard Principal
app.get('/admin.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'prive', 'admin.html'));
});

// Gestion Nouveautés (Ancien admin.html)
app.get('/gestion-nouveautes.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'prive', 'gestion-nouveautes.html'));
});

// Liste des membres protégée
app.get('/liste-membres.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'prive', 'liste-membres.html'));
});

// Gestion Cotisations (Page)
app.get('/gestion-cotisations.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'prive', 'gestion-cotisations.html'));
});

// --- API COTISATIONS ---

// Récupérer les membres et leurs paiements
app.get('/api/cotisations', (req, res) => {
    const sqlMembres = "SELECT * FROM membres ORDER BY nom ASC";
    const sqlPaiements = "SELECT * FROM payments";

    db.query(sqlMembres, (err, membres) => {
        if (err) return res.status(500).json({ error: err });

        db.query(sqlPaiements, (err, paiements) => {
            if (err) return res.status(500).json({ error: err });

            // Mapper les paiements aux membres
            const data = membres.map(m => {
                const mesPaiements = paiements
                    .filter(p => p.membre_id === m.id)
                    .map(p => p.mois);
                return { ...m, paiements: mesPaiements };
            });

            res.json(data);
        });
    });
});

// Basculer un paiement (Toggle)
app.post('/api/cotisations/toggle', isAuthenticated, (req, res) => {
    const { membre_id, mois } = req.body;

    // Vérifier si le paiement existe
    const checkSql = "SELECT * FROM payments WHERE membre_id = ? AND mois = ?";
    db.query(checkSql, [membre_id, mois], (err, results) => {
        if (err) return res.status(500).json({ error: err });

        if (results.length > 0) {
            // DELETE
            const deleteSql = "DELETE FROM payments WHERE membre_id = ? AND mois = ?";
            db.query(deleteSql, [membre_id, mois], () => {
                res.json({ success: true, status: 'removed' });
            });
        } else {
            // INSERT
            const insertSql = "INSERT INTO payments (membre_id, mois) VALUES (?, ?)";
            db.query(insertSql, [membre_id, mois], () => {
                res.json({ success: true, status: 'added' });
            });
        }
    });
});

// --- API NOUVEAUTÉS ---

app.post('/api/nouveautes', isAuthenticated, upload.single('image'), (req, res) => {
    const { titre } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!imageUrl) {
        return res.status(400).json({ success: false, message: 'Image requise.' });
    }

    const sql = "INSERT INTO nouveautes (titre, url, date) VALUES (?, ?, NOW())";
    db.query(sql, [titre || 'Sans titre', imageUrl], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur.' });
        res.json({ success: true, message: 'Nouveauté ajoutée avec succès!' });
    });
});

app.get('/api/nouveautes', (req, res) => {
    const sql = "SELECT * FROM nouveautes ORDER BY date DESC";
    db.query(sql, (err, results) => {
        if (err) res.status(500).json({ success: false });
        else res.json({ success: true, images: results });
    });
});

// --- API INSCRIPTIONS ---

app.post('/api/inscrire', (req, res) => {
    const { nom, telephone, situation } = req.body;
    if (!nom || !telephone || !situation) return res.status(400).json({ success: false });

    const checkSql = "SELECT * FROM membres WHERE telephone = ?";
    db.query(checkSql, [telephone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Numéro déjà enregistré!' });

        let montant = (situation === 'نعم') ? 2000 : 1000;
        const sql = "INSERT INTO membres (nom, telephone, situation, montant) VALUES (?, ?, ?, ?)";
        db.query(sql, [nom, telephone, situation, montant], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            else res.json({ success: true, message: 'Inscription réussie!' });
        });
    });
});

app.post('/api/inscrire-femme', (req, res) => {
    const { nom, telephone } = req.body;
    if (!nom || !telephone) return res.status(400).json({ success: false });

    const checkSql = "SELECT * FROM femmes WHERE telephone = ?";
    db.query(checkSql, [telephone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Numéro déjà enregistré!' });

        const sql = "INSERT INTO femmes (nom, telephone) VALUES (?, ?)";
        db.query(sql, [nom, telephone], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            else res.json({ success: true, message: 'Inscription réussie!' });
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
    console.log(`🔒 Mode Sécurisé (MySQL Sessions) activé`);
});