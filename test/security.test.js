const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const bcrypt = require('bcrypt');
const request = require('supertest');

process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const db = require('../config/db');
const sessions = new Map();
const payments = new Set();
const exportLogs = [];
const adminHash = bcrypt.hashSync('mot-de-passe-test', 4);
const carteToken = 'b'.repeat(64);
const expireLe = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function resultFor(sql, params) {
    const query = String(sql);

    if (query.includes('SELECT to_regclass')) {
        return { rows: [{ to_regclass: '"sessions"' }] };
    }
    if (query.includes('SELECT sess FROM "sessions"')) {
        const sess = sessions.get(params[0]);
        return { rows: sess ? [{ sess }] : [] };
    }
    if (query.includes('INSERT INTO "sessions"')) {
        sessions.set(params[2], params[0]);
        return { rows: [{ sid: params[2] }] };
    }
    if (query.includes('DELETE FROM "sessions"')) {
        sessions.delete(params[0]);
        return { rows: [] };
    }
    if (query.includes('UPDATE "sessions"')) {
        return { rows: [{ sid: params[1] }] };
    }
    if (query.includes('SELECT id FROM admins WHERE username = $1')) {
        return { rows: [{ id: 1 }] };
    }
    if (query.includes('SELECT * FROM admins WHERE username = $1')) {
        return { rows: [{ username: 'admin', password: adminHash }] };
    }
    if (query.includes('SELECT nom, numero_adherent, carte_expire_le, actif FROM membres')) {
        if (params[0] === carteToken) {
            return { rows: [{ nom: 'Alpha', numero_adherent: 'MEM-0001', carte_expire_le: expireLe, actif: true }] };
        }
        return { rows: [] };
    }
    if (query.includes('SELECT * FROM inscriptions WHERE id = $1')) {
        return { rows: [{ id: 1, nom: 'Candidat Test', telephone: '12345678', situation: 'لا', montant: 1000, whatsapp: null, email: null, statut: 'en_attente' }] };
    }
    if (query.includes('SELECT * FROM inscriptions')) {
        return { rows: [{ id: 1, nom: 'Candidat Test', telephone: '12345678', situation: 'لا', statut: 'en_attente' }] };
    }
    if (query.includes('SELECT id FROM inscriptions WHERE telephone')) {
        return { rows: [] };
    }
    if (query.includes('INSERT INTO inscriptions')) {
        return { rows: [{ id: 91 }] };
    }
    if (query.includes('UPDATE inscriptions')) {
        return { rowCount: 1, rows: [] };
    }
    if (query.includes('SELECT COUNT(*)::int AS total FROM membres')) {
        return { rows: [{ total: 12 }] };
    }
    if (query.includes('SELECT COUNT(*)::int AS total FROM femmes')) {
        return { rows: [{ total: 7 }] };
    }
    if (query.includes('SELECT COUNT(*)::int AS total FROM nouveautes')) {
        return { rows: [{ total: 3 }] };
    }
    if (query.includes('INSERT INTO export_logs')) {
        exportLogs.push({ username: params[0], format: params[1], filters: params[2], rowsCount: params[3] });
        return { rows: [] };
    }
    if (query.includes('SELECT numero_adherent, nom, telephone, situation, montant, whatsapp, email, actif')) {
        return { rows: [
            { numero_adherent: 'MEM-0001', nom: 'Alpha', telephone: '12345678', situation: 'لا', montant: 2000, whatsapp: '12345678', email: 'alpha@example.com', actif: true },
            { numero_adherent: 'MEM-0002', nom: '=FORMULE()', telephone: '87654321', situation: 'نعم', montant: 2000, whatsapp: null, email: null, actif: false }
        ] };
    }
    if (query.includes('COALESCE(p.montant_snapshot, m.montant) AS montant')) {
        return { rows: [{ id: 7, nom: 'Alpha', telephone: '12345678', mois: 1, annee: 2027, montant: '2000.00', numero_recu: 'REC-7', created_at: '2027-01-15T10:00:00Z' }] };
    }
    if (query.includes('SELECT id, nom FROM membres')) {
        return { rows: [{ id: 1, nom: 'Alpha', telephone: '12345678', montant: 2000 }] };
    }
    if (query.includes('SELECT membre_id, mois, annee FROM payments')) {
        return { rows: [{ membre_id: 1, mois: 1, annee: 2027 }, { membre_id: 1, mois: 2, annee: 2027 }] };
    }
    if (query.includes('WITH removed AS') && query.includes('DELETE FROM payments')) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        const status = payments.delete(key) ? 'removed' : 'added';
        if (status === 'added') payments.add(key);
        return { rows: [{ status }] };
    }
    if (query.includes('SELECT * FROM payments WHERE')) {
        return { rows: [] };
    }
    if (query.includes('SELECT * FROM payments')) {
        return { rows: [{ membre_id: 1, mois: 1, annee: 2027 }] };
    }
    if (query.includes('SELECT * FROM membres WHERE id = $1')) {
        return { rows: [{ id: 1, nom: 'Alpha', telephone: '12345678', montant: 2000 }] };
    }
    if (query.includes('SELECT * FROM membres')) {
        return { rows: [{ id: 1, nom: 'Alpha', telephone: '12345678', montant: 2000 }] };
    }
    if (query.includes('INSERT INTO membres')) {
        return { rows: [{ id: 2 }] };
    }
    if (query.includes('UPDATE membres')) {
        return { rows: [] };
    }
    if (query.includes('DELETE FROM "sessions" WHERE expire')) {
        return { rows: [] };
    }
    return { rows: [] };
}

