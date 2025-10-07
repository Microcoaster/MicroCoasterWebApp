/**
 * Interface d'administration - Gestion utilisateurs et système côté client
 *
 * Gère l'interface d'administration incluant statistiques temps réel, gestion utilisateur,
 * surveillance système et supervision des modules avec communication WebSocket.
 *
 * @module admin
 * @description Interface d'administration avec contrôles interactifs et mises à jour temps réel
 */

/**
 * Génère un badge HTML avec icône et style pour un type de module donné
 * Crée l'affichage visuel standardisé pour les types de modules dans l'interface admin
 * @param {string} moduleType - Type du module (station, launch-track, switch-track, etc.)
 * @returns {string} HTML du badge avec classe CSS et icône appropriées
 */
function getTypeBadge(moduleType) {
  if (!moduleType) return getTypeBadge('unknown');

  const type = moduleType.toLowerCase().trim();

  // Mapping des types vers les classes CSS et icônes
  const typeConfig = {
    station: {
      class: 'station',
      icon: '🟣',
      label: 'Station',
    },
    'launch track': {
      class: 'launch-track',
      icon: '🔴',
      label: 'Launch Track',
    },
    'launch-track': {
      class: 'launch-track',
      icon: '🔴',
      label: 'Launch Track',
    },
    'switch track': {
      class: 'switch-track',
      icon: '🟠',
      label: 'Switch Track',
    },
    'switch-track': {
      class: 'switch-track',
      icon: '🟠',
      label: 'Switch Track',
    },
    'light fx': {
      class: 'light-fx',
      icon: '🟡',
      label: 'Light FX',
    },
    'light-fx': {
      class: 'light-fx',
      icon: '🟡',
      label: 'Light FX',
    },
    'audio player': {
      class: 'audio-player',
      icon: '🔵',
      label: 'Audio Player',
    },
    'audio-player': {
      class: 'audio-player',
      icon: '🔵',
      label: 'Audio Player',
    },
    'smoke machine': {
      class: 'smoke-machine',
      icon: '⚫',
      label: 'Smoke Machine',
    },
    'smoke-machine': {
      class: 'smoke-machine',
      icon: '⚫',
      label: 'Smoke Machine',
    },
  };

  const config = typeConfig[type] || {
    class: 'unknown',
    icon: '⚫',
    label: 'Unknown',
  };

  return `<span class="type-badge ${config.class}" title="${config.label}">
        ${config.label}
    </span>`;
}

/**
 * Initialise les badges de types pour tous les modules visibles dans l'interface
 * Parcourt les éléments avec l'attribut data-module-type et génère les badges appropriés
 * @returns {void}
 * @public
 */
function initializeModuleTypeBadges() {
  // Chercher tous les éléments qui ont besoin d'un badge de type
  const typeElements = document.querySelectorAll('[data-module-type]');

  typeElements.forEach(element => {
    const moduleType = element.getAttribute('data-module-type');
    const badge = getTypeBadge(moduleType);

    // Remplacer le contenu
    element.innerHTML = badge;
  });
}

/**
 * Initialise les fonctionnalités de pagination avec préférences sauvegardées
 * Restaure les paramètres de pagination depuis localStorage pour modules et utilisateurs
 * @returns {void}
 * @public
 */
function initializePagination() {
  // Restaurer les préférences depuis le localStorage
  const modulesItemsPerPage = document.getElementById('modulesItemsPerPage');
  if (modulesItemsPerPage) {
    const savedLimit = localStorage.getItem('admin_modules_itemsPerPage');
    if (savedLimit && savedLimit !== modulesItemsPerPage.value) {
      modulesItemsPerPage.value = savedLimit;
    }
  }

  const usersItemsPerPage = document.getElementById('usersItemsPerPage');
  if (usersItemsPerPage) {
    const savedLimit = localStorage.getItem('admin_users_itemsPerPage');
    if (savedLimit && savedLimit !== usersItemsPerPage.value) {
      usersItemsPerPage.value = savedLimit;
    }
  }
}

/**
 * Initialise les filtres de colonnes pour les tables d'administration
 * Configure les événements de filtrage et les boutons de réinitialisation
 * @returns {void}
 * @public
 */
