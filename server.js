require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./config/db');
const { isAuthenticated } = require('./middleware/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 1. SÉCURITÉ & MIDDLEWARES GLOBAUX
app.use(helmet({
    contentSecurityPolicy: false, // Désactivé pour simplifier le chargement des scripts/images locaux
}));

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Trop de requêtes, veuillez réessayer plus tard."
});
app.use(globalLimiter);

app.set('trust proxy', 1);
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 2. SESSIONS
const sessionStore = new MySQLStore({}, db);
app.use(session({
    key: 'association_session',
    secret: process.env.SESSION_SECRET || 'secret_pro_2026_assoc',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24h
    }
}));

// 3. ROUTES STATIQUES & PAGES PROTÉGÉES
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: 'Accueil' });
});

// Accès aux pages admin
app.get('/admin.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'admin.html')));
app.get('/liste-membres.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'liste-membres.html')));
app.get('/gestion-cotisations.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-cotisations.html')));
app.get('/gestion-depenses.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-depenses.html')));
app.get('/gestion-nouveautes.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-nouveautes.html')));

// 4. ROUTES API
app.use('/api', apiRoutes);

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// 5. DÉMARRAGE
app.listen(PORT, () => {
    console.log(`🚀 Serveur PRO lancé sur http://localhost:${PORT}`);
    console.log(`🔒 Mode: ${isProduction ? 'PRODUCTION' : 'DÉVELOPPEMENT'}`);
});
