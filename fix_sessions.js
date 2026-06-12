require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT
});

async function fixSessions() {
    try {
        console.log("Suppression de la table sessions...");
        await db.query('DROP TABLE IF EXISTS "sessions" CASCADE;');
        await db.query('DROP TABLE IF EXISTS session CASCADE;');
        console.log("Table supprimée avec succès. connect-pg-simple la recréera automatiquement au format correct.");
    } catch (err) {
        console.error("Erreur:", err);
    } finally {
        await db.end();
    }
}

fixSessions();
