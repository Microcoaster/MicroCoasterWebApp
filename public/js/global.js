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
// MOBILE ORIENTATION DETECTION
// ================================================================================

/**
 * Détecte si l'appareil est un mobile
 * @returns {boolean} True si mobile
 */
function isMobileDevice() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  );
}

/**
 * Détecte si l'appareil est en mode portrait
 * @returns {boolean} True si portrait
 */
function isPortraitMode() {
  return window.innerHeight > window.innerWidth;
}

/**
 * Gère l'affichage de l'overlay de rotation
 */
function handleOrientationChange() {
  if (!isMobileDevice()) return;

  const overlay = document.getElementById('rotate-overlay');
  if (!overlay) return; // L'overlay doit être présent dans le HTML

  if (isPortraitMode()) {
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  } else {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }
}

/**
 * Initialise la détection d'orientation mobile
 */
function initMobileOrientation() {
  if (!isMobileDevice()) return;

  // Ne pas activer l'overlay de rotation sur la page timelines (elle a son propre overlay)
  const isTimelinesPage = window.location.pathname.includes('/timelines');
  if (isTimelinesPage) {
    console.log('⏭️ Overlay de rotation désactivé sur la page timelines');
    return;
  }

  // Vérifier l'orientation initiale
  handleOrientationChange();

  // Écouter les changements d'orientation
  window.addEventListener('resize', handleOrientationChange);
  window.addEventListener('orientationchange', handleOrientationChange);

  console.log("📱 Détection d'orientation mobile activée");
}

// Exposer les fonctions globalement
window.isMobileDevice = isMobileDevice;
window.isPortraitMode = isPortraitMode;
window.handleOrientationChange = handleOrientationChange;

// ================================================================================
// NAVBAR AUTO-HIDE ON SCROLL
// ================================================================================

/**
 * Gère le masquage automatique de la navbar au scroll
 */
function initNavbarAutoHide() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) {
    console.warn('⚠️ Navbar not found for auto-hide');
    return;
  }

  let lastScrollTop = 0;
  let ticking = false;
  const scrollThreshold = 100; // Pixels avant de cacher la navbar
  const scrollDelta = 10; // Sensibilité du scroll

  function handleScroll() {
    // Ne pas cacher la navbar si le menu mobile est ouvert
    const mobileMenu = document.getElementById('navbar-mobile-menu');
    if (mobileMenu && mobileMenu.classList.contains('open')) {
      return;
    }

    const scrollTop =
      window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    // console.log('📜 Scroll:', scrollTop); // Debug scroll position

    // Ne pas cacher si on est tout en haut
    if (scrollTop <= scrollThreshold) {
      if (navbar.classList.contains('navbar-hidden')) {
        navbar.classList.remove('navbar-hidden');
        navbar.classList.add('navbar-visible');
      }
      lastScrollTop = scrollTop;
      return;
    }

    // Déterminer la direction du scroll
    const scrollDiff = Math.abs(lastScrollTop - scrollTop);
    if (scrollDiff <= scrollDelta) {
      return;
    }

    if (scrollTop > lastScrollTop && scrollTop > scrollThreshold) {
      // Scroll vers le bas - cacher la navbar
      if (!navbar.classList.contains('navbar-hidden')) {
        navbar.classList.remove('navbar-visible');
        navbar.classList.add('navbar-hidden');
        console.log('🔼 Navbar cachée - scroll bas:', scrollTop);
      }
    } else if (scrollTop < lastScrollTop) {
      // Scroll vers le haut - montrer la navbar
      if (!navbar.classList.contains('navbar-visible')) {
        navbar.classList.remove('navbar-hidden');
        navbar.classList.add('navbar-visible');
        console.log('🔽 Navbar visible - scroll haut:', scrollTop);
      }
    }

    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
  }

  // Utiliser requestAnimationFrame pour de meilleures performances
  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
      ticking = true;
    }
  }

  // Écouter le scroll sur window ET sur body (au cas où) avec capture pour attraper tous les scrolls
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });

  // Test si le scroll est possible (vérifier après un court délai pour laisser le contenu se charger)
  setTimeout(() => {
    const scrollHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    );
    const hasScroll = scrollHeight > window.innerHeight;
    console.log('✅ Navbar auto-hide initialized - Scroll pour tester!');
    console.log(
      `📏 Page scrollable: ${hasScroll ? 'OUI' : 'NON'} (hauteur: ${scrollHeight}px, fenêtre: ${window.innerHeight}px)`
    );

    // Forcer une vérification initiale
    if (hasScroll) {
      handleScroll();
    }
  }, 100);
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

  // Initialiser la détection d'orientation mobile
  initMobileOrientation();

  // Initialiser le masquage automatique de la navbar au scroll
  initNavbarAutoHide();

  // Gestion de la fermeture propre de WebSocket lors des changements de page
  window.addEventListener('beforeunload', function () {
    if (window.socket && window.socket.connected) {
      window.socket.disconnect();
    }
  });
});
