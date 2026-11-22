const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'views/premium.ejs'), 'utf8');

test('l accueil affiche la statistique hommes et femmes', () => {
    const card = page.match(/id="statMembres"[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(card);
    assert.match(card[0], /رجال/);
    assert.match(card[0], /Hommes/);
    assert.doesNotMatch(card[0], />\s*Membres\s*</);
    assert.match(page, /id="statFemmes"/);
    assert.match(page, /Femmes/);
});
