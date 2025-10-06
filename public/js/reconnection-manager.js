/**
 * Gestionnaire de reconnexion - Reconnexion automatique WebSocket
 *
 * Gère la récupération de connexion WebSocket avec backoff exponentiel,
 * préservation d'état pendant les déconnexions et synchronisation automatique.
 *
 * @module reconnection-manager
 * @description Gestionnaire de reconnexion WebSocket avec résilience et synchronisation
 */

/**
 * Classe de gestion des reconnexions WebSocket
 * Gère la reconnexion automatique avec backoff exponentiel et synchronisation d'état
 * @class ReconnectionManager
 */
class ReconnectionManager {
  /**
   * Crée une instance du gestionnaire de reconnexion
   * Configure les paramètres de reconnexion avec backoff exponentiel
   * @param {Function} socketInitializer - Fonction d'initialisation du socket
   * @param {Object} [options={}] - Options de configuration
   * @param {number} [options.maxReconnectAttempts=10] - Nombre max de tentatives
   * @param {number} [options.reconnectDelay=2000] - Délai initial en ms
   * @param {number} [options.maxReconnectDelay=30000] - Délai maximum en ms
   * @param {number} [options.reconnectDelayMultiplier=1.5] - Multiplicateur de délai
   * @param {boolean} [options.syncOnReconnect=true] - Synchronisation automatique
   */
  constructor(socketInitializer, options = {}) {
    this.socketInitializer = socketInitializer;
    this.options = {
      maxReconnectAttempts: 10,
      reconnectDelay: 2000,
      maxReconnectDelay: 30000,
      reconnectDelayMultiplier: 1.5,
      ...options,
    };

    this.reconnectAttempts = 0;
    this.currentDelay = this.options.reconnectDelay;
    this.isReconnecting = false;
    this.lastKnownState = new Map();

    this.onReconnectCallbacks = [];
    this.onDisconnectCallbacks = [];
  }

  // ================================================================================
  // CALLBACK MANAGEMENT
  // ================================================================================

  /**
   * Enregistre un callback pour les reconnexions réussies
   * @param {Function} callback - Fonction à exécuter lors de la reconnexion
   * @returns {void}
   */
  onReconnect(callback) {
    this.onReconnectCallbacks.push(callback);
  }

  /**
   * Enregistre un callback pour les déconnexions
   * @param {Function} callback - Fonction à exécuter lors de la déconnexion
   * @returns {void}
   */
  onDisconnect(callback) {
    this.onDisconnectCallbacks.push(callback);
  }

  // ================================================================================
  // STATE MANAGEMENT
  // ================================================================================

  /**
   * Sauvegarde l'état actuel pour restauration
   * Préserve les données importantes pendant les déconnexions
   * @param {Object} stateData - Données d'état à sauvegarder
   * @returns {void}
   */
  saveState(stateData) {
    this.lastKnownState.clear();
    if (stateData && typeof stateData === 'object') {
      Object.entries(stateData).forEach(([key, value]) => {
        this.lastKnownState.set(key, value);
      });
    }
  }

  /**
   * Récupère le dernier état connu sauvegardé
   * Permet la restauration des données après reconnexion
   * @returns {Object} Objet contenant le dernier état sauvegardé
   */
  getLastKnownState() {
    const state = {};
    this.lastKnownState.forEach((value, key) => {
      state[key] = value;
    });
    return state;
  }

  // ================================================================================
  // RECONNECTION LOGIC
  // ================================================================================

