require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const compression = require('compression');

const db = require('./config/db');
const { isAuthenticated } = require('./middleware/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET est obligatoire');
}

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.rss2json.com'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"]
        }
    }
}));
app.use(compression());

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Trop de requêtes, veuillez réessayer plus tard."
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${req.body?.username || ''}`
});

const rsvpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Trop de requêtes RSVP, veuillez réessayer plus tard."
});

app.set('trust proxy', 1);
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/api/login', loginLimiter);

// 2. SESSIONS
const sessionStore = new pgSession({
    pool: db,
    tableName: 'sessions',
    createTableIfMissing: true
});
app.use(session({
    key: 'association_session',
    secret: SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24h
    }
}));

// 3. ROUTES STATIQUES & PAGES PROTÉGÉES
// Ajout d'un cache de 7 jours pour soulager le serveur sur les fichiers statiques (images, css, js)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

app.get('/', (req, res) => {
    res.render('index', { title: 'Accueil' });
});

// Accès aux pages admin
app.get('/admin.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'admin.html')));
app.get('/liste-membres.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'liste-membres.html')));
app.get('/gestion-cotisations.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-cotisations.html')));
app.get('/gestion-depenses.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-depenses.html')));
app.get('/gestion-nouveautes.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-nouveautes.html')));
app.get('/gestion-notifications.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-notifications.html')));
app.get('/gestion-inscriptions.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-inscriptions.html')));
app.get('/gestion-evenements.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'prive', 'gestion-evenements.html')));

// 4. ROUTES API
// On applique le limiteur uniquement sur les requêtes API (et non sur les fichiers statiques)
app.use('/api', globalLimiter);
app.use('/api/evenements/:id/rsvp', rsvpLimiter);
app.use('/api', apiRoutes);

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Ressource introuvable' }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Serveur PRO lancé sur http://localhost:${PORT}`);
        console.log(`🔒 Mode: ${isProduction ? 'PRODUCTION' : 'DÉVELOPPEMENT'}`);
    });
}

module.exports = app;
