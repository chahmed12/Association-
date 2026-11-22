'use strict';

function mmToPt(mm) {
    return Number(mm) * 72 / 25.4;
}

function safeString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function arabic(ar, value) {
    const text = safeString(value);
    return typeof ar === 'function' ? ar(text) : text;
}

function fitText(doc, ar, value, font, size, maxWidth) {
    const original = safeString(value);
    let candidate = original;
    doc.font(font).fontSize(size);
    while (candidate.length > 1 && doc.widthOfString(arabic(ar, candidate)) > maxWidth) {
        candidate = candidate.slice(0, -1).trimEnd();
    }
    return candidate.length < original.length ? `${candidate}…` : candidate;
}

function writeText(doc, options) {
    const {
        text, x, y, width, size = 8, font = 'Arabic-Regular',
        color = '#132822', align = 'right', ar = null, lineBreak = false
    } = options;
    const shaped = arabic(ar, fitText(doc, ar, text, font, size, width));
    doc.save()
        .font(font)
        .fontSize(size)
        .fillColor(color)
        .text(shaped, x, y, { width, align, lineBreak, ellipsis: true })
        .restore();
}

function roundedRect(doc, x, y, width, height, radius, fillColor, strokeColor) {
    doc.save();
    doc.roundedRect(x, y, width, height, radius);
    if (fillColor) doc.fillColor(fillColor).fill();
    if (strokeColor) {
        doc.roundedRect(x, y, width, height, radius)
            .strokeColor(strokeColor)
            .lineWidth(0.7)
            .stroke();
    }
    doc.restore();
}

function rule(doc, x1, y1, x2, y2, color, lineWidth = 0.5) {
    doc.save()
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .strokeColor(color)
        .lineWidth(lineWidth)
        .stroke()
        .restore();
}

function formatPeriod(info, locale = 'fr-TN') {
    if (!info || !info.expire_le) return '-';
    const end = new Date(`${info.expire_le}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) return '-';
    const start = new Date(end.getTime());
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    const formatter = new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function drawSignature(doc, x, y, width, color) {
    doc.save();
    rule(doc, x, y, x + width, y, color, 0.6);
    doc.moveTo(x + width * 0.12, y - 1.5)
        .quadraticCurveTo(x + width * 0.35, y - 7, x + width * 0.52, y - 2)
        .quadraticCurveTo(x + width * 0.7, y + 2, x + width * 0.88, y - 4)
        .strokeColor(color)
        .lineWidth(1.1)
        .stroke();
    doc.restore();
}

module.exports = {
    mmToPt,
    safeString,
    arabic,
    fitText,
    writeText,
    roundedRect,
    rule,
    formatPeriod,
    drawSignature
};
