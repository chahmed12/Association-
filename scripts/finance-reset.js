const db = require('../config/db');

const periods = [
    { mois: 12, annee: 2026 },
    { mois: 1, annee: 2027 },
    { mois: 2, annee: 2027 },
    { mois: 3, annee: 2027 },
    { mois: 4, annee: 2027 },
    { mois: 5, annee: 2027 },
    { mois: 6, annee: 2027 },
    { mois: 7, annee: 2027 },
    { mois: 8, annee: 2027 }
];

async function resetFinance() {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE payments, depenses RESTART IDENTITY');

        const { rows: membres } = await client.query('SELECT id FROM membres ORDER BY id');
        const values = [];
        const params = [];

        for (const membre of membres) {
            for (const periode of periods) {
                params.push(membre.id, periode.mois, periode.annee);
                values.push(`($${params.length - 2}, $${params.length - 1}, $${params.length})`);
            }
        }

        if (values.length > 0) {
            await client.query(
                `INSERT INTO payments (membre_id, mois, annee) VALUES ${values.join(', ')}`,
                params
            );
        }

        await client.query('COMMIT');
        console.log(`Cotisations generees: ${membres.length * periods.length} pour ${membres.length} membres`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

resetFinance()
    .then(() => db.end())
    .catch(async (err) => {
        console.error(err.message);
        await db.end();
        process.exitCode = 1;
    });
