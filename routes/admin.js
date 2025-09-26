const express = require("express");
const { requireAdmin } = require("./auth");
const databaseManager = require("../bdd/DatabaseManager");
const router = express.Router();

// Toutes les routes admin nécessitent les permissions administrateur
router.use(requireAdmin);

// Routes API supprimées - les données sont maintenant intégrées directement dans la page

/**
 * Gestion des actions POST (supprimé - tout est maintenant côté client)
 */
// POST supprimé - pas de navigation par URL

/**
 * Page principale d'administration - Version simplifiée sans paramètres URL
 */
router.get("/", async (req, res) => {
  try {
    // Récupérer TOUTES les données côté serveur - la pagination sera côté client
    const [allUsersResult, allModulesResult] = await Promise.all([
      databaseManager.users.findAll({ limit: 999999, offset: 0, sortBy: 'created_at', sortOrder: 'DESC' }),
      databaseManager.modules.findAll({ limit: 999999, offset: 0, sortBy: 'created_at', sortOrder: 'DESC' })
    ]);
    
    // Récupérer l'utilisateur connecté
    const user = await databaseManager.users.findById(req.session.user_id);
    
    const stats = {
      totalUsers: allUsersResult.users.length,
      totalModules: allModulesResult.modules.length,
      onlineModules: allModulesResult.modules.filter(m => m.status === 'online').length,
      adminUsers: allUsersResult.users.filter(u => u.is_admin).length
    };
    
    res.render("admin", { 
      title: "MicroCoaster WebApp - Administration",
      currentPage: 'admin',
      users: allUsersResult.users, // Tous les utilisateurs
      modules: allModulesResult.modules, // Tous les modules
      stats,
      error: null,
      success: null,
      user: user,
      nickname: req.session.nickname // Garder pour compatibilité
    });
  } catch (error) {
    console.error("Admin page error:", error);
    res.render("error", { 
      title: "Erreur", 
      message: "Erreur lors du chargement de la page d'administration." 
    });
  }
});

/**
 * API pour récupérer les statistiques en temps réel
 */
router.get("/api/stats", async (req, res) => {
  try {
    const [usersResult, modulesResult] = await Promise.all([
      databaseManager.users.findAll({ limit: 10000, offset: 0 }),
      databaseManager.modules.findAll({ limit: 10000, offset: 0 })
    ]);
    
    const stats = {
      totalUsers: usersResult.total,
      totalModules: modulesResult.total,
      onlineModules: modulesResult.modules.filter(m => m.status === 'online').length,
      offlineModules: modulesResult.modules.filter(m => m.status === 'offline').length,
      adminUsers: usersResult.users.filter(u => u.is_admin).length,
      regularUsers: usersResult.users.filter(u => !u.is_admin).length
    };
    
    res.json(stats);
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des statistiques" });
  }
});

/**
 * API pour récupérer la liste des utilisateurs
 */
router.get("/api/users", async (req, res) => {
  try {
    const usersResult = await databaseManager.users.findAll({ limit: 1000, offset: 0 });
    res.json(usersResult);
  } catch (error) {
    console.error("Admin users API error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs" });
  }
});

/**
 * API pour récupérer la liste des modules
 */
router.get("/api/modules", async (req, res) => {
  try {
    const modulesResult = await databaseManager.modules.findAll({ limit: 1000, offset: 0 });
    res.json(modulesResult);
  } catch (error) {
    console.error("Admin modules API error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des modules" });
  }
});

module.exports = router;