function initializeFilters() {
  // Tous les filtres de colonnes (inputs et selects)
  const columnFilters = document.querySelectorAll('.column-filter');

  columnFilters.forEach(filter => {
    const eventType = filter.tagName.toLowerCase() === 'select' ? 'change' : 'input';
    filter.addEventListener(eventType, function () {
      applyFilters();
    });
  });

  // Boutons de réinitialisation des filtres
  const clearUsersBtn = document.getElementById('clearUsersFilters');
  const clearModulesBtn = document.getElementById('clearModulesFilters');

  if (clearUsersBtn) {
    clearUsersBtn.addEventListener('click', function () {
      clearFilters('users');
    });
  }

  if (clearModulesBtn) {
    clearModulesBtn.addEventListener('click', function () {
      clearFilters('modules');
    });
  }
}

/**
 * Efface tous les filtres d'une table spécifique
 * @param {string} tableType - Type de table à réinitialiser ('users' ou 'modules')
 * @returns {void}
 * @public
 */
function clearFilters(tableType) {
  const prefix = tableType === 'users' ? 'user' : 'module';

  // Réinitialiser tous les filtres de cette table
  const filters = document.querySelectorAll(`[id^="filter-${prefix}-"]`);
  filters.forEach(filter => {
    filter.value = '';
  });

  applyFilters();
}

/**
 * Applique tous les filtres sélectionnés aux tables (côté client uniquement)
 * Met à jour le tri, la pagination et l'affichage des résultats filtrés
 * @returns {void}
 * @public
 */
function applyFilters() {
  // Filtrer les utilisateurs
  filterTable('users');

  // Filtrer les modules
  filterTable('modules');

  // Réappliquer le tri après filtrage
  applySorting('users');
  applySorting('modules');

  // Réinitialiser la pagination après filtrage
  paginationState.users.page = 1;
  paginationState.modules.page = 1;

  // Réappliquer la pagination avec les nouveaux résultats
  applyClientSidePagination('users');
  applyClientSidePagination('modules');
  updatePaginationControls('users');
  updatePaginationControls('modules');
}

/**
 * Filtre une table spécifique basée sur ses filtres de colonnes actifs
 * Cache/affiche les rangées selon les critères de filtrage définis
 * @param {string} tableType - Type de table à filtrer ('users' ou 'modules')
 * @returns {void}
 * @public
 */
function filterTable(tableType) {
  const table = document.querySelector(`.admin-table[data-table="${tableType}"]`);
  if (!table) {
    return;
  }

  const rows = table.querySelectorAll('tbody tr:not(.filter-row)');
  let visibleCount = 0;

  // Récupérer tous les filtres pour cette table
  const prefix = tableType === 'users' ? 'user' : 'module';
  const filters = {};

  document.querySelectorAll(`[id^="filter-${prefix}-"]`).forEach(filterElement => {
    const column = filterElement.getAttribute('data-column');
    const value = filterElement.value.toLowerCase().trim();
    if (value) {
      filters[column] = value;
    }
  });

  rows.forEach(row => {
    let isVisible = true;

    // Appliquer chaque filtre
    Object.entries(filters).forEach(([column, filterValue]) => {
      if (!isVisible) return; // Déjà masqué

      let cellValue = '';

      // Récupérer la valeur de la cellule selon la colonne
      const cells = row.querySelectorAll('td');

      switch (column) {
        case 'name':
          cellValue =
            tableType === 'users'
              ? cells[0]
                ? cells[0].textContent.toLowerCase()
                : ''
              : cells[1]
                ? cells[1].textContent.toLowerCase()
                : '';
          break;
        case 'email':
          cellValue = cells[1] ? cells[1].textContent.toLowerCase() : '';
          break;
        case 'role':
          cellValue = cells[2] ? cells[2].textContent.toLowerCase() : '';
          break;
        case 'module_count':
          cellValue = cells[3] ? cells[3].textContent.toLowerCase() : '';
          break;
        case 'last_login':
          cellValue = cells[4] ? cells[4].textContent.toLowerCase() : '';
          break;
        case 'created_at':
          cellValue = cells[5] ? cells[5].textContent.toLowerCase() : '';
          break;
        case 'module_id':
          cellValue = cells[0] ? cells[0].textContent.toLowerCase() : '';
          break;
        case 'type':
          cellValue = cells[2] ? cells[2].textContent.toLowerCase() : '';
          break;
        case 'user_name':
          cellValue = cells[3] ? cells[3].textContent.toLowerCase() : '';
          break;
        case 'status':
          cellValue = cells[4] ? cells[4].textContent.toLowerCase() : '';
          break;
        case 'last_seen':
          cellValue = cells[5] ? cells[5].textContent.toLowerCase() : '';
          break;
        default:
          // Recherche dans toute la ligne si colonne non spécifiée
          cellValue = row.textContent.toLowerCase();
      }

      if (!cellValue.includes(filterValue)) {
        isVisible = false;
      }
    });

    // Appliquer la visibilité
    if (isVisible) {
      row.style.display = '';
      row.classList.remove('filtered-hidden');
      visibleCount++;
    } else {
      row.style.display = 'none';
      row.classList.add('filtered-hidden');
    }
  });

  // Afficher un message si aucun résultat
  showNoResultsMessage(table, visibleCount);
}