db.query = (sql, params, callback) => {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }
    const result = resultFor(sql, params || []);
    if (typeof callback === 'function') {
        callback(null, result);
        return undefined;
    }
    return Promise.resolve(result);
};

const app = require('../server');

test('les statistiques publiques ne renvoient que des compteurs', async () => {
    const response = await request(app).get('/api/public/stats').expect(200);
    assert.deepEqual(response.body, { membres: 12, femmes: 7, photos: 3 });
});

test('les cotisations publiques ne renvoient ni montant ni telephone', async () => {
    const response = await request(app).get('/api/public/cotisations').expect(200);
    assert.equal(response.body.length, 1);
    assert.deepEqual(Object.keys(response.body[0]).sort(), ['nom', 'paiements']);
    assert.deepEqual(response.body[0].paiements, [{ mois: 1, annee: 2027 }, { mois: 2, annee: 2027 }]);
});

test('les routes sensibles exigent une session', async () => {
    for (const url of [
        '/api/cotisations', '/api/depenses', '/api/femmes', '/api/membres', '/api/inscriptions',
        '/api/export/membres.csv', '/api/export/cotisations.csv', '/api/export/depenses.csv',
        '/api/recus/7', '/api/recus/membre/1?mois=1&annee=2027',
        '/api/notifications', '/api/membres/1/preferences'
    ]) {
        const response = await request(app).get(url).expect(401);
        assert.equal(response.body.success, false);
    }

    for (const url of [
        '/api/notifications', '/api/notifications/rappels-cotisations',
        '/api/inscriptions/1/valider', '/api/inscriptions/1/rejeter', '/api/membres/1/carte/token'
    ]) {
        const response = await request(app).post(url).send({ motif: 'Motif valide' }).expect(401);
        assert.equal(response.body.success, false);
    }

    const patchRes = await request(app).patch('/api/notifications/1').send({ action: 'envoye' }).expect(401);
    assert.equal(patchRes.body.success, false);

    const putRes = await request(app).put('/api/membres/1/preferences').send({ whatsapp_optin: true }).expect(401);
    assert.equal(putRes.body.success, false);
});

test('les écritures membres exigent une session', async () => {
    for (const method of ['post', 'put', 'delete']) {
        const response = await request(app)[method]('/api/membres/1').expect(401);
        assert.equal(response.body.success, false);
    }
    const creation = await request(app).post('/api/membres')
        .send({ nom: 'Beta', telephone: '00000000', situation: 'لا' })
        .expect(401);
    assert.equal(creation.body.success, false);
});

test('la page liste-membres redirige vers login sans session', async () => {
    await request(app).get('/liste-membres.html').expect(302).expect('Location', '/login.html');
});

test('la page gestion-notifications redirige vers login sans session', async () => {
    await request(app).get('/gestion-notifications.html').expect(302).expect('Location', '/login.html');
});

test('la page gestion-inscriptions redirige vers login sans session', async () => {
    await request(app).get('/gestion-inscriptions.html').expect(302).expect('Location', '/login.html');
});

test('inscription publique exige le consentement', async () => {
    const response = await request(app).post('/api/inscriptions')
        .send({ nom: 'Candidat Test', telephone: '12345678', situation: 'لا' })
        .expect(400);
    assert.equal(response.body.success, false);
    assert.ok(response.body.errors.some(message => /consentement/i.test(message)));
});

test('inscription publique renvoie un token en attente', async () => {
    const response = await request(app).post('/api/inscriptions')
        .send({
            nom: 'Candidat Test',
            telephone: '12345678',
            situation: 'نعم',
            whatsapp: '+222 12 34 56 78',
            email: 'candidat@example.com',
            consentement: true
        })
        .expect(202);
    assert.equal(response.body.success, true);
    assert.match(response.body.token, /^[0-9a-f]{64}$/);
});

test('la carte publique n expose que les champs autorises', async () => {
    const response = await request(app).get(`/api/carte/${carteToken}`).expect(200);
    assert.deepEqual(Object.keys(response.body).sort(), ['annee', 'expire_le', 'nom', 'numero_adherent', 'statut']);
    assert.equal(response.body.statut, 'valide');
    assert.equal(response.body.expire_le, expireLe);
});

