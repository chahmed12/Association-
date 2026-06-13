const bcrypt = require('bcrypt');
const { Client } = require('pg');
require('dotenv').config();

async function fix() {
    const db = new Client({
        host: process.env.PGHOST || process.env.MYSQLHOST,
        user: process.env.PGUSER || process.env.MYSQLUSER,
        password: process.env.PGPASSWORD || process.env.MYSQLPASSWORD,
        database: process.env.PGDATABASE || process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
        port: process.env.PGPORT || process.env.MYSQLPORT || 5432
    });
    await db.connect();

    const hash = await bcrypt.hash('123456', 10);
    await db.query("DELETE FROM admins WHERE username = 'admin'");
    await db.query("INSERT INTO admins (username, password) VALUES ('admin', $1)", [hash]);

    console.log("✅ Compte 'admin' recréé avec le mot de passe : 123456");
    await db.end();
}

fix().catch(console.error);
