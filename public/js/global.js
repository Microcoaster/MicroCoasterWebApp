/**
 * ================================================================================
 * MICROCOASTER WEBAPP - GLOBAL CLIENT UTILITIES
 * ================================================================================
 *
 * Purpose: Shared JavaScript utilities and global functions for all pages
 * Author: MicroCoaster Development Team
 * Created: 2024
 *
 * Description:
 * Provides common functionality including WebSocket connection management,
 * toast notifications, clipboard utilities, image preloading, and global
 * configuration for the client-side application.
 *
 * Dependencies:
 * - Socket.io (optional, for WebSocket functionality)
 *
 * ================================================================================
 */

// ================================================================================
// GLOBAL CONFIGURATION
// ================================================================================

window.MC = window.MC || {};

const IMG_BASE = '/assets/img/';
const urlImg = name => IMG_BASE + name;

function preload(paths) {
  for (const s of paths) {
    const i = new Image();
    i.src = s;
  }
}

// ================================================================================
// TOAST NOTIFICATIONS
// ================================================================================

(function () {
  function ensureWrap() {
    return (
      document.getElementById('toasts') ||
      (() => {
        const d = document.createElement('div');
        d.id = 'toasts';
        d.className = 'toasts';
        document.body.appendChild(d);
        return d;
      })()
    );
  }

  function getToastIcon(type) {
    switch (type) {
      case 'success':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>`;
      case 'error':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>`;
      case 'info':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>`;
      case 'warning':
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>`;
      default:
        return `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>`;
    }
  }

  window.showToast = function (message, type = 'success', duration = 2400) {
    const wrap = ensureWrap();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `
      ${getToastIcon(type)}
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Close">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    `;
    wrap.appendChild(el);
    const close = () => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 180);
    };
    el.querySelector('.toast-close').addEventListener('click', close);
    if (duration > 0) setTimeout(close, duration);
  };
})();

// ================================================================================
// CLIPBOARD UTILITIES
// ================================================================================

window.copyToClipboard = function (text, element = null) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (element) {
          element.classList.add('copied');
          setTimeout(() => element.classList.remove('copied'), 900);
        }
        window.showToast?.('Copied to clipboard', 'success', 1500);
      })
      .catch(() => {
        window.showToast?.('Failed to copy', 'error', 2000);
      });
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      if (element) {
        element.classList.add('copied');
        setTimeout(() => element.classList.remove('copied'), 900);
      }
      window.showToast?.('Copied to clipboard', 'success', 1500);
    } catch {
      window.showToast?.('Failed to copy', 'error', 2000);
    }
    document.body.removeChild(textArea);
  }
};

// ================================================================================
// WEBSOCKET CONNECTION
// ================================================================================

let socket = null;
let isInitializing = false;

