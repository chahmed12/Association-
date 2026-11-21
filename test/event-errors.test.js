const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('le formulaire evenement affiche les erreurs de validation detaillees', () => {
    const html = fs.readFileSync(path.join(root, 'prive/gestion-evenements.html'), 'utf8');
    assert.match(html, /Array\.isArray\(resultat\.errors\)/);
    assert.match(html, /resultat\.errors\.join/);
});

test('les uploads d’images ont un message Cloudinary explicite', () => {
    const api = fs.readFileSync(path.join(root, 'routes/api.js'), 'utf8');
    assert.match(api, /function handleImageUpload/);
    assert.match(api, /Vérifiez CLOUDINARY_URL sur Vercel/);
    assert.doesNotMatch(api, /router\.(post|put)\([^\n]*upload\.single\('image'\)/);
});
