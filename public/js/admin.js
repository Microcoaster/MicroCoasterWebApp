// Admin page functionality
let currentUsersSort = '';
let currentUsersSortOrder = '';
let currentModulesSort = '';
let currentModulesSortOrder = '';
let usersFilters = {};
let modulesFilters = {};
let currentUsersPage = 1;
let currentModulesPage = 1;

// Fonction d'initialisation avec les données EJS
function initializeAdminPage(paginationData) {
  currentUsersSort = paginationData.users.sort;
  currentUsersSortOrder = paginationData.users.sortOrder;
  currentModulesSort = paginationData.modules.sort;
  currentModulesSortOrder = paginationData.modules.sortOrder;
  usersFilters = paginationData.users.filters || {};
  modulesFilters = paginationData.modules.filters || {};
}

// Actualiser les stats toutes les 30 secondes
function startStatsRefresh() {
  setInterval(() => {
    fetch('/admin/api/stats')
      .then(response => response.json())
      .then(stats => {
        document.querySelector('.stat-card:nth-child(1) h3').textContent = stats.totalUsers;
        document.querySelector('.stat-card:nth-child(2) h3').textContent = stats.totalModules;
        document.querySelector('.stat-card:nth-child(3) h3').textContent = stats.onlineModules;
        document.querySelector('.stat-card:nth-child(4) h3').textContent = stats.adminUsers;
      })
      .catch(console.error);
  }, 30000);
}

// Fonctions de filtrage par colonne
function applyColumnFilters(tableType, skipButtonUpdate = false) {
  // Collecter les filtres actifs
  const filters = {};
  const filtersSection = tableType === 'users' ? 
    document.querySelector('#usersSection') : 
    document.querySelector('#modulesSection');
    
  if (!filtersSection) return;
  
  const filterInputs = filtersSection.querySelectorAll('.column-filter');
  
  filterInputs.forEach(filter => {
    const column = filter.dataset.column;
    const value = filter.value.trim();
    
    if (value) {
      filters[column] = value;
    }
  });
  
  // Construire l'URL pour la requête AJAX
  const params = new URLSearchParams();
  Object.keys(filters).forEach(key => {
    params.append(`${tableType}.${key}`, filters[key]);
  });
  
  // Ajouter les paramètres de tri actuels
  if (tableType === 'users') {
    if (currentUsersSort) params.append('usersSort', currentUsersSort);
    if (currentUsersSortOrder) params.append('usersSortOrder', currentUsersSortOrder);
    params.append('usersPage', currentUsersPage);
  } else {
    if (currentModulesSort) params.append('modulesSort', currentModulesSort);
    if (currentModulesSortOrder) params.append('modulesSortOrder', currentModulesSortOrder);
    params.append('modulesPage', currentModulesPage);
  }
  
  // Faire la requête AJAX
  fetch(`/admin?${params.toString()}`)
    .then(response => response.text())
    .then(html => {
      // Parser la réponse HTML pour extraire seulement la section qui nous intéresse
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      if (tableType === 'users') {
        const newUsersSection = doc.querySelector('#usersSection');
        if (newUsersSection) {
          document.querySelector('#usersSection').innerHTML = newUsersSection.innerHTML;
        }
      } else {
        const newModulesSection = doc.querySelector('#modulesSection');
        if (newModulesSection) {
          document.querySelector('#modulesSection').innerHTML = newModulesSection.innerHTML;
        }
      }
      
      // Rétablir les event listeners après la mise à jour
      setupEventListeners();
      
      // Mettre à jour la visibilité du bouton effacer seulement si demandé
      if (!skipButtonUpdate) {
        updateClearButtonVisibility(tableType);
      }
    })
    .catch(error => {
      console.error('Erreur lors du filtrage:', error);
    });
}

// Fonction de tri par colonne
function sortByColumn(tableType, column) {
  const currentSort = tableType === 'users' ? currentUsersSort : currentModulesSort;
  const currentOrder = tableType === 'users' ? currentUsersSortOrder : currentModulesSortOrder;
  
  let newOrder = 'ASC';
  if (currentSort === column) {
    newOrder = currentOrder === 'ASC' ? 'DESC' : 'ASC';
  }
  
  // Mettre à jour les variables globales
  if (tableType === 'users') {
    currentUsersSort = column;
    currentUsersSortOrder = newOrder;
    currentUsersPage = 1;
  } else {
    currentModulesSort = column;
    currentModulesSortOrder = newOrder;
    currentModulesPage = 1;
  }
  
  // Appliquer les filtres avec le nouveau tri
  applyColumnFilters(tableType);
}

