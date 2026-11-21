const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const ArabicReshaperModule = require('arabic-persian-reshaper');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { normalizePhone } = require('../utils/phone');
const { csvBuffer } = require('../utils/csv');

// Utilisation de la méthode statique directe
const ArabicShaper = ArabicReshaperModule.ArabicShaper;

// ─────────────────────────────────────────────────────────────────
//  FONCTION ar() — Reshape + inversion ordre des mots (RTL correct)
//
//  Pourquoi le texte était "bruité" :
//    1. bidi-js crashait  → catch retournait le texte brut (lettres
//       déconnectées, ordre LTR)
//    2. Reshaper seul → lettres bien formées MAIS ordre des mots
//       resté LTR → PDFKit affichait "جدة شباب رابطة" au lieu de
//       "رابطة شباب جدة"
//    3. Inverser les CARACTÈRES individuels après reshape cassait
//       les glyphes contextuels produits par le reshaper
//
//  Solution correcte :
//    • Reshape d'abord (forme correcte de chaque lettre)
//    • Inverser uniquement l'ORDRE DES MOTS (pas les chars)
//    • PDFKit + align:'right' fait le reste
// ─────────────────────────────────────────────────────────────────
function ar(text) {
    if (!text || typeof text !== 'string') return '';
    try {
        // 1. Reshape : connecte les lettres (forme initiale/médiane/finale/isolée)
        const reshaped = ArabicShaper.convertArabic(text);

        // 2. Inverser l'ordre des tokens (mots + espaces) pour RTL
        //    On NE inverse PAS les caractères individuels (ça casserait le reshape)
        const tokens = reshaped.match(/\S+|\s+/g) || [reshaped];
        return tokens.reverse().join('');
    } catch (e) {
        console.error('Erreur ar():', e.message);
        return text;
    }
}

// ─────────────────────────────────────────────────────────────────
//  HELPERS PDF
// ─────────────────────────────────────────────────────────────────

// Couleurs du thème
const COLORS = {
    primary: '#1a5276',   // Bleu marine
    secondary: '#2e86c1',   // Bleu moyen
    accent: '#27ae60',   // Vert
    danger: '#c0392b',   // Rouge
    warning: '#f39c12',   // Orange
    light: '#eaf4fb',   // Bleu très clair
    lightGreen: '#eafaf1',   // Vert très clair
    lightRed: '#fdf2f2',   // Rouge très clair
    white: '#ffffff',
    dark: '#1c2833',
    gray: '#95a5a6',
    lightGray: '#f2f3f4',
    border: '#d5e8f5',
};

/**
 * Dessine un rectangle arrondi (simulé avec fillRoundedRect de PDFKit)
 */
function roundedRect(doc, x, y, w, h, r, fillColor, strokeColor) {
    doc.save()
        .roundedRect(x, y, w, h, r);
    if (fillColor) doc.fillColor(fillColor).fill();
    if (strokeColor) {
        doc.roundedRect(x, y, w, h, r).strokeColor(strokeColor).lineWidth(1).stroke();
    }
    doc.restore();
}

/**
 * Carte statistique avec icône, valeur et label
 */
function statCard(doc, x, y, w, h, value, label, bgColor, textColor) {
    roundedRect(doc, x, y, w, h, 8, bgColor, null);
    doc.fillColor(textColor || COLORS.dark)
        .fontSize(18).font('Arabic-Bold')
        .text(value, x, y + 14, { width: w, align: 'center' });
    doc.fillColor(textColor || COLORS.gray)
        .fontSize(9).font('Arabic-Bold')
        .text(ar(label), x, y + 38, { width: w, align: 'center' });
}

/**
 * Barre de progression horizontale
 */
function progressBar(doc, x, y, width, percent, fillColor) {
    // Fond
    roundedRect(doc, x, y, width, 8, 4, '#e8e8e8', null);
    // Remplissage
    const filled = Math.max(4, (percent / 100) * width);
    roundedRect(doc, x, y, filled, 8, 4, fillColor, null);
}

/**
 * Ligne de séparation
 */
function divider(doc, margin, y, color) {
    doc.moveTo(margin, y).lineTo(595 - margin, y)
        .strokeColor(color || COLORS.border).lineWidth(1).stroke();
}

/**
 * En-tête de section (titre avec bande colorée)
 */
function sectionHeader(doc, title, y, icon) {
    roundedRect(doc, 40, y, 515, 28, 6, COLORS.primary, null);
    doc.fillColor(COLORS.white).fontSize(13).font('Arabic-Bold')
        .text(ar(title), 40, y + 7, { width: 515, align: 'center' });
    return y + 38;
}

function sendCsv(req, res, filename, headers, rows, filters) {
    db.query(
        'INSERT INTO export_logs (admin_username, format, filters, rows_count) VALUES ($1, $2, $3, $4)',
        [req.session.username || null, 'csv', JSON.stringify(filters || {}), rows.length],
        (logErr) => {
            if (logErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvBuffer(headers, rows));
        }
    );
}

function renderRecuPdf(res, payment) {
    const numeroRecu = payment.numero_recu || `REC-${payment.id}`;
    const filename = `recu_${numeroRecu}.pdf`;
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: { Title: `Recu ${numeroRecu}`, Author: 'Association' }
    });
    doc.pipe(res);

    const fontPath = path.join(__dirname, '../fonts/Amiri-Bold.ttf');
    const fontRegPath = path.join(__dirname, '../fonts/Amiri-Regular.ttf');
    doc.registerFont('Arabic-Bold', fontPath);
    doc.registerFont('Arabic-Regular', fs.existsSync(fontRegPath) ? fontRegPath : fontPath);

    const PAGE_W = 595 - 80;
    doc.rect(0, 0, 595, 110).fill(COLORS.primary);
    doc.rect(0, 80, 595, 30).fill(COLORS.secondary);
    doc.fillColor(COLORS.white).font('Arabic-Bold').fontSize(22)
        .text(ar('رابطة شباب جدة'), 40, 18, { width: PAGE_W, align: 'center' });
    doc.fillColor('#aed6f1').fontSize(10)
        .text(ar('موريتانيا - جددة'), 40, 46, { width: PAGE_W, align: 'center' });
    roundedRect(doc, 210, 62, 175, 24, 12, COLORS.accent, null);
    doc.fillColor(COLORS.white).fontSize(11).font('Arabic-Bold')
        .text(ar('إيصال دفع الاشتراك'), 210, 67, { width: 175, align: 'center' });

    let cy = 130;
    doc.fillColor(COLORS.dark).fontSize(16).font('Arabic-Bold')
        .text(ar('إيصال اشتراك'), 40, cy, { width: PAGE_W, align: 'center' });
    cy += 34;

    const dateValue = new Date(payment.created_at || Date.now()).toLocaleDateString('fr-TN');
    const lignes = [
        [ar('رقم الإيصال'), numeroRecu],
        [ar('اسم العضو'), ar(payment.nom)],
        [ar('الفترة'), `${payment.mois}/${payment.annee}`],
        [ar('المبلغ'), `${Number(payment.montant || 0).toLocaleString()} MRO`],
        [ar('التاريخ'), dateValue]
    ];

    lignes.forEach(([label, value], index) => {
        roundedRect(doc, 40, cy, PAGE_W, 44, 6, index % 2 === 0 ? COLORS.light : COLORS.white, COLORS.border);
        doc.fillColor(COLORS.gray).fontSize(10).font('Arabic-Bold')
            .text(label, 55, cy + 8, { width: 200, align: 'right' });
        doc.fillColor(COLORS.dark).fontSize(12).font('Arabic-Bold')
            .text(String(value), 265, cy + 15, { width: 260, align: 'left' });
        cy += 52;
    });

    cy += 20;
    divider(doc, 40, cy);
    doc.fillColor(COLORS.gray).fontSize(9).font('Arabic-Regular')
        .text(ar('تم إنشاء هذا الإيصال تلقائياً بواسطة نظام إدارة رابطة شباب جدة'), 40, cy + 16, { width: PAGE_W, align: 'center' });

    doc.rect(0, 800, 595, 42).fill(COLORS.primary);
    doc.fillColor(COLORS.white).fontSize(8)
        .text(`© ${new Date().getFullYear()} - Association Shabab Jeddah`, 40, 815, { width: PAGE_W, align: 'center' });

    doc.end();
}

