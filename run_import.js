require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const db = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT
});

async function runImport() {
    try {
        const sql = fs.readFileSync('database_export_pg.sql', 'utf8');
        const statements = sql.split(';').filter(stmt => stmt.trim() !== '');
        
        console.log(`Exécution de ${statements.length} requêtes...`);
        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i].trim();
            if (stmt) {
                try {
                    await db.query(stmt);
                } catch (e) {
                    console.error(`Erreur à la requête ${i+1}: ${e.message}\nRequête: ${stmt.substring(0, 50)}...`);
                }
            }
        }
        
        const check = await db.query('SELECT count(*) FROM membres');
        console.log(`\nImportation terminée ! Nombre de membres : ${check.rows[0].count}`);
    } catch (err) {
        console.error("Erreur fatale :", err.message);
    } finally {
        await db.end();
    }
}

runImport();
