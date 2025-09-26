/**
 * Utilitaire de reconnexion automatique et synchronisation d'état
 * Gère la reconnexion WebSocket et la synchronisation après déconnexion
 */

class ReconnectionManager {
  constructor(socketInitializer, options = {}) {
    this.socketInitializer = socketInitializer;
    this.options = {
      maxReconnectAttempts: 10,
      reconnectDelay: 2000,
      maxReconnectDelay: 30000,
      reconnectDelayMultiplier: 1.5,
      syncOnReconnect: true,
      ...options
    };

    this.reconnectAttempts = 0;
    this.currentDelay = this.options.reconnectDelay;
    this.isReconnecting = false;
    this.lastKnownState = new Map(); // Pour stocker l'état avant déconnexion
    
    this.onReconnectCallbacks = [];
    this.onDisconnectCallbacks = [];
    this.onSyncCompleteCallbacks = [];
  }

  /**
   * Ajoute un callback appelé lors de la reconnexion réussie
   */
  onReconnect(callback) {
    this.onReconnectCallbacks.push(callback);
  }

  /**
   * Ajoute un callback appelé lors de la déconnexion
   */
  onDisconnect(callback) {
    this.onDisconnectCallbacks.push(callback);
  }

  /**
   * Ajoute un callback appelé après synchronisation complète
   */
  onSyncComplete(callback) {
    this.onSyncCompleteCallbacks.push(callback);
  }

  /**
   * Sauvegarde l'état actuel avant déconnexion
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
   * Récupère l'état sauvegardé
   */
  getLastKnownState() {
    const state = {};
    this.lastKnownState.forEach((value, key) => {
      state[key] = value;
    });
    return state;
  }

  /**
   * Démarre la logique de reconnexion automatique
   */
  startReconnection() {
    if (this.isReconnecting) {
      console.warn('🔄 Reconnexion déjà en cours...');
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('💥 Nombre maximum de tentatives de reconnexion atteint');
      this.showConnectionError();
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} dans ${this.currentDelay}ms...`);
    
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
   * Tente une reconnexion
   */
  async attemptReconnection() {
    try {
      console.log('🔌 Tentative de reconnexion...');
      
      // Réinitialiser la connexion via la fonction fournie
      const socket = await this.socketInitializer();
      
      if (socket && socket.connected) {
        console.log('✅ Reconnexion réussie !');
        this.onReconnectionSuccess(socket);
      } else {
        throw new Error('Socket non connecté après initialisation');
      }
    } catch (error) {
      console.error('❌ Échec de la reconnexion:', error);
      this.isReconnecting = false;
      
      // Programmer la prochaine tentative
      setTimeout(() => this.startReconnection(), 1000);
    }
  }

  /**
   * Gère le succès de la reconnexion
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
      } catch (error) {
        console.error('Erreur dans callback onReconnect:', error);
      }
    });

    // Synchroniser l'état si activé
    if (this.options.syncOnReconnect) {
      await this.synchronizeState(socket);
    }
  }

  /**
   * Synchronise l'état après reconnexion
   */
  async synchronizeState(socket) {
    console.log('🔄 Synchronisation de l\'état après reconnexion...');
    
    try {
      // Demander l'état actuel au serveur
      socket.emit('request_state_sync', this.getLastKnownState());
      
      // Écouter la réponse de synchronisation
      socket.once('state_sync_response', (serverState) => {
        console.log('📥 État synchronisé avec le serveur');
        
        // Appeler les callbacks de synchronisation complète
        this.onSyncCompleteCallbacks.forEach(callback => {
          try {
            callback(serverState, this.getLastKnownState());
          } catch (error) {
            console.error('Erreur dans callback onSyncComplete:', error);
          }
        });
      });

      // Timeout pour la synchronisation
      setTimeout(() => {
        console.warn('⏰ Timeout de synchronisation d\'état');
      }, 5000);

    } catch (error) {
      console.error('❌ Erreur lors de la synchronisation:', error);
    }
  }

  /**
   * Gère la déconnexion
   */
  onDisconnection() {
    console.log('🔌 Connexion perdue');
    
    // Appeler les callbacks de déconnexion
    this.onDisconnectCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Erreur dans callback onDisconnect:', error);
      }
    });

    // Démarrer la reconnexion automatique
    setTimeout(() => this.startReconnection(), 1000);
  }

  /**
   * Affiche l'indicateur de reconnexion
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
   * Masque l'indicateur de reconnexion
   */
  hideReconnectingIndicator() {
    if (window.showToast) {
      window.showToast('✅ Connexion rétablie', 'success', 2000);
    }

    this.updateStatusBanner('connected');
  }

  /**
   * Affiche une erreur de connexion persistante
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
   * Met à jour la bannière de statut de connexion
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
        banner.textContent = `🔄 Reconnexion... (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`;
        banner.style.display = 'block';
        break;
      case 'error':
        banner.textContent = '💥 Connexion perdue. Rechargez la page.';
        banner.style.display = 'block';
        break;
    }
  }

  /**
   * Réinitialise le gestionnaire de reconnexion
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