function queryAsync(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

function messageBilingue(fr, ar) {
    return {
        message: `${fr} / ${ar}`,
        message_fr: fr,
        message_ar: ar
    };
}

function inscriptionsOuvertes() {
    return process.env.INSCRIPTIONS_OPEN === 'true';
}

function requireInscriptionsOuvertes(req, res, next) {
    if (!inscriptionsOuvertes()) {
        return res.status(403).json({
            success: false,
            ...messageBilingue('Inscriptions fermées', 'التسجيلات مغلقة'),
            code: 'INSCRIPTIONS_FERMEES'
        });
    }
    next();
}

async function getCarteMembre(token) {
    const result = await queryAsync(
        'SELECT nom, numero_adherent, carte_expire_le, actif FROM membres WHERE carte_token = $1',
        [token]
    );
    return result && result.rows ? result.rows[0] || null : null;
}

function carteInfo(membre) {
    const expires = membre.carte_expire_le ? new Date(membre.carte_expire_le) : null;
    const validDate = expires && !Number.isNaN(expires.getTime()) ? expires : null;
    const expire_le = validDate ? validDate.toISOString().slice(0, 10) : null;
    let statut = 'valide';
    if (membre.actif === false) statut = 'inactif';
    else if (!validDate || validDate.getTime() <= Date.now()) statut = 'expire';
    return {
        nom: membre.nom,
        numero_adherent: membre.numero_adherent,
        statut,
        expire_le,
        annee: validDate ? validDate.getUTCFullYear() : new Date().getFullYear()
    };
}

function renderCartePdf(res, token, membre, info) {
    const filename = `carte_${encodeURIComponent(info.numero_adherent || 'membre')}.pdf`;
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: { Title: 'Carte de membre', Author: 'Association' }
    });
    doc.pipe(res);

    const fontPath = path.join(__dirname, '../fonts/Amiri-Bold.ttf');
    const fontRegPath = path.join(__dirname, '../fonts/Amiri-Regular.ttf');
    doc.registerFont('Arabic-Bold', fontPath);
    doc.registerFont('Arabic-Regular', fs.existsSync(fontRegPath) ? fontRegPath : fontPath);

    const PAGE_W = 595 - 80;
    doc.rect(0, 0, 595, 110).fill(COLORS.primary);
    doc.rect(0, 80, 595, 30).fill(COLORS.secondary);
    doc.fillColor(COLORS.white).font('Arabic-Bold').fontSize(22)
        .text(ar('رابطة شباب جدة'), 40, 18, { width: PAGE_W, align: 'center' });
    doc.fillColor('#aed6f1').fontSize(10)
        .text(ar('موريتانيا - جددة'), 40, 46, { width: PAGE_W, align: 'center' });
    roundedRect(doc, 200, 62, 195, 24, 12, COLORS.accent, null);
    doc.fillColor(COLORS.white).fontSize(11).font('Arabic-Bold')
        .text(ar('بطاقة العضو'), 200, 67, { width: 195, align: 'center' });

    let cy = 140;
    doc.fillColor(COLORS.dark).fontSize(18).font('Arabic-Bold')
        .text(ar('بطاقة عضوية'), 40, cy, { width: PAGE_W, align: 'center' });
    cy += 40;

    const fin = info.expire_le ? new Date(`${info.expire_le}T00:00:00Z`) : null;
    const debut = fin ? new Date(fin.getTime()) : null;
    if (debut) debut.setUTCFullYear(debut.getUTCFullYear() - 1);
    const periode = fin && debut
        ? `${debut.toLocaleDateString('fr-TN')} - ${fin.toLocaleDateString('fr-TN')}`
        : '-';

    const lignes = [
        [ar('اسم العضو'), ar(info.nom || '')],
        [ar('رقم العضوية'), info.numero_adherent || ''],
        [ar('فترة الصلاحية'), periode],
        [ar('رمز البطاقة'), token.slice(0, 8)]
    ];
    lignes.forEach(([label, value], index) => {
        roundedRect(doc, 40, cy, PAGE_W, 48, 6, index % 2 === 0 ? COLORS.light : COLORS.white, COLORS.border);
        doc.fillColor(COLORS.gray).fontSize(10).font('Arabic-Bold')
            .text(label, 55, cy + 9, { width: 200, align: 'right' });
        doc.fillColor(COLORS.dark).fontSize(13).font('Arabic-Bold')
            .text(String(value), 265, cy + 16, { width: 260, align: 'left' });
        cy += 58;
    });

    cy += 16;
    divider(doc, 40, cy);
    doc.fillColor(COLORS.gray).fontSize(9).font('Arabic-Regular')
        .text(ar('تم إنشاء هذه البطاقة تلقائياً بواسطة نظام إدارة رابطة شباب جدة'), 40, cy + 16, { width: PAGE_W, align: 'center' });

    doc.rect(0, 800, 595, 42).fill(COLORS.primary);
    doc.fillColor(COLORS.white).fontSize(8)
        .text(`© ${new Date().getFullYear()} - Association Shabab Jeddah`, 40, 815, { width: PAGE_W, align: 'center' });
    doc.end();
}

// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION MULTER (CLOUDINARY)
// ─────────────────────────────────────────────────────────────────
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'association_images',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
    }
});

const imageFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Uniquement des images (JPG, PNG, WEBP) sont autorisées.'));
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFileFilter
});

const proofStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'association_preuves',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    }
});

const uploadProof = multer({
    storage: proofStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFileFilter
});

const preuveSelect = `SELECT id, mois, annee, image_url, created_at, uploaded_by FROM payment_proofs`;

// ═══════════════════════════════════════════════════════════════
//  1. AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════
router.post('/login', validate('login'), (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Identifiants manquants' });

    db.query("SELECT * FROM admins WHERE username = $1", [username], async (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const results = result ? result.rows : [];
        if (results.length > 0) {
            const admin = results[0];
            const match = await bcrypt.compare(password, admin.password);
            if (match) {
                req.session.regenerate((regenErr) => {
                    if (regenErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                    req.session.loggedin = true;
                    req.session.username = username;
                    req.session.save((saveErr) => {
                        if (saveErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                        res.json({ success: true, redirect: '/admin.html' });
                    });
                });
            } else {
                res.status(401).json({ success: false, message: 'Identifiants incorrects' });
            }
        } else {
            res.status(401).json({ success: false, message: 'Identifiants incorrects' });
        }
    });
});

router.get('/check-auth', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.loggedin) });
});

router.get('/public/stats', (req, res) => {
    db.query("SELECT COUNT(*)::int AS total FROM membres WHERE actif = true", (err, hommes) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        db.query("SELECT COUNT(*)::int AS total FROM femmes", (err, femmes) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            db.query("SELECT COUNT(*)::int AS total FROM nouveautes", (err, photos) => {
                if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                res.json({
                    membres: hommes.rows[0].total,
                    femmes: femmes.rows[0].total,
                    photos: photos.rows[0].total
                });
            });
        });
    });
});

router.get('/public/cotisations', (req, res) => {
    res.status(403).json({
        success: false,
        ...messageBilingue('Données financières privées', 'البيانات المالية خاصة'),
        detail: 'donnees financieres privees',
        code: 'DONNEES_FINANCIERES_PRIVEES'
    });
});

const nomChenneliLehmoud = /chenneli\s+lehmoud|شنلي\s+لحمود/i;

router.get('/public/membres', (req, res) => {
    db.query('SELECT nom FROM membres WHERE actif = true ORDER BY nom ASC', (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const membres = result ? result.rows : [];
        res.json({ success: true, membres: membres.map(m => m.nom).filter(nom => !nomChenneliLehmoud.test(nom)) });
    });
});

// ═══════════════════════════════════════════════════════════════
//  2. COTISATIONS
// ═══════════════════════════════════════════════════════════════
router.get('/cotisations', isAuthenticated, (req, res) => {
    db.query("SELECT * FROM membres WHERE actif = true ORDER BY nom ASC", (err, resMembres) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const membres = resMembres ? resMembres.rows : [];
        db.query("SELECT * FROM payments", (err, resPaiements) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            const paiements = resPaiements ? resPaiements.rows : [];
            const data = membres.map(m => ({
                ...m,
                paiements: paiements.filter(p => p.membre_id === m.id).map(p => ({ id: p.id, mois: p.mois, annee: p.annee }))
            }));
            res.json(data);
        });
    });
});

router.post('/cotisations/toggle', isAuthenticated, validate('cotisation'), (req, res) => {
    const { membre_id, mois } = req.body;
    const annee = req.body.annee === undefined ? new Date().getFullYear() : Number(req.body.annee);
    db.query(
        `WITH removed AS (
            DELETE FROM payments WHERE membre_id = $1 AND mois = $2 AND annee = $3 RETURNING id
        ), inserted AS (
            INSERT INTO payments (membre_id, mois, annee)
            SELECT $1, $2, $3
            WHERE NOT EXISTS (SELECT 1 FROM removed)
            ON CONFLICT DO NOTHING
            RETURNING id
        )
        SELECT CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN 'added' ELSE 'removed' END AS status`,
        [membre_id, mois, annee],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true, status: result.rows[0].status });
        }
    );
});

// ═══════════════════════════════════════════════════════════════
//  3. DÉPENSES
// ═══════════════════════════════════════════════════════════════
router.get('/depenses', isAuthenticated, (req, res) => {
    db.query("SELECT * FROM depenses ORDER BY created_at DESC", (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json(result ? result.rows : []);
    });
});

router.post('/depenses', isAuthenticated, validate('depense'), (req, res) => {
    const { label, montant, categorie, date, note } = req.body;
    if (!label || !montant) return res.status(400).json({ success: false });
    db.query("INSERT INTO depenses (label, montant, categorie, date, note) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [label, montant, categorie || 'autre', date || null, note || ''],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true, id: result.rows[0].id });
        });
});

router.delete('/depenses/:id', isAuthenticated, (req, res) => {
    db.query("DELETE FROM depenses WHERE id = $1", [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json({ success: true });
    });
});

