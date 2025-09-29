/**
 * ============================================================================
 * LANGUAGE SELECTOR - CLIENT-SIDE LANGUAGE SWITCHING
 * ============================================================================
 * Handles language selection UI and dynamic language switching
 *
 * @module LanguageClient
 * @description Client-side language switching without page reload
 * ============================================================================
 */

class LanguageSelector {
  constructor() {
    this.currentLanguage = this.getCurrentLanguage();
    this.init();
  }

  /**
   * Initialize language selector
   */
  init() {
    this.createLanguageSelector();
    this.bindEvents();
    this.updateUI();
  }

  /**
   * Get current language from cookie or default
   * @returns {string} Current language code
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
   * Create language selector dropdown in navbar
   */
  createLanguageSelector() {
    // Check if selector already exists in the DOM (from server-side rendering)
    const existingSelector = document.getElementById('language-selector');
    if (existingSelector) {
      // Just update the existing selector
      this.updateExistingSelector(existingSelector);
      return;
    }

    // If not found, create it (fallback)
    const navbarRight = document.querySelector('.navbar-right');
    if (!navbarRight) return;

    const languages = [
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', flag: '🇺🇸' }
    ];

    const currentLangInfo = languages.find(lang => lang.code === this.currentLanguage) || languages[0];

    const selectorHTML = `
      <div class="nav-link language-selector" id="language-selector">
        <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <path d="M9 9h.01"/>
          <path d="M15 9h.01"/>
        </svg>
        <span class="language-current" data-lang="${this.currentLanguage}">
          ${currentLangInfo.flag} ${currentLangInfo.code.toUpperCase()}
        </span>
        <div class="language-dropdown">
          ${languages.map(lang => `
            <a href="#" class="language-option ${lang.code === this.currentLanguage ? 'active' : ''}" 
               data-lang="${lang.code}">
              ${lang.flag} ${lang.name}
            </a>
          `).join('')}
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
   * Update existing language selector from server-side rendering
   */
  updateExistingSelector(selector) {
    // Update current language display
    const currentSpan = selector.querySelector('.language-current');
    if (currentSpan) {
      currentSpan.dataset.lang = this.currentLanguage;
      const languages = [
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'en', name: 'English', flag: '🇺🇸' }
      ];
      const currentLangInfo = languages.find(lang => lang.code === this.currentLanguage) || languages[0];
      currentSpan.textContent = `${currentLangInfo.flag} ${currentLangInfo.code.toUpperCase()}`;
    }

    // Update active states
    const options = selector.querySelectorAll('.language-option');
    options.forEach(option => {
      option.classList.toggle('active', option.dataset.lang === this.currentLanguage);
    });
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    document.addEventListener('click', (e) => {
      const langItem = e.target.closest('a[data-lang]');
      if (langItem) {
        e.preventDefault();
        const newLang = langItem.dataset.lang;
        this.switchLanguage(newLang);
      }
    });
  }

  /**
   * Switch to new language
   * @param {string} newLang - New language code
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
        body: JSON.stringify({ language: newLang })
      });

      const result = await response.json();

      if (result.success) {
        // Update current language
        this.currentLanguage = newLang;
        
        // Show success message (optional)
        this.showMessage('Language changed successfully', 'success');
        
        // Reload page to apply new language
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        throw new Error(result.message || 'Failed to change language');
      }

    } catch (error) {
      console.error('Error switching language:', error);
      this.showMessage('Failed to change language', 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Update UI to reflect current language
   */
  updateUI() {
    const selector = document.getElementById('language-selector');
    if (!selector) return;

    this.updateExistingSelector(selector);
  }

  /**
   * Set loading state for language selector
   * @param {boolean} isLoading - Loading state
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
   * Show temporary message to user
   * @param {string} message - Message to show
   * @param {string} type - Message type (success, error, info)
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
      toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;padding:15px;border-radius:5px;';
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