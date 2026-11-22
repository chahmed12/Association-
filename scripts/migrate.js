const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const migrationsDir = path.join(__dirname, '../migrations');
const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

(async () => {
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await db.query(sql);
        console.log(`Migration appliquee: ${file}`);
    }
    await db.end();
})().catch(async (err) => {
    console.error('Migration echouee:', err.message);
    await db.end();
    process.exitCode = 1;
});
