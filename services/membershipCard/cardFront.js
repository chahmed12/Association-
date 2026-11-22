'use strict';

const fs = require('fs');
const { CARD, PALETTE, FONTS, LOGO_PATH, mmToPt } = require('./cardStyles');
const { writeText, roundedRect, rule, drawSignature } = require('./cardUtils');

const m = mmToPt;

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
    const headerH = m(14);

    doc.rect(0, 0, width, headerH).fill(PALETTE.deep);
    doc.rect(0, headerH, width, m(1.3)).fill(PALETTE.gold);

    drawLogo(doc, ctx, safe, m(2), m(10));

    writeText(doc, {
        text: 'رابطة شباب جدة',
        x: safe + m(12),
        y: m(2.8),
        width: width - safe * 2 - m(12),
        size: m(3.25),
        font: FONTS.bold,
        color: PALETTE.white,
        align: 'right',
        ar: ctx.ar
    });
    writeText(doc, {
        text: 'موريتانيا - جددة',
        x: safe + m(12),
        y: m(8),
        width: width - safe * 2 - m(12),
        size: m(2.25),
        font: FONTS.regular,
        color: PALETTE.sand,
        align: 'right',
        ar: ctx.ar
    });
}

function drawPhoto(doc, ctx) {
    const { width } = CARD;
    const safe = CARD.safe;
    const x = width - safe - m(17);
    const y = m(20.5);
    const boxW = m(17);
    const boxH = m(20);

    roundedRect(doc, x, y, boxW, boxH, m(1.5), PALETTE.white, PALETTE.gold);
    if (ctx.photo && ctx.photo.buffer) {
        doc.image(ctx.photo.buffer, x + m(1), y + m(1), {
            fit: [boxW - m(2), boxH - m(2)],
            align: 'center',
            valign: 'center'
        });
    } else {
        writeText(doc, {
            text: 'الصورة',
            x,
            y: y + boxH * 0.38,
            width: boxW,
            size: m(2.6),
            font: FONTS.regular,
            color: PALETTE.muted,
            align: 'center',
            ar: ctx.ar
        });
    }
}

function drawFields(doc, ctx) {
    const safe = CARD.safe;
    const photoX = CARD.width - safe - m(17);
    const areaX = safe;
    const areaW = photoX - safe - m(2);
    const labelW = m(18);
    const rows = [
        ['اسم العضو', ctx.info.nom, FONTS.bold],
        ['رقم العضوية', ctx.info.numero_adherent, FONTS.bold],
        ['سنة الصلاحية', String(ctx.info.annee), FONTS.regular]
    ];

    writeText(doc, {
        text: 'بطاقة العضوية',
        x: areaX,
        y: m(17.5),
        width: areaW,
        size: m(3.4),
        font: FONTS.bold,
        color: PALETTE.emerald,
        align: 'right',
        ar: ctx.ar
    });

    rows.forEach(([label, value, font], index) => {
        const y = m(24) + index * m(7.2);
        writeText(doc, {
            text: label,
            x: areaX + areaW - labelW,
            y,
            width: labelW,
            size: m(2.15),
            font: FONTS.regular,
            color: PALETTE.muted,
            align: 'right',
            ar: ctx.ar
        });
        writeText(doc, {
            text: value,
            x: areaX,
            y: y + m(2.4),
            width: areaW,
            size: m(3.1),
            font,
            color: PALETTE.ink,
            align: 'right',
            ar: ctx.ar
        });
        rule(doc, areaX, y + m(6.2), areaX + areaW, y + m(6.2), PALETTE.border, 0.4);
    });
}

function drawQr(doc, ctx) {
    const size = m(13);
    const x = CARD.safe;
    const y = CARD.height - CARD.safe - size;

    if (ctx.qr) {
        doc.image(ctx.qr, x, y, { fit: [size, size], align: 'center', valign: 'center' });
        return;
    }

    roundedRect(doc, x, y, size, size, m(1), PALETTE.soft, PALETTE.gold);
    writeText(doc, {
        text: 'QR',
        x,
        y: y + size * 0.35,
        width: size,
        size: m(2.4),
        font: FONTS.bold,
        color: PALETTE.emerald,
        align: 'center'
    });
}

function drawInstitutionalSignature(doc, ctx) {
    const x = CARD.safe + m(18);
    const width = m(34);
    const y = CARD.height - CARD.safe - m(4);

    writeText(doc, {
        text: 'توقيع الرابطة',
        x,
        y: y - m(5.5),
        width,
        size: m(2.1),
        font: FONTS.regular,
        color: PALETTE.muted,
        align: 'center',
        ar: ctx.ar
    });
    drawSignature(doc, x, y, width, PALETTE.gold);
}

function drawCardFront(ctx) {
    const { doc } = ctx;
    doc.rect(0, 0, CARD.width, CARD.height).fill(PALETTE.white);
    drawHeader(doc, ctx);
    drawPhoto(doc, ctx);
    drawFields(doc, ctx);
    drawQr(doc, ctx);
    drawInstitutionalSignature(doc, ctx);
    rule(doc, CARD.safe, CARD.height - CARD.safe - m(0.5), CARD.width - CARD.safe, CARD.height - CARD.safe - m(0.5), PALETTE.emerald, 0.6);
}

module.exports = { drawCardFront };
