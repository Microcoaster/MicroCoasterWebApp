/**
 * Gestionnaire de notifications - Filtrage selon préférences utilisateur
 *
 * Gestionnaire centralisé pour l'émission de notifications toast basées sur
 * les préférences de notification des utilisateurs.
 *
 * @module NotificationManager
 * @description Filtre et émet les notifications selon les préférences utilisateur
 */

const Logger = require('../utils/logger');

/**
 * Gestionnaire de notifications avec filtrage par préférences
 * @class NotificationManager
 */
class NotificationManager {
  /**
   * Crée une instance de NotificationManager
   * @param {EventsManager} eventsManager - Gestionnaire d'événements centralisé
   * @param {DatabaseManager} databaseManager - Gestionnaire de base de données
   */
  constructor(eventsManager, databaseManager) {
    this.events = eventsManager;
    this.db = databaseManager;
    this.Logger = Logger;
  }

  /**
   * Émet une notification toast aux utilisateurs selon leurs préférences
   * @param {string} notificationType - Type de notification (module_status, system_errors, admin_user_activity, admin_module_activity)
   * @param {string} event - Nom de l'événement Socket.IO
   * @param {Object} data - Données de la notification
   * @param {number} [excludeUserId] - ID utilisateur à exclure (optionnel)
   */
  async emitNotification(notificationType, event, data, excludeUserId = null) {
    try {
      // Récupérer tous les clients connectés
      const allClients = Array.from(this.events.connectedClients.values());

      // Filtrer les clients selon leurs préférences
      const eligibleClients = [];

      for (const client of allClients) {
        // Exclure l'utilisateur spécifié si demandé
        if (excludeUserId && client.userId === excludeUserId) {
          continue;
        }

        // Vérifier les préférences de notification
        const hasPreference = await this._userHasNotificationPreference(
          client.userId,
          notificationType
        );
        if (hasPreference) {
          eligibleClients.push(client);
        }
      }

      // Émettre la notification aux clients éligibles
      eligibleClients.forEach(client => {
        client.socket.emit(event, data);
      });

      if (eligibleClients.length > 0) {
        this.Logger.system.debug(
          `Notification '${event}' émise à ${eligibleClients.length} utilisateur(s) (type: ${notificationType})`
        );
      }
    } catch (error) {
      this.Logger.system.error("Erreur lors de l'émission de notification:", error);
    }
  }

  /**
   * Émet une notification aux administrateurs selon leurs préférences
   * @param {string} notificationType - Type de notification admin (admin_user_activity, admin_module_activity)
   * @param {string} event - Nom de l'événement Socket.IO
   * @param {Object} data - Données de la notification
   * @param {number} [excludeUserId] - ID utilisateur à exclure (optionnel)
   */
  async emitToAdmins(notificationType, event, data, excludeUserId = null) {
    try {
      // Récupérer tous les clients admin
      const adminClients = Array.from(this.events.connectedClients.values()).filter(
        client => client.userType === 'admin'
      );

      // Filtrer selon les préférences
      const eligibleClients = [];

      for (const client of adminClients) {
        // Exclure l'utilisateur spécifié si demandé
        if (excludeUserId && client.userId === excludeUserId) {
          continue;
        }

        // Vérifier les préférences de notification admin
        const hasPreference = await this._userHasNotificationPreference(
          client.userId,
          notificationType
        );
        if (hasPreference) {
          eligibleClients.push(client);
        }
      }

      // Émettre la notification aux admins éligibles
      eligibleClients.forEach(client => {
        client.socket.emit(event, data);
      });

      this.Logger.system.info(
        `[NotificationManager] Emitted '${event}' to ${eligibleClients.length} admin clients (type: ${notificationType})`
      );

      if (eligibleClients.length > 0) {
        this.Logger.system.debug(
          `Notification admin '${event}' émise à ${eligibleClients.length} admin(s) (type: ${notificationType})`
        );
      }
    } catch (error) {
      this.Logger.system.error("Erreur lors de l'émission de notification admin:", error);
    }
  }

