const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'views/premium.ejs'), 'utf8');

test('la carte utilise le code Google Maps confirme', () => {
    assert.equal((page.match(/7C89P524%2B84/g) || []).length, 2);
    assert.doesNotMatch(page, /7C89X5MX/);
    assert.match(page, /maps\.google\.com\/maps\?q=7C89P524%2B84/);
    assert.match(page, /google\.com\/maps\/search\/\?api=1&query=7C89P524%2B84/);
});
