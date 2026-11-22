'use strict';

const fs = require('fs');
const PDFDocument = require('pdfkit');
const { buildCardInfo } = require('./cardInfo');
const { buildCardQr } = require('./cardQr');
const { drawCardFront } = require('./cardFront');
const { drawCardBack } = require('./cardBack');
const {
    CARD,
    FONTS,
    FONT_BOLD_PATH,
    FONT_REGULAR_PATH
} = require('./cardStyles');

async function renderMembershipCardPdf(res, options) {
    const {
        req,
        membre,
        photo = null,
        ar = null,
        duplex = 'short-edge'
    } = options || {};

    const info = buildCardInfo(membre);
    const verificationId = (membre && membre.carte_verification_id) || info.verification_id;
    const verificationUrl = verificationId && req
        ? `${req.protocol || 'https'}://${req.get('host')}/verification-carte.html?id=${encodeURIComponent(verificationId)}`
        : null;
    let qr = null;
    if (verificationUrl) {
        try {
            qr = await buildCardQr(verificationUrl);
        } catch {
            qr = null;
        }
    }

    const filename = `carte_${encodeURIComponent(info.numero_adherent || 'membre')}.pdf`;
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument({
        size: [CARD.width, CARD.height],
        margin: 0,
        info: {
            Title: 'Carte de membre',
            Author: 'Association Shabab Jeddah'
        }
    });
    doc.pipe(res);

    doc.registerFont(FONTS.bold, FONT_BOLD_PATH);
    doc.registerFont(
        FONTS.regular,
        fs.existsSync(FONT_REGULAR_PATH) ? FONT_REGULAR_PATH : FONT_BOLD_PATH
    );

    const ctx = { doc, info, membre: membre || {}, photo, qr, ar, duplex, verificationUrl };

    drawCardFront(ctx);
    doc.addPage({ size: [CARD.width, CARD.height], margin: 0 });
    drawCardBack(ctx);

    doc.end();
    return doc;
}

module.exports = { renderMembershipCardPdf };
