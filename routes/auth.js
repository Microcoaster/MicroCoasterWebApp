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
      title: 'Acc�s refus�',
      message: "Vous n'avez pas les permissions n�cessaires pour acc�der � cette page.",
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
    title: 'MicroCoaster WebApp - Cr�er un compte',
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
        // Mettre � jour la derni�re connexion
        await databaseManager.users.updateLastLogin(user.id);

        req.session.user_id = user.id;
        req.session.email = user.email;
        req.session.nickname = user.name;
        req.session.is_admin = user.is_admin;
        Logger.info('User authenticated:', user.name, user.is_admin ? '(admin)' : '');
        return res.redirect('/dashboard');
      } else {
        error = 'Email ou mot de passe incorrect.';
      }
    }
  } catch (err) {
    Logger.error('Login error:', err);
    error = 'Erreur de connexion �� la base de donn�es.';
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
      error = 'Le mot de passe doit contenir au moins 6 caract�res.';
    } else if (await databaseManager.users.emailExists(email)) {
      error = 'Un compte avec cet email existe d�j�.';
    } else {
      // Cr�er le compte
      const user = await databaseManager.users.createUser(email, password, name);
      req.session.user_id = user.id;
      req.session.email = user.email;
      req.session.nickname = user.name;
      req.session.is_admin = user.is_admin;
      Logger.info('New user registered:', user.name);
      return res.redirect('/dashboard');
    }
  } catch (err) {
    Logger.error('Register error:', err);
    error = err.message || 'Erreur lors de la cr�ation du compte.';
  }

  res.render('register', {
    error,
    title: 'MicroCoaster WebApp - Cr�er un compte',
    formData: { email, name }, // Garder les donn�es du formulaire
  });
});

router.get('/logout', (req, res) => {
  const userName = req.session.nickname || 'User';
  req.session.destroy(err => {
    if (err) {
      Logger.error('Session destroy error:', err);
    }
    Logger.info('User logged out:', userName);
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
    Logger.error('Profile error:', error);
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
      error = 'Un compte avec cet email existe d�j�.';
    } else {
      // Mise � jour
      const updatedUser = await databaseManager.users.updateProfile(req.session.user_id, {
        name,
        email,
      });
      req.session.nickname = updatedUser.name;
      req.session.email = updatedUser.email;
      success = 'Profil mis � jour avec succ�s.';
      user.name = updatedUser.name;
      user.email = updatedUser.email;
    }
  } catch (err) {
    Logger.error('Profile update error:', err);
    error = err.message || 'Erreur lors de la mise � jour du profil.';
  }

  const user = await databaseManager.users.findById(req.session.user_id);
  res.render('profile', {
    title: 'MicroCoaster WebApp - Profil',
    user,
    error,
    success,
  });
});

router.post('/chang�e-password', requireAuth, async (req, res) => {
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
      // changer le mot de passe
      await databaseManager.users.changePassword(req.session.user_id, currentPassword, newPassword);
      success = 'Mot de passe changé avec succès.';
    }
  } catch (err) {
    Logger.error('Password change error:', err);
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
