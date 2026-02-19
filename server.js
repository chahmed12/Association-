require('dotenv').config();

const express    = require('express');
const mysql      = require('mysql2');
const bodyParser = require('body-parser');
const path       = require('path');
const cors       = require('cors');
const multer     = require('multer');
const fs         = require('fs');
const session    = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const app  = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════
//  1. CONFIGURATION GÉNÉRALE
// ═══════════════════════════════════════════════════════════════

app.set('trust proxy', 1); // Obligatoire pour Ngrok / proxy HTTPS

// ─── Multer (upload images) ────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ─── Middlewares globaux ───────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ═══════════════════════════════════════════════════════════════
//  2. CONNEXION BASE DE DONNÉES
// ═══════════════════════════════════════════════════════════════

const db = mysql.createConnection({
    host:     process.env.MYSQLHOST,
    user:     process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
    port:     process.env.MYSQLPORT
});

db.connect((err) => {
    if (err) {
        console.error('❌ Erreur de connexion à la base de données:', err.message);
        return;
    }
    console.log('✅ Connecté à la base de données MySQL');
    createTables();
});

// ─── Création automatique des tables ──────────────────────────
function createTables() {

    // 1. Admins
    db.query(`CREATE TABLE IF NOT EXISTS admins (
        id       INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL
    )`, (err) => {
        if (err) return console.error('Erreur table admins:', err);
        console.log("Table 'admins' vérifiée.");
        db.query("SELECT * FROM admins WHERE username = 'admin'", (err, results) => {
            if (!err && results.length === 0) {
                db.query("INSERT INTO admins (username, password) VALUES ('admin', '123456')");
                console.log("Compte admin par défaut créé !");
            }
        });
    });

    // 2. Membres
    db.query(`CREATE TABLE IF NOT EXISTS membres (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        nom              VARCHAR(255) NOT NULL,
        telephone        VARCHAR(20)  NOT NULL,
        situation        VARCHAR(50),
        montant          INT DEFAULT 0,
        date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Erreur table membres:', err);
        else console.log("Table 'membres' vérifiée.");
    });

    // 3. Femmes
    db.query(`CREATE TABLE IF NOT EXISTS femmes (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        nom              VARCHAR(255) NOT NULL,
        telephone        VARCHAR(20)  NOT NULL,
        date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Erreur table femmes:', err);
        else console.log("Table 'femmes' vérifiée.");
    });

    // 4. Nouveautés
    db.query(`CREATE TABLE IF NOT EXISTS nouveautes (
        id    INT AUTO_INCREMENT PRIMARY KEY,
        titre VARCHAR(255),
        url   VARCHAR(500),
        date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Erreur table nouveautes:', err);
        else console.log("Table 'nouveautes' vérifiée.");
    });

    // 5. Payments (cotisations)
    db.query(`CREATE TABLE IF NOT EXISTS payments (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        membre_id  INT NOT NULL,
        mois       INT NOT NULL,
        UNIQUE KEY unique_payment (membre_id, mois),
        FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) console.error('Erreur table payments:', err);
        else console.log("Table 'payments' vérifiée.");
    });

    // 6. Dépenses
    db.query(`CREATE TABLE IF NOT EXISTS depenses (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        label      VARCHAR(255) NOT NULL,
        montant    INT          NOT NULL,
        categorie  VARCHAR(50)  DEFAULT 'autre',
        date       DATE,
        note       TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Erreur table depenses:', err);
        else console.log("Table 'depenses' vérifiée.");
    });
}

// ═══════════════════════════════════════════════════════════════
//  3. SESSION
// ═══════════════════════════════════════════════════════════════

const sessionStore = new MySQLStore({}, db);

app.use(session({
    key:    'session_cookie_name',
    secret: process.env.SESSION_SECRET || 'votre_secret_tres_complique_et_long_2026',
    store:  sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure:   true,   // Obligatoire HTTPS (Ngrok)
        sameSite: 'none', // Obligatoire cross-origin (Ngrok)
        maxAge:   24 * 60 * 60 * 1000 // 24h
    }
}));

// ─── Fichiers publics ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Middleware d'authentification ────────────────────────────
function isAuthenticated(req, res, next) {
    if (req.session.loggedin) return next();
    res.redirect('/login.html');
}

// ═══════════════════════════════════════════════════════════════
//  4. ROUTES PUBLIQUES
// ═══════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
//  5. AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM admins WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
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

// ═══════════════════════════════════════════════════════════════
//  6. PAGES ADMIN (PROTÉGÉES)
// ═══════════════════════════════════════════════════════════════

app.get('/admin.html',              isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'admin.html')));
app.get('/gestion-nouveautes.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-nouveautes.html')));
app.get('/liste-membres.html',      isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'liste-membres.html')));
app.get('/gestion-cotisations.html',isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-cotisations.html')));
app.get('/gestion-depenses.html',   isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-depenses.html')));

// ═══════════════════════════════════════════════════════════════
//  7. API COTISATIONS
// ═══════════════════════════════════════════════════════════════

// GET — liste des membres + leurs paiements
app.get('/api/cotisations', (req, res) => {
    db.query("SELECT * FROM membres ORDER BY nom ASC", (err, membres) => {
        if (err) return res.status(500).json({ error: err });
        db.query("SELECT * FROM payments", (err, paiements) => {
            if (err) return res.status(500).json({ error: err });
            const data = membres.map(m => ({
                ...m,
                paiements: paiements.filter(p => p.membre_id === m.id).map(p => p.mois)
            }));
            res.json(data);
        });
    });
});

// POST — basculer un paiement (toggle)
app.post('/api/cotisations/toggle', isAuthenticated, (req, res) => {
    const { membre_id, mois } = req.body;
    db.query("SELECT * FROM payments WHERE membre_id = ? AND mois = ?", [membre_id, mois], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length > 0) {
            db.query("DELETE FROM payments WHERE membre_id = ? AND mois = ?", [membre_id, mois], () => {
                res.json({ success: true, status: 'removed' });
            });
        } else {
            db.query("INSERT INTO payments (membre_id, mois) VALUES (?, ?)", [membre_id, mois], () => {
                res.json({ success: true, status: 'added' });
            });
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  8. API DÉPENSES
// ═══════════════════════════════════════════════════════════════

// GET — toutes les dépenses (accessible publiquement pour l'affichage du solde)
app.get('/api/depenses', (req, res) => {
    db.query("SELECT * FROM depenses ORDER BY created_at DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// POST — ajouter une dépense (admin uniquement)
app.post('/api/depenses', isAuthenticated, (req, res) => {
    const { label, montant, categorie, date, note } = req.body;
    if (!label || !montant) return res.status(400).json({ success: false, message: 'label et montant requis' });
    db.query(
        "INSERT INTO depenses (label, montant, categorie, date, note) VALUES (?, ?, ?, ?, ?)",
        [label, montant, categorie || 'autre', date || null, note || ''],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, id: result.insertId });
        }
    );
});

// DELETE — supprimer une dépense (admin uniquement)
app.delete('/api/depenses/:id', isAuthenticated, (req, res) => {
    db.query("DELETE FROM depenses WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true });
    });
});

// ═══════════════════════════════════════════════════════════════
//  9. API NOUVEAUTÉS
// ═══════════════════════════════════════════════════════════════

app.post('/api/nouveautes', isAuthenticated, upload.single('image'), (req, res) => {
    const { titre } = req.body;
    const imageUrl  = req.file ? `/uploads/${req.file.filename}` : null;
    if (!imageUrl) return res.status(400).json({ success: false, message: 'Image requise.' });
    db.query("INSERT INTO nouveautes (titre, url, date) VALUES (?, ?, NOW())", [titre || 'Sans titre', imageUrl], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur.' });
        res.json({ success: true, message: 'Nouveauté ajoutée avec succès!' });
    });
});

app.get('/api/nouveautes', (req, res) => {
    db.query("SELECT * FROM nouveautes ORDER BY date DESC", (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, images: results });
    });
});

// ═══════════════════════════════════════════════════════════════
//  10. API INSCRIPTIONS
// ═══════════════════════════════════════════════════════════════

// Inscrire un homme
app.post('/api/inscrire', (req, res) => {
    const { nom, telephone, situation } = req.body;
    if (!nom || !telephone || !situation) return res.status(400).json({ success: false });
    db.query("SELECT * FROM membres WHERE telephone = ?", [telephone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Numéro déjà enregistré!' });
        const montant = (situation === 'نعم') ? 2000 : 1000;
        db.query("INSERT INTO membres (nom, telephone, situation, montant) VALUES (?, ?, ?, ?)",
            [nom, telephone, situation, montant], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                res.json({ success: true, message: 'Inscription réussie!' });
            });
    });
});

// Inscrire une femme
app.post('/api/inscrire-femme', (req, res) => {
    const { nom, telephone } = req.body;
    if (!nom || !telephone) return res.status(400).json({ success: false });
    db.query("SELECT * FROM femmes WHERE telephone = ?", [telephone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Numéro déjà enregistré!' });
        db.query("INSERT INTO femmes (nom, telephone) VALUES (?, ?)", [nom, telephone], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true, message: 'Inscription réussie!' });
        });
    });
});

// Liste des membres
app.get('/api/membres', (req, res) => {
    db.query("SELECT * FROM membres ORDER BY date_inscription DESC", (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, membres: results });
    });
});

// Liste des femmes
app.get('/api/femmes', (req, res) => {
    db.query("SELECT * FROM femmes ORDER BY date_inscription DESC", (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, femmes: results });
    });
});

// ═══════════════════════════════════════════════════════════════
//  11. ROUTE /init — FORCER LA CRÉATION DES TABLES
// ═══════════════════════════════════════════════════════════════

app.get('/init', (req, res) => {
    const tables = [
        `CREATE TABLE IF NOT EXISTS admins (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) NOT NULL, password VARCHAR(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS membres (id INT AUTO_INCREMENT PRIMARY KEY, nom VARCHAR(255) NOT NULL, telephone VARCHAR(20) NOT NULL, situation VARCHAR(50), montant INT DEFAULT 0, date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS femmes (id INT AUTO_INCREMENT PRIMARY KEY, nom VARCHAR(255) NOT NULL, telephone VARCHAR(20) NOT NULL, date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS nouveautes (id INT AUTO_INCREMENT PRIMARY KEY, titre VARCHAR(255), url VARCHAR(500), date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS payments (id INT AUTO_INCREMENT PRIMARY KEY, membre_id INT NOT NULL, mois INT NOT NULL, UNIQUE KEY unique_payment (membre_id, mois), FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE)`,
        `CREATE TABLE IF NOT EXISTS depenses (id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(255) NOT NULL, montant INT NOT NULL, categorie VARCHAR(50) DEFAULT 'autre', date DATE, note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    ];

    let i = 0;
    function next(err) {
        if (err) return res.send(`❌ Erreur : ${err.message}`);
        if (i >= tables.length) {
            // Créer admin par défaut
            db.query("SELECT * FROM admins WHERE username = 'admin'", (err, results) => {
                if (!err && results.length === 0) {
                    db.query("INSERT INTO admins (username, password) VALUES ('admin', '123456')");
                }
            });
            return res.send(`
                <h1 style="color:green;font-family:sans-serif">✅ SUCCÈS ! Les 6 tables ont été créées.</h1>
                <p style="font-family:sans-serif">Vous pouvez maintenant aller sur <a href="/login.html">/login.html</a></p>
            `);
        }
        db.query(tables[i++], next);
    }
    next();
});

// ═══════════════════════════════════════════════════════════════
//  12. DÉMARRAGE
// ═══════════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
    console.log(`🔒 Mode Sécurisé (Ngrok/HTTPS) activé`);
});