// ═══════════════════════════════════════════════════════════════
//  4. NOUVEAUTÉS
// ═══════════════════════════════════════════════════════════════
router.post('/nouveautes', isAuthenticated, upload.single('image'), (req, res) => {
    const { titre } = req.body;
    const imageUrl = req.file ? req.file.path : null;
    if (!imageUrl) return res.status(400).json({ success: false, message: 'Image requise.' });
    db.query("INSERT INTO nouveautes (titre, url, date) VALUES ($1, $2, NOW())", [titre || 'Sans titre', imageUrl], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'Nouveauté ajoutée!' });
    });
});

router.get('/nouveautes', (req, res) => {
    db.query("SELECT * FROM nouveautes ORDER BY date DESC", (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, images: result ? result.rows : [] });
    });
});

router.delete('/nouveautes/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    
    // Récupérer l'URL pour la supprimer de Cloudinary
    db.query("SELECT url FROM nouveautes WHERE id = $1", [id], async (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        
        const results = result ? result.rows : [];
        if (results.length === 0) return res.status(404).json({ success: false, message: 'Image introuvable' });
        
        const imageUrl = results[0].url;
        
        try {
            if (imageUrl) {
                // Extraire le public_id de l'URL Cloudinary
                const parts = imageUrl.split('/');
                const folder = parts[parts.length - 2];
                const file = parts[parts.length - 1].split('.')[0];
                const publicId = `${folder}/${file}`;
                
                await cloudinary.uploader.destroy(publicId);
            }
            
            // Supprimer de la base de données
            db.query("DELETE FROM nouveautes WHERE id = $1", [id], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'Erreur lors de la suppression en base' });
                res.json({ success: true, message: 'Image supprimée avec succès' });
            });
        } catch (cloudErr) {
            console.error('Erreur de suppression Cloudinary:', cloudErr);
            res.status(500).json({ success: false, message: 'Erreur lors de la suppression du fichier' });
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  5. FEMMES ET MEMBRES
// ═══════════════════════════════════════════════════════════════
router.get('/femmes', isAuthenticated, (req, res) => {
    db.query("SELECT * FROM femmes ORDER BY date_inscription DESC", (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json({ success: true, femmes: result ? result.rows : [] });
    });
});

router.use('/membres', isAuthenticated);

router.get('/membres', validate('membreQuery', 'query'), (req, res) => {
    const { q, actif, limit, page } = req.query;
    const conditions = [];
    const params = [];

    if (q) {
        params.push(`%${q}%`);
        const like = `$${params.length}`;
        conditions.push(`(nom ILIKE ${like} OR telephone ILIKE ${like} OR numero_adherent ILIKE ${like})`);
    }
    if (!actif || actif === 'true') {
        conditions.push('actif = true');
    } else if (actif === 'false') {
        conditions.push('actif = false');
    }

    let sql = 'SELECT * FROM membres';
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY date_inscription DESC';

    const hasLimit = limit !== undefined;
    const hasPage = page !== undefined;
    const effectiveLimit = hasLimit ? Number(limit) : 200;
    if (hasLimit || hasPage) {
        params.push(effectiveLimit);
        sql += ` LIMIT $${params.length}`;
    }
    if (hasPage) {
        params.push((Number(page) - 1) * effectiveLimit);
        sql += ` OFFSET $${params.length}`;
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json({ success: true, membres: result ? result.rows : [] });
    });
});

router.get('/membres/:id', (req, res) => {
    db.query("SELECT * FROM membres WHERE id = $1", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const rows = result ? result.rows : [];
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Membre introuvable' });
        res.json({ success: true, membre: rows[0] });
    });
});

router.get('/membres/:id/preuves', isAuthenticated, validate('preuveId', 'params'), (req, res) => {
    db.query('SELECT id FROM membres WHERE id = $1', [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const membres = result ? result.rows : [];
        if (membres.length === 0) return res.status(404).json({ success: false, message: 'Membre introuvable' });
        db.query(`${preuveSelect} WHERE membre_id = $1 ORDER BY created_at DESC, id DESC`, [req.params.id], (proofErr, proofs) => {
            if (proofErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true, proofs: proofs ? proofs.rows : [] });
        });
    });
});

