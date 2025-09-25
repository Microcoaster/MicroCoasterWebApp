// Admin page functionality avec cache côté client
let allUsers = [];
let allModules = [];
let filteredUsers = [];
let filteredModules = [];

let currentUsersSort = '';
let currentUsersSortOrder = '';
let currentModulesSort = '';
let currentModulesSortOrder = '';
let usersFilters = {};
let modulesFilters = {};
let currentUsersPage = 1;
let currentModulesPage = 1;

const ITEMS_PER_PAGE = 10;

// Fonction d'initialisation avec les données depuis les attributs data-
function initializeAdminPage() {
  const body = document.body;
  
  // Lire les paramètres de pagination depuis les attributs data-
  currentUsersSort = body.getAttribute('data-users-sort') || '';
  currentUsersSortOrder = body.getAttribute('data-users-sort-order') || '';
  currentModulesSort = body.getAttribute('data-modules-sort') || '';
  currentModulesSortOrder = body.getAttribute('data-modules-sort-order') || '';
  
  // Charger les données depuis les attributs data-
  loadDataFromPage();
}

// Charger les données depuis les attributs data- de body
function loadDataFromPage() {
  const body = document.body;
  
  try {
    // Lire les données depuis les attributs data-
    const usersData = body.getAttribute('data-all-users');
    const modulesData = body.getAttribute('data-all-modules');
    
    if (usersData && modulesData) {
      allUsers = JSON.parse(decodeURIComponent(usersData));
      allModules = JSON.parse(decodeURIComponent(modulesData));
          
      // Initialiser les données filtrées
      filteredUsers = [...allUsers];
      filteredModules = [...allModules];
      
      console.log(`Données chargées depuis les attributs data-: ${allUsers.length} utilisateurs, ${allModules.length} modules`);
      
      // Appliquer les filtres initiaux et rendre les tables
      applyClientSideFilters('users');
      applyClientSideFilters('modules');
      
      // S'assurer que les flèches de tri sont à jour au démarrage
      updateSortArrows('users');
      updateSortArrows('modules');
      
      return true;
    } else {
      console.error('Aucune donnée trouvée dans les attributs data-');
      return false;
    }
  } catch (error) {
    console.error('Erreur lors du parsing des données:', error);
    return false;
  }
}

// Nouveau système de filtrage côté client
function applyClientSideFilters(tableType) {
  // Collecter les filtres actifs
  const filters = {};
  const filtersSection = tableType === 'users' ? 
    document.querySelector('#usersSection') : 
    document.querySelector('#modulesSection');
    
  if (filtersSection) {
    const filterInputs = filtersSection.querySelectorAll('.column-filter');
    
    filterInputs.forEach(filter => {
      const column = filter.dataset.column;
      const value = filter.value.trim();
      
      if (value) {
        filters[column] = value.toLowerCase();
      }
    });
  }

  // Stocker les filtres
  if (tableType === 'users') {
    usersFilters = filters;
  } else {
    modulesFilters = filters;
  }

  // Filtrer les données
  const sourceData = tableType === 'users' ? allUsers : allModules;
  const currentFilters = tableType === 'users' ? usersFilters : modulesFilters;
  

  
  let filtered = sourceData.filter(item => {
    return Object.keys(currentFilters).every(column => {
      const filterValue = currentFilters[column];
      const itemValue = getNestedValue(item, column);
      
      if (itemValue === null || itemValue === undefined) return false;
      
      // Gestion spéciale pour certains champs
      if (column === 'role' && tableType === 'users') {
        if (filterValue === 'admin') return item.is_admin === 1;
        if (filterValue === 'user' || filterValue === 'utilisateur') return item.is_admin === 0;
        // Si "Tous les rôles" est sélectionné, on ne filtre pas
        if (filterValue === 'tous' || filterValue === '') return true;
        // Si on arrive ici, c'est que la valeur ne correspond à rien
        return false;
      }
      
      if (column === 'status' && tableType === 'modules') {
        const status = getModuleStatus(item).toLowerCase();
        
        if (filterValue === 'online') {
          return !status.includes('hors'); // Online = NOT offline (ne contient pas "hors")
        }
        if (filterValue === 'offline') {
          return status.includes('hors'); // Offline = contient "hors"
        }
        // Si "Tous les statuts" est sélectionné, on ne filtre pas
        if (filterValue === 'tous' || filterValue === '') {
          console.log('Tous les statuts -> return true');
          return true;
        }
        const result = status.includes(filterValue);
        console.log(`General status check: "${status}".includes("${filterValue}") = ${result}`);
        return result;
      }
      
      return String(itemValue).toLowerCase().includes(filterValue);
    });
  });

  // Appliquer le tri
  const currentSort = tableType === 'users' ? currentUsersSort : currentModulesSort;
  const currentOrder = tableType === 'users' ? currentUsersSortOrder : currentModulesSortOrder;
  
  if (currentSort) {
    filtered.sort((a, b) => {
      let aVal = getNestedValue(a, currentSort);
      let bVal = getNestedValue(b, currentSort);
      
      // Gestion des valeurs nulles
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      
      // Gestion spéciale pour le tri par statut des modules (calculé dynamiquement)
      if (currentSort === 'status' && tableType === 'modules') {
        aVal = getModuleStatus(a);
        bVal = getModuleStatus(b);
      }
      
      // Gestion des dates
      if (currentSort.includes('_at') || currentSort.includes('_login') || currentSort.includes('_seen')) {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }
      
      let result = 0;
      if (aVal < bVal) result = -1;
      if (aVal > bVal) result = 1;
      
      return currentOrder === 'DESC' ? -result : result;
    });
  }

  // Stocker les données filtrées
  if (tableType === 'users') {
    filteredUsers = filtered;
    currentUsersPage = 1; // Reset à la première page
  } else {
    filteredModules = filtered;
    currentModulesPage = 1; // Reset à la première page
  }

  // Rendre les données
  renderTable(tableType);
  updateClearButtonVisibility(tableType);
  updateSortArrows(tableType);
}

