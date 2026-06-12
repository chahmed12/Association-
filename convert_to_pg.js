const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'database_export.sql');
const outputFile = path.join(__dirname, 'database_export_pg.sql');

let sql = fs.readFileSync(inputFile, 'utf8');

// Supprimer les lignes de configuration spécifiques à MySQL
sql = sql.replace(/^\/\*!.*\*\//gm, '');
sql = sql.replace(/^-- MySQL dump.*/gm, '');
sql = sql.replace(/^-- Host:.*/gm, '');
sql = sql.replace(/^-- Server version.*/gm, '');
sql = sql.replace(/^-- Dump completed.*/gm, '');

// Supprimer LOCK TABLES et UNLOCK TABLES
sql = sql.replace(/^LOCK TABLES.*$/gm, '');
sql = sql.replace(/^UNLOCK TABLES;$/gm, '');

// Remplacer les backticks par des doubles guillemets
sql = sql.replace(/`/g, '"');

// Remplacer AUTO_INCREMENT par SERIAL et enlever les clés primaires de la définition de ligne (sauf la définition PK à la fin)
// Et les types INT
sql = sql.replace(/\bint\(\d+\)/gi, 'INTEGER');
sql = sql.replace(/\bint NOT NULL AUTO_INCREMENT\b/gi, 'SERIAL');
sql = sql.replace(/\btinyint\(\d+\)/gi, 'BOOLEAN');

// Enlever l'attribut ENGINE
sql = sql.replace(/\) ENGINE=InnoDB.*$/gm, ');');

// Enlever les contraintes de clés uniques inline ou COLLATE inutiles (simplification)
// On va juste nettoyer le ENGINE pour l'instant.
sql = sql.replace(/ COLLATE utf8mb4_0900_ai_ci/gi, '');
sql = sql.replace(/ COLLATE utf8mb4_unicode_ci/gi, '');
sql = sql.replace(/ CHARACTER SET utf8mb4/gi, '');

// Types PostgreSQL spécifiques
sql = sql.replace(/\bdatetime\b/gi, 'TIMESTAMP');

// Remplacer les champs JSON ou texte (mediumtext -> text)
sql = sql.replace(/\bmediumtext\b/gi, 'TEXT');

// Nettoyer les sauts de lignes multiples
sql = sql.replace(/\n{3,}/g, '\n\n');

// Extraire et nettoyer les définitions de tables pour éviter les problèmes avec SERIAL PRIMARY KEY
// (Pas strictement nécessaire si on a "SERIAL" et un "PRIMARY KEY" défini plus bas, PostgreSQL l'accepte)
// Mais parfois il peut y avoir des "AUTO_INCREMENT=X" sur la table.
sql = sql.replace(/\bAUTO_INCREMENT=\d+\b/gi, '');
sql = sql.replace(/\bDEFAULT CHARSET=utf8mb4\b/gi, '');
sql = sql.replace(/\bDEFAULT CHARSET=utf8mb\b/gi, '');

// Gérer les guillemets simples échappés de MySQL (\') vers PostgreSQL ('')
// On remplace \' par ''
sql = sql.replace(/\\'/g, "''");

fs.writeFileSync(outputFile, sql, 'utf8');
console.log('Conversion terminée. Fichier généré: database_export_pg.sql');
