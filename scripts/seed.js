const bcrypt = require('bcrypt');
const db = require('../config/db');

async function seed() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) throw new Error('ADMIN_PASSWORD est obligatoire pour le seed');

    const hash = await bcrypt.hash(password, 10);
    await db.query(
        `INSERT INTO admins (username, password) VALUES ($1, $2)
         ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password`,
        [username, hash]
    );
    console.log('Compte admin pret');
}

seed()
    .then(() => db.end())
    .catch(async (err) => {
        console.error(err.message);
        await db.end();
        process.exitCode = 1;
    });