/**
 * Affiche un message si aucun résultat n'est trouvé
 * @param {HTMLElement} table - L'élément table
 * @param {number} visibleCount - Nombre d'éléments visibles
 */
function showNoResultsMessage(table, visibleCount) {
  // Supprimer l'ancien message s'il existe
  const existingMessage = table.querySelector('.no-results-row');
  if (existingMessage) {
    existingMessage.remove();
  }

  if (visibleCount === 0) {
    const tbody = table.querySelector('tbody');
    const colCount = table.querySelectorAll('thead th').length;

    const messageRow = document.createElement('tr');
    messageRow.className = 'no-results-row';
    messageRow.innerHTML = `
            <td colspan="${colCount}" class="empty-state-cell">
                <div class="empty-state-message">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <h4>Aucun résultat trouvé</h4>
                    <p>Aucun élément ne correspond aux filtres sélectionnés. Essayez d'ajuster vos critères de recherche.</p>
                </div>
            </td>
        `;

    tbody.appendChild(messageRow);
  }
}

/**
 * Initialise le système de tri interactif pour les tables d'administration
 * Configure les écouteurs d'événements sur les en-têtes et applique le tri par défaut
 * @returns {void}
 * @public
 */
function initializeSorting() {
  // Écouter les clics sur les en-têtes sortables
  const sortableHeaders = document.querySelectorAll('.sortable-header');

  sortableHeaders.forEach(header => {
    header.addEventListener('click', function () {
      const column = this.getAttribute('data-sort');
      const tableElement = this.closest('table');
      const tableType = tableElement ? tableElement.getAttribute('data-table') : null;

      if (column && tableType) {
        handleSort(tableType, column);
      }
    });
  });

  // Appliquer le tri initial par défaut
  setTimeout(() => {
    updateSortArrows('users', 'last_login', 'desc');
    updateSortArrows('modules', 'last_seen', 'desc');
    applySorting('users');
    applySorting('modules');
  }, 200);
}

/**
 * Gère les clics sur les en-têtes de tri et met à jour l'ordre des colonnes
 * Bascule entre tri ascendant/descendant ou définit un nouveau tri
 * @param {string} tableType - Type de table ('users' ou 'modules')
 * @param {string} column - Nom de la colonne à trier
 * @returns {void}
 * @public
 */
function handleSort(tableType, column) {
  const currentSort = sortingState[tableType];

  // Si même colonne, inverser l'ordre, sinon utiliser desc par défaut
  let newOrder = 'desc';
  if (currentSort.column === column) {
    newOrder = currentSort.order === 'asc' ? 'desc' : 'asc';
  }

  // Mettre à jour l'état
  sortingState[tableType] = { column, order: newOrder };

  // Appliquer le tri
  applySorting(tableType);

  // Mettre à jour les flèches
  updateSortArrows(tableType, column, newOrder);

  // Réappliquer les filtres et la pagination
  applyClientSidePagination(tableType);
  updatePaginationControls(tableType);
}

