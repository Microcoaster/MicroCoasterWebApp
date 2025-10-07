-- Données initiales pour MicroCoaster WebApp
-- Ce script insère les utilisateurs et modules par défaut

-- Insertion des utilisateurs par défaut
-- Mot de passe: 'azerty' (sera haché par bcrypt avec 12 rounds)

INSERT INTO users (email, password, name, is_admin) VALUES 
('yamakajump@gmail.com', '$2a$12$oF6Qg7bcYJCTHJu3c2KX0ugxGarg3wn7Xh5lKM/bHiczBB2dXnfdi', 'Admin Principal', TRUE), -- azerty
('tristanjoncour29@gmail.com', '$2a$12$oF6Qg7bcYJCTHJu3c2KX0ugxGarg3wn7Xh5lKM/bHiczBB2dXnfdi', 'Tristan Admin', TRUE), -- azerty
('user@gmail.com', '$2a$12$oF6Qg7bcYJCTHJu3c2KX0ugxGarg3wn7Xh5lKM/bHiczBB2dXnfdi', 'Utilisateur Test', FALSE) -- azerty
ON DUPLICATE KEY UPDATE 
  password = VALUES(password),
  is_admin = VALUES(is_admin),
  name = VALUES(name);

-- Modules assignés à l'Admin Principal (yamakajump@gmail.com)
INSERT INTO modules (user_id, module_id, module_code, module_password_hash, name, type) VALUES 
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-0001-AP', '0000-0001', '$2a$12$Npiedf4qUqvcGpcDrusC.uoOnqIfQBquPlhNpXPm.ivtScYkA3JS6', 'Audio Player Pro', 'Audio Player'), -- KKRBR8uOcijWdIxd3IbMU5BOF6kVFRIW
((SELECT id FROM users WHERE email = 'yamakajump@gmail.com'), 'MC-0001-ST', '0000-0002', '$2a$10$M9NDvuDEDAZbMMG4pghVuOOlb7fTpWuovdgLhpKnOGgYwXYGIaAu6', 'Switch Track Alpha', 'Switch Track') -- F674iaRftVsHGKOA8hq3TI93HQHUaYqZ
ON DUPLICATE KEY UPDATE 
  user_id = VALUES(user_id),
  module_code = VALUES(module_code),
  module_password_hash = VALUES(module_password_hash),
  name = VALUES(name), 
  type = VALUES(type);

-- Modules assignés à Tristan Admin (tristanjoncour29@gmail.com)
INSERT INTO modules (user_id, module_id, module_code, module_password_hash, name, type) VALUES 
((SELECT id FROM users WHERE email = 'tristanjoncour29@gmail.com'), 'MC-0002-ST', '0000-0003', '$2a$12$xYmPXBW9EgNuLEW4xa9zF.m/5HEtzDZ1qLT75Lrz1DpoSLG8ezoJS', 'Switch Track Tristan', 'Switch Track'), -- dzcZzgdJYprbFDyM0LC7KVJ2UafTQqYi
((SELECT id FROM users WHERE email = 'tristanjoncour29@gmail.com'), 'MC-0002-AP', '0000-0004', '$2a$12$uLXMxPdn9Ie6P8MWhbi6/.8GuRY9zLHRYzzCxazc5V3HuRPCxMIGi', 'Audio Player Tristan', 'Audio Player') -- lOqfAoxhRi2rU0uWd9OQf5jQsrbPfr1v
ON DUPLICATE KEY UPDATE  
  user_id = VALUES(user_id),
  module_code = VALUES(module_code),
  module_password_hash = VALUES(module_password_hash),
  name = VALUES(name), 
  type = VALUES(type);

-- Modules assignés à l'Utilisateur Test (user@gmail.com)
INSERT INTO modules (user_id, module_id, module_code, module_password_hash, name, type) VALUES 
((SELECT id FROM users WHERE email = 'user@gmail.com'), 'MC-0003-ST', '0000-0005', '$2a$12$uLXMxPdn9Ie6P8MWhbi6/.8GuRY9zLHRYzzCxazc5V3HuRPCxMIGi', 'Switch Track Test', 'Switch Track'), -- fuHOEsoVhY32BIxwrl2vcUeIxELLX00s
((SELECT id FROM users WHERE email = 'user@gmail.com'), 'MC-0003-AP', '0000-0006', '$2a$12$j0P2cgZ.H3ooXyBliTw/hO6svgTYG1YpWPVY.eW0W7pYOv5w1Ia2q', 'Audio Player Test', 'Audio Player') -- A7kdOKCbzoxIvyB6T0gx5lecZzYdoU3F
ON DUPLICATE KEY UPDATE 
  user_id = VALUES(user_id),
  module_code = VALUES(module_code),
  module_password_hash = VALUES(module_password_hash),
  name = VALUES(name), 
  type = VALUES(type);

-- Modules non assignés (disponibles pour claim)
INSERT INTO modules (user_id, module_id, module_code, module_password_hash, name, type) VALUES 
(NULL, 'MC-9004-AP', '0000-0007', '$2a$12$ViFkb3Ef4PpN5pvrY/xbJeMLjxBk/VzNY5Cl8i1xf/Yp4EwgtpeyK', 'Audio Player Libre', 'Audio Player'), -- O7guxoLx2DU6e7UUUSsWaRE3B67OYyy0
(NULL, 'MC-9006-ST', '0000-0008', '$2a$12$OYZmr3.7w/7kyYYtkqs1DORBs4Qy95dVyJ/5sMFrE6ivS.60E8yIO', 'Switch Track Disponible', 'Switch Track') -- 40PWQ6TckL5T0eMzSIbv8vWpJSdDdEGQ
ON DUPLICATE KEY UPDATE 
  module_code = VALUES(module_code),
  module_password_hash = VALUES(module_password_hash),
  name = VALUES(name), 
  type = VALUES(type);