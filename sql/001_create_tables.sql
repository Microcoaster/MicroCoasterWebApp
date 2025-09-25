-- Création des tables pour MicroCoaster WebApp
-- Exécution: En mode développement, ce script est exécuté automatiquement au démarrage

-- Supprimer les tables existantes en mode développement (ordre important pour les FK)
DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS users;

-- Table des utilisateurs
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_is_admin (is_admin),
  INDEX idx_last_login (last_login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des modules
CREATE TABLE modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL, -- NULL pour les modules non assignés
  module_id VARCHAR(50) NOT NULL UNIQUE,
  module_code VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  type VARCHAR(50),
  claimed BOOLEAN DEFAULT FALSE,
  status ENUM('online', 'offline') DEFAULT 'offline',
  last_seen TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_module_id (module_id),
  INDEX idx_user_id (user_id),
  INDEX idx_claimed (claimed),
  INDEX idx_type (type),
  INDEX idx_status (status),
  INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;