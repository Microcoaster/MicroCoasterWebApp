-- Données initiales pour MicroCoaster WebApp
-- Ce script insère les utilisateurs et modules par défaut

-- Insertion des utilisateurs par défaut
-- Mot de passe: 'azerty' (sera haché par bcrypt avec 12 rounds)

INSERT INTO users (email, password, name, is_admin) VALUES 
('yamakajump@gmail.com', '$2a$10$T6cr2MdboBtLHAN3.RJdfOinxiqP3cQ1HZs97VErYDR2jYthBRZii', 'Admin Principal', TRUE),
('tristanjoncour29@gmail.com', '$2a$10$T6cr2MdboBtLHAN3.RJdfOinxiqP3cQ1HZs97VErYDR2jYthBRZii', 'Tristan Admin', TRUE),
('user@gmail.com', '$2a$10$T6cr2MdboBtLHAN3.RJdfOinxiqP3cQ1HZs97VErYDR2jYthBRZii', 'Utilisateur Test', FALSE)
ON DUPLICATE KEY UPDATE 
  password = VALUES(password),
  is_admin = VALUES(is_admin),
  name = VALUES(name);

-- Modules assignés à l'Admin Principal (yamakajump@gmail.com)
INSERT INTO modules (user_id, module_id, module_code, name, type, claimed) VALUES 
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-0001-AP', '123456', 'Audio Player Pro', 'Audio Player', TRUE),
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-1234-STN', '123456', 'Station Taron', 'Station', TRUE),
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-1234-LT', '1234-1234', 'Launch Track Taron', 'Launch Track', TRUE),
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-0001-STN', '123456789', 'Station Toutatis', 'Station', TRUE),
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-1802-LFX', '123456789', 'Light Effects Main', 'Light FX', TRUE),
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-0001-ST', '123456', 'Switch Track Alpha', 'Switch Track', TRUE)
ON DUPLICATE KEY UPDATE 
  user_id = VALUES(user_id),
  module_code = VALUES(module_code),
  name = VALUES(name), 
  type = VALUES(type),
  claimed = VALUES(claimed);

-- Modules assignés à Tristan Admin (tristanjoncour29@gmail.com)
INSERT INTO modules (user_id, module_id, module_code, name, type, claimed) VALUES 
((SELECT id FROM users WHERE email = 'tristanjoncour29@gmail.com'), 'MC-1803-STN', '1803-1803', 'Station Tristan', 'Station', TRUE),
((SELECT id FROM users WHERE email = 'tristanjoncour29@gmail.com'), 'MC-2308-LT', '2803-2803', 'Launch Track Beta', 'Launch Track', TRUE),
((SELECT id FROM users WHERE email = 'tristanjoncour29@gmail.com'), 'MC-0012-SM', '123456', 'Smoke Machine Alpha', 'Smoke Machine', TRUE)
ON DUPLICATE KEY UPDATE 
  user_id = VALUES(user_id),
  module_code = VALUES(module_code),
  name = VALUES(name), 
  type = VALUES(type),
  claimed = VALUES(claimed);

-- Modules assignés à l'Utilisateur Test (user@gmail.com)
INSERT INTO modules (user_id, module_id, module_code, name, type, claimed) VALUES 
((SELECT id FROM users WHERE email = 'user@gmail.com'), 'MC-1258-STN', '123456', 'Station Test User', 'Station', TRUE),
((SELECT id FROM users WHERE email = 'user@gmail.com'), 'MC-1802-STN', '1802-1802', 'Station Demo', 'Station', TRUE)
ON DUPLICATE KEY UPDATE 
  user_id = VALUES(user_id),
  module_code = VALUES(module_code),
  name = VALUES(name), 
  type = VALUES(type),
  claimed = VALUES(claimed);

-- Modules non assignés (disponibles pour claim)
INSERT INTO modules (user_id, module_id, module_code, name, type, claimed) VALUES 
(NULL, 'MC-9001-STN', '900001', 'Station Disponible 1', 'Station', FALSE),
(NULL, 'MC-9002-LT', '900002', 'Launch Track Libre', 'Launch Track', FALSE),
(NULL, 'MC-9003-LFX', '900003', 'Light FX Disponible', 'Light FX', FALSE),
(NULL, 'MC-9004-AP', '900004', 'Audio Player Libre', 'Audio Player', FALSE),
(NULL, 'MC-9005-SM', '900005', 'Smoke Machine Libre', 'Smoke Machine', FALSE),
(NULL, 'MC-9006-ST', '900006', 'Switch Track Disponible', 'Switch Track', FALSE)
ON DUPLICATE KEY UPDATE 
  module_code = VALUES(module_code),
  name = VALUES(name), 
  type = VALUES(type),
  claimed = VALUES(claimed);