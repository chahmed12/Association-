const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const publicBackFiles = [
    'public/agenda.html',
    'public/inscription-femmes.html',
    'public/inscription-hommes.html',
    'public/carte.html',
    'public/membres.html',
    'public/login.html',
    'public/nouveautes.html'
];
const adminBackFiles = [
    'prive/gestion-cotisations.html',
    'prive/gestion-depenses.html',
    'prive/gestion-evenements.html',
    'prive/gestion-inscriptions.html',
    'prive/gestion-journal.html',
    'prive/gestion-notifications.html',
    'prive/gestion-nouveautes.html',
    'prive/liste-membres.html',
    'prive/suivi-cotisations.html'
];
const legacyFiles = [
    'views/premium.ejs',
    'views/partials/header.ejs',
    'public/legacy-index.html',
    'public/index-3d-test.html'
];

function lire(relatif) {
    return fs.readFileSync(path.join(root, relatif), 'utf8');
}

function ancres(html) {
    return html.match(/<a\b[^>]*>/g) || [];
}

function backFixe(html) {
    return ancres(html).filter((ancre) => /\bajj-back--fixed\b/.test(ancre));
}

function attribut(ancre, nom) {
    const correspondance = ancre.match(new RegExp(`${nom}="([^"]*)"`));
    return correspondance ? correspondance[1] : null;
}

test('les retours publics utilisent un seul composant fixe vers /', () => {
    for (const relatif of publicBackFiles) {
        const html = lire(relatif);
        const boutons = backFixe(html);
        assert.equal(boutons.length, 1, `${relatif} doit avoir un seul retour fixe`);
        assert.equal(attribut(boutons[0], 'href'), '/', `${relatif} doit renvoyer vers /`);
        assert.match(boutons[0], /\bajj-back\b/);
    }
});

test('les retours admin utilisent un seul composant fixe vers /admin.html', () => {
    for (const relatif of adminBackFiles) {
        const html = lire(relatif);
        const boutons = backFixe(html);
        assert.equal(boutons.length, 1, `${relatif} doit avoir un seul retour fixe`);
        assert.equal(attribut(boutons[0], 'href'), '/admin.html', `${relatif} doit renvoyer vers /admin.html`);
        assert.match(boutons[0], /\bajj-back\b/);
    }
});

test('aucun ancien libellé ni double état de retour ne subsiste', () => {
    for (const relatif of [...publicBackFiles, ...adminBackFiles]) {
        const html = lire(relatif);
        assert.doesNotMatch(html, /←\s*(Accueil|Retour Dashboard)|Retour Admin|adminBackButton|homeBackButton|Retour \/ العودة/, relatif);
        assert.doesNotMatch(html, /\/suivi-dons\.html/, relatif);
    }
});

test('le modificateur dark n’est utilisé que sur les pages avec #darkToggle', () => {
    for (const relatif of [...publicBackFiles, ...adminBackFiles]) {
        const html = lire(relatif);
        if (/\bajj-back--with-dark\b/.test(html)) {
            assert.match(html, /id="darkToggle"/, `${relatif} n'a pas de darkToggle`);
        }
    }
});

test('les liens publics depuis l’admin sont des sorties explicites', () => {
    for (const relatif of adminBackFiles) {
        const html = lire(relatif);
        for (const ancre of ancres(html)) {
            if (attribut(ancre, 'href') === '/') {
                assert.match(ancre, /\bajj-exit-link\b/, `${relatif} contient un retour admin vers /`);
            }
        }
    }
});

test('tous les boutons retour en haut partagent le composant .ajj-back-top', () => {
    for (const relatif of [...publicBackFiles, ...adminBackFiles, ...legacyFiles]) {
        const chemin = path.join(root, relatif);
        if (!fs.existsSync(chemin)) continue;
        const html = lire(relatif);
        const boutons = html.match(/<button\b[^>]*id="scrollTop"[^>]*>/g) || [];
        for (const bouton of boutons) {
            assert.match(bouton, /\bajj-back-top\b/, `${relatif} doit utiliser .ajj-back-top`);
            assert.doesNotMatch(bouton, /style="[^"]*position:\s*fixed/, `${relatif} ne doit pas garder de style inline`);
        }
    }
});

test('le CSS compilé contient les composants partagés', () => {
    const css = lire('public/css/app.css');
    assert.match(css, /\.ajj-back/);
    assert.match(css, /\.ajj-back--fixed/);
    assert.match(css, /\.ajj-back-top/);
    assert.match(css, /\.ajj-exit-link/);
});
