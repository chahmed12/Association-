'use strict';

const fs = require('fs');
const { CARD, PALETTE, FONTS, LOGO_PATH, mmToPt } = require('./cardStyles');
const { writeText, roundedRect, rule, formatPeriod } = require('./cardUtils');

const m = mmToPt;

const STATUT_LABELS = {
    valide: 'سارية',
    expire: 'منتهية',
    inactif: 'غير نشطة'
};

function drawLogo(doc, ctx, x, y, size) {
    if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, x, y, { fit: [size, size], align: 'center', valign: 'center' });
        return;
    }
    roundedRect(doc, x, y, size, size, m(1.5), PALETTE.sand, null);
    writeText(doc, {
        text: 'رج',
        x,
        y: y + size * 0.18,
        width: size,
        size: size * 0.42,
        font: FONTS.bold,
        color: PALETTE.deep,
        align: 'center',
        ar: ctx.ar
    });
}

function drawHeader(doc, ctx) {
    const { width } = CARD;
    const safe = CARD.safe;
    const headerH = m(13.5);

    doc.rect(0, 0, width, headerH).fill(PALETTE.deep);
    doc.rect(0, headerH, width, m(1.3)).fill(PALETTE.gold);
    drawLogo(doc, ctx, safe, m(1.8), m(9.5));
    writeText(doc, {
        text: 'رابطة شباب جدة',
        x: safe + m(11),
        y: m(2.6),
        width: width - safe * 2 - m(11),
        size: m(3),
        font: FONTS.bold,
        color: PALETTE.white,
        align: 'right',
        ar: ctx.ar
    });
}

function drawInfoRows(doc, ctx) {
    const safe = CARD.safe;
    const qrX = CARD.width - safe - m(14);
    const areaW = qrX - safe - m(2);
    const rows = [
        ['فترة الصلاحية', formatPeriod(ctx.info)],
        ['حالة البطاقة', STATUT_LABELS[ctx.info.statut] || ctx.info.statut],
        ['سنة الانخراط', String(ctx.info.annee_adhesion)]
    ];

    writeText(doc, {
        text: 'معلومات البطاقة',
        x: safe,
        y: m(16.5),
        width: areaW,
        size: m(3.2),
        font: FONTS.bold,
        color: PALETTE.emerald,
        align: 'right',
        ar: ctx.ar
    });

    rows.forEach(([label, value], index) => {
        const y = m(20) + index * m(5.2);
        writeText(doc, {
            text: label,
            x: safe + areaW - m(17),
            y,
            width: m(17),
            size: m(2.15),
            font: FONTS.regular,
            color: PALETTE.muted,
            align: 'right',
            ar: ctx.ar
        });
        writeText(doc, {
            text: value,
            x: safe,
            y: y + m(2.2),
            width: areaW,
            size: m(2.9),
            font: FONTS.bold,
            color: PALETTE.ink,
            align: 'right',
            ar: ctx.ar
        });
        rule(doc, safe, y + m(5.8), safe + areaW, y + m(5.8), PALETTE.border, 0.4);
    });
}

function drawQr(doc, ctx) {
    const size = m(14);
    const x = CARD.width - CARD.safe - size;
    const y = m(18.5);

    if (ctx.qr) {
        doc.image(ctx.qr, x, y, { fit: [size, size], align: 'center', valign: 'center' });
        return;
    }

    roundedRect(doc, x, y, size, size, m(1), PALETTE.soft, PALETTE.gold);
    writeText(doc, {
        text: 'QR',
        x,
        y: y + size * 0.36,
        width: size,
        size: m(2.4),
        font: FONTS.bold,
        color: PALETTE.emerald,
        align: 'center'
    });
}

function drawNotice(doc, ctx) {
    const safe = CARD.safe;
    const y = CARD.height - safe - m(13);

    roundedRect(doc, safe, y, CARD.width - safe * 2, m(10.5), m(1.5), PALETTE.soft, PALETTE.border);
    writeText(doc, {
        text: 'هذه البطاقة خاصة بصاحبها ولا يجوز استعمالها من طرف الغير',
        x: safe + m(2),
        y: y + m(1.4),
        width: CARD.width - safe * 2 - m(4),
        size: m(2.35),
        font: FONTS.regular,
        color: PALETTE.ink,
        align: 'center',
        ar: ctx.ar
    });
}

function drawIdentity(doc, ctx) {
    const safe = CARD.safe;
    const y = CARD.height - m(4.2);

    doc.rect(0, CARD.height - m(5.5), CARD.width, m(5.5)).fill(PALETTE.deep);
    writeText(doc, {
        text: 'عزيمة، أخوة، بناء',
        x: safe,
        y,
        width: CARD.width - safe * 2,
        size: m(2.1),
        font: FONTS.bold,
        color: PALETTE.sand,
        align: 'right',
        ar: ctx.ar
    });
    writeText(doc, {
        text: 'Association Shabab Jeddah',
        x: safe,
        y,
        width: CARD.width - safe * 2,
        size: m(1.9),
        font: FONTS.regular,
        color: PALETTE.white,
        align: 'left'
    });
}

function drawCardBack(ctx) {
    const { doc } = ctx;

    doc.save();
    if (ctx.duplex === 'short-edge') {
        doc.translate(CARD.width, 0);
        doc.scale(-1, 1);
    }

    doc.rect(0, 0, CARD.width, CARD.height).fill(PALETTE.white);
    drawHeader(doc, ctx);
    drawInfoRows(doc, ctx);
    drawQr(doc, ctx);
    drawNotice(doc, ctx);
    drawIdentity(doc, ctx);

    doc.restore();
}

module.exports = { drawCardBack };
