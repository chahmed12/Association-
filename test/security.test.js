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
    if (query.includes('SELECT membre_id, mois FROM payments') || query.includes('SELECT * FROM payments')) {
        return { rows: [{ membre_id: 1, mois: 1 }, { membre_id: 1, mois: 2 }] };
    }
    if (query.includes('SELECT * FROM membres')) {
        return { rows: [{ id: 1, nom: 'Alpha', telephone: '12345678', montant: 2000 }] };
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
    assert.deepEqual(response.body[0].paiements, [1, 2]);
});

test('les routes sensibles exigent une session', async () => {
    for (const url of ['/api/cotisations', '/api/depenses', '/api/femmes', '/api/membres']) {
        const response = await request(app).get(url).expect(401);
        assert.equal(response.body.success, false);
    }
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