/**
 * Applique le tri sur une table selon l'état de tri actuel
 * Gère le tri spécialisé pour dates, nombres et statuts avec parsing intelligent
 * @param {string} tableType - Type de table à trier ('users' ou 'modules')
 * @returns {void}
 * @public
 */
function applySorting(tableType) {
  const table = document.querySelector(`.admin-table[data-table="${tableType}"]`);
  if (!table) return;

  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr:not(.filter-row):not(.no-results-row)'));
  const { column, order } = sortingState[tableType];

  // Fonction pour obtenir la valeur de tri d'une cellule
  const getSortValue = (row, column, tableType) => {
    const cells = row.querySelectorAll('td');
    let cellIndex = 0;
    let cellValue = '';

    if (tableType === 'users') {
      switch (column) {
        case 'name':
          cellIndex = 0;
          break;
        case 'email':
          cellIndex = 1;
          break;
        case 'is_admin':
          cellIndex = 2;
          break;
        case 'module_count':
          cellIndex = 3;
          break;
        case 'last_login':
          cellIndex = 4;
          break;
        case 'created_at':
          cellIndex = 5;
          break;
        default:
          cellIndex = 0;
      }
    } else if (tableType === 'modules') {
      switch (column) {
        case 'module_id':
          cellIndex = 0;
          break;
        case 'name':
          cellIndex = 1;
          break;
        case 'type':
          cellIndex = 2;
          break;
        case 'user_name':
          cellIndex = 3;
          break;
        case 'status':
          cellIndex = 4;
          break;
        case 'last_seen':
          cellIndex = 5;
          break;
        default:
          cellIndex = 0;
      }
    }

    cellValue = cells[cellIndex] ? cells[cellIndex].textContent.trim() : '';

    // Traitement spécial pour certaines colonnes
    if (column === 'module_count') {
      return parseInt(cellValue) || 0;
    } else if (column === 'last_login' || column === 'last_seen' || column === 'created_at') {
      if (cellValue === 'Jamais') return new Date(0);

      // Parser les dates françaises (DD/MM/YYYY HH:mm:ss)
      const dateMatch = cellValue.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (dateMatch) {
        const [, day, month, year, hour, minute, second] = dateMatch;
        return new Date(year, month - 1, day, hour, minute, second);
      }

      // Fallback pour d'autres formats
      const simpleMatch = cellValue.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (simpleMatch) {
        const [, day, month, year] = simpleMatch;
        return new Date(year, month - 1, day);
      }

      return new Date(cellValue);
    } else if (column === 'is_admin') {
      return cellValue.toLowerCase().includes('admin') ? 1 : 0;
    } else if (column === 'status') {
      // "En ligne" doit être trié avant "Hors ligne"
      const onlineText = window.t('common.online').toLowerCase();
      return cellValue.toLowerCase().includes(onlineText) ? 1 : 0;
    }

    return cellValue.toLowerCase();
  };

  // Trier les lignes
  rows.sort((a, b) => {
    const valueA = getSortValue(a, column, tableType);
    const valueB = getSortValue(b, column, tableType);

    let comparison = 0;
    if (valueA < valueB) comparison = -1;
    else if (valueA > valueB) comparison = 1;

    return order === 'asc' ? comparison : -comparison;
  });

  // Réorganiser les lignes dans le DOM
  rows.forEach(row => tbody.appendChild(row));
}

/**
 * Met à jour l'affichage visuel des flèches de tri dans les en-têtes
 * Réinitialise toutes les flèches puis active celle de la colonne courante
 * @param {string} tableType - Type de table ('users' ou 'modules')
 * @param {string} activeColumn - Colonne actuellement triée
 * @param {string} order - Ordre de tri ('asc' ou 'desc')
 * @returns {void}
 * @private
 */
function updateSortArrows(tableType, activeColumn, order) {
  const table = document.querySelector(`.admin-table[data-table="${tableType}"]`);
  if (!table) return;

  // Réinitialiser toutes les flèches
  const arrows = table.querySelectorAll('.sort-arrow');
  arrows.forEach(arrow => {
    arrow.className = 'sort-arrow';
  });

  // Mettre à jour la flèche active
  const activeArrow = table.querySelector(`.sort-arrow[data-sort="${activeColumn}"]`);
  if (activeArrow) {
    activeArrow.className = `sort-arrow ${order}`;
  }
}