  /**
   * Démarre le processus de reconnexion avec backoff exponentiel
   * Gère les tentatives multiples avec délai croissant entre chaque tentative
   * @returns {void}
   * @public
   */
  startReconnection() {
    if (this.isReconnecting) {
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.showConnectionError();
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // Afficher un indicateur visuel
    this.showReconnectingIndicator();

    setTimeout(() => {
      this.attemptReconnection();
    }, this.currentDelay);

    // Augmenter le délai pour la prochaine tentative
    this.currentDelay = Math.min(
      this.currentDelay * this.options.reconnectDelayMultiplier,
      this.options.maxReconnectDelay
    );
  }

  /**
   * Tente une reconnexion en utilisant la fonction d'initialisation fournie
   * Vérifie la connexion et déclenche les callbacks appropriés
   * @returns {Promise<void>}
   * @throws {Error} Si la reconnexion échoue
   * @private
   */
  async attemptReconnection() {
    try {
      // Réinitialiser la connexion via la fonction fournie
      const socket = await this.socketInitializer();

      if (socket && socket.connected) {
        this.onReconnectionSuccess(socket);
      } else {
        throw new Error('Socket non connecté après initialisation');
      }
    } catch {
      this.isReconnecting = false;

      // Programmer la prochaine tentative
      setTimeout(() => this.startReconnection(), 1000);
    }
  }

  /**
   * Gère le succès de la reconnexion et déclenche la synchronisation
   * Remet à zéro les compteurs et exécute les callbacks de reconnexion
   * @param {Object} socket - Instance du socket reconnecté
   * @returns {Promise<void>}
   * @private
   */
  async onReconnectionSuccess(socket) {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.currentDelay = this.options.reconnectDelay;

    // Masquer l'indicateur de reconnexion
    this.hideReconnectingIndicator();

    // Appeler les callbacks de reconnexion
    this.onReconnectCallbacks.forEach(callback => {
      try {
        callback(socket);
      } catch {
        // Ignorer les erreurs de callback
      }
    });
  }

  /**
   * Gère les événements de déconnexion et lance la reconnexion automatique
   * Exécute les callbacks de déconnexion et démarre le processus de reconnexion
   * @returns {void}
   * @public
   */
  onDisconnection(reason) {
    // Appeler les callbacks de déconnexion
    this.onDisconnectCallbacks.forEach(callback => {
      try {
        callback(reason);
      } catch {
        // Ignorer les erreurs de callback
      }
    });
  }

  /**
   * Affiche l'indicateur visuel de reconnexion en cours
   * Utilise le système de toast et met à jour la bannière de statut
   * @returns {void}
   * @private
   */
  showReconnectingIndicator() {
    // Utiliser showToast si disponible
    if (window.showToast) {
      window.showToast(
        `🔄 Reconnexion en cours... (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`,
        'warning',
        this.currentDelay
      );
    }

    // Mettre à jour la bannière de statut
    this.updateStatusBanner('reconnecting');
  }

  /**
   * Masque l'indicateur de reconnexion et affiche le message de succès
   * Met à jour l'interface pour indiquer que la connexion est rétablie
   * @returns {void}
   * @private
   */
  hideReconnectingIndicator() {
    if (window.showToast) {
      window.showToast('✅ Connexion rétablie', 'success', 2000);
    }

    this.updateStatusBanner('connected');
  }

  /**
   * Affiche une erreur de connexion persistante après échec des tentatives
   * Montre un toast permanent et met à jour la bannière d'erreur
   * @returns {void}
   * @private
   */
  showConnectionError() {
    if (window.showToast) {
      window.showToast(
        '💥 Impossible de se reconnecter. Rechargez la page.',
        'error',
        0 // Toast permanent
      );
    }

    this.updateStatusBanner('error');
  }

  /**
   * Met à jour la bannière de statut de connexion selon l'état actuel
   * Gère l'affichage et le contenu de la bannière selon le statut
   * @param {string} status - Statut de connexion ('connected', 'reconnecting', 'error')
   * @returns {void}
   * @private
   */
  updateStatusBanner(status) {
    const banner = document.querySelector('.connection-status-banner');
    if (!banner) return;

    banner.className = `connection-status-banner ${status}`;

    switch (status) {
      case 'connected':
        banner.style.display = 'none';
        break;
      case 'reconnecting':
        banner.textContent = t('reconnection.reconnecting', {
          attempts: this.reconnectAttempts,
          max: this.options.maxReconnectAttempts,
        });
        banner.style.display = 'block';
        break;
      case 'error':
        banner.textContent = t('reconnection.connection_lost');
        banner.style.display = 'block';
        break;
    }
  }

  /**
   * Réinitialise complètement le gestionnaire de reconnexion
   * Remet à zéro tous les compteurs et l'état interne
   * @returns {void}
   * @public
   */
  reset() {
    this.reconnectAttempts = 0;
    this.currentDelay = this.options.reconnectDelay;
    this.isReconnecting = false;
    this.lastKnownState.clear();
  }
}

// Export pour utilisation dans les modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReconnectionManager;
}

// Export global pour utilisation côté navigateur
if (typeof window !== 'undefined') {
  window.ReconnectionManager = ReconnectionManager;
}
