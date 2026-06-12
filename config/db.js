const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
    host: process.env.PGHOST || process.env.MYSQLHOST,
    user: process.env.PGUSER || process.env.MYSQLUSER,
    password: process.env.PGPASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.PGDATABASE || process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
    port: process.env.PGPORT || process.env.MYSQLPORT || 5432,
    max: 10 // équivalent à connectionLimit
});

db.query('SELECT 1', (err) => {
    if (err) console.error('❌ Erreur de connexion DB:', err.message);
    else console.log('✅ Connecté à PostgreSQL (Pool Centralisé)');
});

module.exports = db;
