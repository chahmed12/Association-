const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_init.sql'), 'utf8');

db.query(sql)
    .then(() => {
        console.log('Migration appliquee');
        return db.end();
    })
    .catch(async (err) => {
        console.error('Migration echouee:', err.message);
        await db.end();
        process.exitCode = 1;
    });
