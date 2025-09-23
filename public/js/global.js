/* =========================================================
 * MicroCoaster - Global JavaScript
 * Fonctions et utilitaires partagés entre toutes les pages
 * =======================================================*/

/* =============== UTILITAIRES GLOBAUX =============== */

// Configuration globale
window.MC = window.MC || {};

// Utilitaires d'images
const IMG_BASE = '/assets/img/';
const urlImg = (name) => IMG_BASE + name;

function preload(paths) {
  for (const s of paths) { 
    const i = new Image(); 
    i.src = s; 
  }
}

/* =============== GESTION DES TOASTS =============== */
(function(){
  function ensureWrap(){
    return document.getElementById('toasts') || (()=>{
      const d = document.createElement('div');
      d.id = 'toasts'; 
      d.className = 'toasts';
      document.body.appendChild(d);
      return d;
    })();
  }
  
  window.showToast = function(message, type='success', duration=2400){
    const wrap = ensureWrap();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span>${message}</span><button class="close" aria-label="Close">×</button>`;
    wrap.appendChild(el);
    
    const close = () => { 
      el.classList.add('hide'); 
      setTimeout(() => el.remove(), 180); 
    };
    
    el.querySelector('.close').addEventListener('click', close);
    if (duration > 0) setTimeout(close, duration);
  };
})();

/* =============== COPY TO CLIPBOARD =============== */
window.copyToClipboard = function(text, element = null) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (element) {
        element.classList.add('copied');
        setTimeout(() => element.classList.remove('copied'), 900);
      }
      window.showToast?.('Copied to clipboard', 'success', 1500);
    }).catch(() => {
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
    } catch (err) {
      window.showToast?.('Failed to copy', 'error', 2000);
    }
    document.body.removeChild(textArea);
  }
};

/* =============== INITIALIZATION =============== */
document.addEventListener('DOMContentLoaded', function() {
  // Exposer les utilitaires globalement
  window.IMG_BASE = IMG_BASE;
  window.urlImg = urlImg;
  window.preload = preload;
  
  console.log('🚀 MicroCoaster Global JS loaded');
});