test('un token de carte invalide ou inconnu est refuse', async () => {
    await request(app).get('/api/carte/pas-un-token').expect(400);
    await request(app).get(`/api/carte/${'c'.repeat(64)}`).expect(404);
});

test('le PDF de carte est public', async () => {
    const response = await request(app).get(`/api/carte/${carteToken}.pdf`).expect(200);
    assert.match(response.headers['content-type'], /application\/pdf/);
    assert.ok(response.body && response.body.length > 0);
});

test('moderation des inscriptions et renouvellement du token de carte', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login')
        .send({ username: 'admin', password: 'mot-de-passe-test' })
        .expect(200);

    const liste = await agent.get('/api/inscriptions?statut=en_attente').expect(200);
    assert.equal(liste.body.success, true);
    assert.equal(liste.body.inscriptions.length, 1);

    await agent.post('/api/inscriptions/1/rejeter').send({ motif: 'ab' }).expect(400);

    const valide = await agent.post('/api/inscriptions/1/valider').send({}).expect(200);
    assert.equal(valide.body.success, true);
    assert.equal(valide.body.numero_adherent, 'MEM-0002');
    assert.match(valide.body.carte_token, /^[0-9a-f]{64}$/);

    const rejet = await agent.post('/api/inscriptions/1/rejeter').send({ motif: 'Dossier incomplet' }).expect(200);
    assert.equal(rejet.body.success, true);

    const carte = await agent.post('/api/membres/1/carte/token').send({}).expect(200);
    assert.match(carte.body.token, /^[0-9a-f]{64}$/);
});

test('check-auth indique etat non connecte puis connecte', async () => {
    const agent = request.agent(app);
    await agent.get('/api/check-auth').expect(200, { authenticated: false });

    await agent.post('/api/login')
        .send({ username: 'admin', password: 'mot-de-passe-test' })
        .expect(200);

    await agent.get('/api/check-auth').expect(200, { authenticated: true });
    await agent.get('/api/cotisations').expect(200);

    const toggle = await agent.post('/api/cotisations/toggle')
        .send({ membre_id: 1, mois: 12, annee: 2026 })
        .expect(200);
    assert.deepEqual(toggle.body, { success: true, status: 'added' });

    const toggleOff = await agent.post('/api/cotisations/toggle')
        .send({ membre_id: 1, mois: 12, annee: 2026 })
        .expect(200);
    assert.deepEqual(toggleOff.body, { success: true, status: 'removed' });
});

test('le telechargement CSV avec session renvoie un BOM et un content-type CSV', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login')
        .send({ username: 'admin', password: 'mot-de-passe-test' })
        .expect(200);

    const response = await agent.get('/api/export/membres.csv').expect(200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.equal(response.headers['content-disposition'], 'attachment; filename="membres.csv"');
    assert.ok(response.text.startsWith('\uFEFF'));
    assert.match(response.text, /numéro adhérent/);
    assert.ok(response.text.includes('\'=FORMULE()'));
    assert.ok(response.text.includes('MEM-0001'));

    const log = exportLogs[exportLogs.length - 1];
    assert.equal(log.username, 'admin');
    assert.equal(log.format, 'csv');
    assert.deepEqual(JSON.parse(log.filters), {});
    assert.equal(log.rowsCount, 2);
});

test('toggle cotisation refuse les parametres invalides', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login')
        .send({ username: 'admin', password: 'mot-de-passe-test' })
        .expect(200);

    for (const payload of [
        { membre_id: 0, mois: 12, annee: 2026 },
        { membre_id: 'abc', mois: 12, annee: 2026 },
        { membre_id: 1, mois: 13, annee: 2026 },
        { membre_id: 1, mois: 0, annee: 2026 },
        { membre_id: 1, mois: 12, annee: 1999 },
        { membre_id: 1, mois: 12, annee: 2101 },
        { membre_id: 1, mois: 12, annee: 'abc' }
    ]) {
        const response = await agent.post('/api/cotisations/toggle').send(payload).expect(400);
        assert.equal(response.body.success, false);
    }
});

test('une route API inconnue renvoie un JSON 404', async () => {
    const response = await request(app).get('/api/route-inexistante').expect(404);
    assert.deepEqual(response.body, { success: false, message: 'Ressource introuvable' });
});

test('le serveur refuse de demarrer sans SESSION_SECRET', () => {
    const env = { ...process.env };
    delete env.SESSION_SECRET;
    const serverPath = path.resolve(__dirname, '../server.js');
    const run = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(serverPath)})`], {
        cwd: os.tmpdir(),
        env,
        encoding: 'utf8'
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /SESSION_SECRET est obligatoire/);
});
