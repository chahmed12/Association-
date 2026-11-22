const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function lire(chemin) {
    return fs.readFileSync(path.join(__dirname, '..', chemin), 'utf8');
}

test('les pages de tokens hommes et femmes sont separees et lecture seule', () => {
    const hommes = lire('prive/tokens-hommes.html');
    const femmes = lire('prive/tokens-femmes.html');

    assert.match(hommes, /const SOURCE = 'hommes'/);
    assert.match(hommes, /\/api\/cartes\/hommes\.csv/);
    assert.match(hommes, /Tokens Hommes/);
    assert.doesNotMatch(hommes, /\/api\/cartes\/femmes/);

    assert.match(femmes, /const SOURCE = 'femmes'/);
    assert.match(femmes, /\/api\/cartes\/femmes\.csv/);
    assert.match(femmes, /Tokens Femmes/);
    assert.doesNotMatch(femmes, /\/api\/cartes\/hommes/);

    for (const page of [hommes, femmes]) {
        assert.match(page, /ajj-back ajj-back--fixed/);
        assert.match(page, /Copier token/);
        assert.match(page, /Copier lien/);
        assert.doesNotMatch(page, /Régénérer/);
        assert.doesNotMatch(page, /\/carte\/token/);
    }
});

test('les routes privees et le menu admin exposent les deux listes', () => {
    const server = lire('server.js');
    assert.match(server, /app\.get\('\/tokens-hommes\.html', isAuthenticated/);
    assert.match(server, /app\.get\('\/tokens-femmes\.html', isAuthenticated/);

    const admin = lire('prive/admin.html');
    assert.match(admin, /href="\/tokens-hommes\.html"/);
    assert.match(admin, /href="\/tokens-femmes\.html"/);
});

test('les API de tokens ne permettent aucune regeneration', () => {
    const api = lire('routes/api.js');
    assert.match(api, /router\.use\('\/cartes', isAuthenticated\)/);
    assert.match(api, /router\.get\('\/cartes\/hommes\.csv'/);
    assert.match(api, /router\.get\('\/cartes\/femmes\.csv'/);
    assert.match(api, /router\.get\('\/cartes\/hommes'/);
    assert.match(api, /router\.get\('\/cartes\/femmes'/);
    assert.doesNotMatch(api, /router\.(post|put|patch|delete)\('\/cartes\//);
});
