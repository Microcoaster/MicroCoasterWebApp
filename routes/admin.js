const express = require("express");
const { requireAdmin } = require("./auth");
const { getAllUsers, getAllModules, getUserById } = require("../models/database");
const router = express.Router();

// Toutes les routes admin nécessitent les permissions administrateur
router.use(requireAdmin);

/**
 * API pour récupérer toutes les données des utilisateurs
 */
router.get("/api/all-users", async (req, res) => {
  try {
    // Récupérer tous les utilisateurs sans pagination
    const usersResult = await getAllUsers({ 
      limit: 999999, 
      offset: 0, 
      sortBy: 'created_at', 
      sortOrder: 'DESC' 
    });
    
    res.json({
      success: true,
      users: usersResult.users,
      total: usersResult.total
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de tous les utilisateurs:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des utilisateurs'
    });
  }
});

/**
 * API pour récupérer toutes les données des modules
 */
router.get("/api/all-modules", async (req, res) => {
  try {
    // Récupérer tous les modules sans pagination
    const modulesResult = await getAllModules({ 
      limit: 999999, 
      offset: 0, 
      sortBy: 'created_at', 
      sortOrder: 'DESC' 
    });
    
    res.json({
      success: true,
      modules: modulesResult.modules,
      total: modulesResult.total
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de tous les modules:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des modules'
    });
  }
});

/**
 * Page principale d'administration
 */
router.get("/", async (req, res) => {
  try {
    // Paramètres de pagination et recherche
    const usersPage = parseInt(req.query.usersPage) || 1;
    const modulesPage = parseInt(req.query.modulesPage) || 1;
    const usersSearch = req.query.usersSearch || '';
    const modulesSearch = req.query.modulesSearch || '';
    const usersSort = req.query.usersSort || 'last_login';
    const modulesSort = req.query.modulesSort || 'last_seen';
    const usersSortOrder = req.query.usersSortOrder || 'DESC';
    const modulesSortOrder = req.query.modulesSortOrder || 'DESC';
    
    // Filtres par colonne
    const usersFilters = {
      name: req.query['users.name'] || '',
      email: req.query['users.email'] || '',
      role: req.query['users.role'] || '',
      module_count: req.query['users.module_count'] || '',
      last_login: req.query['users.last_login'] || '',
      created_at: req.query['users.created_at'] || ''
    };
    
    const modulesFilters = {
      module_id: req.query['modules.module_id'] || '',
      name: req.query['modules.name'] || '',
      type: req.query['modules.type'] || '',
      user_name: req.query['modules.user_name'] || '',
      status: req.query['modules.status'] || '',
      last_seen: req.query['modules.last_seen'] || ''
    };
    
    const limit = 10;
    const usersOffset = (usersPage - 1) * limit;
    const modulesOffset = (modulesPage - 1) * limit;
    
    const [usersResult, modulesResult, user] = await Promise.all([
      getAllUsers({ limit, offset: usersOffset, sortBy: usersSort, sortOrder: usersSortOrder, search: usersSearch, filters: usersFilters }),
      getAllModules({ limit, offset: modulesOffset, sortBy: modulesSort, sortOrder: modulesSortOrder, search: modulesSearch, filters: modulesFilters }),
      getUserById(req.session.user_id)
    ]);
    
    // Statistiques rapides (toujours globales)
    const [allUsersResult, allModulesResult] = await Promise.all([
      getAllUsers({ limit: 10000, offset: 0 }), // Récupérer tous pour les stats
      getAllModules({ limit: 10000, offset: 0 })
    ]);
    
    const stats = {
      totalUsers: allUsersResult.total,
      totalModules: allModulesResult.total,
      onlineModules: allModulesResult.modules.filter(m => m.status === 'online').length,
      adminUsers: allUsersResult.users.filter(u => u.is_admin).length
    };
    
    res.render("admin", { 
      title: "MicroCoaster WebApp - Administration",
      currentPage: 'admin',
      users: usersResult.users,
      modules: modulesResult.modules,
      stats,
      pagination: {
        users: {
          page: usersPage,
          totalPages: Math.ceil(usersResult.total / limit),
          total: usersResult.total,
          search: usersSearch,
          sort: usersSort,
          sortOrder: usersSortOrder,
          filters: usersFilters
        },
        modules: {
          page: modulesPage,
          totalPages: Math.ceil(modulesResult.total / limit),
          total: modulesResult.total,
          search: modulesSearch,
          sort: modulesSort,
          sortOrder: modulesSortOrder,
          filters: modulesFilters
        }
      },
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
      getAllUsers({ limit: 10000, offset: 0 }),
      getAllModules({ limit: 10000, offset: 0 })
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
    const usersResult = await getAllUsers({ limit: 1000, offset: 0 });
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
    const modulesResult = await getAllModules({ limit: 1000, offset: 0 });
    res.json(modulesResult);
  } catch (error) {
    console.error("Admin modules API error:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des modules" });
  }
});

module.exports = router;