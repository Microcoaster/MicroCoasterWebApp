const express = require('express');
const databaseManager = require('../bdd/DatabaseManager');
const Logger = require('../utils/logger');
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session.user_id) {
    next();
  } else {
    res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  if (req.session.user_id && req.session.is_admin) {
    next();
  } else {
    res.status(403).render('error', {
      title: 'Accès refusé',
      message: "Vous n'avez pas les permissions nécessaires pour accéder à cette page.",
    });
  }
}

router.get('/login', (req, res) => {
  if (req.session.user_id) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    error: null,
    title: 'MicroCoaster WebApp - Login',
  });
});

router.get('/register', (req, res) => {
  if (req.session.user_id) {
    return res.redirect('/dashboard');
  }
  res.render('register', {
    error: null,
    title: 'MicroCoaster WebApp - Créer un compte',
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  let error = null;

  try {
    if (!email || !password) {
      error = 'Veuillez remplir tous les champs.';
    } else {
      const user = await databaseManager.users.verifyLogin(email, password);
      if (user) {
        // Mettre à jour la dernière connexion
        await databaseManager.users.updateLastLogin(user.id);

        // Récupérer l'utilisateur avec la dernière connexion mise à jour
        const updatedUser = await databaseManager.users.findById(user.id);

        req.session.user_id = updatedUser.id;
        req.session.email = updatedUser.email;
        req.session.nickname = updatedUser.name;
        req.session.is_admin = updatedUser.is_admin;

        // Émettre événement temps réel : utilisateur connecté
        if (req.app.locals.realTimeAPI) {
          req.app.locals.realTimeAPI.emitUserLoggedIn(
            {
              id: updatedUser.id,
              name: updatedUser.name,
              email: updatedUser.email,
              is_admin: updatedUser.is_admin,
              last_login: updatedUser.last_login, // Utiliser la vraie valeur de la BDD
            },
            req.sessionID
          );
        }

        Logger.activity.info('User authenticated:', user.name, user.is_admin ? '(admin)' : '');
        return res.redirect('/dashboard');
      } else {
        error = 'Email ou mot de passe incorrect.';
      }
    }
  } catch (err) {
    Logger.activity.error('Login error:', err);
    error = 'Erreur de connexion à la base de données.';
  }

  res.render('login', {
    error,
    title: 'MicroCoaster WebApp - Login',
  });
});

router.post('/register', async (req, res) => {
  const { email, password, confirmPassword, name } = req.body;
  let error = null;

  try {
    // Validation
    if (!email || !password || !confirmPassword || !name) {
      error = 'Veuillez remplir tous les champs.';
    } else if (password !== confirmPassword) {
      error = 'Les mots de passe ne correspondent pas.';
    } else if (password.length < 6) {
      error = 'Le mot de passe doit contenir au moins 6 caractères.';
    } else if (await databaseManager.users.emailExists(email)) {
      error = 'Un compte avec cet email existe déjà.';
    } else {
      // Créer le compte
      const user = await databaseManager.users.createUser(email, password, name);

      // Mettre à jour la dernière connexion pour le nouvel utilisateur
      await databaseManager.users.updateLastLogin(user.id);

      // Récupérer l'utilisateur avec la dernière connexion mise à jour
      const updatedUser = await databaseManager.users.findById(user.id);

      req.session.user_id = updatedUser.id;
      req.session.email = updatedUser.email;
      req.session.nickname = updatedUser.name;
      req.session.is_admin = updatedUser.is_admin;

      // Émettre événement temps réel : nouvel utilisateur enregistré
      if (req.app.locals.realTimeAPI) {
        req.app.locals.realTimeAPI.emitUserLoggedIn(
          {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            is_admin: updatedUser.is_admin,
            last_login: updatedUser.last_login,
            isNewUser: true,
            registrationDate: new Date(),
          },
          req.sessionID
        );
      }

      Logger.activity.info('New user registered:', user.name);
      return res.redirect('/dashboard');
    }
  } catch (err) {
    Logger.activity.error('Register error:', err);
    error = err.message || 'Erreur lors de la création du compte.';
  }

  res.render('register', {
    error,
    title: 'MicroCoaster WebApp - Créer un compte',
    formData: { email, name }, // Garder les données du formulaire
  });
});

router.get('/logout', (req, res) => {
  const userName = req.session.nickname || 'User';
  const userId = req.session.user_id;

  // Émettre événement temps réel : utilisateur déconnecté
  if (req.app.locals.realTimeAPI && userId) {
    req.app.locals.realTimeAPI.emitUserLoggedOut(
      {
        id: userId,
        name: userName,
        logoutTime: new Date(),
      },
      req.sessionID
    );
  }

  req.session.destroy(err => {
    if (err) {
      Logger.activity.error('Session destroy error:', err);
    }
    Logger.activity.info('User logged out:', userName);
    res.redirect('/login');
  });
});

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await databaseManager.users.findById(req.session.user_id);
    if (!user) {
      return res.redirect('/logout');
    }

    res.render('profile', {
      title: 'MicroCoaster WebApp - Profil',
      user,
      error: null,
      success: null,
    });
  } catch (error) {
    Logger.activity.error('Profile error:', error);
    res.render('error', {
      title: 'Erreur',
      message: 'Erreur lors du chargement du profil.',
    });
  }
});

