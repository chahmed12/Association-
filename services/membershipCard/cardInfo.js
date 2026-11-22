'use strict';

function parseDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function buildCardInfo(membre, now = new Date()) {
    const source = membre || {};
    const expireDate = parseDate(source.carte_expire_le);
    const inscriptionDate = parseDate(source.date_inscription);
    const expire_le = expireDate ? expireDate.toISOString().slice(0, 10) : null;
    const expiryEnd = expireDate
        ? Date.UTC(
            expireDate.getUTCFullYear(),
            expireDate.getUTCMonth(),
            expireDate.getUTCDate(),
            23, 59, 59, 999
        )
        : null;

    let statut = 'valide';
    if (source.actif === false) statut = 'inactif';
    else if (expiryEnd === null || expiryEnd < now.getTime()) statut = 'expire';

    return {
        nom: source.nom || '',
        numero_adherent: source.numero_adherent || '',
        statut,
        expire_le,
        annee: expireDate ? expireDate.getUTCFullYear() : now.getUTCFullYear(),
        annee_adhesion: inscriptionDate ? inscriptionDate.getUTCFullYear() : now.getUTCFullYear(),
        verification_id: source.carte_verification_id || '',
        source: source.source || ''
    };
}

module.exports = { buildCardInfo, parseDate };
