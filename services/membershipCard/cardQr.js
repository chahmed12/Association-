'use strict';

const QRCode = require('qrcode');

async function buildCardQr(url) {
    if (!url) return null;
    return QRCode.toBuffer(url, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 512
    });
}

function buildVerificationUrl(req, verificationId) {
    if (!req || !verificationId) return null;
    const host = typeof req.get === 'function' ? req.get('host') : null;
    if (!host) return null;
    const protocol = req.protocol || 'https';
    return `${protocol}://${host}/verification-carte.html?id=${encodeURIComponent(verificationId)}`;
}

module.exports = { buildCardQr, buildVerificationUrl };
