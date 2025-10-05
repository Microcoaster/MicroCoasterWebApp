/**
 * Tests unitaires pour BaseDAO
 * @description Tests des méthodes de construction de requêtes SQL
 */

const BaseDAO = require('../../bdd/BaseDAO');

describe('BaseDAO - Tests unitaires', () => {
  let baseDAO;
  let mockPool;

  beforeEach(() => {
    // Mock du pool de connexions
    mockPool = {
      execute: jest.fn(),
    };
    baseDAO = new BaseDAO(mockPool);
  });

  describe('buildWhereClause', () => {
    test('doit construire une clause WHERE avec un filtre', () => {
      const filters = { name: 'test' };
      const result = baseDAO.buildWhereClause(filters);

      expect(result.whereClause).toBe('WHERE name LIKE ?');
      expect(result.params).toEqual(['%test%']);
    });

    test('doit construire une clause WHERE avec plusieurs filtres', () => {
      const filters = { name: 'test', type: 'admin' };
      const result = baseDAO.buildWhereClause(filters);

      expect(result.whereClause).toBe('WHERE name LIKE ? AND type LIKE ?');
      expect(result.params).toEqual(['%test%', '%admin%']);
    });

    test('doit retourner une clause vide si aucun filtre valide', () => {
      const filters = { name: '', type: null, status: undefined };
      const result = baseDAO.buildWhereClause(filters);

      expect(result.whereClause).toBe('');
      expect(result.params).toEqual([]);
    });

    test('doit ignorer les valeurs vides ou nulles', () => {
      const filters = { name: 'test', empty: '', nullValue: null, undefinedValue: undefined };
      const result = baseDAO.buildWhereClause(filters);

      expect(result.whereClause).toBe('WHERE name LIKE ?');
      expect(result.params).toEqual(['%test%']);
    });
  });

  describe('buildOrderByClause', () => {
    const validFields = ['name', 'created_at', 'id'];

    test('doit construire une clause ORDER BY valide', () => {
      const result = baseDAO.buildOrderByClause('name', 'ASC', validFields);
      expect(result).toBe('ORDER BY name ASC');
    });

    test('doit utiliser DESC par défaut si ordre invalide', () => {
      const result = baseDAO.buildOrderByClause('name', 'invalid', validFields);
      expect(result).toBe('ORDER BY name DESC');
    });

    test('doit utiliser le premier champ valide par défaut si champ invalide', () => {
      const result = baseDAO.buildOrderByClause('invalid_field', 'ASC', validFields);
      expect(result).toBe('ORDER BY name ASC');
    });

    test('doit gérer les champs et ordres valides', () => {
      const result = baseDAO.buildOrderByClause('created_at', 'DESC', validFields);
      expect(result).toBe('ORDER BY created_at DESC');
    });
  });

  describe('buildLimitClause', () => {
    test('doit construire une clause LIMIT avec offset', () => {
      const result = baseDAO.buildLimitClause(10, 20);
      expect(result).toBe('LIMIT 10 OFFSET 20');
    });

    test('doit convertir les valeurs en entiers', () => {
      const result = baseDAO.buildLimitClause('15', '30');
      expect(result).toBe('LIMIT 15 OFFSET 30');
    });

    test('doit gérer limit et offset à zéro', () => {
      const result = baseDAO.buildLimitClause(0, 0);
      expect(result).toBe('LIMIT 0 OFFSET 0');
    });
  });

  describe('Méthodes de base de données (avec mock)', () => {
    test('execute doit appeler pool.execute et retourner les résultats', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockPool.execute.mockResolvedValue([mockRows]);

      const result = await baseDAO.execute('SELECT * FROM test', [1]);

      expect(mockPool.execute).toHaveBeenCalledWith('SELECT * FROM test', [1]);
      expect(result).toEqual(mockRows);
    });

    test('findOne doit retourner le premier résultat ou null', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockPool.execute.mockResolvedValue([mockRows]);

      const result = await baseDAO.findOne('SELECT * FROM test WHERE id = ?', [1]);
      expect(result).toEqual({ id: 1, name: 'test' });

      // Test avec aucun résultat
      mockPool.execute.mockResolvedValue([[]]);
      const emptyResult = await baseDAO.findOne('SELECT * FROM test WHERE id = ?', [999]);
      expect(emptyResult).toBeNull();
    });

    test('findAll doit retourner tous les résultats', async () => {
      const mockRows = [{ id: 1 }, { id: 2 }];
      mockPool.execute.mockResolvedValue([mockRows]);

      const result = await baseDAO.findAll('SELECT * FROM test');
      expect(result).toEqual(mockRows);
    });

    test('insert doit retourner le résultat de l\'insertion', async () => {
      const mockResult = { insertId: 123, affectedRows: 1 };
      mockPool.execute.mockResolvedValue([mockResult]);

      const result = await baseDAO.insert('INSERT INTO test (name) VALUES (?)', ['test']);
      expect(result).toEqual(mockResult);
    });

    test('update doit retourner le résultat de la mise à jour', async () => {
      const mockResult = { affectedRows: 5 };
      mockPool.execute.mockResolvedValue([mockResult]);

      const result = await baseDAO.update('UPDATE test SET name = ? WHERE id = ?', ['new', 1]);
      expect(result).toEqual(mockResult);
    });

    test('delete doit retourner le résultat de la suppression', async () => {
      const mockResult = { affectedRows: 1 };
      mockPool.execute.mockResolvedValue([mockResult]);

      const result = await baseDAO.delete('DELETE FROM test WHERE id = ?', [1]);
      expect(result).toEqual(mockResult);
    });
  });
});
