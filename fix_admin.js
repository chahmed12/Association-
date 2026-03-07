const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function fix() {
    const db = await mysql.createConnection({
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER,
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
        port: process.env.MYSQLPORT
    });

    const hash = await bcrypt.hash('123456', 10);
    await db.execute("DELETE FROM admins WHERE username = 'admin'");
    await db.execute("INSERT INTO admins (username, password) VALUES ('admin', ?)", [hash]);
    
    console.log("✅ Compte 'admin' recréé avec le mot de passe : 123456");
    await db.end();
}

fix().catch(console.error);
