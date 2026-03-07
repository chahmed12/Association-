const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const ArabicReshaperModule = require('arabic-persian-reshaper');

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

/**
 * Mini graphique à barres verticales (barres dessinées avec des rectangles)
 */
function barChart(doc, x, y, width, height, data, maxVal, barColor) {
    const barCount = data.length;
    const gap = 4;
    const barW = (width - gap * (barCount - 1)) / barCount;

    data.forEach((val, i) => {
        const barH = maxVal > 0 ? (val / maxVal) * height : 0;
        const bx = x + i * (barW + gap);
        const by = y + height - barH;
        roundedRect(doc, bx, by, barW, barH, 3, barColor, null);
    });

    // Axe X
    doc.moveTo(x, y + height).lineTo(x + width, y + height)
        .strokeColor(COLORS.border).lineWidth(1).stroke();
}

// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION MULTER
// ─────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Uniquement des images (JPG, PNG, WEBP) sont autorisées.'));
    }
});

// ═══════════════════════════════════════════════════════════════
//  1. AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════
router.post('/login', validate('login'), (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Identifiants manquants' });

    db.query("SELECT * FROM admins WHERE username = ?", [username], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
        if (results.length > 0) {
            const admin = results[0];
            const match = await bcrypt.compare(password, admin.password);
            if (match) {
                req.session.loggedin = true;
                req.session.username = username;
                req.session.save(() => res.json({ success: true, redirect: '/admin.html' }));
            } else {
                res.status(401).json({ success: false, message: 'Identifiants incorrects' });
            }
        } else {
            res.status(401).json({ success: false, message: 'Identifiants incorrects' });
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  2. COTISATIONS
// ═══════════════════════════════════════════════════════════════
router.get('/cotisations', (req, res) => {
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

router.post('/cotisations/toggle', isAuthenticated, (req, res) => {
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
//  3. DÉPENSES
// ═══════════════════════════════════════════════════════════════
router.get('/depenses', (req, res) => {
    db.query("SELECT * FROM depenses ORDER BY created_at DESC", (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

router.post('/depenses', isAuthenticated, validate('depense'), (req, res) => {
    const { label, montant, categorie, date, note } = req.body;
    if (!label || !montant) return res.status(400).json({ success: false });
    db.query("INSERT INTO depenses (label, montant, categorie, date, note) VALUES (?, ?, ?, ?, ?)",
        [label, montant, categorie || 'autre', date || null, note || ''],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, id: result.insertId });
        });
});

router.delete('/depenses/:id', isAuthenticated, (req, res) => {
    db.query("DELETE FROM depenses WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true });
    });
});

// ═══════════════════════════════════════════════════════════════
//  4. NOUVEAUTÉS
// ═══════════════════════════════════════════════════════════════
router.post('/nouveautes', isAuthenticated, upload.single('image'), (req, res) => {
    const { titre } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    if (!imageUrl) return res.status(400).json({ success: false, message: 'Image requise.' });
    db.query("INSERT INTO nouveautes (titre, url, date) VALUES (?, ?, NOW())", [titre || 'Sans titre', imageUrl], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'Nouveauté ajoutée!' });
    });
});

router.get('/nouveautes', (req, res) => {
    db.query("SELECT * FROM nouveautes ORDER BY date DESC", (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, images: results });
    });
});

// ═══════════════════════════════════════════════════════════════
//  5. INSCRIPTIONS
// ═══════════════════════════════════════════════════════════════
router.post('/inscrire', validate('inscription'), (req, res) => {
    const { nom, telephone, situation } = req.body;
    if (!nom || !telephone || !situation) return res.status(400).json({ success: false });
    db.query("SELECT * FROM membres WHERE telephone = ?", [telephone], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Numéro déjà enregistré!' });
        const montant = (situation === 'نعم') ? 2000 : 1000;
        db.query("INSERT INTO membres (nom, telephone, situation, montant) VALUES (?, ?, ?, ?)",
            [nom, telephone, situation, montant], (err) => {
                if (err) return res.status(500).json({ success: false });
                res.json({ success: true, message: 'Inscription réussie!' });
            });
    });
});

// ═══════════════════════════════════════════════════════════════
//  6. GÉNÉRATION DE RAPPORT PDF PROFESSIONNEL (ARABE)
// ═══════════════════════════════════════════════════════════════

router.get('/pdf/rapport-financier', isAuthenticated, (req, res) => {
    // Charger toutes les données en parallèle
    db.query("SELECT * FROM membres", (err, membres) => {
        if (err) return res.status(500).send('Erreur DB');
        db.query("SELECT * FROM payments", (err, paiements) => {
            if (err) return res.status(500).send('Erreur DB');
            db.query("SELECT * FROM depenses ORDER BY date DESC", (err, depenses) => {
                if (err) return res.status(500).send('Erreur DB');

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

module.exports = router;