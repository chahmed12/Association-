'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { CARD, PALETTE, FONT_BOLD_PATH, LOGO_PATH, mmToPt } = require('../services/membershipCard/cardStyles');
const { buildCardInfo } = require('../services/membershipCard/cardInfo');
const { buildCardQr, buildVerificationUrl } = require('../services/membershipCard/cardQr');
const { renderMembershipCardPdf } = require('../services/membershipCard');

const verificationId = '11111111-2222-4333-8444-555555555555';

test('les dimensions CR80 sont exactes', () => {
    assert.ok(Math.abs(CARD.width - mmToPt(85.6)) < 1e-9);
    assert.ok(Math.abs(CARD.height - mmToPt(53.98)) < 1e-9);
    assert.ok(Math.abs(CARD.width - 242.6456692913) < 1e-6);
    assert.ok(Math.abs(CARD.height - 153.0141732283) < 1e-6);
});

test('la configuration Vercel inclut les assets de la carte avec un glob string', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const includeFiles = vercel.functions['server.js'].includeFiles;
    assert.equal(typeof includeFiles, 'string');
    assert.ok(includeFiles.length <= 256);
    assert.match(includeFiles, /views/);
    assert.match(includeFiles, /prive/);
    assert.match(includeFiles, /fonts/);
    assert.match(includeFiles, /AssociationJJJ\.jpg/);
});

test('la palette est celle de l association', () => {
    assert.equal(PALETTE.deep, '#062C2A');
    assert.equal(PALETTE.emerald, '#087F5B');
    assert.equal(PALETTE.gold, '#D8AA55');
    assert.equal(PALETTE.sand, '#E9D7B4');
    assert.equal(PALETTE.ink, '#132822');
});

test('le logo de l association est disponible', () => {
    assert.ok(fs.existsSync(LOGO_PATH));
});

test('la police arabe gras est disponible', () => {
    assert.ok(fs.existsSync(FONT_BOLD_PATH));
});

test('une carte valide reste valide jusqu a la fin du jour', () => {
    const info = buildCardInfo({
        nom: 'Alpha',
        numero_adherent: 'MEM-0001',
        carte_expire_le: '2030-01-01T00:00:00Z',
        actif: true
    }, new Date('2030-01-01T23:59:59.000Z'));
    assert.equal(info.statut, 'valide');
    assert.equal(info.expire_le, '2030-01-01');
});

test('une carte est expiree des le lendemain', () => {
    const info = buildCardInfo({
        carte_expire_le: '2030-01-01T00:00:00Z',
        actif: true
    }, new Date('2030-01-02T00:00:00.000Z'));
    assert.equal(info.statut, 'expire');
});

test('une carte inactive est prioritaire sur la date', () => {
    const info = buildCardInfo({
        carte_expire_le: '2030-01-02T00:00:00Z',
        actif: false
    }, new Date('2030-01-01T12:00:00.000Z'));
    assert.equal(info.statut, 'inactif');
});

test('une date invalide rend la carte expiree', () => {
    const info = buildCardInfo({ carte_expire_le: 'pas-une-date', actif: true });
    assert.equal(info.statut, 'expire');
    assert.equal(info.expire_le, null);
});

test('une date absente rend la carte expiree', () => {
    const info = buildCardInfo({ actif: true });
    assert.equal(info.statut, 'expire');
});

test('l annee d adhesion vient de date_inscription', () => {
    const info = buildCardInfo({ date_inscription: '2019-07-10T00:00:00Z' });
    assert.equal(info.annee_adhesion, 2019);
});

test('le module conserve verification_id et source', () => {
    const info = buildCardInfo({ carte_verification_id: verificationId, source: 'femmes' });
    assert.equal(info.verification_id, verificationId);
    assert.equal(info.source, 'femmes');
});

test('l URL de verification ne contient pas de token', () => {
    const req = { protocol: 'https', get: () => 'exemple.tn' };
    const url = buildVerificationUrl(req, verificationId);
    assert.equal(url, `https://exemple.tn/verification-carte.html?id=${verificationId}`);
    assert.ok(!url.includes('token'));
});

test('le QR de verification est un PNG', async () => {
    const buffer = await buildCardQr('https://exemple.tn/verification-carte.html');
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
});

test('le generateur produit deux pages CR80 meme sans Amiri-Regular', async () => {
    const chunks = [];
    const res = new PassThrough();
    res.setHeader = () => {};
    res.on('data', chunk => chunks.push(chunk));

    const done = new Promise(resolve => res.on('end', resolve));
    await renderMembershipCardPdf(res, {
        req: { protocol: 'https', get: () => 'exemple.tn' },
        membre: {
            nom: 'Alpha',
            numero_adherent: 'MEM-0001',
            carte_expire_le: '2030-01-01T00:00:00Z',
            actif: true,
            photo_url: null,
            carte_verification_id: verificationId,
            source: 'hommes'
        },
        photo: null,
        ar: value => value,
        duplex: 'short-edge'
    });
    await done;

    const pdf = Buffer.concat(chunks).toString('latin1');
    assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 2);
    assert.equal((pdf.match(/\/MediaBox \[0 0 [\d.]+ [\d.]+\]/g) || []).length, 2);
});
