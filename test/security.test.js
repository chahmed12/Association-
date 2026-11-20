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
const champsPublicsEvenement = ['id', 'titre', 'description', 'lieu', 'date_debut', 'date_fin', 'image_url', 'capacite'];
const evenements = [
    { id: 1, titre: 'Evenement Publie', description: 'Description', lieu: 'Jeddah', date_debut: '2030-06-01T10:00:00Z', date_fin: null, image_url: null, capacite: 2, statut: 'publie' },
    { id: 2, titre: 'Evenement Brouillon', description: 'Description', lieu: 'Jeddah', date_debut: '2030-07-01T10:00:00Z', date_fin: null, image_url: null, capacite: null, statut: 'brouillon' },
    { id: 3, titre: 'Evenement Passe', description: 'Description', lieu: 'Jeddah', date_debut: '2020-01-01T10:00:00Z', date_fin: null, image_url: null, capacite: 1, statut: 'publie' }
];
const rsvps = [];
let journalCreatedId = null;
const journalEntries = [
    { id: 1, nom: 'Auteur Public', message: 'Message public approuve par ladministration.', statut: 'publie', created_at: '2026-11-20T10:00:00Z', publie_at: '2026-11-20T10:01:00Z', traite_at: '2026-11-20T10:01:00Z', traite_par: 'admin' },
    { id: 2, nom: 'Auteur Attente', message: 'Message en attente de moderation ici.', statut: 'en_attente', created_at: '2026-11-20T11:00:00Z', publie_at: null, traite_at: null, traite_par: null }
];

