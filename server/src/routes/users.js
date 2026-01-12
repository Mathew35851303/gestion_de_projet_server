const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/users
 * Liste tous les utilisateurs
 */
router.get('/', authenticate, (req, res) => {
  const users = db.prepare(`
    SELECT id, email, name, role, color, avatar, allowed_pages, must_change_password, created_at
    FROM users
    ORDER BY name
  `).all();

  res.json(users.map(user => ({
    ...user,
    allowedPages: user.allowed_pages ? JSON.parse(user.allowed_pages) : [],
    mustChangePassword: user.must_change_password === 1,
  })));
});

/**
 * GET /api/users/:id
 * Récupérer un utilisateur par ID
 */
router.get('/:id', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT id, email, name, role, color, avatar, allowed_pages, must_change_password, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  res.json({
    ...user,
    allowedPages: user.allowed_pages ? JSON.parse(user.allowed_pages) : [],
    mustChangePassword: user.must_change_password === 1,
  });
});

/**
 * POST /api/users
 * Créer un nouvel utilisateur (admin seulement)
 */
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { email, name, password, role = 'user', color = '#3b82f6', allowedPages = [] } = req.body;

  if (!email || !name || !password) {
    return res.status(400).json({ error: 'Email, nom et mot de passe requis' });
  }

  // Vérifier si l'email existe déjà
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Cet email est déjà utilisé' });
  }

  const id = uuidv4();
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, email, name, password, role, color, allowed_pages, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, email.toLowerCase(), name, hashedPassword, role, color, JSON.stringify(allowedPages));

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    color: user.color,
    allowedPages,
    mustChangePassword: true,
  });
});

/**
 * PUT /api/users/:id
 * Modifier un utilisateur (admin seulement, ou soi-même pour certains champs)
 */
router.put('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { email, name, role, color, allowedPages, password } = req.body;

  // Vérifier les permissions
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  // Les non-admins ne peuvent modifier que leur nom et couleur
  if (req.user.role !== 'admin') {
    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = datetime('now')
      WHERE id = ?
    `).run(name, color, id);
  } else {
    // Vérifier si l'email est déjà utilisé par quelqu'un d'autre
    if (email && email !== user.email) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), id);
      if (existing) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }
    }

    let query = `
      UPDATE users
      SET email = COALESCE(?, email),
          name = COALESCE(?, name),
          role = COALESCE(?, role),
          color = COALESCE(?, color),
          allowed_pages = COALESCE(?, allowed_pages),
          updated_at = datetime('now')
    `;
    const params = [
      email ? email.toLowerCase() : null,
      name,
      role,
      color,
      allowedPages ? JSON.stringify(allowedPages) : null,
    ];

    // Ajouter la mise à jour du mot de passe si fourni
    if (password) {
      query += `, password = ?, must_change_password = 1`;
      params.push(bcrypt.hashSync(password, 10));
    }

    query += ` WHERE id = ?`;
    params.push(id);

    db.prepare(query).run(...params);
  }

  const updatedUser = db.prepare(`
    SELECT id, email, name, role, color, avatar, allowed_pages, must_change_password
    FROM users WHERE id = ?
  `).get(id);

  res.json({
    ...updatedUser,
    allowedPages: updatedUser.allowed_pages ? JSON.parse(updatedUser.allowed_pages) : [],
    mustChangePassword: updatedUser.must_change_password === 1,
  });
});

/**
 * DELETE /api/users/:id
 * Supprimer un utilisateur (admin seulement)
 */
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;

  // Ne pas permettre de supprimer son propre compte
  if (req.user.id === id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  res.json({ message: 'Utilisateur supprimé' });
});

module.exports = router;
