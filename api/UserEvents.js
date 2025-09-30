/**
 * Événements utilisateurs - Gestion temps réel
 *
 * Gestionnaire des événements utilisateurs incluant authentification, activités,
 * mises à jour de profil et suivi de sessions pour la sécurité et monitoring.
 *
 * @module UserEvents
 * @description Gestionnaire temps réel pour l'authentification et activité utilisateur
 */

const Logger = require('../utils/logger');

class UserEvents {
  constructor(eventsManager) {
    this.events = eventsManager;
    this.Logger = Logger;
  }

  userLoggedIn(userData, sessionId) {
    Logger.activity.debug(`[UserEvents] User logged in: ${userData.name} (ID: ${userData.id})`);

    const loginTime = userData.last_login ? new Date(userData.last_login) : new Date();

    const eventData = {
      action: 'login',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        isAdmin: userData.is_admin,
        lastLogin: loginTime,
      },
      sessionId,
      timestamp: new Date(),
    };

    this.events.emitToAdmins('rt_user_logged_in', eventData);

    this.events.emitToUser(userData.id, 'user:session:new', {
      message: 'Connexion réussie',
      timestamp: new Date(),
    });

    this.emitStatsToAdmins();
  }

  userLoggedOut(userData, sessionId) {
    Logger.activity.info(`[UserEvents] User logged out: ${userData.name} (ID: ${userData.id})`);

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

    this.events.emitToAdmins('rt_user_logged_out', eventData);

    this.emitStatsToAdmins();
  }

  userProfileUpdated(userData, sessionId = null) {
    Logger.activity.info(
      `[UserEvents] User profile updated: ${userData.name} (ID: ${userData.id})`
    );

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

    this.events.emitToUser(userData.id, 'rt_user_profile_updated', eventData);
    this.events.emitToAdmins('rt_user_profile_updated', eventData);
  }

  userPasswordChanged(userData) {
    Logger.activity.info(
      `[UserEvents] Password changed for user: ${userData.name} (ID: ${userData.id})`
    );

    const eventData = {
      action: 'password_changed',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
      },
      timestamp: new Date(),
    };

    this.events.emitToUser(userData.id, 'user:security:password_changed', {
      message: 'Votre mot de passe a été modifié avec succès',
      timestamp: new Date(),
    });

    this.events.emitToAdmins('admin:user:password_changed', eventData);
  }

  userRegistered(userData) {
    Logger.activity.info(`[UserEvents] New user registered: ${userData.name} (ID: ${userData.id})`);

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

    this.events.emitToAdmins('admin:user:registered', eventData);

    this.events.emitToUser(userData.id, 'user:welcome', {
      message: 'Bienvenue dans MicroCoaster WebApp !',
      user: eventData.user,
    });
  }

  // ================================================================================
  // ACTIVITY TRACKING
  // ================================================================================

  userActivity(userId, activity, metadata = {}) {
    if (['send_module_command', 'module_added', 'module_removed'].includes(activity)) {
      const eventData = {
        userId,
        activity,
        metadata,
        timestamp: new Date(),
      };

      this.events.emitToAdmins('admin:user:activity', eventData);
    }
  }

  // ================================================================================
  // UTILITIES & SESSION MANAGEMENT
  // ================================================================================

  _detectChanges(oldData, newData) {
    const changes = [];

    if (oldData.name !== newData.name) changes.push('name');
    if (oldData.email !== newData.email) changes.push('email');
    if (oldData.is_admin !== newData.is_admin) changes.push('admin_status');

    return changes;
  }

  /**
   * Emit updated stats to admins
   */
  emitStatsToAdmins() {
    setTimeout(() => {
      try {
        const clientStats = this.events.getStats();
        const realTimeAPI = this.events.io?.app?.locals?.realTimeAPI;
        const moduleStats = realTimeAPI?.modules
          ? realTimeAPI.modules.getConnectionStats()
          : { connectedModules: 0 };

        const simpleStats = {
          users: { online: clientStats.uniqueUsers },
          modules: { online: moduleStats.connectedModules },
          timestamp: new Date(),
        };

        this.events.emitToAdmins('simple_stats_update', simpleStats);
        Logger.system.debug(
          `[UserEvents] Stats updated: ${simpleStats.users.online} users, ${simpleStats.modules.online} modules`
        );
      } catch (error) {
        Logger.system.error('[UserEvents] Stats emission error:', error);
      }
    }, 300);
  }
}

module.exports = UserEvents;