function initializeWebSocket() {
  // Éviter les initialisations multiples
  if (socket && socket.connected) {
    // WebSocket already connected
    return socket;
  }

  if (isInitializing) {
    // WebSocket initialization in progress
    return;
  }

  try {
    isInitializing = true;
    // Initializing WebSocket connection...
    socket = io({
      // Désactiver la reconnexion automatique lors du changement de page
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 5,
      timeout: 10000,
      forceNew: false, // Réutiliser la connexion si possible
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', function () {
      // WebSocket connected      // Auto-authentification si des informations utilisateur sont disponibles
      if (window.MC && window.MC.userId) {
        const authData = {
          userId: window.MC.userId,
          userType: window.MC.userRole === 'admin' ? 'admin' : 'user',
          userName: window.MC.userName,
          page: getCurrentPageName(),
        };
        // Auto-authenticating...
        socket.emit('client:authenticate', authData);
      }

      window.dispatchEvent(new CustomEvent('websocket-ready'));
    });

    socket.on('disconnect', function (reason) {
      // WebSocket disconnected
      isInitializing = false;

      // Ne pas reconnecter automatiquement si c'est intentionnel
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        // Intentional disconnect
      }
    });

    socket.on('error', function (data) {
      console.error('❌ WebSocket error:', data);
      if (data.message) {
        window.showToast?.(data.message, 'error', 3000);
      }
    });

    socket.on('connect_error', function (error) {
      console.error('❌ WebSocket connection error:', error);
    });

    socket.on('reconnect', function (attemptNumber) {
      console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_attempt', function (attemptNumber) {
      console.log('🔄 WebSocket reconnection attempt:', attemptNumber);
    });

    // Écouter les réponses d'authentification
    socket.on('client:auth:success', data => {
      // Authentifié avec succès
    });

    socket.on('client:auth:error', data => {
      console.error('❌ [GLOBAL] Erreur authentification:', data);
    });

    // ================================================================================
    // ÉVÉNEMENTS TEMPS RÉEL POUR ADMIN
    // ================================================================================

    // Statistiques globales temps réel (pour la page admin)
    socket.on('simple_stats_update', function (data) {
      if (getCurrentPageName() === 'admin' && window.updateSimpleStats) {
        window.updateSimpleStats(data);
      }
    });

    // Demander les stats immédiatement si on est sur la page admin (ton approche)
    if (getCurrentPageName() === 'admin') {
      socket.emit('request_stats');
      // Demande de stats au chargement
    } // Événements utilisateurs (pour la page admin)
    socket.on('rt_user_logged_in', function (data) {
      if (getCurrentPageName() === 'admin' && window.showRealTimeNotification) {
        const message = `👤 ${data.user.name} s'est connecté${data.user.isNewUser ? ' (nouveau compte)' : ''}`;
        window.showRealTimeNotification(message);
      }
    });

    socket.on('rt_user_logged_out', function (data) {
      if (getCurrentPageName() === 'admin' && window.showRealTimeNotification) {
        window.showRealTimeNotification(`👤 ${data.user.name} s'est déconnecté`);
      }
    });

    // Événements modules (pour la page admin)
    socket.on('rt_module_online', function (data) {
      if (getCurrentPageName() === 'admin' && window.updateModuleStatus) {
        window.updateModuleStatus(data.moduleId, true);
        if (data.lastSeen && window.updateModuleLastSeen) {
          window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
        }
      }
    });

    socket.on('rt_module_offline', function (data) {
      if (getCurrentPageName() === 'admin' && window.updateModuleStatus) {
        window.updateModuleStatus(data.moduleId, false);
        if (data.lastSeen && window.updateModuleLastSeen) {
          window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
        }
      }
    });

    // Événements télémétrie et dernière activité
    socket.on('rt_telemetry_updated', function (data) {
      // Télémétrie reçue (logs désactivés pour éviter le spam)
      // Mettre à jour la dernière activité du module
      if (getCurrentPageName() === 'admin' && data.lastSeen && window.updateModuleLastSeen) {
        window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
      }
    });

    socket.on('rt_module_last_seen_updated', function (data) {
      // Dernière activité mise à jour (logs désactivés pour éviter le spam)
      if (getCurrentPageName() === 'admin' && window.updateModuleLastSeen) {
        window.updateModuleLastSeen(data.moduleId, data.lastSeen, data.lastSeenFormatted);
      }
    });

    window.socket = socket;
    isInitializing = false;
  } catch (error) {
    console.error('❌ Failed to initialize WebSocket:', error);
    isInitializing = false;
  }
}

// Fonction utilitaire pour détecter la page actuelle
function getCurrentPageName() {
  const path = window.location.pathname;
  if (path.includes('/admin')) return 'admin';
  if (path.includes('/dashboard')) return 'dashboard';
  if (path.includes('/modules')) return 'modules';
  if (path.includes('/timelines')) return 'timelines';
  return 'unknown';
}

// ================================================================================
// INITIALIZATION
// ================================================================================

document.addEventListener('DOMContentLoaded', function () {
  window.MC = window.MC || {};
  window.MC.isDevelopment = document.querySelector('meta[name="env"]')?.content === 'development';

  window.IMG_BASE = IMG_BASE;
  window.urlImg = urlImg;
  window.preload = preload;

  if (typeof io !== 'undefined') {
    initializeWebSocket();
  }

  // Gérer la fermeture propre lors du changement de page
  window.addEventListener('beforeunload', function () {
    if (window.socket && window.socket.connected) {
      // Disconnecting on page unload
      window.socket.disconnect();
    }
  });

  // Gérer aussi la navigation interne
  window.addEventListener('pagehide', function () {
    if (window.socket && window.socket.connected) {
      // Disconnecting on page hide
      window.socket.disconnect();
    }
  });
});