/**
 * Met à jour un badge de type de module dynamiquement
 * Remplace le contenu HTML et l'attribut data du badge existant
 * @param {HTMLElement} element - L'élément badge à mettre à jour
 * @param {string} newType - Le nouveau type de module
 * @returns {void}
 * @public
 */
function updateModuleTypeBadge(element, newType) {
  if (!element) return;

  const badge = getTypeBadge(newType);
  element.innerHTML = badge;
  element.setAttribute('data-module-type', newType);
}

/**
 * Convertit les anciens badges CSS en nouveaux badges avec icônes
 * Analyse le texte des badges existants pour déterminer le type et les remplace
 * @returns {void}
 * @public
 */
function convertLegacyBadges() {
  const legacyBadges = document.querySelectorAll(
    '.badge-station, .badge-launch-track, .badge-switch-track, .badge-light-fx, .badge-audio-player, .badge-smoke-machine, .badge-unknown'
  );

  legacyBadges.forEach(badge => {
    const text = badge.textContent.trim();
    let moduleType = 'unknown';

    // Déterminer le type basé sur le texte du badge
    if (text.toLowerCase().includes('station')) moduleType = 'station';
    else if (text.toLowerCase().includes('launch')) moduleType = 'launch-track';
    else if (text.toLowerCase().includes('switch')) moduleType = 'switch-track';
    else if (text.toLowerCase().includes('light')) moduleType = 'light-fx';
    else if (text.toLowerCase().includes('audio')) moduleType = 'audio-player';
    else if (text.toLowerCase().includes('smoke')) moduleType = 'smoke-machine';

    // Remplacer par le nouveau badge
    const newBadge = getTypeBadge(moduleType);
    badge.outerHTML = newBadge;
  });
}

/**
 * Initialise tous les composants de l'interface d'administration
 * Point d'entrée principal pour l'initialisation complète du système admin
 * @returns {void}
 * @public
 */
function initializeAll() {
  // Attendre un peu pour s'assurer que le DOM est complètement chargé
  setTimeout(() => {
    initializeModuleTypeBadges();
    convertLegacyBadges();
    initializePagination();
    initializeFilters();
    initializeSorting();

    // Initialiser la pagination côté client
    initializeClientSidePagination();

    // Initialiser les événements temps réel
    initializeRealTimeEvents();
  }, 100);
}

/**
 * Initialise la pagination côté client avec gestion des événements
 * Configure les contrôles de pagination et sauvegarde des préférences
 * @returns {void}
 * @public
 */
function initializeClientSidePagination() {
  // Restaurer les préférences depuis le localStorage
  const modulesSelect = document.getElementById('modulesItemsPerPage');
  if (modulesSelect) {
    const savedLimit = localStorage.getItem('admin_modules_itemsPerPage');
    if (savedLimit) {
      modulesSelect.value = savedLimit;
      paginationState.modules.itemsPerPage = parseInt(savedLimit);
    }
  }

  const usersSelect = document.getElementById('usersItemsPerPage');
  if (usersSelect) {
    const savedLimit = localStorage.getItem('admin_users_itemsPerPage');
    if (savedLimit) {
      usersSelect.value = savedLimit;
      paginationState.users.itemsPerPage = parseInt(savedLimit);
    }
  }

  // Appliquer la pagination initiale
  applyClientSidePagination('users');
  applyClientSidePagination('modules');
  updatePaginationControls('users');
  updatePaginationControls('modules');
}

// Un seul event listener pour éviter les doublons
document.addEventListener('DOMContentLoaded', initializeAll);

// État de pagination côté client
const paginationState = {
  users: { page: 1, itemsPerPage: 10 },
  modules: { page: 1, itemsPerPage: 10 },
};

// État de tri côté client
const sortingState = {
  users: { column: 'last_login', order: 'desc' },
  modules: { column: 'last_seen', order: 'desc' },
};

/**
 * Fonctions de pagination côté client (sans URL)
 */
