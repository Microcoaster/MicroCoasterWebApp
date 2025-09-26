/**
 * Admin Page JavaScript
 * Gestion des fonctionnalités de la page d'administration
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser les badges de types pour tous les modules affichés
    initializeModuleTypeBadges();
    
    // Initialiser les fonctionnalités de pagination si présentes
    initializePagination();
    
    // Initialiser les filtres si présents
    initializeFilters();
});

/**
 * Génère le badge HTML pour un type de module
 * @param {string} moduleType - Le type du module
 * @returns {string} HTML du badge
 */
function getTypeBadge(moduleType) {
    if (!moduleType) return getTypeBadge('unknown');
    
    const type = moduleType.toLowerCase().trim();
    
    // Mapping des types vers les classes CSS et icônes
    const typeConfig = {
        'station': {
            class: 'station',
            icon: '🟣',
            label: 'Station'
        },
        'launch track': {
            class: 'launch-track',
            icon: '🔴', 
            label: 'Launch Track'
        },
        'launch-track': {
            class: 'launch-track',
            icon: '🔴',
            label: 'Launch Track'
        },
        'switch track': {
            class: 'switch-track',
            icon: '🟠',
            label: 'Switch Track'
        },
        'switch-track': {
            class: 'switch-track',
            icon: '🟠',
            label: 'Switch Track'
        },
        'light fx': {
            class: 'light-fx',
            icon: '🟡',
            label: 'Light FX'
        },
        'light-fx': {
            class: 'light-fx',
            icon: '🟡',
            label: 'Light FX'
        },
        'audio player': {
            class: 'audio-player',
            icon: '🔵',
            label: 'Audio Player'
        },
        'audio-player': {
            class: 'audio-player',
            icon: '🔵',
            label: 'Audio Player'
        },
        'smoke machine': {
            class: 'smoke-machine',
            icon: '⚫',
            label: 'Smoke Machine'
        },
        'smoke-machine': {
            class: 'smoke-machine',
            icon: '⚫',
            label: 'Smoke Machine'
        }
    };
    
    const config = typeConfig[type] || {
        class: 'unknown',
        icon: '⚫',
        label: 'Unknown'
    };
    
    return `<span class="type-badge ${config.class}" title="${config.label}">
        ${config.label}
    </span>`;
}

/**
 * Initialise les badges de types pour tous les modules visibles
 */
function initializeModuleTypeBadges() {
    // Chercher tous les éléments qui ont besoin d'un badge de type
    const typeElements = document.querySelectorAll('[data-module-type]');
    
    typeElements.forEach((element, index) => {
        const moduleType = element.getAttribute('data-module-type');
        const badge = getTypeBadge(moduleType);
        
        // Remplacer le contenu
        element.innerHTML = badge;
    });
}

/**
 * Initialise les fonctionnalités de pagination
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
 * Initialise les filtres de la page admin
 */
function initializeFilters() {
    // Tous les filtres de colonnes (inputs et selects)
    const columnFilters = document.querySelectorAll('.column-filter');
    
    columnFilters.forEach(filter => {
        const eventType = filter.tagName.toLowerCase() === 'select' ? 'change' : 'input';
        filter.addEventListener(eventType, function() {
            applyFilters();
        });
    });
    
    // Boutons de réinitialisation des filtres
    const clearUsersBtn = document.getElementById('clearUsersFilters');
    const clearModulesBtn = document.getElementById('clearModulesFilters');
    
    if (clearUsersBtn) {
        clearUsersBtn.addEventListener('click', function() {
            clearFilters('users');
        });
    }
    
    if (clearModulesBtn) {
        clearModulesBtn.addEventListener('click', function() {
            clearFilters('modules');
        });
    }
}

/**
 * Efface tous les filtres d'une table
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
 * Applique les filtres sélectionnés (côté client uniquement)
 */
