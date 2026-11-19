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
const adminHash = bcrypt.hashSync('mot-de-passe-test', 4);

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
    if (query.includes('SELECT * FROM admins WHERE username = $1')) {
        return { rows: [{ username: 'admin', password: adminHash }] };
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
    for (const url of ['/api/cotisations', '/api/depenses', '/api/femmes', '/api/membres']) {
        const response = await request(app).get(url).expect(401);
        assert.equal(response.body.success, false);
    }
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