window.changeItemsPerPage = function (select) {
  const itemsPerPage = parseInt(select.value);
  const table = select.getAttribute('data-table');

  // Sauvegarder la préférence
  localStorage.setItem(`admin_${table}_itemsPerPage`, itemsPerPage);

  // Mettre à jour l'état local
  paginationState[table].itemsPerPage = itemsPerPage;
  paginationState[table].page = 1; // Retour à la première page

  // Réappliquer les filtres et la pagination
  applyClientSidePagination(table);
  updatePaginationControls(table);
};

window.navigatePage = function (table, direction, event) {
  // Vérifier si le bouton est désactivé
  if (event && event.target && event.target.disabled) {
    return false;
  }

  const currentPage = paginationState[table].page;
  let newPage = currentPage;

  if (direction === 'prev') {
    newPage = Math.max(1, currentPage - 1);
  } else if (direction === 'next') {
    // Calculer le nombre maximum de pages basé sur les éléments visibles
    const tableElement = document.querySelector(`.admin-table[data-table="${table}"]`);
    if (tableElement) {
      const allRows = Array.from(
        tableElement.querySelectorAll('tbody tr:not(.filter-row):not(.no-results-row)')
      );
      const visibleRows = allRows.filter(
        row => !row.classList.contains('filtered-hidden') && row.style.display !== 'none'
      );
      const maxPages = Math.ceil(visibleRows.length / paginationState[table].itemsPerPage);
      newPage = Math.min(maxPages || 1, currentPage + 1);
    }
  }

  if (newPage !== currentPage) {
    paginationState[table].page = newPage;

    // Appliquer la pagination
    applyClientSidePagination(table);
    updatePaginationControls(table);
  }
};

/**
 * Applique la pagination côté client aux lignes visibles d'une table
 * Masque toutes les lignes puis affiche uniquement celles de la page courante
 * @param {string} tableType - Type de table à paginer ('users' ou 'modules')
 * @returns {void}
 * @public
 */
function applyClientSidePagination(tableType) {
  const table = document.querySelector(`.admin-table[data-table="${tableType}"]`);
  if (!table) return;

  // Récupérer seulement les lignes visibles (non filtrées)
  const allRows = Array.from(
    table.querySelectorAll('tbody tr:not(.filter-row):not(.no-results-row)')
  );
  const visibleRows = allRows.filter(
    row => !row.classList.contains('filtered-hidden') && row.style.display !== 'none'
  );

  const { page, itemsPerPage } = paginationState[tableType];
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // D'abord, masquer toutes les lignes paginées
  allRows.forEach(row => {
    row.classList.add('pagination-hidden');
  });

  // Puis afficher seulement les lignes de la page courante
  visibleRows.forEach((row, index) => {
    if (index >= startIndex && index < endIndex) {
      row.classList.remove('pagination-hidden');
    }
  });
}

/**
 * Met à jour l'état visuel des contrôles de pagination
 * Calcule et affiche les informations de page et gère l'état des boutons
 * @param {string} tableType - Type de table ('users' ou 'modules')
 * @returns {void}
 * @public
 */
function updatePaginationControls(tableType) {
  const table = document.querySelector(`.admin-table[data-table="${tableType}"]`);
  if (!table) return;

  // Compter seulement les lignes visibles (non filtrées)
  const allRows = Array.from(
    table.querySelectorAll('tbody tr:not(.filter-row):not(.no-results-row)')
  );
  const visibleRows = allRows.filter(
    row => !row.classList.contains('filtered-hidden') && row.style.display !== 'none'
  );

  const { page, itemsPerPage } = paginationState[tableType];
  const totalItems = visibleRows.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = totalItems === 0 ? 0 : (page - 1) * itemsPerPage + 1;
  const endItem = Math.min(page * itemsPerPage, totalItems);

  // Mettre à jour les boutons de navigation
  const prevBtn = document.querySelector(`.pagination-prev[data-table="${tableType}"]`);
  const nextBtn = document.querySelector(`.pagination-next[data-table="${tableType}"]`);

  if (prevBtn) {
    prevBtn.disabled = page <= 1;
    prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
  }

  if (nextBtn) {
    nextBtn.disabled = page >= totalPages || totalPages === 0;
    nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
  }

  // Mettre à jour l'info de pagination
  const paginationInfo = document.querySelector(`.pagination-info[data-table="${tableType}"]`);
  if (paginationInfo) {
    if (totalItems === 0) {
      paginationInfo.textContent = 'Aucun élément';
    } else {
      paginationInfo.textContent = `${startItem}-${endItem} sur ${totalItems}`;
    }
  }
}