// Fonction de tri par colonne (client-side)
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
  } else {
    currentModulesSort = column;
    currentModulesSortOrder = newOrder;
  }
  
  // Réappliquer les filtres avec le nouveau tri
  applyClientSideFilters(tableType);
  
  // Mettre à jour les flèches de tri
  updateSortArrows(tableType);
}

// Fonction pour effacer tous les filtres (client-side)
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
  
  // Reset des variables
  if (tableType === 'users') {
    usersFilters = {};
    currentUsersSort = '';
    currentUsersSortOrder = '';
    currentUsersPage = 1;
  } else {
    modulesFilters = {};
    currentModulesSort = '';
    currentModulesSortOrder = '';
    currentModulesPage = 1;
  }
  
  // Réappliquer les filtres (vides)
  applyClientSideFilters(tableType);
}





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

  // Event listeners pour les filtres par colonne (client-side)
  document.querySelectorAll('.column-filter:not([data-listener-added])').forEach(filter => {
    const tableType = filter.closest('.admin-section').querySelector('h2').textContent.includes('Utilisateurs') ? 'users' : 'modules';
    
    // Filtrage en temps réel immédiat (pas de délai car côté client)
    filter.addEventListener('input', function() {
      applyClientSideFilters(tableType);
    });
    
    filter.addEventListener('change', function() {
      applyClientSideFilters(tableType);
    });
    
    // Filtrage au press Enter
    filter.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        applyClientSideFilters(tableType);
      }
    });
    
    filter.setAttribute('data-listener-added', 'true');
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

// Charger les données avec filtres (client-side)
function loadUsers() {
  applyClientSideFilters('users');
}

function loadModules() {
  applyClientSideFilters('modules');
}

// Changer de page (client-side)
function changePage(tableType, page) {
  if (tableType === 'users') {
    currentUsersPage = parseInt(page);
  } else {
    currentModulesPage = parseInt(page);
  }
  renderTable(tableType);
}

// Fonctions utilitaires
function getNestedValue(obj, path) {
  if (path === 'user_name') return obj.user_name || '';
  if (path === 'role') return obj.is_admin; // Retourne 1 pour admin, 0 pour user
  if (path === 'status') return getModuleStatus(obj); // Retourne "En ligne" ou "Hors ligne"
  return path.split('.').reduce((o, p) => o && o[p], obj);
}

function getModuleStatus(module) {
  if (!module.last_seen) return 'Hors ligne';
  const lastSeen = new Date(module.last_seen);
  const now = new Date();
  const diffMinutes = (now - lastSeen) / (1000 * 60);
  return diffMinutes <= 5 ? 'En ligne' : 'Hors ligne';
}

function formatDate(dateStr) {
  if (!dateStr) return 'Jamais';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR') + ' à ' + date.toLocaleTimeString('fr-FR');
}

function getRoleBadge(isAdmin) {
  if (isAdmin) {
    return '<span class="badge badge-admin">Admin</span>';
  }
  return '<span class="badge badge-user">Utilisateur</span>';
}

function getStatusBadge(status) {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('ligne')) {
    return `<span class="status status-${statusLower.replace(' ', '-')}">${status}</span>`;
  }
  return `<span class="status">${status}</span>`;
}

