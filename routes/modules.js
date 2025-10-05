/**
 * Routes de gestion des modules - Interface modules utilisateur
 *
 * Gère la gestion complète des modules IoT incluant l'ajout, suppression,
 * mise à jour, claim et inférence automatique des types de modules.
 *
 * @module modules
 * @description Routes de gestion des modules avec claim, CRUD et inférence de types
 */

const express = require('express');
const databaseManager = require('../bdd/DatabaseManager');
const { requireAuth } = require('./auth');
const Logger = require('../utils/logger');
const router = express.Router();

/**
 * Vérifie si une chaîne se termine par un suffixe (insensible à la casse)
 * @param {string} haystack - Chaîne à vérifier
 * @param {string} needle - Suffixe recherché
 * @returns {boolean} True si la chaîne se termine par le suffixe
 * @private
 */
function endsWithCi(haystack, needle) {
  if (needle.length === 0) return true;
  return haystack.toLowerCase().endsWith(needle.toLowerCase());
}

/**
 * Infère automatiquement le type d'un module depuis son ID ou nom
 * Utilise les conventions de nommage MicroCoaster pour déterminer le type
 * @param {string} moduleId - ID du module (ex: MC-0001-STN)
 * @param {string} [name=''] - Nom optionnel du module
 * @returns {string} Type inféré (Station, Launch Track, Switch Track, etc.)
 * @private
 */
function mcInferType(moduleId, name = '') {
  const mid = moduleId?.toUpperCase().trim() || '';
  if (endsWithCi(mid, 'STN')) return 'Station';
  if (endsWithCi(mid, 'LFX')) return 'Light FX';
  if (endsWithCi(mid, 'AP')) return 'Audio Player';
  if (endsWithCi(mid, 'SM')) return 'Smoke Machine';
  if (endsWithCi(mid, 'ST')) return 'Switch Track';
  if (endsWithCi(mid, 'LT')) return 'Launch Track';

  const nm = name?.toUpperCase().trim() || '';
  if (endsWithCi(nm, ' STN')) return 'Station';
  if (endsWithCi(nm, ' LFX')) return 'Light FX';
  if (endsWithCi(nm, ' AP')) return 'Audio Player';
  if (endsWithCi(nm, ' SM')) return 'Smoke Machine';
  if (endsWithCi(nm, ' ST')) return 'Switch Track';
  if (endsWithCi(nm, ' LT')) return 'Launch Track';

  return 'Unknown';
}

/**
 * Route principale de la page de gestion des modules
 * Affiche la liste des modules de l'utilisateur avec inférence automatique des types
 * @param {Request} req - Requête Express avec session utilisateur authentifiée
 * @param {Response} res - Réponse Express pour rendu de vue modules
 * @returns {Promise<void>}
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;

    const user = await databaseManager.users.findById(userId);
    if (!user) {
      return res.redirect('/logout');
    }

    // Récupérer tous les modules de l'utilisateur
    const modules = await databaseManager.modules.findByUserId(userId);

    // Inférer les types manquants
    modules.forEach(module => {
      if (!module.type) {
        module.type = mcInferType(module.module_id, module.name);
      }
    });

    // Rendu de la page
    res.render('modules', {
      currentPage: 'modules',
      modules,
      user: user, // Passer l'objet utilisateur complet avec isAdmin
      flash: req.query.flash || null,
    });
  } catch (error) {
    Logger.app.error('Error loading modules page:', error);
    res.status(500).render('modules', {
      modules: [],
      user: {
        id: req.session.user_id,
        code: req.session.code,
        name: req.session.nickname,
        isAdmin: req.session.isAdmin || false,
      },
      flash: 'Database error occurred',
    });
  }
});

/**
 * API de récupération des modules en format JSON
 * Fournit la liste des modules de l'utilisateur pour les requêtes AJAX
 * @param {Request} req - Requête Express avec session utilisateur authentifiée
 * @param {Response} res - Réponse JSON avec liste des modules
 * @returns {Promise<void>}
 */
