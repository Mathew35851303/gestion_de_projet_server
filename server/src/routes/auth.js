const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Connexion utilisateur
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);

  if (!validPassword) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }

  const token = generateToken(user.id);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      color: user.color,
      avatar: user.avatar,
      allowedPages: user.allowed_pages ? JSON.parse(user.allowed_pages) : [],
      mustChangePassword: user.must_change_password === 1,
    },
  });
});

/**
 * GET /api/auth/me
 * Récupérer l'utilisateur connecté
 */
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/change-password
 * Changer le mot de passe
 */
router.post('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }

  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

  // Si l'utilisateur doit changer son mot de passe, on ne vérifie pas l'ancien
  if (!req.user.mustChangePassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel requis' });
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);

  db.prepare(`
    UPDATE users
    SET password = ?, must_change_password = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(hashedPassword, req.user.id);

  res.json({ message: 'Mot de passe modifié avec succès' });
});

/**
 * POST /api/auth/logout
 * Déconnexion (côté client principalement)
 */
router.post('/logout', authenticate, (req, res) => {
  // Le token est invalidé côté client
  res.json({ message: 'Déconnexion réussie' });
});

module.exports = router;
