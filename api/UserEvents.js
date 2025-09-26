const Logger = require('../utils/logger');

/**
 * Gestionnaire des événements liés aux utilisateurs
 * Émet des événements temps réel pour les actions des utilisateurs
 */
class UserEvents {
  constructor(eventsManager) {
    this.events = eventsManager;
    this.Logger = Logger;
    this.userSessions = new Map(); // userId -> { loginTime, lastActivity, sessionCount }
  }

  /**
   * Utilisateur se connecte
   * @param {object} userData - Données de l'utilisateur
   * @param {string} sessionId - ID de session
   */
  userLoggedIn(userData, sessionId) {
    Logger.info(`[UserEvents] User logged in: ${userData.name} (ID: ${userData.id})`);
    
    const loginTime = userData.last_login ? new Date(userData.last_login) : new Date();
    const sessionInfo = {
      loginTime: loginTime,
      lastActivity: new Date(),
      sessionId,
    };

    // Mettre à jour les sessions
    if (this.userSessions.has(userData.id)) {
      const existing = this.userSessions.get(userData.id);
      existing.sessionCount = (existing.sessionCount || 0) + 1;
      existing.lastActivity = new Date();
    } else {
      this.userSessions.set(userData.id, { ...sessionInfo, sessionCount: 1 });
    }

    const eventData = {
      action: 'login',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        isAdmin: userData.is_admin,
        lastLogin: loginTime, // Ajouter la vraie date de dernière connexion
      },
      session: sessionInfo,
      timestamp: new Date(),
    };

    // Émettre vers les admins pour monitoring des connexions
    this.events.emitToAdmins('rt_user_logged_in', eventData);

    // Émettre vers les autres sessions de cet utilisateur (notification multi-appareil)
    this.events.emitToUser(userData.id, 'user:session:new', {
      message: 'Nouvelle connexion détectée',
      sessionInfo,
    });
    
    // Mettre à jour les statistiques globales
    setTimeout(() => {
      if (this.events.io.app && this.events.io.app.locals && this.events.io.app.locals.realTimeAPI) {
        this.events.io.app.locals.realTimeAPI.admin.updateGlobalStats().catch(console.error);
      }
    }, 500);
  }

  /**
   * Utilisateur se déconnecte
   * @param {object} userData - Données de l'utilisateur
   * @param {string} sessionId - ID de session
   */
  userLoggedOut(userData, sessionId) {
    Logger.info(`[UserEvents] User logged out: ${userData.name} (ID: ${userData.id})`);
    
    const sessionInfo = this.userSessions.get(userData.id);
    if (sessionInfo) {
      sessionInfo.sessionCount = Math.max(0, (sessionInfo.sessionCount || 1) - 1);
      
      // Si plus de sessions, supprimer l'entrée
      if (sessionInfo.sessionCount === 0) {
        this.userSessions.delete(userData.id);
      }
    }

    const eventData = {
      action: 'logout',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
      },
      sessionId,
      timestamp: new Date(),
    };

    // Émettre vers les admins
    this.events.emitToAdmins('rt_user_logged_out', eventData);
    
    // Mettre à jour les statistiques globales
    setTimeout(() => {
      if (this.events.io.app && this.events.io.app.locals && this.events.io.app.locals.realTimeAPI) {
        this.events.io.app.locals.realTimeAPI.admin.updateGlobalStats().catch(console.error);
      }
    }, 500);
  }

  /**
   * Profil utilisateur modifié
   * @param {object} oldUserData - Anciennes données
   * @param {object} newUserData - Nouvelles données
   */
  userProfileUpdated(userData, sessionId = null) {
    Logger.info(`[UserEvents] User profile updated: ${userData.name} (ID: ${userData.id})`);
    
    const eventData = {
      action: 'profile_updated',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        isAdmin: userData.is_admin,
      },
      timestamp: userData.updatedAt || new Date(),
    };

    // Émettre vers toutes les sessions de cet utilisateur
    this.events.emitToUser(userData.id, 'rt_user_profile_updated', eventData);

    // Émettre vers les admins
    this.events.emitToAdmins('rt_user_profile_updated', eventData);
  }

  /**
   * Mot de passe changé
   * @param {object} userData - Données utilisateur
   */
  userPasswordChanged(userData) {
    Logger.info(`[UserEvents] Password changed for user: ${userData.name} (ID: ${userData.id})`);
    
    const eventData = {
      action: 'password_changed',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
      },
      timestamp: new Date(),
    };

    // Notification de sécurité vers toutes les sessions de l'utilisateur
    this.events.emitToUser(userData.id, 'user:security:password_changed', {
      message: 'Votre mot de passe a été modifié avec succès',
      timestamp: new Date(),
    });

    // Émettre vers les admins pour audit de sécurité
    this.events.emitToAdmins('admin:user:password_changed', eventData);
  }

  /**
   * Nouvel utilisateur enregistré
   * @param {object} userData - Données du nouvel utilisateur
   */
  userRegistered(userData) {
    Logger.info(`[UserEvents] New user registered: ${userData.name} (ID: ${userData.id})`);
    
    const eventData = {
      action: 'registered',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        isAdmin: userData.is_admin || false,
      },
      timestamp: new Date(),
    };

    // Émettre vers les admins
    this.events.emitToAdmins('admin:user:registered', eventData);

    // Message de bienvenue à l'utilisateur
    this.events.emitToUser(userData.id, 'user:welcome', {
      message: 'Bienvenue dans MicroCoaster WebApp !',
      user: eventData.user,
    });
  }

  /**
   * Activité utilisateur détectée
   * @param {number} userId - ID utilisateur
   * @param {string} activity - Type d'activité
   * @param {object} metadata - Métadonnées de l'activité
   */
  userActivity(userId, activity, metadata = {}) {
    const sessionInfo = this.userSessions.get(userId);
    if (sessionInfo) {
      sessionInfo.lastActivity = new Date();
    }

    // Émettre seulement les activités importantes vers les admins
    if (['module_command', 'module_added', 'module_removed'].includes(activity)) {
      const eventData = {
        userId,
        activity,
        metadata,
        timestamp: new Date(),
      };

      this.events.emitToAdmins('admin:user:activity', eventData);
    }
  }

  /**
   * Détecte les changements entre anciennes et nouvelles données
   * @private
   */
  _detectChanges(oldData, newData) {
    const changes = [];
    
    if (oldData.name !== newData.name) changes.push('name');
    if (oldData.email !== newData.email) changes.push('email');
    if (oldData.is_admin !== newData.is_admin) changes.push('admin_status');
    
    return changes;
  }

  /**
   * Obtient les statistiques des utilisateurs connectés
   */
  getConnectedUsersStats() {
    const stats = {
      totalSessions: 0,
      uniqueUsers: this.userSessions.size,
      users: [],
    };

    this.userSessions.forEach((sessionInfo, userId) => {
      stats.totalSessions += sessionInfo.sessionCount;
      stats.users.push({
        userId,
        sessionCount: sessionInfo.sessionCount,
        loginTime: sessionInfo.loginTime,
        lastActivity: sessionInfo.lastActivity,
      });
    });

    return stats;
  }

  /**
   * Vérifie si un utilisateur est connecté
   * @param {number} userId - ID utilisateur
   */
  isUserConnected(userId) {
    return this.userSessions.has(userId);
  }
}

module.exports = UserEvents;