router.post('/membres/:id/preuves', isAuthenticated, validate('preuveId', 'params'), uploadProof.single('image'), validate('preuveCreate'), async (req, res) => {
    try {
        const found = await queryAsync('SELECT id FROM membres WHERE id = $1', [req.params.id]);
        const membres = found && found.rows ? found.rows : [];
        if (membres.length === 0) return res.status(404).json({ success: false, message: 'Membre introuvable' });
        if (!req.file) return res.status(400).json({ success: false, message: 'Image requise.' });

        const admins = await queryAsync('SELECT id FROM admins WHERE username = $1', [req.session.username]);
        const adminRows = admins && admins.rows ? admins.rows : [];
        const uploadedBy = adminRows.length > 0 ? adminRows[0].id : null;

        const inserted = await queryAsync(
            `INSERT INTO payment_proofs (membre_id, mois, annee, image_url, public_id, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, mois, annee, image_url, created_at, uploaded_by`,
            [
                req.params.id,
                req.body.mois === undefined ? null : req.body.mois,
                req.body.annee === undefined ? null : req.body.annee,
                req.file.path,
                req.file.filename || null,
                uploadedBy
            ]
        );
        const proof = inserted && inserted.rows ? inserted.rows[0] : null;
        if (!proof) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.status(201).json({ success: true, proof, proofs: [proof] });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.delete('/preuves/:id', isAuthenticated, validate('preuveId', 'params'), async (req, res) => {
    try {
        const found = await queryAsync('SELECT id, public_id, image_url FROM payment_proofs WHERE id = $1', [req.params.id]);
        const rows = found && found.rows ? found.rows : [];
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Preuve introuvable' });

        const proof = rows[0];
        let publicId = proof.public_id;
        if (!publicId && proof.image_url) {
            const parts = String(proof.image_url).split('/');
            publicId = `${parts[parts.length - 2]}/${parts[parts.length - 1].split('.')[0]}`;
        }
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (cloudErr) {
                console.error('Erreur de suppression Cloudinary:', cloudErr);
                return res.status(500).json({ success: false, message: 'Erreur lors de la suppression du fichier' });
            }
        }
        await queryAsync('DELETE FROM payment_proofs WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.post('/membres/:id/carte/token', async (req, res) => {
    try {
        const found = await queryAsync('SELECT * FROM membres WHERE id = $1', [req.params.id]);
        const membre = found && found.rows ? found.rows[0] : null;
        if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });
        const token = crypto.randomBytes(32).toString('hex');
        const updated = await queryAsync(
            `UPDATE membres SET carte_token = $1, carte_expire_le = NOW() + INTERVAL '1 year' WHERE id = $2`,
            [token, req.params.id]
        );
        if (updated && updated.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Membre introuvable' });
        }
        res.json({ success: true, token });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.post('/membres', validate('membreCreate'), (req, res) => {
    const { nom, telephone, situation, email } = req.body;
    const montant = req.body.montant === undefined ? (situation === 'نعم' ? 2000 : 1000) : req.body.montant;
    const whatsapp = normalizePhone(req.body.whatsapp) || null;

    db.query(
        "INSERT INTO membres (nom, telephone, situation, montant, whatsapp, email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [nom, telephone, situation, montant, whatsapp, email || null],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            const id = result && result.rows && result.rows[0] ? result.rows[0].id : null;
            if (id === null) return res.status(500).json({ success: false, message: 'Erreur serveur' });

            const numeroAdherent = `MEM-${String(id).padStart(4, '0')}`;
            db.query("UPDATE membres SET numero_adherent = $1 WHERE id = $2", [numeroAdherent, id], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                res.status(201).json({ success: true, id, numero_adherent: numeroAdherent });
            });
        }
    );
});

router.put('/membres/:id', validate('membreUpdate'), (req, res) => {
    const fields = [];
    const values = [];
    const add = (column, value) => {
        values.push(value);
        fields.push(`${column} = $${values.length}`);
    };

    if (req.body.nom !== undefined) add('nom', req.body.nom);
    if (req.body.telephone !== undefined) add('telephone', req.body.telephone);
    if (req.body.situation !== undefined) add('situation', req.body.situation);
    if (req.body.montant !== undefined) add('montant', req.body.montant);
    if (req.body.whatsapp !== undefined) add('whatsapp', normalizePhone(req.body.whatsapp) || null);
    if (req.body.email !== undefined) add('email', req.body.email || null);
    if (req.body.actif !== undefined) add('actif', req.body.actif);
    fields.push('updated_at = NOW()');

    values.push(req.params.id);
    db.query(`UPDATE membres SET ${fields.join(', ')} WHERE id = $${values.length}`, values, (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json({ success: true });
    });
});

router.delete('/membres/:id', (req, res) => {
    db.query("UPDATE membres SET actif = false, deleted_at = NOW() WHERE id = $1", [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json({ success: true });
    });
});

// ═══════════════════════════════════════════════════════════════
//  6. INSCRIPTIONS
// ═══════════════════════════════════════════════════════════════
router.post('/inscrire', requireInscriptionsOuvertes, validate('inscription'), (req, res) => {
    const { nom, telephone, situation } = req.body;
    if (!nom || !telephone || !situation) return res.status(400).json({ success: false });
    db.query("SELECT * FROM membres WHERE telephone = $1 AND actif = true", [telephone], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        const results = result ? result.rows : [];
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Numéro déjà enregistré!' });
        const montant = (situation === 'نعم') ? 2000 : 1000;
        db.query("INSERT INTO membres (nom, telephone, situation, montant) VALUES ($1, $2, $3, $4)",
            [nom, telephone, situation, montant], (err) => {
                if (err) return res.status(500).json({ success: false });
                res.json({ success: true, message: 'Inscription réussie!' });
            });
    });
});

router.post('/inscriptions', requireInscriptionsOuvertes, validate('inscriptionPublic'), (req, res) => {
    const { nom, telephone, situation } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const montant = situation === 'نعم' ? 2000 : 1000;
    const whatsapp = normalizePhone(req.body.whatsapp) || null;
    db.query(
        "SELECT id FROM inscriptions WHERE telephone = $1 AND statut = 'en_attente'",
        [telephone],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            const rows = result ? result.rows : [];
            if (rows.length > 0) {
                return res.status(409).json({ success: false, message: 'Inscription déjà en attente' });
            }
            db.query(
                `INSERT INTO inscriptions (nom, telephone, situation, montant, whatsapp, email, consentement, statut, token)
                 VALUES ($1, $2, $3, $4, $5, $6, true, 'en_attente', $7) RETURNING id`,
                [nom, telephone, situation, montant, whatsapp, req.body.email || null, token],
                (insertErr) => {
                    if (insertErr) {
                        if (insertErr.code === '23505') {
                            return res.status(409).json({ success: false, message: 'Inscription déjà en attente' });
                        }
                        return res.status(500).json({ success: false, message: 'Erreur serveur' });
                    }
                    res.status(202).json({
                        success: true,
                        token,
                        message: 'Inscription enregistrée, en attente de validation'
                    });
                }
            );
        }
    );
});

router.get('/inscriptions', isAuthenticated, validate('inscriptionQuery', 'query'), (req, res) => {
    const params = [];
    let sql = 'SELECT * FROM inscriptions';
    if (req.query.statut) {
        params.push(req.query.statut);
        sql += ` WHERE statut = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json({ success: true, inscriptions: result ? result.rows : [] });
    });
});

router.post('/inscriptions/:id/valider', isAuthenticated, async (req, res) => {
    try {
        const found = await queryAsync('SELECT * FROM inscriptions WHERE id = $1', [req.params.id]);
        const inscription = found && found.rows ? found.rows[0] : null;
        if (!inscription) return res.status(404).json({ success: false, message: 'Inscription introuvable' });
        if (inscription.statut === 'valide' || inscription.statut === 'rejete') {
            return res.status(409).json({ success: false, message: 'Inscription déjà traitée' });
        }

        const admins = await queryAsync('SELECT id FROM admins WHERE username = $1', [req.session.username]);
        const adminRows = admins && admins.rows ? admins.rows : [];
        const adminId = adminRows.length > 0 ? adminRows[0].id : null;

        const created = await queryAsync(
            `INSERT INTO membres (nom, telephone, situation, montant, whatsapp, email, source)
             VALUES ($1, $2, $3, $4, $5, $6, 'admin') RETURNING id`,
            [inscription.nom, inscription.telephone, inscription.situation, inscription.montant, inscription.whatsapp, inscription.email]
        );
        const createdRows = created && created.rows ? created.rows : [];
        if (createdRows.length === 0) return res.status(500).json({ success: false, message: 'Erreur serveur' });

        const membreId = createdRows[0].id;
        const numeroAdherent = `MEM-${String(membreId).padStart(4, '0')}`;
        const carteToken = crypto.randomBytes(32).toString('hex');

        await queryAsync(
            `UPDATE membres SET numero_adherent = $1, carte_token = $2, carte_expire_le = NOW() + INTERVAL '1 year' WHERE id = $3`,
            [numeroAdherent, carteToken, membreId]
        );
        await queryAsync(
            `UPDATE inscriptions SET statut = 'valide', membre_id = $1, traite_at = NOW(), traite_par = $2 WHERE id = $3`,
            [membreId, adminId, req.params.id]
        );
        res.json({ success: true, membre_id: membreId, numero_adherent: numeroAdherent, carte_token: carteToken });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.post('/inscriptions/:id/rejeter', isAuthenticated, validate('inscriptionDecision'), async (req, res) => {
    try {
        const found = await queryAsync('SELECT * FROM inscriptions WHERE id = $1', [req.params.id]);
        const inscription = found && found.rows ? found.rows[0] : null;
        if (!inscription) return res.status(404).json({ success: false, message: 'Inscription introuvable' });
        if (inscription.statut === 'valide' || inscription.statut === 'rejete') {
            return res.status(409).json({ success: false, message: 'Inscription déjà traitée' });
        }

        const admins = await queryAsync('SELECT id FROM admins WHERE username = $1', [req.session.username]);
        const adminRows = admins && admins.rows ? admins.rows : [];
        const adminId = adminRows.length > 0 ? adminRows[0].id : null;

        const updated = await queryAsync(
            `UPDATE inscriptions SET statut = 'rejete', motif_rejet = $1, traite_at = NOW(), traite_par = $2 WHERE id = $3`,
            [req.body.motif, adminId, req.params.id]
        );
        if (!updated || updated.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Inscription introuvable' });
        }
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.get('/carte/:token.pdf', validate('carteToken', 'params'), async (req, res) => {
    try {
        const membre = await getCarteMembre(req.params.token);
        if (!membre) return res.status(404).json({ success: false, message: 'Carte introuvable' });
        renderCartePdf(res, req.params.token, membre, carteInfo(membre));
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.get('/carte/:token', validate('carteToken', 'params'), async (req, res) => {
    try {
        const membre = await getCarteMembre(req.params.token);
        if (!membre) return res.status(404).json({ success: false, message: 'Carte introuvable' });
        res.json(carteInfo(membre));
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  6. GÉNÉRATION DE RAPPORT PDF PROFESSIONNEL (ARABE)
// ═══════════════════════════════════════════════════════════════

router.get('/pdf/rapport-financier', isAuthenticated, (req, res) => {
    // Charger toutes les données en parallèle
    db.query("SELECT * FROM membres WHERE actif = true", (err, resMembres) => {
        if (err) return res.status(500).send('Erreur DB');
        const membres = resMembres ? resMembres.rows : [];
        db.query("SELECT * FROM payments", (err, resPaiements) => {
            if (err) return res.status(500).send('Erreur DB');
            const paiements = resPaiements ? resPaiements.rows : [];
            db.query("SELECT * FROM depenses ORDER BY date DESC", (err, resDepenses) => {
                if (err) return res.status(500).send('Erreur DB');
                const depenses = resDepenses ? resDepenses.rows : [];

                // ── Calculs financiers ──────────────────────────────────
                const totalCot = membres.reduce((sum, m) => {
                    const count = paiements.filter(p => p.membre_id === m.id).length;
                    return sum + (count * m.montant);
                }, 0);
                const totalDep = depenses.reduce((sum, d) => sum + Number(d.montant), 0);
                const solde = totalCot - totalDep;

                // Stats membres
                const totalMembres = membres.length;
                const membresActifs = membres.filter(m =>
                    paiements.some(p => p.membre_id === m.id)).length;
                const membresInactifs = totalMembres - membresActifs;
                const tauxPaiement = totalMembres > 0
                    ? Math.round((membresActifs / totalMembres) * 100) : 0;

                // Stats dépenses par catégorie
                const depParCat = {};
                depenses.forEach(d => {
                    const cat = d.categorie || 'autre';
                    depParCat[cat] = (depParCat[cat] || 0) + Number(d.montant);
                });

                // Dépenses des 6 derniers mois
                const now = new Date();
                const moisLabels = [];
                const moisData = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const label = d.toLocaleDateString('ar-TN', { month: 'short' });
                    const total = depenses
                        .filter(dep => {
                            const dd = new Date(dep.date || dep.created_at);
                            return dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear();
                        })
                        .reduce((s, dep) => s + Number(dep.montant), 0);
                    moisLabels.push(label);
                    moisData.push(total);
                }
                const maxMois = Math.max(...moisData, 1);

                // ── Création du PDF ─────────────────────────────────────
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 40,
                    info: { Title: 'Rapport Financier', Author: 'Association' }
                });

                const filename = `rapport_financier_${Date.now()}.pdf`;
                res.setHeader('Content-disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
                res.setHeader('Content-type', 'application/pdf');
                doc.pipe(res);

                // Polices arabes
                const fontPath = path.join(__dirname, '../fonts/Amiri-Bold.ttf');
                const fontRegPath = path.join(__dirname, '../fonts/Amiri-Regular.ttf');
                doc.registerFont('Arabic-Bold', fontPath);
                doc.registerFont('Arabic-Regular', fs.existsSync(fontRegPath) ? fontRegPath : fontPath);

                const PAGE_W = 595 - 80; // largeur utile
                let cy = 40; // curseur Y courant

                // ────────────────────────────────────────────────────────
                //  EN-TÊTE
                // ────────────────────────────────────────────────────────

                // Fond dégradé simulé (deux rectangles superposés)
                doc.rect(0, 0, 595, 110).fill(COLORS.primary);
                doc.rect(0, 80, 595, 30).fill(COLORS.secondary);

                // Nom de l'association
                doc.fillColor(COLORS.white)
                    .font('Arabic-Bold').fontSize(22)
                    .text(ar("رابطة شباب جدة"), 40, 18, { width: PAGE_W, align: 'center' });

                doc.fillColor('#aed6f1').fontSize(10)
                    .text(ar("موريتانيا - جددة  |  نظام الإدارة المالية"), 40, 46, { width: PAGE_W, align: 'center' });

                // Badge "التقرير المالي"
                roundedRect(doc, 220, 62, 155, 24, 12, COLORS.accent, null);
                doc.fillColor(COLORS.white).fontSize(11).font('Arabic-Bold')
                    .text(ar("التقرير المالي العام"), 220, 67, { width: 155, align: 'center' });

                cy = 125;

                // Date d'émission
                const dateNow = new Date().toLocaleDateString('ar-TN', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
                doc.fillColor(COLORS.gray).fontSize(9).font('Arabic-Regular')
                    .text(ar(`تاريخ الإصدار : ${dateNow}`), 40, cy, { width: PAGE_W, align: 'right' });
                cy += 20;

                // ────────────────────────────────────────────────────────
                //  CARTES STATISTIQUES (4 cartes en ligne)
                // ────────────────────────────────────────────────────────
                cy = sectionHeader(doc, "ملخص الأرقام الرئيسية", cy);

                const cardW = 115;
                const cardH = 60;
                const cardGap = 9;
                const startX = 40;

                const cards = [
                    { value: `${totalCot.toLocaleString()}`, label: "إجمالي الاشتراكات", bg: COLORS.lightGreen, color: COLORS.accent },
                    { value: `${totalDep.toLocaleString()}`, label: "إجمالي المصاريف", bg: COLORS.lightRed, color: COLORS.danger },
                    { value: `${solde < 0 ? '-' : ''}${Math.abs(solde).toLocaleString()}`, label: "الرصيد الحالي", bg: solde >= 0 ? COLORS.light : COLORS.lightRed, color: solde >= 0 ? COLORS.secondary : COLORS.danger },
                    { value: `${totalMembres}`, label: "عدد الأعضاء", bg: '#fef9e7', color: COLORS.warning },
                ];

                cards.forEach((card, i) => {
                    statCard(
                        doc,
                        startX + i * (cardW + cardGap),
                        cy,
                        cardW, cardH,
                        card.value + " MRO",
                        card.label,
                        card.bg,
                        card.color
                    );
                });

                cy += cardH + 18;

                // ────────────────────────────────────────────────────────
                //  SECTION MEMBRES
                // ────────────────────────────────────────────────────────
                cy = sectionHeader(doc, "إحصائيات الأعضاء", cy);

                // Taux de paiement
                doc.fillColor(COLORS.dark).fontSize(10).font('Arabic-Bold')
                    .text(ar(`نسبة الدفع : ${tauxPaiement}%`), 40, cy, { width: PAGE_W, align: 'right' });
                cy += 14;

                progressBar(doc, 40, cy, PAGE_W, tauxPaiement, COLORS.accent);
                cy += 20;

                // Deux mini-cartes membres actifs / inactifs
                const mCardW = (PAGE_W - 10) / 2;
                roundedRect(doc, 40, cy, mCardW, 42, 6, COLORS.lightGreen, COLORS.accent);
                doc.fillColor(COLORS.accent).fontSize(16).font('Arabic-Bold')
                    .text(`${membresActifs}`, 40, cy + 8, { width: mCardW, align: 'center' });
                doc.fillColor(COLORS.gray).fontSize(9)
                    .text(ar("أعضاء نشطون"), 40, cy + 28, { width: mCardW, align: 'center' });

                roundedRect(doc, 40 + mCardW + 10, cy, mCardW, 42, 6, COLORS.lightRed, COLORS.danger);
                doc.fillColor(COLORS.danger).fontSize(16).font('Arabic-Bold')
                    .text(`${membresInactifs}`, 40 + mCardW + 10, cy + 8, { width: mCardW, align: 'center' });
                doc.fillColor(COLORS.gray).fontSize(9)
                    .text(ar("أعضاء غير نشطين"), 40 + mCardW + 10, cy + 28, { width: mCardW, align: 'center' });

                cy += 60;

                // ────────────────────────────────────────────────────────
                //  GRAPHIQUE : DÉPENSES PAR CATÉGORIE
                // ────────────────────────────────────────────────────────
                cy = sectionHeader(doc, "المصاريف حسب الفئة", cy);

                const catColors = ['#2e86c1', '#27ae60', '#e74c3c', '#f39c12', '#8e44ad', '#16a085'];
                const catEntries = Object.entries(depParCat);

                if (catEntries.length > 0) {
                    const barChartW = 260;
                    const barChartH = 90;
                    const maxCatVal = Math.max(...catEntries.map(([, v]) => v), 1);
                    const catBarW = Math.floor((barChartW - (catEntries.length - 1) * 4) / catEntries.length);

                    // Dessin manuel des barres (catégories)
                    catEntries.forEach(([cat, val], i) => {
                        const bx = 40 + i * (catBarW + 4);
                        const bh = (val / maxCatVal) * barChartH;
                        const by = cy + barChartH - bh;
                        const color = catColors[i % catColors.length];

                        roundedRect(doc, bx, by, catBarW, bh, 3, color, null);

                        // Valeur au-dessus
                        doc.fillColor(COLORS.dark).fontSize(7).font('Arabic-Bold')
                            .text(val.toLocaleString(), bx - 5, by - 12, { width: catBarW + 10, align: 'center' });
                    });

                    // Axe X
                    doc.moveTo(40, cy + barChartH).lineTo(40 + barChartW, cy + barChartH)
                        .strokeColor(COLORS.border).lineWidth(1).stroke();

                    // Labels catégories (dessous)
                    catEntries.forEach(([cat, val], i) => {
                        const bx = 40 + i * (catBarW + 4);
                        doc.fillColor(COLORS.gray).fontSize(6.5).font('Arabic-Bold')
                            .text(ar(cat.substring(0, 8)), bx - 5, cy + barChartH + 4, { width: catBarW + 10, align: 'center' });
                    });

                    // Légende à droite
                    let ly = cy + 5;
                    catEntries.slice(0, 6).forEach(([cat, val], i) => {
                        const color = catColors[i % catColors.length];
                        doc.rect(320, ly, 10, 10).fill(color);
                        doc.fillColor(COLORS.dark).fontSize(8.5).font('Arabic-Regular')
                            .text(`${val.toLocaleString()} MRO  ← ` + ar(cat), 335, ly + 1, { width: 220, align: 'right' });
                        ly += 16;
                    });

                    cy += barChartH + 30;
                } else {
                    doc.fillColor(COLORS.gray).fontSize(10)
                        .text(ar("لا توجد مصاريف مسجلة"), 40, cy, { width: PAGE_W, align: 'center' });
                    cy += 20;
                }

                // ────────────────────────────────────────────────────────
                //  GRAPHIQUE : ÉVOLUTION MENSUELLE DES DÉPENSES
                // ────────────────────────────────────────────────────────
                cy = sectionHeader(doc, "تطور المصاريف خلال 6 أشهر", cy);

                const monthChartW = PAGE_W;
                const monthChartH = 70;
                const monthBarW = Math.floor((monthChartW - 5 * 8) / 6);

                moisData.forEach((val, i) => {
                    const bx = 40 + i * (monthBarW + 8);
                    const bh = maxMois > 0 ? Math.max(2, (val / maxMois) * monthChartH) : 2;
                    const by = cy + monthChartH - bh;
                    const color = val === Math.max(...moisData) ? COLORS.danger : COLORS.secondary;

                    roundedRect(doc, bx, by, monthBarW, bh, 3, color, null);

                    // Valeur
                    if (val > 0) {
                        doc.fillColor(COLORS.dark).fontSize(7).font('Arabic-Bold')
                            .text(val.toLocaleString(), bx - 5, by - 12, { width: monthBarW + 10, align: 'center' });
                    }

                    // Label mois
                    doc.fillColor(COLORS.gray).fontSize(8).font('Arabic-Bold')
                        .text(ar(moisLabels[i]), bx - 5, cy + monthChartH + 4, { width: monthBarW + 10, align: 'center' });
                });

                doc.moveTo(40, cy + monthChartH).lineTo(40 + monthChartW, cy + monthChartH)
                    .strokeColor(COLORS.border).lineWidth(1).stroke();

                cy += monthChartH + 30;

                // ────────────────────────────────────────────────────────
                //  TABLEAU DES DERNIÈRES DÉPENSES
                // ────────────────────────────────────────────────────────
                cy = sectionHeader(doc, "آخر المصاريف المسجلة", cy);

                // En-tête du tableau
                const colW = { date: 80, label: 220, cat: 100, montant: 115 };
                const tableX = 40;

                roundedRect(doc, tableX, cy, PAGE_W, 22, 4, COLORS.secondary, null);
                doc.fillColor(COLORS.white).fontSize(9).font('Arabic-Bold');
                doc.text(ar("التاريخ"), tableX, cy + 6, { width: colW.date, align: 'center' });
                doc.text(ar("الوصف"), tableX + colW.date, cy + 6, { width: colW.label, align: 'right' });
                doc.text(ar("الفئة"), tableX + colW.date + colW.label, cy + 6, { width: colW.cat, align: 'center' });
                doc.text(ar("المبلغ"), tableX + colW.date + colW.label + colW.cat, cy + 6, { width: colW.montant, align: 'center' });
                cy += 24;

                // Lignes
                const recentDeps = depenses.slice(0, 15);
                recentDeps.forEach((d, idx) => {
                    const rowBg = idx % 2 === 0 ? COLORS.white : COLORS.lightGray;
                    roundedRect(doc, tableX, cy, PAGE_W, 20, 0, rowBg, null);

                    const dateStr = new Date(d.date || d.created_at).toLocaleDateString('fr-TN');
                    const labelStr = ar((d.label || '').substring(0, 28));
                    const catStr = ar((d.categorie || 'autre').substring(0, 12));
                    const montStr = `${Number(d.montant).toLocaleString()} MRO`;

                    doc.fillColor(COLORS.dark).fontSize(8.5).font('Arabic-Regular');
                    doc.text(dateStr, tableX, cy + 5, { width: colW.date, align: 'center' });
                    doc.text(labelStr, tableX + colW.date, cy + 5, { width: colW.label, align: 'right' });
                    doc.text(catStr, tableX + colW.date + colW.label, cy + 5, { width: colW.cat, align: 'center' });
                    doc.fillColor(COLORS.danger).font('Arabic-Bold')
                        .text(montStr, tableX + colW.date + colW.label + colW.cat, cy + 5, { width: colW.montant, align: 'center' });

                    cy += 22;

                    // Nouvelle page si nécessaire
                    if (cy > 750) {
                        doc.addPage();
                        cy = 40;
                    }
                });

                // Total dépenses
                cy += 4;
                divider(doc, 40, cy);
                cy += 6;
                roundedRect(doc, tableX + colW.date + colW.label + colW.cat - 10, cy, colW.montant + 10, 22, 4, COLORS.lightRed, null);
                doc.fillColor(COLORS.danger).fontSize(10).font('Arabic-Bold')
                    .text(`${totalDep.toLocaleString()} MRO`, tableX + colW.date + colW.label + colW.cat, cy + 5, { width: colW.montant, align: 'center' });
                doc.fillColor(COLORS.dark).fontSize(9).font('Arabic-Bold')
                    .text(ar("المجموع :"), tableX + colW.date + colW.label, cy + 5, { width: colW.cat, align: 'right' });
                cy += 30;

                // ────────────────────────────────────────────────────────
                //  PIED DE PAGE
                // ────────────────────────────────────────────────────────
                doc.rect(0, 800, 595, 42).fill(COLORS.primary);
                doc.fillColor('#aed6f1').fontSize(8).font('Arabic-Regular')
                    .text(
                        ar("تم إنشاء هذا المستند تلقائياً بواسطة نظام إدارة رابطة شباب جدة"),
                        40, 809, { width: PAGE_W, align: 'center' }
                    );
                doc.fillColor(COLORS.white).fontSize(7)
                    .text(`© ${new Date().getFullYear()} - Association Shabab Jeddah`, 40, 822, { width: PAGE_W, align: 'center' });

                doc.end();
            });
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  7. EXPORTS CSV
// ═══════════════════════════════════════════════════════════════

router.use('/export', isAuthenticated);

router.get('/export/membres.csv', validate('exportQuery', 'query'), (req, res) => {
    const { q, actif, from, to } = req.query;
    const conditions = [];
    const params = [];

    if (q) {
        params.push(`%${q}%`);
        const like = `$${params.length}`;
        conditions.push(`(nom ILIKE ${like} OR telephone ILIKE ${like} OR numero_adherent ILIKE ${like})`);
    }
    if (actif === 'true' || actif === 'false') {
        conditions.push(`actif = ${actif === 'true'}`);
    }
    if (from) {
        params.push(from);
        conditions.push(`date_inscription >= $${params.length}`);
    }
    if (to) {
        params.push(to);
        conditions.push(`date_inscription < $${params.length}::date + INTERVAL '1 day'`);
    }

    let sql = 'SELECT numero_adherent, nom, telephone, situation, montant, whatsapp, email, actif FROM membres';
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY nom ASC';

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const rows = (result ? result.rows : []).map(m => [
            m.numero_adherent || '',
            m.nom || '',
            m.telephone || '',
            m.situation || '',
            m.montant,
            m.whatsapp || '',
            m.email || '',
            m.actif ? 'true' : 'false'
        ]);
        sendCsv(req, res, 'membres.csv',
            ['numéro adhérent', 'nom', 'téléphone', 'situation', 'montant', 'whatsapp', 'email', 'actif'],
            rows, req.query);
    });
});

router.get('/export/cotisations.csv', validate('exportQuery', 'query'), (req, res) => {
    const { q, mois, annee } = req.query;
    const conditions = [];
    const params = [];

    if (q) {
        params.push(`%${q}%`);
        conditions.push(`(m.nom ILIKE $${params.length} OR m.telephone ILIKE $${params.length})`);
    }
    if (mois !== undefined) {
        params.push(mois);
        conditions.push(`p.mois = $${params.length}`);
    }
    if (annee !== undefined) {
        params.push(annee);
        conditions.push(`p.annee = $${params.length}`);
    }

    let sql = `SELECT m.nom, m.telephone, p.mois, p.annee,
        COALESCE(p.montant_snapshot, m.montant) AS montant,
        COALESCE(p.numero_recu, 'REC-' || p.id) AS numero_recu
        FROM payments p JOIN membres m ON m.id = p.membre_id`;
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY p.annee DESC, p.mois DESC, m.nom ASC';

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const rows = (result ? result.rows : []).map(p => [
            p.nom || '',
            p.telephone || '',
            p.mois,
            p.annee,
            p.montant,
            p.numero_recu || ''
        ]);
        sendCsv(req, res, 'cotisations.csv',
            ['nom', 'téléphone', 'mois', 'annee', 'montant', 'numéro de reçu'],
            rows, req.query);
    });
});

router.get('/export/depenses.csv', validate('exportQuery', 'query'), (req, res) => {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];

    if (from) {
        params.push(from);
        conditions.push(`COALESCE(date, created_at::date) >= $${params.length}`);
    }
    if (to) {
        params.push(to);
        conditions.push(`COALESCE(date, created_at::date) < $${params.length}::date + INTERVAL '1 day'`);
    }

    let sql = 'SELECT label, montant, categorie, date, note FROM depenses';
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY date DESC NULLS LAST, created_at DESC';

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const rows = (result ? result.rows : []).map(d => [
            d.label || '',
            d.montant,
            d.categorie || '',
            d.date ? new Date(d.date).toISOString().slice(0, 10) : '',
            d.note || ''
        ]);
        sendCsv(req, res, 'depenses.csv',
            ['label', 'montant', 'catégorie', 'date', 'note'],
            rows, req.query);
    });
});

// ═══════════════════════════════════════════════════════════════
//  8. REÇUS PDF
// ═══════════════════════════════════════════════════════════════

router.use('/recus', isAuthenticated);

const recuSelect = `SELECT p.id, p.mois, p.annee, p.numero_recu, p.created_at,
    COALESCE(p.montant_snapshot, m.montant) AS montant, m.nom
    FROM payments p JOIN membres m ON m.id = p.membre_id`;

router.get('/recus/membre/:id', validate('exportQuery', 'query'), (req, res) => {
    const { mois, annee } = req.query;
    if (mois === undefined || annee === undefined) {
        return res.status(400).json({ success: false, message: 'Mois et année requis' });
    }
    db.query(`${recuSelect} WHERE p.membre_id = $1 AND p.mois = $2 AND p.annee = $3`,
        [req.params.id, mois, annee], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            const rows = result ? result.rows : [];
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Paiement introuvable' });
            renderRecuPdf(res, rows[0]);
        });
});

router.get('/recus/:id', (req, res) => {
    db.query(`${recuSelect} WHERE p.id = $1`, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const rows = result ? result.rows : [];
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Paiement introuvable' });
        renderRecuPdf(res, rows[0]);
    });
});

function buildRappelMessage(mois, annee) {
    return `السلام عليكم، rappel pour la cotisation de ${mois}/${annee}. Merci.`;
}

function buildWaLink(phone, message) {
    const digits = normalizePhone(phone) || '';
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

router.get('/notifications', isAuthenticated, validate('notificationQuery', 'query'), (req, res) => {
    const { statut, canal } = req.query;
    const conditions = [];
    const params = [];
    if (statut) {
        params.push(statut);
        conditions.push(`n.statut = $${params.length}`);
    }
    if (canal) {
        params.push(canal);
        conditions.push(`n.canal = $${params.length}`);
    }
    let sql = `SELECT n.*, m.nom AS membre_nom, m.whatsapp AS membre_whatsapp
        FROM notifications n LEFT JOIN membres m ON m.id = n.membre_id`;
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY n.created_at DESC';
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        res.json({ success: true, notifications: result ? result.rows : [] });
    });
});

router.post('/notifications', isAuthenticated, validate('notificationCreate'), (req, res) => {
    const { membre_id, canal, template, scheduled_at } = req.body;
    const payloadInput = req.body.payload || {};
    db.query('SELECT id, nom, telephone, whatsapp FROM membres WHERE id = $1', [membre_id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const membre = result && result.rows ? result.rows[0] : null;
        if (!membre) return res.status(404).json({ success: false, message: 'Membre introuvable' });

        const mois = payloadInput.mois;
        const annee = payloadInput.annee;
        const periode = (mois !== undefined && annee !== undefined)
            ? `${annee}-${String(mois).padStart(2, '0')}`
            : null;
        const message = (template === 'rappel_cotisation' && mois !== undefined && annee !== undefined)
            ? buildRappelMessage(mois, annee)
            : (payloadInput.message || '');
        const lien = buildWaLink(membre.whatsapp || membre.telephone, message);
        const payload = { ...payloadInput, message, lien };

        db.query(
            `INSERT INTO notifications (membre_id, canal, template, payload, statut, periode, scheduled_at)
             VALUES ($1, $2, $3, $4, 'a_envoyer', $5, COALESCE($6::timestamptz, NOW()))
             RETURNING id`,
            [membre_id, canal, template, JSON.stringify(payload), periode, scheduled_at || null],
            (insertErr, insertResult) => {
                if (insertErr) {
                    if (insertErr.code === '23505') {
                        return res.status(409).json({ success: false, message: 'Déjà planifié' });
                    }
                    return res.status(500).json({ success: false, message: 'Erreur serveur' });
                }
                res.status(201).json({ success: true, id: insertResult.rows[0].id });
            }
        );
    });
});

router.post('/notifications/rappels-cotisations', isAuthenticated, validate('rappelCreate'), (req, res) => {
    const { mois, annee } = req.body;
    const periode = `${annee}-${String(mois).padStart(2, '0')}`;
    db.query(
        `SELECT m.id, m.nom, m.telephone, m.whatsapp
         FROM membres m
         WHERE m.actif = true AND m.whatsapp IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM payments p WHERE p.membre_id = m.id AND p.mois = $1 AND p.annee = $2
           )`,
        [mois, annee],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            const membres = result ? result.rows : [];
            let demandes = 0;
            let ignores = 0;
            let index = 0;

            const next = () => {
                if (index >= membres.length) {
                    return res.json({ success: true, demandes, ignores });
                }
                const membre = membres[index++];
                const message = buildRappelMessage(mois, annee);
                const lien = buildWaLink(membre.whatsapp || membre.telephone, message);
                const payload = { mois, annee, message, lien };
                db.query(
                    `INSERT INTO notifications (membre_id, canal, template, payload, statut, periode)
                     VALUES ($1, 'whatsapp', 'rappel_cotisation', $2, 'a_envoyer', $3)
                     ON CONFLICT (membre_id, template, periode) WHERE membre_id IS NOT NULL AND periode IS NOT NULL DO NOTHING`,
                    [membre.id, JSON.stringify(payload), periode],
                    (insertErr, insertResult) => {
                        if (insertErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                        if (insertResult.rowCount > 0) demandes += 1;
                        else ignores += 1;
                        next();
                    }
                );
            };

            next();
        }
    );
});

router.patch('/notifications/:id', isAuthenticated, validate('notificationAction'), (req, res) => {
    const { action } = req.body;
    let sql;
    let params;
    if (action === 'envoye') {
        sql = `UPDATE notifications SET statut = 'envoye', sent_at = NOW(), erreur = NULL WHERE id = $1`;
        params = [req.params.id];
    } else if (action === 'annule') {
        sql = `UPDATE notifications SET statut = 'annule' WHERE id = $1`;
        params = [req.params.id];
    } else {
        sql = `UPDATE notifications SET statut = 'a_envoyer', erreur = NULL, tentatives = tentatives + 1 WHERE id = $1`;
        params = [req.params.id];
    }
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        if (!result || result.rowCount === 0) return res.status(404).json({ success: false, message: 'Notification introuvable' });
        res.json({ success: true });
    });
});

router.get('/membres/:id/preferences', (req, res) => {
    db.query(
        `INSERT INTO notification_preferences (membre_id)
         VALUES ($1)
         ON CONFLICT (membre_id) DO NOTHING`,
        [req.params.id],
        (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            db.query('SELECT * FROM notification_preferences WHERE membre_id = $1', [req.params.id], (selectErr, result) => {
                if (selectErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                const rows = result ? result.rows : [];
                if (rows.length === 0) return res.status(404).json({ success: false, message: 'Membre introuvable' });
                res.json({ success: true, preferences: rows[0] });
            });
        }
    );
});

router.put('/membres/:id/preferences', validate('preferencesUpdate'), (req, res) => {
    const fields = [];
    const values = [];
    if (req.body.whatsapp_optin !== undefined) {
        values.push(req.body.whatsapp_optin);
        fields.push(`whatsapp_optin = $${values.length}`);
    }
    if (req.body.email_optin !== undefined) {
        values.push(req.body.email_optin);
        fields.push(`email_optin = $${values.length}`);
    }
    if (req.body.locale !== undefined) {
        values.push(req.body.locale);
        fields.push(`locale = $${values.length}`);
    }
    fields.push('updated_at = NOW()');
    values.push(req.params.id);
    db.query(
        `UPDATE notification_preferences SET ${fields.join(', ')} WHERE membre_id = $${values.length} RETURNING *`,
        values,
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            if (result && result.rowCount > 0) {
                return res.json({ success: true, preferences: result.rows[0] });
            }
            const whatsappOptin = req.body.whatsapp_optin === undefined ? false : req.body.whatsapp_optin;
            const emailOptin = req.body.email_optin === undefined ? false : req.body.email_optin;
            const locale = req.body.locale === undefined ? 'ar' : req.body.locale;
            db.query(
                `INSERT INTO notification_preferences (membre_id, whatsapp_optin, email_optin, locale)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [req.params.id, whatsappOptin, emailOptin, locale],
                (insertErr, insertResult) => {
                    if (insertErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                    res.json({ success: true, preferences: insertResult.rows[0] });
                }
            );
        }
    );
});

