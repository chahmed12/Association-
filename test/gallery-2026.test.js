const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const images2026 = [
    'jeddeta-tournoi-classement-semi-final-2026.jpg',
    'jeddeta-festival-nuit-2026.jpg',
    'jeddeta-vert-2026.jpg',
    'jeddeta-vert-event-2026.jpg',
    'jeddah-festival-nuit-portrait-2026.jpg',
    'jeddeta-concours-national-recompenses-admin-2026.jpg'
];

test('les six images de l’album 2026 sont présentes', () => {
    for (const image of images2026) {
        const chemin = path.join(root, 'public/images/galerie', image);
        assert.ok(fs.existsSync(chemin), `${image} doit être présent`);
        assert.ok(fs.statSync(chemin).size > 0, `${image} ne doit pas être vide`);
    }
});

test('la page premium contient l’album bento 2026', () => {
    const page = fs.readFileSync(path.join(root, 'views/premium.ejs'), 'utf8');
    for (const image of images2026) {
        assert.match(page, new RegExp(`/images/galerie/${image.replaceAll('.', '\\.')}`));
    }
    assert.match(page, /galerie2026Photos/);
    assert.match(page, /galerie2026Container/);
    assert.match(page, /gallery-bento/);
    assert.match(page, /gallery-tile--slot-\$\{index \+ 1\}/);
});

test('le lightbox partagé garde miniatures, swipe et compteur', () => {
    const page = fs.readFileSync(path.join(root, 'views/premium.ejs'), 'utf8');
    assert.match(page, /galerieThumbs/);
    assert.match(page, /galerieCounterVisible/);
    assert.match(page, /touchstart/);
    assert.match(page, /touchend/);
    assert.match(page, /activeGaleriePhotos/);
});

test('la galerie existante reste disponible', () => {
    const page = fs.readFileSync(path.join(root, 'views/premium.ejs'), 'utf8');
    for (const image of [
        'jeddeta-football-terrain.jpg',
        'jeddeta-festival-joie.jpg',
        'jeddeta-equipe-championne-2026.jpg',
        'jeddeta-festival-2026.jpg',
        'jeddeta-equipe.jpg',
        'jeddeta-festival-rabita.jpg'
    ]) {
        assert.match(page, new RegExp(`/images/galerie/${image.replaceAll('.', '\\.')}`));
    }
});