/**
 * Met à jour le statut d'un module en temps réel dans le tableau
 * Change le texte et les classes CSS avec animation visuelle
 * @param {string} moduleId - Identifiant unique du module
 * @param {boolean} isOnline - État de connexion du module
 * @returns {void}
 * @public
 */
function updateModuleStatus(moduleId, isOnline) {
  const moduleRow = document.querySelector(`tr[data-module-id="${moduleId}"]`);
  if (!moduleRow) return;

  const statusCell = moduleRow.cells[4];
  if (!statusCell) return;

  const statusSpan = statusCell.querySelector('.status');
  if (!statusSpan) return;

  // Mise à jour simple et directe
  const newText = isOnline ? 'En ligne' : 'Hors ligne';
  const newClass = `status ${isOnline ? 'status-online' : 'status-offline'}`;

  statusSpan.textContent = newText;
  statusSpan.className = newClass;

  // Animation simple
  statusSpan.classList.add(isOnline ? 'statusChangeOnline' : 'statusChangeOffline');
  setTimeout(() => {
    statusSpan.classList.remove('statusChangeOnline', 'statusChangeOffline');
  }, 3000);

  statusSpan.textContent = newText;
  statusSpan.className = newClass;

  // Tri automatique après mise à jour
  applySorting('modules');
}

/**
 * Met à jour visuellement l'horodatage de dernière activité d'un module
 * Formate la date au format français et met à jour la cellule correspondante
 * @param {string} moduleId - Identifiant unique du module
 * @param {Date} timestamp - Horodatage de la dernière activité
 * @returns {void}
 * @public
 */
function updateModuleLastSeenInTable(moduleId, timestamp) {
  const moduleRow = document.querySelector(`tr[data-module-id="${moduleId}"]`);
  if (!moduleRow) return;

  const lastActivityCell = moduleRow.cells[5];
  if (!lastActivityCell) return;

  // Utiliser la VRAIE timestamp de la télémétrie
  const realTimestamp = timestamp || new Date();
  const formattedDate = realTimestamp.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  lastActivityCell.textContent = formattedDate;
}

/**
 * Met à jour l'affichage de dernière activité d'un module dans toutes les lignes
 * Gère le formatage automatique si aucun format n'est fourni
 * @param {string} moduleId - Identifiant unique du module
 * @param {Date|string} lastSeen - Date de dernière activité
 * @param {string} [lastSeenFormatted] - Date déjà formatée (optionnel)
 * @returns {void}
 * @public
 */
function updateModuleLastSeen(moduleId, lastSeen, lastSeenFormatted) {
  const moduleRows = document.querySelectorAll(`tr[data-module-id="${moduleId}"]`);

  moduleRows.forEach(row => {
    // La colonne "Dernière activité" est la 6ème colonne (index 5)
    const lastSeenCell = row.children[5]; // 0: ID, 1: Nom, 2: Type, 3: Propriétaire, 4: Statut, 5: Dernière activité
    if (lastSeenCell) {
      // Utiliser le format déjà formaté ou formater la date
      const displayText =
        lastSeenFormatted || (lastSeen ? new Date(lastSeen).toLocaleString('fr-FR') : 'Jamais');
      lastSeenCell.textContent = displayText;
    }
  });
}

/**
 * Met à jour les statistiques temps réel dans l'interface d'administration
 * Reçoit et affiche le nombre d'utilisateurs et modules en ligne
 * @param {Object} data - Données statistiques {users: {online: number}, modules: {online: number}}
 * @returns {void}
 * @public
 */
function updateSimpleStats(data) {
  // Format simple direct des WebSocket stats : { users: { online: X }, modules: { online: Y } }
  const onlineUsersElement = document.querySelector('.stat-online-users');
  const onlineModulesElement = document.querySelector('.stat-online-modules');

  if (data.users && onlineUsersElement) {
    onlineUsersElement.textContent = data.users.online || 0;
  }

  if (data.modules && onlineModulesElement) {
    onlineModulesElement.textContent = data.modules.online || 0;
  }
}