function applyFilters() {
    // Filtrer les utilisateurs
    filterTable('users');
    
    // Filtrer les modules
    filterTable('modules');
    
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
 * Filtre une table spécifique basée sur ses filtres de colonnes
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
                    cellValue = tableType === 'users' ? 
                        (cells[0] ? cells[0].textContent.toLowerCase() : '') :
                        (cells[1] ? cells[1].textContent.toLowerCase() : '');
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
 * Met à jour un badge de type de module dynamiquement
 * @param {HTMLElement} element - L'élément à mettre à jour
 * @param {string} newType - Le nouveau type de module
 */
function updateModuleTypeBadge(element, newType) {
    if (!element) return;
    
    const badge = getTypeBadge(newType);
    element.innerHTML = badge;
    element.setAttribute('data-module-type', newType);
}

/**
 * Convertit les anciens badges en nouveaux badges avec icônes
 */
function convertLegacyBadges() {
    const legacyBadges = document.querySelectorAll('.badge-station, .badge-launch-track, .badge-switch-track, .badge-light-fx, .badge-audio-player, .badge-smoke-machine, .badge-unknown');
    
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
 * Initialise tout après le chargement de la page
 */
function initializeAll() {
    // Attendre un peu pour s'assurer que le DOM est complètement chargé
    setTimeout(() => {
        // Vérifier que les tables existent
        const usersTable = document.querySelector('.admin-table[data-table="users"]');
        const modulesTable = document.querySelector('.admin-table[data-table="modules"]');
        
        initializeModuleTypeBadges();
        convertLegacyBadges();
        initializePagination();
        initializeFilters();
        
        // Initialiser la pagination côté client
        initializeClientSidePagination();
        

    }, 100);
}

/**
 * Initialise la pagination côté client
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



// Remplacer l'ancien event listener
document.removeEventListener('DOMContentLoaded', function() {
    initializeModuleTypeBadges();
    initializePagination();
    initializeFilters();
});

document.addEventListener('DOMContentLoaded', initializeAll);



// État de pagination côté client
const paginationState = {
    users: { page: 1, itemsPerPage: 10 },
    modules: { page: 1, itemsPerPage: 10 }
};

/**
 * Fonctions de pagination côté client (sans URL)
 */
window.changeItemsPerPage = function(select) {
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

window.navigatePage = function(table, direction, event) {
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
            const allRows = Array.from(tableElement.querySelectorAll('tbody tr:not(.filter-row):not(.no-results-row)'));
            const visibleRows = allRows.filter(row => 
                !row.classList.contains('filtered-hidden') && 
                row.style.display !== 'none'
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
 * Applique la pagination côté client
 */
function applyClientSidePagination(tableType) {
    const table = document.querySelector(`.admin-table[data-table="${tableType}"]`);
    if (!table) return;
    
    // Récupérer seulement les lignes visibles (non filtrées)
    const allRows = Array.from(table.querySelectorAll('tbody tr:not(.filter-row):not(.no-results-row)'));
    const visibleRows = allRows.filter(row => 
        !row.classList.contains('filtered-hidden') && 
        row.style.display !== 'none'
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
 * Met à jour les contrôles de pagination
 */
function updatePaginationControls(tableType) {
    const table = document.querySelector(`.admin-table[data-table="${tableType}"]`);
    if (!table) return;
    
    // Compter seulement les lignes visibles (non filtrées)
    const allRows = Array.from(table.querySelectorAll('tbody tr:not(.filter-row):not(.no-results-row)'));
    const visibleRows = allRows.filter(row => 
        !row.classList.contains('filtered-hidden') && 
        row.style.display !== 'none'
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
        prevBtn.disabled = (page <= 1);
        prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
    }
    
    if (nextBtn) {
        nextBtn.disabled = (page >= totalPages || totalPages === 0);
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
 * Exporte les fonctions principales pour utilisation externe
 */
window.getTypeBadge = getTypeBadge;
window.updateModuleTypeBadge = updateModuleTypeBadge;
window.convertLegacyBadges = convertLegacyBadges;
window.initializeModuleTypeBadges = initializeModuleTypeBadges;
