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
 * Initialise la connexion WebSocket pour le dashboard
 * Configure les écouteurs d'événements temps réel avec fallback polling
 * @returns {void}
 */
function initializeDashboardWebSocket() {
  let webSocketReady = false;

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

      webSocketReady = true;
      return true;
    }
    return false;
  }

  window.addEventListener('websocket-ready', function () {
    if (!webSocketReady) {
      setupWebSocketListeners();
    }
  });

  if (typeof window.socket !== 'undefined' && window.socket) {
    if (setupWebSocketListeners()) {
      return;
    }
  }

  setTimeout(() => {
    if (!webSocketReady) {
      startStatsPolling();
    }
  }, 2000);
}

/**
 * Démarre le sondage périodique des statistiques
 * Fallback pour mise à jour des compteurs en l'absence de WebSocket
 * @returns {void}
 */
function startStatsPolling() {
  setInterval(async () => {
    try {
      const response = await fetch('/dashboard/stats');
      if (response.ok) {
        const stats = await response.json();
        updateCountersFromStats(stats);
      }
    } catch (error) {
      if (window.MC?.isDevelopment) {
        console.error('Error polling stats:', error);
      }
    }
  }, 10000);
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
  const onlineElement = document.querySelector('.dashboard-stat.online');
  const offlineElement = document.querySelector('.dashboard-stat.offline');

  if (!onlineElement || !offlineElement) {
    console.warn('Dashboard counter elements not found');
    return;
  }

  const previousStatus = moduleStatus.get(moduleId);

  if (previousStatus === isOnline) {
    return;
  }

  moduleStatus.set(moduleId, isOnline);

  // Seulement mettre à jour si c'est un changement de statut (pas une nouvelle détection)
  // Si previousStatus === undefined, le module est déjà compté dans les stats initiales du DOM
  if (previousStatus !== undefined) {
    if (previousStatus === false && isOnline === true) {
      // Module passe d'offline à online
      onlineModules++;
      if (offlineModules > 0) offlineModules--;
    } else if (previousStatus === true && isOnline === false) {
      // Module passe d'online à offline
      if (onlineModules > 0) onlineModules--;
      offlineModules++;
    }

    animateCounterUpdate(onlineElement, onlineModules);
    animateCounterUpdate(offlineElement, offlineModules);
  }
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
