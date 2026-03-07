const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.query('SELECT 1', (err) => {
    if (err) console.error('❌ Erreur de connexion DB:', err.message);
    else console.log('✅ Connecté à MySQL (Pool Centralisé)');
});

module.exports = db;
