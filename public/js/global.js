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
window.MC.translations = window.MC.translations || {};

const IMG_BASE = '/assets/img/';
const urlImg = name => IMG_BASE + name;

// ================================================================================
// CLIENT-SIDE TRANSLATION SYSTEM
// ================================================================================

/**
 * Load translations from server
 */
async function loadTranslations() {
  try {
    const response = await fetch('/api/language/translations');
    const data = await response.json();
    window.MC.translations = data.translations;
    window.MC.currentLanguage = data.language;
    return data.translations;
  } catch (error) {
    console.warn('Failed to load translations:', error);
    return {};
  }
}

/**
 * Get translated text by key path (e.g., 'common.save')
 * @param {string} key - The translation key path
 * @param {object} params - Parameters for interpolation
 * @returns {string} The translated text or the key if not found
 */
function t(key, params = {}) {
  const keys = key.split('.');
  let value = window.MC.translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key; // Return key if not found
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Simple interpolation for parameters like {{count}}
  let result = value;
  for (const [param, replacement] of Object.entries(params)) {
    result = result.replace(new RegExp(`{{${param}}}`, 'g'), replacement);
  }

  return result;
}

// Make translation function globally available
window.t = t;

// Auto-load translations when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadTranslations().then(() => {
    // Appliquer les mises à jour de traduction en attente
    if (window.pendingTranslationUpdates && Array.isArray(window.pendingTranslationUpdates)) {
      window.pendingTranslationUpdates.forEach(updateFn => {
        try {
          updateFn();
        } catch (error) {
          console.warn('Error applying pending translation update:', error);
        }
      });
      window.pendingTranslationUpdates = []; // Vider la liste
    }

    // Mettre à jour tous les éléments avec des clés de traduction non résolues
    document.querySelectorAll('[data-state]').forEach(element => {
      if (element.textContent && element.textContent.startsWith('modules.')) {
        const key = element.textContent;
        const translated = window.t(key);
        if (translated !== key) {
          element.textContent = translated;
        }
      }
    });
  });
});

function preload(paths) {
  for (const s of paths) {
    const i = new Image();
    i.src = s;
  }
}

// ================================================================================
// TOAST NOTIFICATIONS 
// ================================================================================
// Toasts sont maintenant gérés par toast.js - inclure ce fichier dans les pages

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
      transports: ['polling'], // Utiliser SEULEMENT polling pour éviter complètement les conflits WebSocket
      upgrade: false, // Désactiver l'upgrade WebSocket pour une compatibilité parfaite
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
      console.error('❌ Socket.IO connection error:', error);
      // Ne pas afficher d'erreur si c'est juste un fallback vers polling
      if (error.message && !error.message.includes('websocket error')) {
        window.showToast?.('Erreur de connexion: ' + error.message, 'error', 3000);
      }
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
    } // Événements maintenant gérés par toast.js

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