router.get('/api', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;
    const modules = await databaseManager.modules.findByUserId(userId);

    // Inférer les types manquants
    modules.forEach(module => {
      if (!module.type) {
        module.type = mcInferType(module.module_id, module.name);
      }
    });

    res.json({ success: true, modules });
  } catch (error) {
    Logger.modules.error('Error fetching modules:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * Route de revendication (claim) d'un module avec code de sécurité
 * Permet à un utilisateur de revendiquer un module avec validation du code sécurisé
 * @param {Request} req - Requête Express avec données module_id, module_code, name
 * @param {Response} res - Réponse Express avec redirection et message de statut
 * @returns {Promise<void>}
 */
router.post('/claim', requireAuth, async (req, res) => {
  try {
    const { module_id, module_code, name } = req.body;
    const userId = req.session.user_id;

    if (!module_id || module_id.trim() === '') {
      return res.redirect('/modules?flash=' + encodeURIComponent('Module ID is required'));
    }

    if (!module_code || module_code.trim() === '') {
      return res.redirect('/modules?flash=' + encodeURIComponent('Module code is required'));
    }

    if (!/^MC-\d{4}-(STN|LFX|AP|SM|ST|LT)$/i.test(module_id.trim())) {
      return res.redirect(
        '/modules?flash=' + encodeURIComponent('Invalid Module ID format (expected MC-XXXX-(type))')
      );
    }

    if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(module_code.trim())) {
      return res.redirect(
        '/modules?flash=' + encodeURIComponent('Invalid module code format (expected XXXX-XXXX)')
      );
    }

    const moduleIdTrim = module_id.trim();
    const moduleCodeTrim = module_code.trim();
    const nameTrim = name?.trim() || null;
    const type = mcInferType(moduleIdTrim, nameTrim);

    const databaseManager = require('../bdd/DatabaseManager');

    const [existingModules] = await databaseManager.execute(
      'SELECT id, user_id, claimed, module_code FROM modules WHERE module_id = ? LIMIT 1',
      [moduleIdTrim]
    );

    if (existingModules.length === 0) {
      return res.redirect('/modules?flash=' + encodeURIComponent('Unknown module ID'));
    }

    const existingModule = existingModules[0];

    // Vérifier le code du module (simple comparaison pour l'instant - à améliorer avec hash si nécessaire)
    if (existingModule.module_code !== moduleCodeTrim) {
      return res.redirect('/modules?flash=' + encodeURIComponent('Wrong module code'));
    }

    // Vérifier si le module est déjà claimé
    if (existingModule.claimed === 1) {
      if (existingModule.user_id === userId) {
        return res.redirect(
          '/modules?flash=' + encodeURIComponent('This module is already in your list')
        );
      } else {
        return res.redirect(
          '/modules?flash=' +
            encodeURIComponent('This module has already been claimed by another user')
        );
      }
    }

    // Claim le module
    await databaseManager.execute(
      `
      UPDATE modules 
      SET user_id = ?, name = ?, type = ?, claimed = 1, updated_at = NOW()
      WHERE id = ? AND claimed = 0
    `,
      [userId, nameTrim, type, existingModule.id]
    );

    // Émettre événement temps réel : module ajouté
    if (req.app.locals.realTimeAPI) {
      req.app.locals.realTimeAPI.emitModuleAdded({
        module_id: moduleIdTrim,
        name: nameTrim,
        type: type,
        userId: userId,
        claimed: true,
        updatedAt: new Date(),
      });
    }

    Logger.activity.info(`✅ Module claimed: ${moduleIdTrim} (${type}) by user ${userId}`);
    res.redirect('/modules?flash=' + encodeURIComponent('Module added successfully'));
  } catch (error) {
    Logger.modules.error('Error claiming module:', error);
    res.redirect('/modules?flash=' + encodeURIComponent('Database error occurred'));
  }
});

/**
 * Route d'ajout direct d'un module (méthode legacy)
 * Ajoute directement un module sans validation de code sécurisé (compatibilité)
 * @param {Request} req - Requête Express avec données module_id, name
 * @param {Response} res - Réponse Express avec redirection et message de statut
 * @returns {Promise<void>}
 * @deprecated Utiliser /claim avec code de sécurité à la place
 */
router.post('/add', requireAuth, async (req, res) => {
  try {
    const { module_id, name } = req.body;
    const userId = req.session.user_id;

    if (!module_id || module_id.trim() === '') {
      return res.redirect('/modules?flash=' + encodeURIComponent('Module ID is required'));
    }

    // Inférer le type
    const type = mcInferType(module_id, name);

    // Ajouter le module en base
    const databaseManager = require('../bdd/DatabaseManager');
    await databaseManager.execute(
      `
      INSERT INTO modules (user_id, module_id, name, type, claimed, created_at)
      VALUES (?, ?, ?, ?, 1, NOW())
    `,
      [userId, module_id.trim(), name?.trim() || null, type]
    );

    // Émettre événement temps réel : module ajouté
    if (req.app.locals.realTimeAPI) {
      req.app.locals.realTimeAPI.emitModuleAdded({
        module_id: module_id.trim(),
        name: name?.trim() || null,
        type: type,
        userId: userId,
        claimed: true,
        createdAt: new Date(),
      });
    }

    Logger.activity.info(`➕ Module added: ${module_id} (${type}) by user ${userId}`);
    res.redirect('/modules?flash=' + encodeURIComponent('Module added successfully'));
  } catch (error) {
    Logger.modules.error('Error adding module:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      res.redirect('/modules?flash=' + encodeURIComponent('Module already exists'));
    } else {
      res.redirect('/modules?flash=' + encodeURIComponent('Error adding module'));
    }
  }
});

/**
 * Route de suppression/libération d'un module
 * Libère un module revendiqué (unclaim) plutôt que de le supprimer définitivement
 * @param {Request} req - Requête Express avec paramètre moduleId
 * @param {Response} res - Réponse JSON avec confirmation ou erreur
 * @returns {Promise<void>}
 */
router.post('/delete/:moduleId', requireAuth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.session.user_id;

    // Vérifier que le module appartient à l'utilisateur
    const moduleResult = await databaseManager.execute(
      'SELECT * FROM modules WHERE module_id = ? AND user_id = ? LIMIT 1',
      [moduleId, userId]
    );
    if (!moduleResult || moduleResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    // Unclaim le module (au lieu de le supprimer complètement)
    await databaseManager.execute(
      `
      UPDATE modules 
      SET claimed = 0, user_id = NULL, name = NULL, updated_at = NOW()
      WHERE module_id = ? AND user_id = ?
    `,
      [moduleId, userId]
    );

    // Émettre événement temps réel : module supprimé
    if (req.app.locals.realTimeAPI) {
      req.app.locals.realTimeAPI.emitModuleRemoved({
        module_id: moduleId,
        userId: userId,
        claimed: false,
        updatedAt: new Date(),
      });
    }

    Logger.activity.info(`🗑️ Module unclaimed: ${moduleId} by user ${userId}`);
    res.json({ success: true, message: 'Module deleted successfully' });
  } catch (error) {
    Logger.modules.error('Error unclaiming module:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * Route de mise à jour des informations d'un module
 * Met à jour le nom et/ou le type d'un module appartenant à l'utilisateur
 * @param {Request} req - Requête Express avec paramètre moduleId et données name, type
 * @param {Response} res - Réponse JSON avec confirmation ou erreur
 * @returns {Promise<void>}
 */
router.post('/update/:moduleId', requireAuth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { name, type } = req.body;
    const userId = req.session.user_id;

    // Vérifier que le module appartient à l'utilisateur
    const moduleResult = await databaseManager.execute(
      'SELECT * FROM modules WHERE module_id = ? AND user_id = ? LIMIT 1',
      [moduleId, userId]
    );
    if (!moduleResult || moduleResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    // Mettre à jour le module
    const finalType = type || mcInferType(moduleId, name);
    await databaseManager.execute(
      `
      UPDATE modules 
      SET name = ?, type = ?, updated_at = NOW()
      WHERE module_id = ? AND user_id = ?
    `,
      [name?.trim() || null, finalType, moduleId, userId]
    );

    // Émettre événement temps réel : module mis à jour
    if (req.app.locals.realTimeAPI) {
      req.app.locals.realTimeAPI.emitModuleUpdated({
        module_id: moduleId,
        name: name?.trim() || null,
        type: finalType,
        userId: userId,
        updatedAt: new Date(),
      });
    }

    Logger.activity.info(`📝 Module updated: ${moduleId} by user ${userId}`);
    res.json({ success: true, message: 'Module updated successfully' });
  } catch (error) {
    Logger.modules.error('Error updating module:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

module.exports = router;