// Fonction pour effacer tous les filtres
function clearAllFilters(tableType) {
  // Vider tous les champs de filtre
  const filtersSection = tableType === 'users' ? 
    document.querySelector('#usersSection') : 
    document.querySelector('#modulesSection');
    
  if (filtersSection) {
    const filterInputs = filtersSection.querySelectorAll('.column-filter');
    filterInputs.forEach(filter => {
      filter.value = '';
    });
  }
  
  // Reset de la page
  if (tableType === 'users') {
    currentUsersPage = 1;
  } else {
    currentModulesPage = 1;
  }
  
  // Reset du tri aussi
  if (tableType === 'users') {
    currentUsersSort = '';
    currentUsersSortOrder = '';
  } else {
    currentModulesSort = '';
    currentModulesSortOrder = '';
  }
  
  // Appliquer les filtres (vides)
  applyColumnFilters(tableType);
  
  window.location.href = url.toString();
}

// Fonctions de recherche (gardées pour compatibilité)
function searchUsers() {
  const search = document.getElementById('usersSearch')?.value || '';
  const url = new URL(window.location);
  url.searchParams.set('usersSearch', search);
  url.searchParams.set('usersPage', '1');
  window.location.href = url.toString();
}

function searchModules() {
  const search = document.getElementById('modulesSearch')?.value || '';
  const url = new URL(window.location);
  url.searchParams.set('modulesSearch', search);
  url.searchParams.set('modulesPage', '1');
  window.location.href = url.toString();
}

// Fonctions de tri
function sortUsers() {
  const sort = document.getElementById('usersSort').value;
  const url = new URL(window.location);
  url.searchParams.set('usersSort', sort);
  url.searchParams.set('usersPage', '1');
  window.location.href = url.toString();
}

function sortModules() {
  const sort = document.getElementById('modulesSort').value;
  const url = new URL(window.location);
  url.searchParams.set('modulesSort', sort);
  url.searchParams.set('modulesPage', '1');
  window.location.href = url.toString();
}

// Fonctions pour inverser l'ordre de tri
function toggleUsersSortOrder() {
  const newOrder = currentUsersSortOrder === 'DESC' ? 'ASC' : 'DESC';
  const url = new URL(window.location);
  url.searchParams.set('usersSortOrder', newOrder);
  url.searchParams.set('usersPage', '1');
  window.location.href = url.toString();
}

function toggleModulesSortOrder() {
  const newOrder = currentModulesSortOrder === 'DESC' ? 'ASC' : 'DESC';
  const url = new URL(window.location);
  url.searchParams.set('modulesSortOrder', newOrder);
  url.searchParams.set('modulesPage', '1');
  window.location.href = url.toString();
}

// Fonction de changement de page
function changePage(type, page) {
  const url = new URL(window.location);
  if (type === 'users') {
    url.searchParams.set('usersPage', page);
  } else if (type === 'modules') {
    url.searchParams.set('modulesPage', page);
  }
  window.location.href = url.toString();
}

// Flag pour éviter de dupliquer les listeners globaux
let globalListenersSetup = false;

