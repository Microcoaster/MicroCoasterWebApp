const express = require('express');
const { getUserModules, getModule, verifyAccessCode } = require('../models/database');
const { requireAuth } = require('./auth');
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
    const user = await verifyAccessCode(req.session.code);
    if (!user) {
      return res.redirect('/logout');
    }

    // Récupérer tous les modules de l'utilisateur
    const modules = await getUserModules(userId);
    
    // Inférer les types manquants
    modules.forEach(module => {
      if (!module.type) {
        module.type = mcInferType(module.module_id, module.name);
      }
    });

    // Rendu de la page
    res.render('modules', {
      title: 'My Modules – MicroCoaster',
      modules,
      user: {
        id: user.id,
        code: user.code,
        name: user.name
      },
      flash: req.query.flash || null
    });

  } catch (error) {
    console.error('Error loading modules page:', error);
    res.status(500).render('modules', { 
      title: 'My Modules – MicroCoaster',
      modules: [],
      user: {
        id: req.session.user_id,
        code: req.session.code,
        name: req.session.nickname
      },
      flash: 'Database error occurred'
    });
  }
});

// API pour récupérer les modules en JSON (pour AJAX)
router.get('/api', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;
    const modules = await getUserModules(userId);
    
    // Inférer les types manquants
    modules.forEach(module => {
      if (!module.type) {
        module.type = mcInferType(module.module_id, module.name);
      }
    });

    res.json({ success: true, modules });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Ajouter un module
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
    const { pool } = require('../models/database');
    await pool.execute(`
      INSERT INTO modules (user_id, module_id, name, type, claimed, created_at)
      VALUES (?, ?, ?, ?, 1, NOW())
    `, [userId, module_id.trim(), name?.trim() || null, type]);

    console.log(`➕ Module added: ${module_id} (${type}) by user ${userId}`);
    res.redirect('/modules?flash=' + encodeURIComponent('Module added successfully'));

  } catch (error) {
    console.error('Error adding module:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      res.redirect('/modules?flash=' + encodeURIComponent('Module already exists'));
    } else {
      res.redirect('/modules?flash=' + encodeURIComponent('Error adding module'));
    }
  }
});

// Supprimer un module
router.post('/delete/:moduleId', requireAuth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.session.user_id;

    // Vérifier que le module appartient à l'utilisateur
    const module = await getModule(moduleId, userId);
    if (!module) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    // Supprimer le module
    const { pool } = require('../models/database');
    await pool.execute('DELETE FROM modules WHERE module_id = ? AND user_id = ?', [moduleId, userId]);

    console.log(`🗑️ Module deleted: ${moduleId} by user ${userId}`);
    res.json({ success: true, message: 'Module deleted successfully' });

  } catch (error) {
    console.error('Error deleting module:', error);
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
    const module = await getModule(moduleId, userId);
    if (!module) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    // Mettre à jour le module
    const { pool } = require('../models/database');
    await pool.execute(`
      UPDATE modules 
      SET name = ?, type = ?, updated_at = NOW()
      WHERE module_id = ? AND user_id = ?
    `, [name?.trim() || null, type || mcInferType(moduleId, name), moduleId, userId]);

    console.log(`📝 Module updated: ${moduleId} by user ${userId}`);
    res.json({ success: true, message: 'Module updated successfully' });

  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

module.exports = router;