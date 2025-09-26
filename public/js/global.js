/* =========================================================
 * MicroCoaster - Global JavaScript
 * Fonctions et utilitaires partagés entre toutes les pages
 * =======================================================*/

/* =============== UTILITAIRES GLOBAUX =============== */

// Configuration globale
window.MC = window.MC || {};

// Utilitaires d'images
const IMG_BASE = '/assets/img/';
const urlImg = name => IMG_BASE + name;

function preload(paths) {
  for (const s of paths) {
    const i = new Image();
    i.src = s;
  }
}

/* =============== GESTION DES TOASTS =============== */
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

  window.showToast = function (message, type = 'success', duration = 2400) {
    const wrap = ensureWrap();
    const el = document.createElement('div');
    el.className = 'toast ' + type;

    // Créer les éléments sans innerHTML pour éviter les problèmes CSP
    const span = document.createElement('span');
    span.textContent = message;
    const button = document.createElement('button');
    button.className = 'close';
    button.setAttribute('aria-label', 'Close');
    button.textContent = 'x';

    el.appendChild(span);
    el.appendChild(button);
    wrap.appendChild(el);

    const close = () => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 180);
    };

    button.addEventListener('click', close);
    if (duration > 0) setTimeout(close, duration);
  };
})();

/* =============== COPY TO CLIPBOARD =============== */
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
    // Fallback pour les navigateurs plus anciens
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

/* =============== WEBSOCKET CONNECTION =============== */
let socket = null;

function initializeWebSocket() {
  try {
    socket = io();

    socket.on('connect', function () {
      // Déclencher un événement pour indiquer que le socket est prêt
      window.dispatchEvent(new CustomEvent('websocket-ready'));
    });

    socket.on('disconnect', function () {
      // Connexion perdue
    });

    socket.on('error', function (data) {
      console.error('❌ WebSocket error:', data);
      if (data.message) {
        window.showToast?.(data.message, 'error', 3000);
      }
    });

    // Exposer le socket globalement
    window.socket = socket;
  } catch (error) {
    console.error('❌ Failed to initialize WebSocket:', error);
  }
}

/* =============== INITIALIZATION =============== */
document.addEventListener('DOMContentLoaded', function () {
  // Configuration globale basée sur l'environnement
  window.MC = window.MC || {};
  window.MC.isDevelopment = document.querySelector('meta[name="env"]')?.content === 'development';

  // Exposer les utilitaires globalement
  window.IMG_BASE = IMG_BASE;
  window.urlImg = urlImg;
  window.preload = preload;

  // Initialiser WebSocket si Socket.IO est disponible
  if (typeof io !== 'undefined') {
    initializeWebSocket();
  }
});