function findRsvpByIdentity(evenementId, membreId, telephone, callback) {
    if (membreId !== null) {
        return db.query(
            `SELECT id FROM rsvps WHERE evenement_id = $1 AND membre_id = $2`,
            [evenementId, membreId],
            callback
        );
    }
    if (telephone !== null) {
        return db.query(
            `SELECT id FROM rsvps WHERE evenement_id = $1 AND membre_id IS NULL AND telephone = $2`,
            [evenementId, telephone],
            callback
        );
    }
    callback(null, { rows: [] });
}

function countOuiRsvps(evenementId, excludeId, callback) {
    db.query(
        `SELECT COUNT(*)::int AS total FROM rsvps WHERE evenement_id = $1 AND reponse = 'oui' AND id <> $2`,
        [evenementId, excludeId],
        (err, result) => {
            if (err) return callback(err);
            const rows = result ? result.rows : [];
            callback(null, rows.length > 0 ? Number(rows[0].total) : 0);
        }
    );
}

router.get('/evenements', validate('evenementQuery', 'query'), (req, res) => {
    const conditions = ["statut = 'publie'"];
    if (req.query.avenir === '1') conditions.push('date_debut >= NOW()');
    db.query(
        `SELECT id, titre, description, lieu, date_debut, date_fin, image_url, capacite
         FROM evenements WHERE ${conditions.join(' AND ')} ORDER BY date_debut ASC`,
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true, evenements: result ? result.rows : [] });
        }
    );
});

