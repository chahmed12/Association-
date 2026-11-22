const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function lire(chemin) {
    return fs.readFileSync(path.join(__dirname, '..', chemin), 'utf8');
}

test('la migration des cartes est idempotente et couvre les femmes', () => {
    const sql = lire('migrations/002_cartes.sql');
    assert.match(sql, /ALTER TABLE femmes/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS carte_token VARCHAR\(64\)/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS photo_url VARCHAR\(500\)/);
    assert.match(sql, /UPDATE femmes/);
    assert.match(sql, /WHERE numero_adherent IS NULL/);
    assert.match(sql, /WHERE carte_token IS NULL/);

    const runner = lire('scripts/migrate.js');
    assert.match(runner, /readdirSync/);
    assert.match(runner, /\.sql/);
    assert.match(runner, /sort\(\)/);
});

test('les validateurs acceptent un identifiant de carte', () => {
    const validators = lire('middleware/validators.js');
    assert.match(validators, /carteId: Joi\.object/);
});

test('l API gere les cartes hommes et femmes avec photo', () => {
    const api = lire('routes/api.js');
    assert.match(api, /FROM femmes WHERE carte_token = \$1/);
    assert.match(api, /async function renderCartePdf/);
    assert.match(api, /photoCarteBuffer/);
    assert.match(api, /router\.post\('\/carte\/:token\/photo'/);
    assert.match(api, /association_cartes/);
    assert.match(api, /router\.get\('\/femmes\/:id\/carte'/);
    assert.match(api, /router\.post\('\/femmes\/:id\/carte\/token'/);
});

test('la page carte propose la photo optionnelle', () => {
    const page = lire('public/carte.html');
    assert.match(page, /cartePhotoForm/);
    assert.match(page, /\/api\/carte\/\$\{encodeURIComponent\(carteActiveToken\)\}\/photo/);
    assert.match(page, /Photo \(optionnelle\)/);
});

test('l admin affiche le bouton token pour les hommes et les femmes', () => {
    const page = lire('prive/liste-membres.html');
    assert.match(page, /data-action="carte"/);
    assert.match(page, /data-source="hommes"/);
    assert.match(page, /data-source="femmes"/);
    assert.match(page, /handleCarteAction/);
    assert.match(page, /\/carte\/token/);
});