function evenementPublic(event) {
    const publicEvent = {};
    for (const champ of champsPublicsEvenement) publicEvent[champ] = event[champ];
    return publicEvent;
}

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
    if (query.includes('DELETE FROM evenements')) {
        const index = evenements.findIndex(e => String(e.id) === String(params[0]));
        if (index >= 0) evenements.splice(index, 1);
        return { rowCount: 1, rows: [] };
    }
    if (query.includes('SELECT image_url FROM evenements')) {
        const event = evenements.find(e => String(e.id) === String(params[0]));
        return { rows: event ? [{ image_url: event.image_url }] : [] };
    }
    if (query.includes('SELECT statut, capacite FROM evenements')) {
        const event = evenements.find(e => String(e.id) === String(params[0]));
        return { rows: event ? [{ statut: event.statut, capacite: event.capacite }] : [] };
    }
    if (query.includes('FROM evenements e LEFT JOIN rsvps')) {
        let rows = evenements;
        if (params.length > 0) rows = rows.filter(e => e.statut === params[0]);
        return { rows: rows.map(e => ({
            ...e,
            rsvps_oui: rsvps.filter(r => r.evenement_id === e.id && r.reponse === 'oui').length
        })) };
    }
    if (query.includes('FROM evenements WHERE id = $1')) {
        const event = evenements.find(e => String(e.id) === String(params[0]) && e.statut === 'publie');
        return { rows: event ? [evenementPublic(event)] : [] };
    }
    if (query.includes('FROM evenements')) {
        let rows = evenements.filter(e => e.statut === 'publie');
        if (query.includes('date_debut >= NOW()')) {
            rows = rows.filter(e => new Date(e.date_debut).getTime() >= Date.now());
        }
        return { rows: rows.sort((a, b) => a.date_debut.localeCompare(b.date_debut)).map(evenementPublic) };
    }
    if (query.includes('INSERT INTO evenements')) {
        const event = {
            id: 10,
            titre: params[0],
            description: params[1],
            lieu: params[2],
            date_debut: params[3],
            date_fin: params[4],
            image_url: params[5],
            capacite: params[6],
            statut: params[7],
            created_by: params[8]
        };
        evenements.push(event);
        return { rows: [{ id: event.id }] };
    }
    if (query.includes('UPDATE evenements')) {
        return { rowCount: 1, rows: [] };
    }
    if (query.includes('SELECT id FROM rsvps WHERE evenement_id')) {
        const rows = query.includes('membre_id = $2')
            ? rsvps.filter(r => String(r.evenement_id) === String(params[0]) && String(r.membre_id) === String(params[1]))
            : rsvps.filter(r => String(r.evenement_id) === String(params[0]) && r.membre_id === null && String(r.telephone) === String(params[1]));
        return { rows };
    }
    if (query.includes('SELECT COUNT(*)::int AS total FROM rsvps')) {
        const total = rsvps.filter(r => String(r.evenement_id) === String(params[0]) && r.reponse === 'oui' && r.id !== Number(params[1])).length;
        return { rows: [{ total }] };
    }
    if (query.includes('SELECT GREATEST(')) {
        const capacite = Number(params[1]);
        const total = rsvps.filter(r => String(r.evenement_id) === String(params[0]) && r.reponse === 'oui').length;
        return { rows: [{ places_restantes: Math.max(capacite - total, 0) }] };
    }
    if (query.includes('INSERT INTO rsvps')) {
        const rsvp = {
            id: rsvps.length + 1,
            evenement_id: Number(params[0]),
            membre_id: params[1],
            nom_invite: params[2],
            telephone: params[3],
            reponse: params[4],
            note: params[5],
            token: params[6]
        };
        const conflict = query.includes('ON CONFLICT (evenement_id, membre_id)')
            ? rsvps.find(r => String(r.evenement_id) === String(rsvp.evenement_id) && String(r.membre_id) === String(rsvp.membre_id))
            : query.includes('ON CONFLICT (evenement_id, telephone)')
                ? rsvps.find(r => String(r.evenement_id) === String(rsvp.evenement_id) && r.membre_id === null && String(r.telephone) === String(rsvp.telephone))
                : null;
        if (conflict) {
            Object.assign(conflict, rsvp, { id: conflict.id });
            return { rows: [{ id: conflict.id, reponse: conflict.reponse, token: conflict.token }] };
        }
        rsvps.push(rsvp);
        return { rows: [{ id: rsvp.id, reponse: rsvp.reponse, token: rsvp.token }] };
    }
    if (query.includes('UPDATE rsvps SET reponse')) {
        const rsvp = rsvps.find(r => r.token === params[0]);
        if (!rsvp) return { rowCount: 0, rows: [] };
        rsvp.reponse = 'non';
        return { rowCount: 1, rows: [{ id: rsvp.id }] };
    }
    if (query.includes('FROM rsvps r LEFT JOIN membres')) {
        return { rows: rsvps.filter(r => String(r.evenement_id) === String(params[0])).map(r => ({ ...r, membre_nom: null })) };
    }
    if (query.includes("FROM journal_entries WHERE statut = 'publie'")) {
        return { rows: journalEntries.filter(entry => entry.statut === 'publie').map(entry => ({ id: entry.id, nom: entry.nom, message: entry.message, publie_at: entry.publie_at })) };
    }
    if (query.includes('INSERT INTO journal_entries')) {
        const entry = {
            id: journalEntries.length + 1,
            nom: params[0],
            message: params[1],
            statut: 'en_attente',
            created_at: new Date().toISOString(),
            publie_at: null,
            traite_at: null,
            traite_par: null
        };
        journalEntries.push(entry);
        return { rows: [{ id: entry.id, nom: entry.nom, message: entry.message, statut: entry.statut, created_at: entry.created_at }] };
    }
    if (query.includes('FROM journal_entries') && query.includes('ORDER BY created_at DESC')) {
        let rows = journalEntries;
        if (params.length > 0) rows = rows.filter(entry => entry.statut === params[0]);
        return { rows: rows.map(entry => ({ ...entry })) };
    }
    if (query.includes('UPDATE journal_entries')) {
        const entry = journalEntries.find(item => String(item.id) === String(params[2]));
        if (!entry) return { rowCount: 0, rows: [] };
        entry.statut = params[0];
        entry.publie_at = params[0] === 'publie' ? new Date().toISOString() : entry.publie_at;
        entry.traite_at = new Date().toISOString();
        entry.traite_par = params[1];
        return { rowCount: 1, rows: [{ ...entry }] };
    }
    if (query.includes('DELETE FROM journal_entries')) {
        const index = journalEntries.findIndex(entry => String(entry.id) === String(params[0]));
        if (index < 0) return { rowCount: 0, rows: [] };
        journalEntries.splice(index, 1);
        return { rowCount: 1, rows: [] };
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
        '/api/notifications', '/api/membres/1/preferences',
        '/api/admin/evenements', '/api/admin/journal', '/api/evenements/1/rsvps'
    ]) {
        const response = await request(app).get(url).expect(401);
        assert.equal(response.body.success, false);
    }

    for (const url of [
        '/api/notifications', '/api/notifications/rappels-cotisations',
        '/api/inscriptions/1/valider', '/api/inscriptions/1/rejeter', '/api/membres/1/carte/token',
        '/api/evenements'
    ]) {
        const response = await request(app).post(url).send({ motif: 'Motif valide' }).expect(401);
        assert.equal(response.body.success, false);
    }

    const patchRes = await request(app).patch('/api/notifications/1').send({ action: 'envoye' }).expect(401);
    assert.equal(patchRes.body.success, false);

    const journalPatch = await request(app).patch('/api/admin/journal/1').send({ statut: 'publie' }).expect(401);
    assert.equal(journalPatch.body.success, false);

    const putRes = await request(app).put('/api/membres/1/preferences').send({ whatsapp_optin: true }).expect(401);
    assert.equal(putRes.body.success, false);

    const eventPut = await request(app).put('/api/evenements/1').send({ titre: 'Titre modifie' }).expect(401);
    assert.equal(eventPut.body.success, false);

    const eventDelete = await request(app).delete('/api/evenements/1').expect(401);
    assert.equal(eventDelete.body.success, false);

    const journalDelete = await request(app).delete('/api/admin/journal/1').expect(401);
    assert.equal(journalDelete.body.success, false);
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

