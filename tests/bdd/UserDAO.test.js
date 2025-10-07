/**
 * Tests pour UserDAO
 *
 * Tests unitaires pour le DAO spécialisé dans la gestion des utilisateurs
 * avec authentification, chiffrement des mots de passe et opérations CRUD.
 */

const UserDAO = require('../../bdd/UserDAO');

// Mocks
jest.mock('../../utils/logger', () => ({
  app: {
    error: jest.fn(),
  },
  activity: {
    error: jest.fn(),
  },
  system: {
    error: jest.fn(),
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const Logger = require('../../utils/logger');
const bcrypt = require('bcrypt');

describe('UserDAO', () => {
  let mockPool;
  let userDAO;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock du pool de base de données
    mockPool = {
      execute: jest.fn(),
    };

    userDAO = new UserDAO(mockPool);
  });

  describe('Initialisation', () => {
    test('devrait créer une instance correctement', () => {
      expect(userDAO.pool).toBe(mockPool);
    });
  });

  describe('Vérification des identifiants', () => {
    test('devrait vérifier les identifiants avec succès', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed_password',
        is_admin: 0,
      };

      mockPool.execute = jest.fn().mockResolvedValue([[mockUser]]);
      bcrypt.compare.mockResolvedValue(true);

      const result = await userDAO.verifyLogin('test@example.com', 'password123');

      expect(result).toEqual({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        is_admin: 0,
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
    });

    test("devrait retourner null si l'email n'existe pas", async () => {
      mockPool.execute.mockResolvedValue([[]]);

      const result = await userDAO.verifyLogin('nonexistent@example.com', 'password');

      expect(result).toBeNull();
    });

    test('devrait retourner null si le mot de passe est incorrect', async () => {
      const mockUser = { password: 'hashed_password' };

      mockPool.execute.mockResolvedValue([[mockUser]]);
      bcrypt.compare.mockResolvedValue(false);

      const result = await userDAO.verifyLogin('test@example.com', 'wrong_password');

      expect(result).toBeNull();
    });

    test('devrait gérer les erreurs de base de données', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      await expect(userDAO.verifyLogin('test@example.com', 'password')).rejects.toThrow(
        'Database error'
      );
      expect(Logger.app.error).toHaveBeenCalledWith(
        'Erreur lors de la vérification des identifiants:',
        expect.any(Error)
      );
    });
  });

  describe("Création d'utilisateur", () => {
    test('devrait créer un utilisateur avec succès', async () => {
      const mockCreatedUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        is_admin: 0,
        last_login: null,
        created_at: '2024-01-01 12:00:00',
      };

      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[]]) // Vérification email
        .mockResolvedValueOnce([{ insertId: 1 }]) // Insertion
        .mockResolvedValueOnce([[mockCreatedUser]]); // findById après création

      bcrypt.hash.mockResolvedValue('hashed_password_123');

      const result = await userDAO.createUser('test@example.com', 'password123', 'Test User');

      expect(result).toEqual({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        is_admin: 0,
        last_login: null,
        created_at: expect.any(String),
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
    });

    test("devrait échouer si l'email existe déjà", async () => {
      mockPool.execute.mockResolvedValue([[{ id: 1 }]]); // Email existe

      await expect(userDAO.createUser('existing@example.com', 'password', 'User')).rejects.toThrow(
        'Un utilisateur avec cet email existe déjà'
      );
    });

    test('devrait gérer les erreurs lors de la création', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[]]) // Email libre
        .mockRejectedValue(new Error('Insert failed')); // Échec insertion

      await expect(userDAO.createUser('test@example.com', 'password', 'User')).rejects.toThrow(
        'Insert failed'
      );
      expect(Logger.activity.error).toHaveBeenCalledWith(
        "Erreur lors de la création de l'utilisateur:",
        expect.any(Error)
      );
    });
  });

  describe('Récupération par ID', () => {
    test('devrait récupérer un utilisateur par son ID', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        is_admin: 1,
        last_login: '2024-01-01 12:00:00',
        created_at: '2024-01-01 10:00:00',
      };

      mockPool.execute = jest.fn().mockResolvedValue([[mockUser]]);

      const result = await userDAO.findById(1);

      expect(result).toEqual(mockUser);
    });

    test('devrait gérer les erreurs de récupération', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      await expect(userDAO.findById(1)).rejects.toThrow('Database error');
      expect(Logger.app.error).toHaveBeenCalledWith(
        "Erreur lors de la récupération de l'utilisateur:",
        expect.any(Error)
      );
    });
  });

  describe('Récupération de tous les utilisateurs', () => {
    test('devrait récupérer tous les utilisateurs avec pagination', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'user1@example.com',
          name: 'User 1',
          is_admin: 0,
          last_login: null,
          created_at: '2024-01-01',
          module_count: 2,
        },
        {
          id: 2,
          email: 'user2@example.com',
          name: 'User 2',
          is_admin: 1,
          last_login: null,
          created_at: '2024-01-01',
          module_count: 0,
        },
      ];

      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([mockUsers]) // Requête principale
        .mockResolvedValueOnce([[{ total: 2 }]]); // Comptage

      const result = await userDAO.findAll({ limit: 10, offset: 0 });

      expect(result).toHaveProperty('users', mockUsers);
      expect(result).toHaveProperty('total', 2);
    });

    test('devrait appliquer les filtres de recherche', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ total: 0 }]);

      await userDAO.findAll({
        search: 'test',
        filters: { role: 'admin', email: 'admin@example.com' },
      });

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        expect.arrayContaining(['%test%', '%test%', '%admin@example.com%'])
      );
    });

    test('devrait gérer le tri et la pagination', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ total: 0 }]);

      await userDAO.findAll({
        sortBy: 'email',
        sortOrder: 'DESC',
        limit: 5,
        offset: 15,
      });

      const query = mockPool.execute.mock.calls[0][0];
      expect(query).toMatch(/ORDER BY.*email.*DESC/i);
      expect(query).toMatch(/LIMIT.*5.*OFFSET.*15/i);
    });

    test('devrait filtrer par rôle utilisateur', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ total: 0 }]);

      await userDAO.findAll({
        filters: { role: 'user' },
      });

      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('u.is_admin = 0'),
        expect.any(Array)
      );
    });

    test('devrait gérer les filtres complexes dans le comptage', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ total: 1 }]);

      await userDAO.findAll({
        search: 'test',
        filters: { role: 'admin', module_count: '2' },
      });

      // Vérifier que la requête de comptage gère les filtres correctement
      const countCall = mockPool.execute.mock.calls[1];
      expect(countCall[0]).toMatch(/WHERE.*u\.is_admin = 1/);
    });

    test('devrait gérer le comptage avec recherche et filtres multiples', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ total: 1 }]);

      await userDAO.findAll({
        search: 'admin',
        filters: { name: 'John', role: 'user' },
      });

      // Vérifier que les conditions WHERE multiples sont gérées
      const countCall = mockPool.execute.mock.calls[1];
      expect(countCall[0]).toMatch(/WHERE.*AND.*u\.is_admin = 0/);
    });
  });

  describe('Mise à jour du profil', () => {
    test('devrait mettre à jour le profil avec succès', async () => {
      mockPool.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const result = await userDAO.updateProfile(1, { name: 'New Name', email: 'new@example.com' });

      expect(result).toBe(true);
      expect(mockPool.execute).toHaveBeenCalledWith(
        'UPDATE users SET name = ?, email = ? WHERE id = ?',
        ['New Name', 'new@example.com', 1]
      );
    });

    test('devrait ignorer les champs non autorisés', async () => {
      mockPool.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const result = await userDAO.updateProfile(1, {
        name: 'New Name',
        password: 'new_password', // Non autorisé
        is_admin: 1, // Non autorisé
      });

      expect(result).toBe(true);
      expect(mockPool.execute).toHaveBeenCalledWith('UPDATE users SET name = ? WHERE id = ?', [
        'New Name',
        1,
      ]);
    });

    test("devrait échouer si aucun champ n'est valide", async () => {
      await expect(userDAO.updateProfile(1, { password: 'new_pass' })).rejects.toThrow(
        'Aucun champ valide à mettre à jour'
      );
    });

    test('devrait gérer les erreurs de mise à jour', async () => {
      mockPool.execute.mockRejectedValue(new Error('Update failed'));

      await expect(userDAO.updateProfile(1, { name: 'New Name' })).rejects.toThrow('Update failed');
      expect(Logger.activity.error).toHaveBeenCalledWith(
        'Erreur lors de la mise à jour du profil:',
        expect.any(Error)
      );
    });
  });

  describe('Mise à jour de la dernière connexion', () => {
    test('devrait mettre à jour la dernière connexion', async () => {
      mockPool.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const result = await userDAO.updateLastLogin(1);

      expect(result).toBe(true);
      expect(mockPool.execute).toHaveBeenCalledWith(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [1]
      );
    });

    test('devrait gérer les erreurs', async () => {
      mockPool.execute.mockRejectedValue(new Error('Update failed'));

      await expect(userDAO.updateLastLogin(1)).rejects.toThrow('Update failed');
      expect(Logger.activity.error).toHaveBeenCalledWith(
        'Erreur lors de la mise à jour de la dernière connexion:',
        expect.any(Error)
      );
    });
  });

  describe("Vérification d'email", () => {
    test("devrait confirmer qu'un email existe", async () => {
      mockPool.execute = jest.fn().mockResolvedValue([[{ id: 1 }]]);

      const exists = await userDAO.emailExists('test@example.com');

      expect(exists).toBe(true);
    });

    test("devrait confirmer qu'un email n'existe pas", async () => {
      mockPool.execute = jest.fn().mockResolvedValue([[]]);

      const exists = await userDAO.emailExists('nonexistent@example.com');

      expect(exists).toBe(false);
    });

    test('devrait gérer les erreurs', async () => {
      mockPool.execute.mockRejectedValue(new Error('Database error'));

      await expect(userDAO.emailExists('test@example.com')).rejects.toThrow('Database error');
      expect(Logger.app.error).toHaveBeenCalledWith(
        "Erreur lors de la vérification de l'email:",
        expect.any(Error)
      );
    });
  });

  describe('Comptage des utilisateurs', () => {
    test("devrait compter le nombre total d'utilisateurs", async () => {
      mockPool.execute = jest.fn().mockResolvedValue([[{ total: 25 }]]);

      const count = await userDAO.count();

      expect(count).toBe(25);
    });

    test("devrait compter le nombre d'administrateurs", async () => {
      mockPool.execute = jest.fn().mockResolvedValue([[{ total: 3 }]]);

      const adminCount = await userDAO.countAdmins();

      expect(adminCount).toBe(3);
    });

    test('devrait gérer les erreurs de comptage', async () => {
      mockPool.execute.mockRejectedValue(new Error('Count failed'));

      await expect(userDAO.count()).rejects.toThrow('Count failed');
      expect(Logger.system.error).toHaveBeenCalledWith(
        'Erreur lors du comptage des utilisateurs:',
        expect.any(Error)
      );
    });
  });

  describe('Changement de mot de passe', () => {
    test('devrait changer le mot de passe avec succès', async () => {
      const mockUser = { id: 1, password: 'old_hashed_password' };

      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[mockUser]]) // Récupération utilisateur
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Mise à jour

      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('new_hashed_password');

      const result = await userDAO.changePassword(1, 'old_password', 'new_password');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('old_password', 'old_hashed_password');
      expect(bcrypt.hash).toHaveBeenCalledWith('new_password', 12);
    });

    test("devrait échouer si l'utilisateur n'existe pas", async () => {
      mockPool.execute.mockResolvedValue([[]]);

      await expect(userDAO.changePassword(999, 'old', 'new')).rejects.toThrow(
        'Utilisateur non trouvé'
      );
    });

    test("devrait échouer si l'ancien mot de passe est incorrect", async () => {
      const mockUser = { password: 'old_hashed' };

      mockPool.execute.mockResolvedValue([[mockUser]]);
      bcrypt.compare.mockResolvedValue(false);

      await expect(userDAO.changePassword(1, 'wrong_old', 'new')).rejects.toThrow(
        'Mot de passe actuel incorrect'
      );
    });

    test('devrait gérer les erreurs lors du changement', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[{ id: 1, password: 'hash' }]])
        .mockRejectedValue(new Error('Update failed'));

      bcrypt.compare.mockResolvedValue(true);

      await expect(userDAO.changePassword(1, 'old', 'new')).rejects.toThrow('Update failed');
      expect(Logger.activity.error).toHaveBeenCalledWith(
        'Erreur lors du changement de mot de passe:',
        expect.any(Error)
      );
    });
  });

  describe('Statistiques utilisateurs', () => {
    test('devrait calculer les statistiques complètes', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[{ total: 50 }]]) // Total
        .mockResolvedValueOnce([[{ total: 5 }]]) // Admins
        .mockResolvedValueOnce([[{ total: 30 }]]); // Actifs

      const stats = await userDAO.getStats();

      expect(stats).toEqual({
        total: 50,
        admins: 5,
        active: 30,
        regular: 45,
      });
    });

    test('devrait gérer les cas où les résultats de statistiques sont null', async () => {
      mockPool.execute = jest
        .fn()
        .mockResolvedValueOnce([[{ total: 10 }]]) // Total
        .mockResolvedValueOnce([[null]]) // Admins (null result)
        .mockResolvedValueOnce([[{ total: 5 }]]); // Actifs

      const stats = await userDAO.getStats();

      expect(stats).toEqual({
        total: 10,
        admins: 0, // Should default to 0 when null
        active: 5,
        regular: 10, // 10 - 0
      });
    });
  });
});
