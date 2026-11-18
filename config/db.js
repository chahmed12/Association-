const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
    host: process.env.PGHOST || process.env.MYSQLHOST,
    user: process.env.PGUSER || process.env.MYSQLUSER,
    password: process.env.PGPASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.PGDATABASE || process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
    port: process.env.PGPORT || process.env.MYSQLPORT || 5432,
    max: 25 // Augmenté pour gérer 200-300 utilisateurs simultanés (Render free = 50 max)
});

module.exports = db;