router.get('/admin/evenements', isAuthenticated, validate('evenementQuery', 'query'), (req, res) => {
    const params = [];
    let where = '';
    if (req.query.statut) {
        params.push(req.query.statut);
        where = `WHERE e.statut = $${params.length}`;
    }
    db.query(
        `SELECT e.id, e.titre, e.description, e.lieu, e.date_debut, e.date_fin, e.image_url,
            e.capacite, e.statut, e.created_at, e.updated_at,
            COUNT(r.id) FILTER (WHERE r.reponse = 'oui')::int AS rsvps_oui
         FROM evenements e LEFT JOIN rsvps r ON r.evenement_id = e.id
         ${where}
         GROUP BY e.id ORDER BY e.date_debut ASC`,
        params,
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true, evenements: result ? result.rows : [] });
        }
    );
});

router.get('/evenements/:id/rsvps', isAuthenticated, (req, res) => {
    db.query(
        `SELECT r.id, r.membre_id, r.nom_invite, r.telephone, r.reponse, r.note, r.created_at,
            m.nom AS membre_nom
         FROM rsvps r LEFT JOIN membres m ON m.id = r.membre_id
         WHERE r.evenement_id = $1 ORDER BY r.created_at DESC`,
        [req.params.id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true, rsvps: result ? result.rows : [] });
        }
    );
});

