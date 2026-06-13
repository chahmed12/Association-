require('dotenv').config();
const { Client } = require('pg');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Cloudinary se configure automatiquement via la variable CLOUDINARY_URL présente dans le .env

async function migrateImages() {
    // Connexion à la base de données (assurez-vous que votre .env pointe vers Render temporairement)
    const db = new Client({
        host: process.env.PGHOST || process.env.MYSQLHOST,
        user: process.env.PGUSER || process.env.MYSQLUSER,
        password: process.env.PGPASSWORD || process.env.MYSQLPASSWORD,
        database: process.env.PGDATABASE || process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE,
        port: process.env.PGPORT || process.env.MYSQLPORT || 5432,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await db.connect();
        console.log("✅ Connecté à la base de données.");

        // Sélectionner toutes les nouveautés dont l'URL commence par '/uploads/'
        const result = await db.query("SELECT * FROM nouveautes WHERE url LIKE '/uploads/%'");
        const nouveautes = result.rows;

        console.log(`🔎 ${nouveautes.length} anciennes images locales trouvées dans la base de données à migrer...`);

        for (let item of nouveautes) {
            const fileName = path.basename(item.url);
            const localPath = path.join(__dirname, 'public', 'uploads', fileName);

            if (fs.existsSync(localPath)) {
                console.log(`⏳ Téléversement de ${fileName}...`);
                try {
                    // Upload sur Cloudinary
                    const uploadResult = await cloudinary.uploader.upload(localPath, {
                        folder: 'association_images'
                    });
                    
                    // Mise à jour de l'URL dans la base de données
                    await db.query("UPDATE nouveautes SET url = $1 WHERE id = $2", [uploadResult.secure_url, item.id]);
                    console.log(`✅ Succès pour : ${item.titre}`);
                } catch (err) {
                    console.error(`❌ Erreur d'upload pour ${fileName}:`, err.message);
                }
            } else {
                console.log(`⚠️ Fichier introuvable localement (ignoré) : ${localPath}`);
            }
        }
        console.log("🎉 Migration terminée avec succès !");
    } catch (err) {
        console.error("❌ Erreur générale:", err);
    } finally {
        await db.end();
    }
}

migrateImages();
