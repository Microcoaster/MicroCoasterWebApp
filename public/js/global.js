/**
 * Utilitaires globaux client - Fonctions partagées et configuration
 *
 * Fournit les fonctionnalités communes incluant la gestion des connexions WebSocket,
 * notifications toast, utilitaires clipboard, préchargement d'images et configuration globale.
 *
 * @module global
 * @description Utilitaires JavaScript partagés pour toutes les pages de l'application
 */

window.MC = window.MC || {};
window.MC.translations = window.MC.translations || {};

const IMG_BASE = '/assets/img/';
/**
 * Génère l'URL complète d'une image depuis son nom
 * Combine le chemin de base avec le nom du fichier
 * @param {string} name - Nom du fichier image
 * @returns {string} URL complète de l'image
 */
const urlImg = name => `${IMG_BASE}${name}`;

/**
 * Charge les traductions depuis le serveur
 * Récupère dynamiquement les traductions de la langue courante
 * @returns {Promise<Object>} Objet des traductions ou objet vide en cas d'erreur
 */
async function loadTranslations() {
  try {
    const response = await fetch('/api/language/translations');
    const data = await response.json();
    window.MC.translations = data.translations;
    window.MC.currentLanguage = data.language;
    return data.translations;
  } catch {
    return {};
  }
}

/**
 * Obtient le texte traduit par clé hiérarchique (ex: 'common.save')
 * Récupère et interpole les traductions avec gestion des paramètres
 * @param {string} key - Clé de traduction hiérarchique (pointée)
 * @param {Object} [params={}] - Paramètres pour interpolation {{param}}
 * @returns {string} Texte traduit ou clé si non trouvée
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
        } catch {
          // Ignorer les erreurs de mise à jour de traduction
        }
      });
      window.pendingTranslationUpdates = []; // Vider la liste
    }
  });
});

/**
 * Précharge une liste d'images pour optimiser les performances
 * Crée des objets Image en cache pour éviter les délais de chargement
 * @param {string[]} paths - Tableau des chemins d'images à précharger
 * @returns {void}
 */
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

/**
 * Copie du texte dans le presse-papiers avec retour visuel
 * Utilise l'API Clipboard moderne avec fallback legacy et animations CSS
 * @param {string} text - Texte à copier dans le presse-papiers
 * @param {HTMLElement|null} [element=null] - Élément pour animation visuelle
 * @returns {void}
 */
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

/**
 * Initialise la connexion WebSocket avec authentification automatique
 * Configure Socket.IO avec polling, gestion des événements et authentification utilisateur
 * @returns {Object|undefined} Instance socket si déjà connectée, undefined sinon
 * @throws {Error} Si l'initialisation WebSocket échoue
 * @public
 */
function initializeWebSocket() {
  // Éviter les initialisations multiples
  if (socket && socket.connected) {
    return socket;
  }

  if (isInitializing) {
    return;
  }

  try {
    isInitializing = true;

    // Configuration Socket.IO optimisée pour la stabilité
    socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 5,
      timeout: 10000,
      forceNew: false, // Réutilise les connexions existantes
      transports: ['polling'], // Force polling pour éviter les conflits WebSocket
      upgrade: false, // Désactive l'upgrade automatique vers WebSocket
    });

    // Événement de connexion WebSocket avec authentification automatique
    socket.on('connect', function () {
      // Auto-authentification si des informations utilisateur sont disponibles
      if (window.MC && window.MC.userId) {
        const authData = {
          userId: window.MC.userId,
          userType: window.MC.userRole === 'admin' ? 'admin' : 'user',
          userName: window.MC.userName,
          page: getCurrentPageName(),
        };
        socket.emit('client:authenticate', authData);
      }

      // Notifier que WebSocket est prêt pour les autres modules
      window.dispatchEvent(new CustomEvent('websocket-ready'));
    });

    // Gestion des déconnexions WebSocket
    socket.on('disconnect', function () {
      isInitializing = false;
    });

    socket.on('error', function (data) {
      if (data.message) {
        window.showToast?.(data.message, 'error', 3000);
      }
    });

    socket.on('connect_error', function (error) {
      if (error.message && !error.message.includes('websocket error')) {
        window.showToast?.(`Erreur de connexion: ${error.message}`, 'error', 3000);
      }
    });

    // Gestion des événements temps réel pour l'interface d'administration
    socket.on('simple_stats_update', function (data) {
      if (getCurrentPageName() === 'admin' && window.updateSimpleStats) {
        window.updateSimpleStats(data);
      }
    });

    // Demande immédiate des statistiques si on est sur la page admin
    if (getCurrentPageName() === 'admin') {
      socket.emit('request_stats');
    }

    window.socket = socket;
    isInitializing = false;
  } catch {
    isInitializing = false;
  }
}

/**
 * Détecte la page actuelle basée sur l'URL pour la configuration WebSocket
 * Analyse le pathname pour déterminer le contexte de l'application
 * @returns {string} Nom de la page ('admin', 'dashboard', 'modules', 'timelines', 'unknown')
 * @private
 */
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

  // Gestion de la fermeture propre de WebSocket lors des changements de page
  window.addEventListener('beforeunload', function () {
    if (window.socket && window.socket.connected) {
      window.socket.disconnect();
    }
  });
});