router.get('/evenements/:id', (req, res) => {
    db.query(
        `SELECT id, titre, description, lieu, date_debut, date_fin, image_url, capacite
         FROM evenements WHERE id = $1 AND statut = 'publie'`,
        [req.params.id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            const rows = result ? result.rows : [];
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Evenement introuvable' });
            res.json({ success: true, evenement: rows[0] });
        }
    );
});

router.post('/evenements', isAuthenticated, upload.single('image'), validate('evenementCreate'), (req, res) => {
    const { titre, description, lieu, date_debut, date_fin, capacite, statut } = req.body;
    const imageUrl = req.file ? req.file.path : null;
    db.query('SELECT id FROM admins WHERE username = $1', [req.session.username], (err, adminResult) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const adminRows = adminResult ? adminResult.rows : [];
        const createdBy = adminRows.length > 0 ? adminRows[0].id : null;
        db.query(
            `INSERT INTO evenements (titre, description, lieu, date_debut, date_fin, image_url, capacite, statut, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [titre, description || null, lieu || null, date_debut, date_fin || null, imageUrl, capacite || null, statut || 'brouillon', createdBy],
            (insertErr, insertResult) => {
                if (insertErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                const rows = insertResult ? insertResult.rows : [];
                if (rows.length === 0) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                res.status(201).json({ success: true, id: rows[0].id });
            }
        );
    });
});

router.put('/evenements/:id', isAuthenticated, upload.single('image'), validate('evenementUpdate'), (req, res) => {
    const fields = [];
    const values = [];
    const add = (column, value) => {
        values.push(value);
        fields.push(`${column} = $${values.length}`);
    };
    for (const column of ['titre', 'description', 'lieu', 'date_debut', 'date_fin', 'capacite', 'statut']) {
        if (req.body[column] === undefined) continue;
        const nullable = ['description', 'lieu', 'date_fin', 'capacite'].includes(column) && req.body[column] === '';
        add(column, nullable ? null : req.body[column]);
    }
    if (req.file) add('image_url', req.file.path);
    fields.push('updated_at = NOW()');
    values.push(req.params.id);
    db.query(`UPDATE evenements SET ${fields.join(', ')} WHERE id = $${values.length}`, values, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        if (!result || result.rowCount === 0) return res.status(404).json({ success: false, message: 'Evenement introuvable' });
        res.json({ success: true });
    });
});

router.delete('/evenements/:id', isAuthenticated, (req, res) => {
    db.query('SELECT image_url FROM evenements WHERE id = $1', [req.params.id], async (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const rows = result ? result.rows : [];
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Evenement introuvable' });
        const imageUrl = rows[0].image_url;
        if (imageUrl) {
            const parts = String(imageUrl).split('/');
            const publicId = `${parts[parts.length - 2]}/${parts[parts.length - 1].split('.')[0]}`;
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (cloudErr) {
                console.error('Erreur de suppression Cloudinary:', cloudErr);
                return res.status(500).json({ success: false, message: 'Erreur lors de la suppression du fichier' });
            }
        }
        db.query('DELETE FROM evenements WHERE id = $1', [req.params.id], (deleteErr) => {
            if (deleteErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            res.json({ success: true });
        });
    });
});

router.post('/evenements/:id/rsvp', validate('rsvpCreate'), (req, res) => {
    const evenementId = req.params.id;
    const membreId = req.body.membre_id === undefined || req.body.membre_id === null || req.body.membre_id === '' ? null : req.body.membre_id;
    const telephone = req.body.telephone === undefined || req.body.telephone === null || req.body.telephone === '' ? null : req.body.telephone;
    const nomInvite = req.body.nom_invite || null;
    const reponse = req.body.reponse;
    const note = req.body.note || null;
    const token = crypto.randomBytes(32).toString('hex');

    db.query(`SELECT statut, capacite FROM evenements WHERE id = $1`, [evenementId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        const rows = result ? result.rows : [];
        if (rows.length === 0 || rows[0].statut !== 'publie') {
            return res.status(404).json({ success: false, message: 'Evenement introuvable' });
        }
        const capacite = rows[0].capacite === null || rows[0].capacite === undefined ? null : Number(rows[0].capacite);

        findRsvpByIdentity(evenementId, membreId, telephone, (findErr, found) => {
            if (findErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            const existingRows = found ? found.rows : [];
            const existingId = existingRows.length > 0 ? existingRows[0].id : 0;

            const insertRsvp = () => {
                let sql = `INSERT INTO rsvps (evenement_id, membre_id, nom_invite, telephone, reponse, note, token)
                           VALUES ($1, $2, $3, $4, $5, $6, $7)`;
                if (membreId !== null) {
                    sql += ` ON CONFLICT (evenement_id, membre_id) WHERE membre_id IS NOT NULL
                             DO UPDATE SET nom_invite = EXCLUDED.nom_invite, telephone = EXCLUDED.telephone,
                             reponse = EXCLUDED.reponse, note = EXCLUDED.note, token = EXCLUDED.token, updated_at = NOW()`;
                } else if (telephone !== null) {
                    sql += ` ON CONFLICT (evenement_id, telephone) WHERE membre_id IS NULL AND telephone IS NOT NULL
                             DO UPDATE SET nom_invite = EXCLUDED.nom_invite, reponse = EXCLUDED.reponse,
                             note = EXCLUDED.note, token = EXCLUDED.token, updated_at = NOW()`;
                }
                sql += ` RETURNING id, reponse, token`;
                db.query(sql, [evenementId, membreId, nomInvite, telephone, reponse, note, token], (insertErr, insertResult) => {
                    if (insertErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                    const rsvpRows = insertResult ? insertResult.rows : [];
                    if (rsvpRows.length === 0) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                    const rsvp = rsvpRows[0];
                    const finish = (placesRestantes) => res.json({
                        success: true,
                        id: rsvp.id,
                        reponse: rsvp.reponse,
                        token: rsvp.token,
                        places_restantes: placesRestantes
                    });
                    if (capacite === null) return finish(null);
                    db.query(
                        `SELECT GREATEST($2::int - COUNT(*)::int, 0) AS places_restantes
                         FROM rsvps WHERE evenement_id = $1 AND reponse = 'oui'`,
                        [evenementId, capacite],
                        (countErr, countResult) => {
                            if (countErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                            const countRows = countResult ? countResult.rows : [];
                            finish(countRows.length > 0 ? Number(countRows[0].places_restantes) : 0);
                        }
                    );
                });
            };

            if (reponse !== 'oui' || capacite === null) return insertRsvp();
            countOuiRsvps(evenementId, existingId, (countErr, total) => {
                if (countErr) return res.status(500).json({ success: false, message: 'Erreur serveur' });
                if (total >= capacite) {
                    return res.status(409).json({ success: false, message: 'Capacité atteinte', places_restantes: 0 });
                }
                insertRsvp();
            });
        });
    });
});

router.post('/rsvp/:token/annuler', validate('rsvpToken', 'params'), (req, res) => {
    db.query(
        `UPDATE rsvps SET reponse = 'non', updated_at = NOW() WHERE token = $1 RETURNING id`,
        [req.params.token],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
            if (!result || result.rowCount === 0) return res.status(404).json({ success: false, message: 'RSVP introuvable' });
            res.json({ success: true });
        }
    );
});

router.get('/journal', async (req, res) => {
    try {
        const result = await queryAsync(
            `SELECT id, nom, message, publie_at FROM journal_entries WHERE statut = 'publie' ORDER BY publie_at DESC LIMIT 50`
        );
        res.json({ success: true, entries: result.rows });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.post('/journal', validate('journalCreate'), async (req, res) => {
    try {
        const result = await queryAsync(
            `INSERT INTO journal_entries (nom, message, statut) VALUES ($1, $2, 'en_attente') RETURNING id, nom, message, statut, created_at`,
            [req.body.nom, req.body.message]
        );
        res.status(201).json({ success: true, entry: result.rows[0], message: 'Message en attente de modération' });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.get('/admin/journal', isAuthenticated, async (req, res) => {
    const statut = ['en_attente', 'publie', 'rejete'].includes(req.query.statut) ? req.query.statut : null;
    const sql = statut
        ? `SELECT id, nom, message, statut, created_at, publie_at, traite_at, traite_par FROM journal_entries WHERE statut = $1 ORDER BY created_at DESC`
        : `SELECT id, nom, message, statut, created_at, publie_at, traite_at, traite_par FROM journal_entries ORDER BY created_at DESC`;
    try {
        const result = await queryAsync(sql, statut ? [statut] : []);
        res.json({ success: true, entries: result.rows });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.patch('/admin/journal/:id', isAuthenticated, validate('journalId', 'params'), validate('journalDecision'), async (req, res) => {
    try {
        const result = await queryAsync(
            `UPDATE journal_entries SET statut = $1::varchar, publie_at = CASE WHEN $1::varchar = 'publie' THEN NOW() ELSE publie_at END, traite_at = NOW(), traite_par = $2 WHERE id = $3 RETURNING id, nom, message, statut, publie_at, traite_at, traite_par`,
            [req.body.statut, req.session.username || 'admin', Number(req.params.id)]
        );
        if (!result || result.rowCount === 0) return res.status(404).json({ success: false, message: 'Journal introuvable' });
        res.json({ success: true, entry: result.rows[0] });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

router.delete('/admin/journal/:id', isAuthenticated, validate('journalId', 'params'), async (req, res) => {
    try {
        const result = await queryAsync(`DELETE FROM journal_entries WHERE id = $1`, [Number(req.params.id)]);
        if (!result || result.rowCount === 0) return res.status(404).json({ success: false, message: 'Journal introuvable' });
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;