/**
 * ================================================================================
 * MICROCOASTER WEBAPP - DASHBOARD PAGE
 * ================================================================================
 *
 * Purpose: Dashboard functionality for real-time module monitoring
 * Author: MicroCoaster Development Team
 * Created: 2024
 *
 * Description:
 * Manages the dashboard interface including real-time module status updates,
 * statistics counters, WebSocket event handling, and interactive elements.
 * Provides live updates for online/offline module counts and visual feedback.
 *
 * Dependencies:
 * - global.js (WebSocket connection and utilities)
 * - Socket.io (for real-time updates)
 *
 * ================================================================================
 */

// ================================================================================
// DASHBOARD STATE MANAGEMENT
// ================================================================================

const moduleStatus = new Map();
let onlineModules = 0;
let offlineModules = 0;

// ================================================================================
// INITIALIZATION
// ================================================================================

document.addEventListener('DOMContentLoaded', function () {
  initializeDashboard();
  initializeDashboardWebSocket();

  const addModuleBtn = document.getElementById('addModuleBtn');
  if (addModuleBtn) {
    addModuleBtn.addEventListener('click', addNewModule);
  }
});

function addNewModule() {
  window.location.href = '/modules#add';
}

// ================================================================================
// DASHBOARD SETUP
// ================================================================================

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

// ================================================================================
// WEBSOCKET INTEGRATION
// ================================================================================

function initializeDashboardWebSocket() {
  let webSocketReady = false;

  function setupWebSocketListeners() {
    if (typeof window.socket !== 'undefined' && window.socket && window.socket.connected) {
      window.socket.on('module_online', function (data) {
        updateModuleStatus(data.moduleId, true);
      });

      window.socket.on('module_offline', function (data) {
        updateModuleStatus(data.moduleId, false);
      });

      window.socket.on('module_presence', function (data) {
        updateModuleStatus(data.moduleId, data.online);
      });

      window.socket.on('modules_state', function (modules) {
        modules.forEach(module => {
          updateModuleStatus(module.moduleId, module.online);
        });
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

// ================================================================================
// STATISTICS MANAGEMENT
// ================================================================================

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

// ================================================================================
// VISUAL EFFECTS
// ================================================================================

function animateCounterUpdate(element, newValue) {
  element.style.transform = 'scale(1.1)';
  element.style.transition = 'transform 0.2s ease';

  setTimeout(() => {
    element.textContent = newValue;
    element.style.transform = 'scale(1)';
  }, 100);
}