// Initialisation des event listeners
function setupEventListeners() {
  // Event listeners pour les en-têtes de tri cliquables
  document.querySelectorAll('.sortable-header:not([data-listener-added])').forEach(header => {
    header.addEventListener('click', function() {
      const sortField = this.dataset.sort;
      const tableType = this.closest('.admin-section').querySelector('h2').textContent.includes('Utilisateurs') ? 'users' : 'modules';
      sortByColumn(tableType, sortField);
    });
    header.setAttribute('data-listener-added', 'true');
  });

  // Event listeners pour les filtres par colonne
  document.querySelectorAll('.column-filter:not([data-listener-added])').forEach(filter => {
    const tableType = filter.closest('.admin-section').querySelector('h2').textContent.includes('Utilisateurs') ? 'users' : 'modules';
    
    // Filtrage en temps réel avec debounce pour les champs texte
    if (filter.type === 'text' || filter.type === 'number') {
      let timeout;
      filter.addEventListener('input', function() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          applyColumnFilters(tableType);
        }, 500); // 500ms de délai
      });
    } else {
      // Filtrage immédiat pour les selects
      filter.addEventListener('change', function() {
        applyColumnFilters(tableType);
      });
    }
    
    // Filtrage au press Enter
    filter.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        applyColumnFilters(tableType);
      }
    });
    
    // Mettre à jour la visibilité du bouton lors de la saisie
    filter.addEventListener('input', function() {
      updateClearButtonVisibility(tableType);
    });
    
    filter.addEventListener('change', function() {
      updateClearButtonVisibility(tableType);
    });
    
    filter.setAttribute('data-listener-added', 'true');
  });

  // Event listeners pour les boutons de recherche (si ils existent encore)
  const usersSearchBtn = document.getElementById('usersSearchBtn');
  if (usersSearchBtn) {
    usersSearchBtn.addEventListener('click', searchUsers);
  }

  const modulesSearchBtn = document.getElementById('modulesSearchBtn');
  if (modulesSearchBtn) {
    modulesSearchBtn.addEventListener('click', searchModules);
  }

  // Event listeners pour les boutons de pagination
  document.querySelectorAll('.pagination-btn:not([data-listener-added])').forEach(btn => {
    btn.addEventListener('click', function() {
      const table = this.dataset.table;
      const page = this.dataset.page;
      changePage(table, page);
    });
    btn.setAttribute('data-listener-added', 'true');
  });

  // Boutons pour effacer les filtres
  setupClearButtonsListeners();
}

// Gérer la visibilité des boutons d'effacement
function updateClearButtonVisibility(tableType) {
  const buttonId = tableType === 'users' ? 'clearUsersFilters' : 'clearModulesFilters';
  const clearButton = document.getElementById(buttonId);
  
  if (clearButton) {
    // Vérifier s'il y a des filtres actifs
    const filtersSection = tableType === 'users' ? 
      document.querySelector('#usersSection') : 
      document.querySelector('#modulesSection');
      
    if (filtersSection) {
      const filterInputs = filtersSection.querySelectorAll('.column-filter');
      let hasActiveFilters = false;
      
      filterInputs.forEach(filter => {
        if (filter.value.trim() !== '') {
          hasActiveFilters = true;
        }
      });
      
      // Vérifier aussi le tri actuel
      const hasActiveSort = (tableType === 'users' && currentUsersSort) || 
                          (tableType === 'modules' && currentModulesSort);
      
      clearButton.style.display = (hasActiveFilters || hasActiveSort) ? 'flex' : 'none';
    }
  }
}

// Ajouter les event listeners pour les boutons d'effacement du header
function setupClearButtonsListeners() {
  const clearUsersBtn = document.getElementById('clearUsersFilters');
  const clearModulesBtn = document.getElementById('clearModulesFilters');
  
  if (clearUsersBtn && !clearUsersBtn.dataset.listenerAdded) {
    clearUsersBtn.addEventListener('click', () => clearAllFilters('users'));
    clearUsersBtn.dataset.listenerAdded = 'true';
  }
  
  if (clearModulesBtn && !clearModulesBtn.dataset.listenerAdded) {
    clearModulesBtn.addEventListener('click', () => clearAllFilters('modules'));
    clearModulesBtn.dataset.listenerAdded = 'true';
  }
}

// Charger les données avec filtres (pour les requêtes AJAX)
function loadUsers(skipButtonUpdate = false) {
  applyColumnFilters('users', skipButtonUpdate);
}

function loadModules(skipButtonUpdate = false) {
  applyColumnFilters('modules', skipButtonUpdate);
}

// Changer de page
function changePage(tableType, page) {
  if (tableType === 'users') {
    currentUsersPage = parseInt(page);
  } else {
    currentModulesPage = parseInt(page);
  }
  applyColumnFilters(tableType);
}

// Initialisation quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
  setupEventListeners();
  
  // Ne pas appeler loadUsers() et loadModules() au chargement initial
  // car cela déclenche des requêtes AJAX et updateClearButtonVisibility
  // Les données sont déjà chargées par le serveur
  
  // Cependant, si la page a des filtres dans l'URL (rechargement), 
  // il faut vérifier s'il faut afficher le bouton
  const urlParams = new URLSearchParams(window.location.search);
  const hasFilters = Array.from(urlParams.keys()).some(key => 
    key.startsWith('users.') || key.startsWith('modules.')
  );
  const hasSort = urlParams.has('usersSort') || urlParams.has('modulesSort');
  
  if (hasFilters || hasSort) {
    updateClearButtonVisibility('users');
    updateClearButtonVisibility('modules');
  }
  
  startStatsRefresh();
});