/**
 * Exporte les fonctions principales pour utilisation externe
 */
window.getTypeBadge = getTypeBadge;
window.updateModuleTypeBadge = updateModuleTypeBadge;
window.convertLegacyBadges = convertLegacyBadges;
window.initializeModuleTypeBadges = initializeModuleTypeBadges;

// Export admin functions for global.js
window.updateSimpleStats = updateSimpleStats;

/**
 * Initialise les écouteurs d'événements WebSocket pour l'interface d'administration
 * Configure la réception des événements temps réel modules et utilisateurs
 * @returns {void}
 * @public
 */
function initializeRealTimeEvents() {
  // Attendre que la connexion WebSocket soit prête
  document.addEventListener('websocket-ready', () => {
    if (window.socket) {
      setupModuleEvents();
      setupUserEvents();
    }
  });

  // Si la connexion est déjà établie
  if (window.socket && window.socket.connected) {
    setupModuleEvents();
    setupUserEvents();
  }
}

/**
 * Configure les écouteurs d'événements spécifiques aux modules ESP32
 * Gère télémétrie, réponses de commandes et mises à jour de statut
 * @returns {void}
 * @private
 */
function setupModuleEvents() {
  // Gestion de la télémétrie des modules
  window.socket.on('module_telemetry', data => {
    // La télémétrie implique que le module est en ligne
    updateModuleStatus(data.moduleId, true);

    // Mise à jour avec la VRAIE timestamp de télémétrie
    const telemetryTimestamp = data.timestamp ? new Date(data.timestamp) : new Date();
    updateModuleLastSeenInTable(data.moduleId, telemetryTimestamp);

    // Forcer le tri pour repositionner par activité récente
    applySorting('modules');
  });

  // Réponses aux commandes
  window.socket.on('module_command_response', data => {
    window.showToast?.(`✅ ${data.moduleId}: ${data.command} → ${data.status}`, 'success', 3000);
  });
}

/**
 * Configure les écouteurs d'événements de connexion/déconnexion utilisateur
 * Affiche des notifications toast pour les changements d'état utilisateur
 * @returns {void}
 * @private
 */
function setupUserEvents() {
  // Gestion des connexions utilisateur
  window.socket.on('rt_user_logged_in', data => {
    window.showToast?.(
      `👤 ${data.user.name} connecté${data.user.isNewUser ? ' (nouveau)' : ''}`,
      'info',
      3000
    );
  });

  // Gestion des déconnexions utilisateur
  window.socket.on('rt_user_logged_out', data => {
    window.showToast?.(`👤 ${data.user.name} déconnecté`, 'info', 3000);
  });
}

/**
 * Affiche une notification temps réel dans l'interface d'administration
 * Utilise le système toast global et une zone de notifications spécialisée
 * @param {string} message - Message à afficher dans la notification
 * @returns {void}
 * @public
 */
function showRealTimeNotification(message) {
  // Utiliser le système de toast global s'il est disponible
  if (window.showToast) {
    window.showToast(message, 'info', 3000);
  }

  // Ajouter aussi dans une zone de notifications admin spécialisée si elle existe
  const notificationArea = document.querySelector('.admin-notifications');
  if (notificationArea) {
    const notification = document.createElement('div');
    notification.className = 'admin-notification fade-in';
    notification.innerHTML = `
      <span class="notification-time">${new Date().toLocaleTimeString()}</span>
      <span class="notification-message">${message}</span>
    `;

    notificationArea.insertBefore(notification, notificationArea.firstChild);

    // Garder seulement les 10 dernières notifications
    const notifications = notificationArea.querySelectorAll('.admin-notification');
    if (notifications.length > 10) {
      notifications[notifications.length - 1].remove();
    }

    // Auto-fade après 10 secondes
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 500);
    }, 10000);
  }
}

// Export des fonctions pour utilisation globale
window.updateModuleStatus = updateModuleStatus;
window.updateModuleLastSeen = updateModuleLastSeen;
window.showRealTimeNotification = showRealTimeNotification;
