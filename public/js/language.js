/**
 * Sélecteur de langue - Changement de langue dynamique côté client
 *
 * Gère l'interface de sélection de langue et le changement dynamique
 * sans rechargement de page avec mise à jour temps réel.
 *
 * @module language
 * @description Changement de langue côté client sans rechargement de page
 */

/**
 * Classe de gestion du sélecteur de langue
 * Gère l'interface utilisateur et les événements de changement de langue
 * @class LanguageSelector
 */
class LanguageSelector {
  /**
   * Crée une instance du sélecteur de langue
   * Initialise la langue courante depuis les cookies et configure l'interface
   */
  constructor() {
    this.currentLanguage = this.getCurrentLanguage();
    this.init();
  }

  /**
   * Initialise le sélecteur de langue
   * Configure l'interface, les événements et met à jour l'affichage
   * @returns {void}
   */
  init() {
    this.createLanguageSelector();
    this.bindEvents();
    this.updateUI();
  }

  /**
   * Récupère la langue courante depuis les cookies ou défaut
   * Analyse les cookies pour trouver la préférence de langue utilisateur
   * @returns {string} Code de langue courante (fr/en)
   */
  getCurrentLanguage() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'language') {
        return value;
      }
    }
    return 'fr'; // Default fallback
  }

  /**
   * Crée le sélecteur de langue dans la barre de navigation
   * Génère l'interface dropdown ou met à jour l'élément existant
   * @returns {void}
   */
  createLanguageSelector() {
    const existingSelector = document.getElementById('language-selector');
    if (existingSelector) {
      this.updateExistingSelector(existingSelector);
      return;
    }

    // If not found, create it (fallback)
    const navbarRight = document.querySelector('.navbar-right');
    if (!navbarRight) return;

    const languages = [
      { code: 'fr', name: 'Français', flag: '/assets/flags/fr.svg' },
      { code: 'en', name: 'English', flag: '/assets/flags/en.svg' },
    ];

    const currentLangInfo =
      languages.find(lang => lang.code === this.currentLanguage) || languages[0];

    const selectorHTML = `
      <div class="nav-link language-selector" id="language-selector">
        <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <path d="M9 9h.01"/>
          <path d="M15 9h.01"/>
        </svg>
        <span class="language-current" data-lang="${this.currentLanguage}">
          <img src="${currentLangInfo.flag}" alt="${currentLangInfo.name}" class="flag-icon">
          ${currentLangInfo.code.toUpperCase()}
        </span>
        <div class="language-dropdown">
          ${languages
            .map(
              lang => `
            <a href="#" class="language-option ${lang.code === this.currentLanguage ? 'active' : ''}" 
               data-lang="${lang.code}">
              <img src="${lang.flag}" alt="${lang.name}" class="flag-icon">
              ${lang.name}
            </a>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    // Insert before the profile link
    const profileLink = navbarRight.querySelector('.profile');
    if (profileLink) {
      profileLink.insertAdjacentHTML('beforebegin', selectorHTML);
    } else {
      navbarRight.insertAdjacentHTML('afterbegin', selectorHTML);
    }
  }

  /**
   * Met à jour un sélecteur de langue existant depuis le rendu côté serveur
   * Synchronise l'affichage du sélecteur avec la langue courante
   * @param {HTMLElement} selector - Élément sélecteur à mettre à jour
   * @returns {void}
   * @public
   */
  updateExistingSelector(selector) {
    // Update current language display
    const currentSpan = selector.querySelector('.language-current');
    if (currentSpan) {
      currentSpan.dataset.lang = this.currentLanguage;
      const languages = [
        { code: 'fr', name: 'Français', flag: '/assets/flags/fr.svg' },
        { code: 'en', name: 'English', flag: '/assets/flags/en.svg' },
      ];
      const currentLangInfo =
        languages.find(lang => lang.code === this.currentLanguage) || languages[0];
      currentSpan.innerHTML = `
        <img src="${currentLangInfo.flag}" alt="${currentLangInfo.name}" class="flag-icon">
        ${currentLangInfo.code.toUpperCase()}
      `;
    }

    // Update active states
    const options = selector.querySelectorAll('.language-option');
    options.forEach(option => {
      option.classList.toggle('active', option.dataset.lang === this.currentLanguage);
    });
  }

  /**
   * Lie les écouteurs d'événements pour les interactions du sélecteur
   * Configure la gestion des clics sur les options de langue
   * @returns {void}
   * @public
   */
  bindEvents() {
    document.addEventListener('click', e => {
      const langItem = e.target.closest('a[data-lang]');
      if (langItem) {
        e.preventDefault();
        const newLang = langItem.dataset.lang;
        this.switchLanguage(newLang);
      }
    });
  }

  /**
   * Bascule vers une nouvelle langue
   * Effectue la requête API et recharge la page avec la nouvelle langue
   * @param {string} newLang - Code de la nouvelle langue
   * @returns {Promise<void>}
   * @throws {Error} Si la requête de changement de langue échoue
   * @public
   */
  async switchLanguage(newLang) {
    if (newLang === this.currentLanguage) return;

    try {
      // Show loading state
      this.setLoadingState(true);

      // Send API request
      const response = await fetch('/api/language/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language: newLang }),
      });

      const result = await response.json();

      if (result.success) {
        // Update current language
        this.currentLanguage = newLang;

        // Show success message with proper translation
        this.showLanguageMessage(newLang, 'success');

        // Reload page to apply new language
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        throw new Error(result.message || 'Failed to change language');
      }
    } catch (error) {
      console.error('Error switching language:', error);
      this.showLanguageMessage(this.currentLanguage, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Met à jour l'interface utilisateur pour refléter la langue courante
   * Synchronise tous les éléments d'interface avec la langue sélectionnée
   * @returns {void}
   * @public
   */
  updateUI() {
    const selector = document.getElementById('language-selector');
    if (!selector) return;

    this.updateExistingSelector(selector);
  }

  /**
   * Définit l'état de chargement du sélecteur de langue
   * Affiche/masque l'indicateur de chargement pendant le changement de langue
   * @param {boolean} isLoading - État de chargement
   * @returns {void}
   * @public
   */
  setLoadingState(isLoading) {
    const selector = document.getElementById('language-selector');
    if (!selector) return;

    if (isLoading) {
      selector.classList.add('loading');
    } else {
      selector.classList.remove('loading');
    }
  }

  /**
   * Affiche un message de changement de langue avec traduction et style appropriés
   * Crée un toast personnalisé pour notifier du changement de langue
   * @param {string} language - Code de langue pour le message
   * @param {string} [type='success'] - Type de message ('success', 'error')
   * @returns {void}
   * @public
   */
  showLanguageMessage(language, type = 'success') {
    const messages = {
      fr: {
        success: 'Langue changée avec succès',
        error: 'Échec du changement de langue',
      },
      en: {
        success: 'Language changed successfully',
        error: 'Failed to change language',
      },
    };

    const languages = [
      { code: 'fr', name: 'Français', flag: '/assets/flags/fr.svg' },
      { code: 'en', name: 'English', flag: '/assets/flags/en.svg' },
    ];

    const message = messages[language]?.[type] || messages.fr[type];
    const langInfo = languages.find(l => l.code === language) || languages[0];

    // Create custom toast for language change
    const toast = document.createElement('div');
    toast.className = `language-toast ${type}`;
    toast.innerHTML = `
      <div class="language-toast-content">
        <div class="language-toast-flag">
          <img src="${langInfo.flag}" alt="${langInfo.name}" class="flag-icon-large">
        </div>
        <div class="language-toast-text">
          <div class="language-toast-message">${message}</div>
          <div class="language-toast-lang">${langInfo.name}</div>
        </div>
        <div class="language-toast-close" onclick="this.parentElement.parentElement.remove()" title="Fermer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
    `;

    // Add to page and show
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Affiche un message temporaire à l'utilisateur (générique)
   * Crée une notification toast avec Bootstrap ou style personnalisé
   * @param {string} message - Message à afficher
   * @param {string} [type='info'] - Type de message ('success', 'error', 'info')
   * @returns {void}
   * @public
   */
  showMessage(message, type = 'info') {
    // Create toast notification (using Bootstrap toast if available)
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : 'danger'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;

    // Add to page and show
    document.body.appendChild(toast);

    // Use Bootstrap toast if available, otherwise simple timeout
    if (window.bootstrap?.Toast) {
      const bsToast = new bootstrap.Toast(toast);
      bsToast.show();
      toast.addEventListener('hidden.bs.toast', () => toast.remove());
    } else {
      toast.style.cssText =
        'position:fixed;top:20px;right:20px;z-index:9999;padding:15px;border-radius:5px;';
      setTimeout(() => toast.remove(), 3000);
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new LanguageSelector();
});

// Also export for manual initialization if needed
window.LanguageSelector = LanguageSelector;
