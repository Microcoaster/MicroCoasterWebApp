const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');
const databaseManager = require('../bdd/DatabaseManager');

// Fonction helper pour déduire le type de module (même que dans modules.js)
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

// Route pour afficher les timelines
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;

    // Récupérer les modules de l'utilisateur directement depuis la DB
    const userModules = await databaseManager.modules.findByUserId(userId);
    
    // Inférer les types manquants et formatter
    const formattedModules = userModules.map(module => ({
      module_id: module.module_id,
      name: module.name || module.module_id,
      type: module.type || mcInferType(module.module_id, module.name),
      claimed: module.claimed || 0,
      isOnline: false  // Toujours offline par défaut
    }));

    // Récupérer les informations utilisateur
    const user = await databaseManager.users.findById(userId);

    res.render('timelines', {
      title: 'Timeline Editor - MicroCoaster',
      currentPage: 'timelines',
      user: user,
      modules: formattedModules
    });

  } catch (error) {
    console.error('Erreur lors du chargement des timelines:', error);
    res.status(500).render('error', {
      title: 'Erreur - MicroCoaster',
      message: 'Une erreur est survenue lors du chargement des timelines',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

module.exports = router;
