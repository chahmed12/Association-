-- Script SQL pour créer les tables nécessaires
-- Exécutez ce script dans phpMyAdmin ou MySQL Workbench

-- Table pour les inscriptions des femmes (sans montant ni situation)
CREATE TABLE IF NOT EXISTS femmes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    telephone VARCHAR(50) NOT NULL,
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les nouveautés (images)
CREATE TABLE IF NOT EXISTS nouveautes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titre VARCHAR(255),
    url VARCHAR(500) NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vérifier que la table membres existe déjà (pour les hommes)
-- Si elle n'existe pas, la créer
CREATE TABLE IF NOT EXISTS membres (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    telephone VARCHAR(50) NOT NULL,
    situation VARCHAR(50) NOT NULL,
    montant INT NOT NULL,
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les paiements (modifié de paiements -> payments)
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    membre_id INT NOT NULL,
    mois INT NOT NULL,
    FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE
);

-- Insérer quelques exemples de nouveautés
INSERT INTO nouveautes (titre, url, date) VALUES 
('Événement culturel 2026', '/uploads/event1.png', NOW()),
('Activité sportive', '/uploads/event2.png', NOW());
