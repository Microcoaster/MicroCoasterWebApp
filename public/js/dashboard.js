/* =========================================================
 * MicroCoaster - Dashboard Page JavaScript
 * Fonctions spécifiques au tableau de bord
 * =======================================================*/

// Variables globales pour les statistiques en temps réel
let moduleStatus = new Map(); // moduleId -> boolean (online/offline)
let onlineModules = 0;
let offlineModules = 0;

document.addEventListener('DOMContentLoaded', function() {
  initializeDashboard();
  initializeWebSocket();
});

function addNewModule() {
  window.location.href = '/modules#add';
}

function initializeDashboard() {
  // Récupérer les compteurs initiaux depuis le DOM
  const onlineElement = document.querySelector('.dashboard-stat.online');
  const offlineElement = document.querySelector('.dashboard-stat.offline');
  
  if (onlineElement && offlineElement) {
    onlineModules = parseInt(onlineElement.textContent || '0');
    offlineModules = parseInt(offlineElement.textContent || '0');
    console.log(`📊 Initial counters: ${onlineModules} online, ${offlineModules} offline`);
  }

  // Animation d'entrée des cartes
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
  
  console.log('📊 Dashboard initialized');
}

function initializeWebSocket() {
  let webSocketReady = false;
  
  // Fonction pour configurer les listeners WebSocket
  function setupWebSocketListeners() {
    if (typeof window.socket !== 'undefined' && window.socket && window.socket.connected) {
      // Écouter les changements d'état des modules
      window.socket.on('module_online', function(data) {
        console.log('📡 Module online:', data.moduleId);
        updateModuleStatus(data.moduleId, true);
      });

      window.socket.on('module_offline', function(data) {
        console.log('📡 Module offline:', data.moduleId);
        updateModuleStatus(data.moduleId, false);
      });

      window.socket.on('module_presence', function(data) {
        console.log('📡 Module presence update:', data.moduleId, data.online);
        updateModuleStatus(data.moduleId, data.online);
      });

      // Écouter l'état initial des modules
      window.socket.on('modules_state', function(modules) {
        console.log('📡 Initial modules state:', modules);
        modules.forEach(module => {
          updateModuleStatus(module.moduleId, module.online);
        });
      });

      console.log('🔌 Dashboard WebSocket listeners initialized');
      webSocketReady = true;
      return true;
    }
    return false;
  }

  // Écouter l'événement de disponibilité WebSocket
  window.addEventListener('websocket-ready', function() {
    if (!webSocketReady) {
      setupWebSocketListeners();
    }
  });

  // Essayer immédiatement si Socket.IO est déjà disponible
  if (typeof window.socket !== 'undefined' && window.socket) {
    if (setupWebSocketListeners()) {
      return;
    }
  }

  // Fallback après délai si WebSocket n'est toujours pas prêt
  setTimeout(() => {
    if (!webSocketReady) {
      console.log('📊 Using polling fallback for dashboard updates');
      startStatsPolling();
    }
  }, 2000);
}

function startStatsPolling() {
  // Récupérer les stats toutes les 10 secondes
  setInterval(async () => {
    try {
      const response = await fetch('/dashboard/stats');
      if (response.ok) {
        const stats = await response.json();
        updateCountersFromStats(stats);
      }
    } catch (error) {
      console.error('Error polling stats:', error);
    }
  }, 10000);
  
  console.log('📊 Stats polling started (fallback mode)');
}

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

function updateModuleStatus(moduleId, isOnline) {
  const onlineElement = document.querySelector('.dashboard-stat.online');
  const offlineElement = document.querySelector('.dashboard-stat.offline');
  
  if (!onlineElement || !offlineElement) {
    console.warn('Dashboard counter elements not found');
    return;
  }

  // Vérifier le statut précédent du module
  const previousStatus = moduleStatus.get(moduleId);
  
  if (previousStatus === isOnline) {
    // Pas de changement, rien à faire
    return;
  }

  // Mettre à jour le statut du module
  moduleStatus.set(moduleId, isOnline);

  // Ajuster les compteurs selon le changement
  if (previousStatus === undefined) {
    // Nouveau module découvert
    if (isOnline) {
      onlineModules++;
    } else {
      offlineModules++;
    }
  } else if (previousStatus === false && isOnline === true) {
    // Module passe de offline à online
    onlineModules++;
    if (offlineModules > 0) offlineModules--;
  } else if (previousStatus === true && isOnline === false) {
    // Module passe de online à offline
    if (onlineModules > 0) onlineModules--;
    offlineModules++;
  }

  // Animation de mise à jour des compteurs
  animateCounterUpdate(onlineElement, onlineModules);
  animateCounterUpdate(offlineElement, offlineModules);

  console.log(`📊 Module ${moduleId} ${isOnline ? 'online' : 'offline'} - Counters: ${onlineModules} online, ${offlineModules} offline`);
}

function animateCounterUpdate(element, newValue) {
  // Animation simple de pulsation pour indiquer la mise à jour
  element.style.transform = 'scale(1.1)';
  element.style.transition = 'transform 0.2s ease';
  
  setTimeout(() => {
    element.textContent = newValue;
    element.style.transform = 'scale(1)';
  }, 100);
}