function getTypeBadge(type) {
  if (!type) return '<span class="badge badge-user">Inconnu</span>';
  
  const typeLower = type.toLowerCase().replace(/\s+/g, '-');
  
  if (typeLower.includes('switch') || typeLower.includes('track')) {
    return `<span class="badge badge-switch-track">${type}</span>`;
  }
  if (typeLower.includes('station')) {
    return `<span class="badge badge-station">${type}</span>`;
  }
  if (typeLower.includes('smoke') || typeLower.includes('machine')) {
    return `<span class="badge badge-smoke-machine">${type}</span>`;
  }
  
  return `<span class="badge badge-user">${type}</span>`;
}

// Fonction pour mettre à jour les flèches de tri
function updateSortArrows(tableType) {
  const section = tableType === 'users' ? 
    document.querySelector('#usersSection') : 
    document.querySelector('#modulesSection');
    
  if (!section) return;
  
  const currentSort = tableType === 'users' ? currentUsersSort : currentModulesSort;
  const currentOrder = tableType === 'users' ? currentUsersSortOrder : currentModulesSortOrder;
  
  // Reset toutes les flèches
  section.querySelectorAll('.sort-arrow').forEach(arrow => {
    arrow.className = 'sort-arrow';
  });
  
  // Mettre à jour la flèche active
  if (currentSort) {
    const activeHeader = section.querySelector(`[data-sort="${currentSort}"] .sort-arrow`);
    if (activeHeader) {
      activeHeader.className = `sort-arrow ${currentOrder.toLowerCase()}`;
    }
  }
}

// Fonction de rendu des tables
function renderTable(tableType) {
  const data = tableType === 'users' ? filteredUsers : filteredModules;
  const currentPage = tableType === 'users' ? currentUsersPage : currentModulesPage;
  
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageData = data.slice(startIndex, endIndex);
  
  const tableContainer = tableType === 'users' ? 
    document.querySelector('#usersSection .table-container tbody') :
    document.querySelector('#modulesSection .table-container tbody');
  
  if (!tableContainer) return;
  
  if (pageData.length === 0) {
    // Afficher le message empty state
    tableContainer.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="6" class="empty-state-cell">
          <div class="empty-state-message">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <h4>Aucun ${tableType === 'users' ? 'utilisateur' : 'module'} trouvé</h4>
            <p>Essayez de modifier vos filtres de recherche</p>
          </div>
        </td>
      </tr>
    `;
  } else {
    let html = '';
    
    if (tableType === 'users') {
      pageData.forEach(user => {
        html += `
          <tr>
            <td>${user.name || ''}</td>
            <td><code>${user.email || ''}</code></td>
            <td>${getRoleBadge(user.is_admin)}</td>
            <td>${user.module_count || 0}</td>
            <td>${formatDate(user.last_login)}</td>
            <td>${formatDate(user.created_at)}</td>
          </tr>
        `;
      });
    } else {
      pageData.forEach(module => {
        html += `
          <tr>
            <td><code>${module.module_id || ''}</code></td>
            <td>${module.name || 'Module sans nom'}</td>
            <td>${getTypeBadge(module.type)}</td>
            <td>${module.user_name || ''}</td>
            <td>${getStatusBadge(getModuleStatus(module))}</td>
            <td>${formatDate(module.last_seen)}</td>
          </tr>
        `;
      });
    }
    
    tableContainer.innerHTML = html;
  }
  
  // Mettre à jour la pagination
  renderPagination(tableType, data.length);
}

// Fonction de rendu de la pagination
function renderPagination(tableType, totalItems) {
  const currentPage = tableType === 'users' ? currentUsersPage : currentModulesPage;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  
  const paginationContainer = tableType === 'users' ?
    document.querySelector('#usersSection .pagination-container') :
    document.querySelector('#modulesSection .pagination-container');
    
  if (!paginationContainer) return;
  
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
  
  paginationContainer.innerHTML = `
    <div class="pagination-info">
      Page ${currentPage} sur ${totalPages} (${startIndex}-${endIndex} sur ${totalItems})
    </div>
    <div class="pagination-controls">
      <button class="pagination-prev" data-table="${tableType}" ${currentPage === 1 ? 'disabled' : ''}>‹ Précédent</button>
      <button class="pagination-next" data-table="${tableType}" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}>Suivant ›</button>
    </div>
  `;
  
  // Ajouter les event listeners après avoir créé les boutons
  const prevBtn = paginationContainer.querySelector('.pagination-prev');
  const nextBtn = paginationContainer.querySelector('.pagination-next');
  
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => changePage(tableType, currentPage - 1));
  }
  
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => changePage(tableType, currentPage + 1));
  }
}

// Initialisation quand le DOM est chargé
document.addEventListener('DOMContentLoaded', function() {
  // Initialiser la page admin avec les données depuis les attributs data-
  initializeAdminPage();
  
  setupEventListeners();
});
