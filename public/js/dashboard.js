/**
 * Tableau de bord - Interface de surveillance temps réel des modules
 *
 * Gère l'interface du dashboard incluant les mises à jour de statut temps réel,
 * compteurs de statistiques, gestion d'événements WebSocket et éléments interactifs.
 *
 * @module dashboard
 * @description Interface de surveillance avec mises à jour temps réel et statistiques
 */

const moduleStatus = new Map();
let onlineModules = 0;
let offlineModules = 0;

document.addEventListener('DOMContentLoaded', function () {
  initializeDashboard();
  initializeDashboardWebSocket();

  const addModuleBtn = document.getElementById('addModuleBtn');
  if (addModuleBtn) {
    addModuleBtn.addEventListener('click', addNewModule);
  }
});

/**
 * Redirige vers la page d'ajout de modules
 * Navigation vers l'interface de gestion des modules avec ancrage d'ajout
 * @returns {void}
 */
function addNewModule() {
  window.location.href = '/modules#add';
}

/**
 * Initialise l'interface du tableau de bord
 * Configure les statistiques initiales et lance les animations d'entrée des cartes
 * @returns {void}
 */
function initializeDashboard() {
  const onlineElement = document.querySelector('.dashboard-stat.online');
  const offlineElement = document.querySelector('.dashboard-stat.offline');

  if (onlineElement && offlineElement) {
    onlineModules = parseInt(onlineElement.textContent || '0');
    offlineModules = parseInt(offlineElement.textContent || '0');
  }

  // Initialiser la Map moduleStatus avec l'état actuel (tous les modules sont considérés online par défaut)
  // Cette initialisation permet de gérer correctement les transitions de statut
  initializeModuleStatusMap();

  const cards = document.querySelectorAll('.dashboard-card');
  cards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';

    setTimeout(() => {
      card.style.transition = 'all 0.5s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, index * 100);
  });
}

/**
 * Initialise la Map moduleStatus avec l'état actuel des modules
 * Récupère la liste des modules depuis le DOM et les marque comme online par défaut
 * Cela permet de gérer correctement les transitions de statut WebSocket
 * @returns {void}
 */
function initializeModuleStatusMap() {
  // Récupérer tous les modules depuis les éléments du DOM
  const moduleElements = document.querySelectorAll('[data-module-id]');

  moduleElements.forEach(element => {
    const moduleId = element.getAttribute('data-module-id');
    if (moduleId) {
      // Par défaut, considérer que les modules affichés sont online
      // Cette hypothèse est valide car les modules offline ne sont généralement pas affichés
      moduleStatus.set(moduleId, true);
    }
  });

  // Alternative: récupérer depuis l'API pour être plus précis
  fetch('/dashboard/stats')
    .then(response => response.json())
    .then(stats => {
      // Cette fonction pourrait être étendue pour synchroniser précisément
      // mais pour l'instant, l'approche DOM est suffisante
    })
    .catch(error => {
      if (window.MC?.isDevelopment) {
        console.warn('Could not initialize module status map from API:', error);
      }
    });
}

/**
 * Initialise la connexion WebSocket pour le dashboard
 * Configure les écouteurs d'événements temps réel pour les mises à jour de statut
 * @returns {void}
 */
function initializeDashboardWebSocket() {
  /**
   * Configure les écouteurs d'événements WebSocket
   * Établit la communication temps réel pour les mises à jour de statut
   * @returns {boolean} True si WebSocket prêt, false sinon
   * @private
   */
  function setupWebSocketListeners() {
    if (typeof window.socket !== 'undefined' && window.socket && window.socket.connected) {
      window.socket.on('user:module:online', function (data) {
        updateModuleStatus(data.moduleId, true);
      });

      window.socket.on('user:module:offline', function (data) {
        updateModuleStatus(data.moduleId, false);
      });

      return true;
    }
    return false;
  }

  // Essayer immédiatement
  if (!setupWebSocketListeners()) {
    // Attendre l'événement websocket-ready
    window.addEventListener('websocket-ready', function () {
      setupWebSocketListeners();
    });
  }
}

/**
 * Met à jour les compteurs de statistiques depuis les données du serveur
 * Compare les valeurs actuelles avec les nouvelles et anime les changements
 * @param {Object} stats - Objet contenant les statistiques des modules
 * @param {number} stats.onlineModules - Nombre de modules en ligne
 * @param {number} stats.offlineModules - Nombre de modules hors ligne
 * @returns {void}
 */
function updateCountersFromStats(stats) {
  const onlineElement = document.querySelector('.dashboard-stat.online');
  const offlineElement = document.querySelector('.dashboard-stat.offline');

  if (onlineElement && offlineElement) {
    const currentOnline = parseInt(onlineElement.textContent || '0');
    const currentOffline = parseInt(offlineElement.textContent || '0');

    if (currentOnline !== stats.onlineModules) {
      animateCounterUpdate(onlineElement, stats.onlineModules);
      onlineModules = stats.onlineModules;
    }

    if (currentOffline !== stats.offlineModules) {
      animateCounterUpdate(offlineElement, stats.offlineModules);
      offlineModules = stats.offlineModules;
    }
  }
}

/**
 * Met à jour le statut d'un module spécifique et ajuste les compteurs
 * Gère les transitions d'état en temps réel avec animation des compteurs
 * @param {string} moduleId - Identifiant unique du module
 * @param {boolean} isOnline - Nouveau statut du module (true=en ligne, false=hors ligne)
 * @returns {void}
 */
function updateModuleStatus(moduleId, isOnline) {
  const previousStatus = moduleStatus.get(moduleId);

  // Si pas de changement de statut, ne rien faire
  if (previousStatus === isOnline) {
    return;
  }

  // Mettre à jour la Map avec le nouveau statut
  moduleStatus.set(moduleId, isOnline);

  // Récupérer les vraies statistiques du serveur pour mettre à jour les compteurs
  fetch('/dashboard/stats')
    .then(response => response.json())
    .then(stats => {
      updateCountersFromStats(stats);
    })
    .catch(error => {
      if (window.MC?.isDevelopment) {
        console.error('Error fetching updated stats:', error);
      }
    });
}

/**
 * Anime la mise à jour d'un compteur avec effet de zoom
 * Applique une transition visuelle avec échelle et changement de valeur
 * @param {HTMLElement} element - Élément DOM du compteur à animer
 * @param {number} newValue - Nouvelle valeur à afficher
 * @returns {void}
 */
function animateCounterUpdate(element, newValue) {
  element.style.transform = 'scale(1.1)';
  element.style.transition = 'transform 0.2s ease';

  setTimeout(() => {
    element.textContent = newValue;
    element.style.transform = 'scale(1)';
  }, 100);
}
