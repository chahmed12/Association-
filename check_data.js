require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT
});

async function checkData() {
    try {
        const tables = ['admins', 'membres', 'femmes', 'depenses', 'payments', 'nouveautes'];
        for (const table of tables) {
            const res = await db.query(`SELECT count(*) FROM "${table}"`);
            console.log(`${table}: ${res.rows[0].count}`);
        }
    } catch (err) {
        console.error("Erreur:", err.message);
    } finally {
        await db.end();
    }
}

checkData();
