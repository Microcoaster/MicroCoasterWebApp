const express = require('express');
const databaseManager = require('../bdd/DatabaseManager');
const { requireAuth } = require('./auth');
const Logger = require('../utils/logger');
const router = express.Router();

// Fonction helper pour déduire le type de module (portée de PHP)
function endsWithCi(haystack, needle) {
  if (needle.length === 0) return true;
  return haystack.toLowerCase().endsWith(needle.toLowerCase());
}

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

// Page principale des modules (remplace modules.php)
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;

    // Récupérer les informations utilisateur
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
      title: 'My Modules – MicroCoaster',
      currentPage: 'modules',
      modules,
      user: user, // Passer l'objet utilisateur complet avec isAdmin
      flash: req.query.flash || null,
    });
  } catch (error) {
    Logger.app.error('Error loading modules page:', error);
    res.status(500).render('modules', {
      title: 'My Modules – MicroCoaster',
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

// API pour récupérer les modules en JSON (pour AJAX)
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

// Claim/Ajouter un module (avec code de sécurité)
router.post('/claim', requireAuth, async (req, res) => {
  try {
    const { module_id, module_code, name } = req.body;
    const userId = req.session.user_id;

    // Validations
    if (!module_id || module_id.trim() === '') {
      return res.redirect('/modules?flash=' + encodeURIComponent('Module ID is required'));
    }

    if (!module_code || module_code.trim() === '') {
      return res.redirect('/modules?flash=' + encodeURIComponent('Module code is required'));
    }

    // Validation du format Module ID
    if (!/^MC-\d{4}-(STN|LFX|AP|SM|ST|LT)$/i.test(module_id.trim())) {
      return res.redirect(
        '/modules?flash=' + encodeURIComponent('Invalid Module ID format (expected MC-XXXX-(type))')
      );
    }

    // Validation du format Module Code
    if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(module_code.trim())) {
      return res.redirect(
        '/modules?flash=' + encodeURIComponent('Invalid module code format (expected XXXX-XXXX)')
      );
    }

    const moduleIdTrim = module_id.trim();
    const moduleCodeTrim = module_code.trim();
    const nameTrim = name?.trim() || null;

    // Inférer le type
    const type = mcInferType(moduleIdTrim, nameTrim);

    const databaseManager = require('../bdd/DatabaseManager');

    // Vérifier si le module existe déjà
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

// Ajouter un module (ancienne méthode - conservée pour compatibilité)
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

// Supprimer/Unclaim un module
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
    const databaseManager = require('../bdd/DatabaseManager');
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

// Mettre à jour un module
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
    const databaseManager = require('../bdd/DatabaseManager');
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