test('la page gestion-evenements redirige vers login sans session', async () => {
    await request(app).get('/gestion-evenements.html').expect(302).expect('Location', '/login.html');
});

test('la page gestion-journal redirige vers login sans session', async () => {
    await request(app).get('/gestion-journal.html').expect(302).expect('Location', '/login.html');
});

test('les evenements publics n exposent que les champs autorises', async () => {
    const response = await request(app).get('/api/evenements').expect(200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.evenements.length, 2);
    assert.deepEqual(Object.keys(response.body.evenements[0]).sort(), [...champsPublicsEvenement].sort());
    assert.ok(response.body.evenements.every(event => event.statut === undefined && event.created_by === undefined));
    assert.ok(response.body.evenements.every(event => event.titre !== 'Evenement Brouillon'));
});

test('le filtre avenir et un statut public ne levent pas le filtre publie', async () => {
    const future = await request(app).get('/api/evenements?avenir=1').expect(200);
    assert.equal(future.body.evenements.length, 1);
    assert.equal(future.body.evenements[0].id, 1);

    const ignored = await request(app).get('/api/evenements?statut=brouillon').expect(200);
    assert.equal(ignored.body.evenements.length, 2);

    await request(app).get('/api/evenements?avenir=0').expect(400);
});

test('le detail public refuse un evenement non publie', async () => {
    const response = await request(app).get('/api/evenements/1').expect(200);
    assert.deepEqual(Object.keys(response.body.evenement).sort(), [...champsPublicsEvenement].sort());
    await request(app).get('/api/evenements/2').expect(404);
    await request(app).get('/api/evenements/999').expect(404);
});

test('le RSVP public cree un token et met a jour la meme reponse', async () => {
    const first = await request(app).post('/api/evenements/1/rsvp')
        .send({ nom_invite: 'Invite Un', telephone: '12345678', reponse: 'oui', note: 'Premier' })
        .expect(200);
    assert.equal(first.body.success, true);
    assert.equal(first.body.reponse, 'oui');
    assert.match(first.body.token, /^[0-9a-f]{64}$/);
    assert.equal(first.body.places_restantes, 1);
    assert.equal(first.headers['ratelimit-limit'], '20');

    const second = await request(app).post('/api/evenements/1/rsvp')
        .send({ nom_invite: 'Invite Un', telephone: '12345678', reponse: 'non' })
        .expect(200);
    assert.equal(second.body.id, first.body.id);
    assert.equal(second.body.reponse, 'non');
    assert.equal(second.body.places_restantes, 2);

    const annulation = await request(app).post(`/api/rsvp/${second.body.token}/annuler`).expect(200);
    assert.equal(annulation.body.success, true);
    await request(app).post('/api/rsvp/pas-un-token/annuler').expect(400);
    await request(app).post(`/api/rsvp/${'d'.repeat(64)}/annuler`).expect(404);
});

test('la capacite bloque les nouveaux oui mais pas la mise a jour', async () => {
    const first = await request(app).post('/api/evenements/3/rsvp')
        .send({ nom_invite: 'Invite A', telephone: '11111111', reponse: 'oui' })
        .expect(200);
    assert.equal(first.body.places_restantes, 0);

    const refused = await request(app).post('/api/evenements/3/rsvp')
        .send({ nom_invite: 'Invite B', telephone: '22222222', reponse: 'oui' })
        .expect(409);
    assert.equal(refused.body.success, false);

    const update = await request(app).post('/api/evenements/3/rsvp')
        .send({ nom_invite: 'Invite A', telephone: '11111111', reponse: 'peut_etre' })
        .expect(200);
    assert.equal(update.body.id, first.body.id);
});