  /**
   * Vérifie si un utilisateur a activé une préférence de notification
   * @param {number} userId - ID de l'utilisateur
   * @param {string} notificationType - Type de notification à vérifier
   * @returns {boolean} True si l'utilisateur a activé cette notification
   * @private
   */
  async _userHasNotificationPreference(userId, notificationType) {
    try {
      const user = await this.db.users.findById(userId);
      if (!user) {
        this.Logger.system.debug(`User ${userId} not found for notification check`);
        return false;
      }

      let preferenceValue;
      switch (notificationType) {
        case 'module_status':
          preferenceValue = user.notify_module_status;
          break;
        case 'system_errors':
          preferenceValue = user.notify_system_errors;
          break;
        case 'admin_user_activity':
          preferenceValue = user.notify_admin_user_activity;
          break;
        case 'admin_module_activity':
          preferenceValue = user.notify_admin_module_activity;
          break;
        default:
          return false;
      }

      // Accepter true, 1, "1" comme valeurs activées
      const isEnabled =
        preferenceValue === true || preferenceValue === 1 || preferenceValue === '1';
      this.Logger.system.debug(
        `User ${userId} preference ${notificationType}: ${preferenceValue} (type: ${typeof preferenceValue}) -> ${isEnabled ? 'ENABLED' : 'DISABLED'}`
      );

      return isEnabled;
    } catch (error) {
      this.Logger.system.error(
        `Erreur vérification préférence ${notificationType} pour user ${userId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Émet une notification de mise à jour de profil
   * @param {Object} userData - Données utilisateur mises à jour
   */
  async emitProfileUpdated(userData) {
    const data = {
      type: 'success',
      title: 'Profil mis à jour',
      message: `Le profil de ${userData.name} a été modifié`,
      timestamp: new Date(),
      user: {
        id: userData.id,
        name: userData.name,
      },
    };

    // Émettre à l'utilisateur concerné (toujours, car c'est son profil)
    this.events.emitToUser(userData.id, 'notification:toast', data);

    // Émettre aux admins qui ont activé les notifications d'activité utilisateur
    await this.emitToAdmins('admin_user_activity', 'notification:toast', data, userData.id);
  }

  /**
   * Émet une notification de changement de mot de passe
   * @param {Object} userData - Données utilisateur
   */
  async emitPasswordChanged(userData) {
    const data = {
      type: 'success',
      title: 'Mot de passe modifié',
      message: `Le mot de passe de ${userData.name} a été changé`,
      timestamp: new Date(),
      user: {
        id: userData.id,
        name: userData.name,
      },
    };

    // Émettre à l'utilisateur concerné
    this.events.emitToUser(userData.id, 'notification:toast', data);

    // Émettre aux admins qui ont activé les notifications d'activité utilisateur
    await this.emitToAdmins('admin_user_activity', 'notification:toast', data, userData.id);
  }

  /**
   * Émet une notification de nouvel utilisateur inscrit
   * @param {Object} userData - Données du nouvel utilisateur
   */
  async emitUserRegistered(userData) {
    const data = {
      type: 'info',
      title: 'Nouvel utilisateur',
      message: `${userData.name} s'est inscrit sur la plateforme`,
      timestamp: new Date(),
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
      },
    };

    // Émettre aux admins qui ont activé les notifications d'activité utilisateur
    await this.emitToAdmins('admin_user_activity', 'notification:toast', data);
  }

  /**
   * Émet une notification de connexion utilisateur
   * @param {Object} userData - Données utilisateur
   */
  async emitUserLoggedIn(userData) {
    this.Logger.system.info(
      `[NotificationManager] emitUserLoggedIn called for user ${userData.id} (${userData.name})`
    );
    const data = {
      type: 'info',
      title: 'Connexion utilisateur',
      message: `${userData.name} s'est connecté`,
      timestamp: new Date(),
      user: {
        id: userData.id,
        name: userData.name,
      },
    };

    // Émettre aux admins qui ont activé les notifications d'activité utilisateur
    await this.emitToAdmins('admin_user_activity', 'notification:toast', data);
  }

  /**
   * Émet une notification de déconnexion utilisateur
   * @param {Object} userData - Données utilisateur
   */
  async emitUserLoggedOut(userData) {
    const data = {
      type: 'info',
      title: 'Déconnexion utilisateur',
      message: `${userData.name} s'est déconnecté`,
      timestamp: new Date(),
      user: {
        id: userData.id,
        name: userData.name,
      },
    };

    // Émettre aux admins qui ont activé les notifications d'activité utilisateur
    await this.emitToAdmins('admin_user_activity', 'notification:toast', data);
  }

  /**
   * Émet une notification de module connecté/déconnecté
   * @param {string} moduleId - ID du module
   * @param {boolean} online - État du module
   * @param {Object} moduleInfo - Informations du module
   */
  async emitModuleStatusChanged(moduleId, online, moduleInfo) {
    const status = online ? 'connecté' : 'déconnecté';
    const data = {
      type: online ? 'success' : 'warning',
      title: `Module ${status}`,
      message: `Module ${moduleId} ${online ? 'connecté' : 'déconnecté'}`,
      timestamp: new Date(),
      module: {
        id: moduleId,
        name: moduleInfo.name || moduleId,
        type: moduleInfo.type,
        online: online,
      },
    };

    // 1. Toujours notifier le propriétaire de SON module (avec message spécial)
    if (moduleInfo.userId) {
      const ownerData = {
        ...data,
        title: `Votre module ${status}`,
        message: `Votre module ${moduleId} est ${status}`,
      };
      this.events.emitToUser(moduleInfo.userId, 'notification:toast', ownerData);
    }

    // 2. Notifier les autres admins qui ont activé les notifications d'activité des modules
    await this.emitToAdmins('admin_module_activity', 'notification:toast', data, moduleInfo.userId);
  }

  /**
   * Émet une notification de module ajouté/supprimé/mis à jour
   * @param {string} action - Action effectuée (added/removed/updated)
   * @param {Object} moduleData - Données du module
   */
  async emitModuleAction(action, moduleData) {
    const actionText = {
      added: 'ajouté',
      removed: 'supprimé',
      updated: 'mis à jour',
    };

    const data = {
      type: 'info',
      title: `Module ${actionText[action]}`,
      message: `Module ${moduleData.module_id} a été ${actionText[action]}`,
      timestamp: new Date(),
      module: moduleData,
    };

    // Émettre aux admins qui ont activé les notifications d'activité des modules
    await this.emitToAdmins('admin_module_activity', 'notification:toast', data, moduleData.userId);
  }

  /**
   * Émet une notification d'erreur système
   * @param {string} errorType - Type d'erreur
   * @param {string} message - Message d'erreur
   * @param {Object} metadata - Métadonnées supplémentaires
   */
  async emitSystemError(errorType, message, metadata = {}) {
    const data = {
      type: 'error',
      title: 'Erreur système',
      message: message,
      timestamp: new Date(),
      error: {
        type: errorType,
        ...metadata,
      },
    };

    // Émettre aux utilisateurs qui ont activé les notifications d'erreurs système
    await this.emitNotification('system_errors', 'notification:toast', data);
  }
}

module.exports = NotificationManager;