router.post('/profile', requireAuth, async (req, res) => {
  const { name, email } = req.body;
  let error = null;
  let success = null;

  try {
    const user = await databaseManager.users.findById(req.session.user_id);
    if (!user) {
      return res.redirect('/logout');
    }

    // Validation
    if (!name || !email) {
      error = 'Veuillez remplir tous les champs.';
    } else if (email !== user.email && (await databaseManager.users.emailExists(email))) {
      error = 'Un compte avec cet email existe déjà.';
    } else {
      // Mise à jour
      const updateSuccess = await databaseManager.users.updateProfile(req.session.user_id, {
        name,
        email,
      });

      if (updateSuccess) {
        // Récupérer l'utilisateur mis à jour
        const updatedUser = await databaseManager.users.findById(req.session.user_id);

        req.session.nickname = updatedUser.name;
        req.session.email = updatedUser.email;

        // Émettre événement temps réel : profil utilisateur mis à jour
        if (req.app.locals.realTimeAPI) {
          req.app.locals.realTimeAPI.emitUserProfileUpdated(
            {
              id: updatedUser.id,
              name: updatedUser.name,
              email: updatedUser.email,
              is_admin: updatedUser.is_admin,
              updatedAt: new Date(),
            },
            req.sessionID
          );

          success = 'Profil mis à jour avec succès.';
          user.name = updatedUser.name;
          user.email = updatedUser.email;
        }
      } else {
        error = 'Erreur lors de la mise à jour du profil.';
      }
    }
  } catch (err) {
    Logger.activity.error('Profile update error:', err);
    error = err.message || 'Erreur lors de la mise à jour du profil.';
  }

  const user = await databaseManager.users.findById(req.session.user_id);
  res.render('profile', {
    title: 'MicroCoaster WebApp - Profil',
    user,
    error,
    success,
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  let error = null;
  let success = null;

  try {
    const user = await databaseManager.users.findById(req.session.user_id);
    if (!user) {
      return res.redirect('/logout');
    }

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      error = 'Veuillez remplir tous les champs.';
    } else if (newPassword !== confirmPassword) {
      error = 'Les nouveaux mots de passe ne correspondent pas.';
    } else if (newPassword.length < 6) {
      error = 'Le nouveau mot de passe doit contenir au moins 6 caractères.';
    } else {
      // Changer le mot de passe
      await databaseManager.users.changePassword(req.session.user_id, currentPassword, newPassword);
      success = 'Mot de passe changé avec succès.';
    }
  } catch (err) {
    Logger.activity.error('Password change error:', err);
    error = err.message || 'Erreur lors du changement de mot de passe.';
  }

  const user = await databaseManager.users.findById(req.session.user_id);
  res.render('profile', {
    title: 'MicroCoaster WebApp - Profil',
    user,
    error,
    success,
  });
});

router.get('/', (req, res) => {
  if (req.session.user_id) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

module.exports = { router, requireAuth, requireAdmin };