test('le RSVP exige une identite, un telephone valide et un evenement publie', async () => {
    await request(app).post('/api/evenements/1/rsvp')
        .send({ telephone: '12345678', reponse: 'oui' }).expect(400);
    await request(app).post('/api/evenements/2/rsvp')
        .send({ nom_invite: 'Invite', telephone: '33333333', reponse: 'oui' }).expect(404);
    await request(app).post('/api/evenements/1/rsvp')
        .send({ nom_invite: 'Invite', telephone: 'abc', reponse: 'oui' }).expect(400);
});

test('administration des evenements et liste des rsvps', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login')
        .send({ username: 'admin', password: 'mot-de-passe-test' })
        .expect(200);

    const created = await agent.post('/api/evenements').send({
        titre: 'Nouvel Evenement', description: 'Desc', lieu: 'Jeddah',
        date_debut: '2031-01-01T10:00:00Z', capacite: 10, statut: 'publie'
    }).expect(201);
    assert.equal(created.body.id, 10);

    const list = await agent.get('/api/admin/evenements').expect(200);
    assert.equal(list.body.evenements.length, 4);
    assert.equal(list.body.evenements[0].rsvps_oui, 0);

    const filtered = await agent.get('/api/admin/evenements?statut=brouillon').expect(200);
    assert.equal(filtered.body.evenements.length, 1);

    await agent.put('/api/evenements/1').send({ titre: 'Titre modifie' }).expect(200);
    await agent.delete('/api/evenements/10').expect(200);
    const afterDelete = await agent.get('/api/admin/evenements').expect(200);
    assert.equal(afterDelete.body.evenements.length, 3);

    const rsvpsList = await agent.get('/api/evenements/1/rsvps').expect(200);
    assert.equal(rsvpsList.body.rsvps.length, 1);
    assert.equal(rsvpsList.body.rsvps[0].telephone, '12345678');
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

test('/index.html redirige vers la racine premium', async () => {
    const response = await request(app).get('/index.html').expect(308);
    assert.equal(response.headers.location, '/');
});

test('le journal public n expose que les contributions publiees', async () => {
    const response = await request(app).get('/api/journal').expect(200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.entries.length, 1);
    assert.deepEqual(Object.keys(response.body.entries[0]).sort(), ['id', 'message', 'nom', 'publie_at']);
    assert.equal(response.body.entries[0].statut, undefined);
    assert.equal(response.body.entries[0].created_at, undefined);
});

test('le GET du journal n est pas soumis au limiteur de messages', async () => {
    for (let i = 0; i < 7; i += 1) {
        const response = await request(app).get('/api/journal').expect(200);
        assert.equal(response.body.success, true);
    }
});

test('le journal public cree une contribution en attente et valide les donnees', async () => {
    const created = await request(app).post('/api/journal')
        .send({ nom: 'Nouvel Auteur', message: 'Bonjour depuis le public du site.' })
        .expect(201);
    assert.equal(created.body.success, true);
    assert.equal(created.body.entry.statut, 'en_attente');
    journalCreatedId = created.body.entry.id;

    const invalid = await request(app).post('/api/journal')
        .send({ nom: 'A', message: 'court' })
        .expect(400);
    assert.equal(invalid.body.success, false);
});

test('moderation du journal par un admin', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login')
        .send({ username: 'admin', password: 'mot-de-passe-test' })
        .expect(200);

    const liste = await agent.get('/api/admin/journal').expect(200);
    assert.equal(liste.body.entries.length, 3);

    const enAttente = await agent.get('/api/admin/journal?statut=en_attente').expect(200);
    assert.equal(enAttente.body.entries.length, 2);
    assert.ok(enAttente.body.entries.every(entry => entry.statut === 'en_attente'));

    const publie = await agent.patch(`/api/admin/journal/${journalCreatedId}`)
        .send({ statut: 'publie' })
        .expect(200);
    assert.equal(publie.body.entry.statut, 'publie');
    assert.ok(publie.body.entry.publie_at);

    await agent.patch('/api/admin/journal/abc').send({ statut: 'publie' }).expect(400);
    await agent.patch('/api/admin/journal/999').send({ statut: 'publie' }).expect(404);
    await agent.patch('/api/admin/journal/1').send({ statut: 'autre' }).expect(400);

    const publies = await agent.get('/api/admin/journal?statut=publie').expect(200);
    assert.equal(publies.body.entries.length, 2);

    await agent.delete(`/api/admin/journal/${journalCreatedId}`).expect(200);
    const apresSuppression = await agent.get('/api/admin/journal').expect(200);
    assert.equal(apresSuppression.body.entries.length, 2);
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
