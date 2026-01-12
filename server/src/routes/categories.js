const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/categories
 * Liste toutes les catégories
 */
router.get('/', authenticate, (req, res) => {
  const categories = db.prepare(`
    SELECT * FROM categories ORDER BY name
  `).all();

  // Récupérer les membres pour chaque catégorie
  const getMembers = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN category_members cm ON u.id = cm.user_id
    WHERE cm.category_id = ?
  `);

  const result = categories.map(cat => ({
    ...cat,
    members: getMembers.all(cat.id),
  }));

  res.json(result);
});

/**
 * GET /api/categories/:id
 * Récupérer une catégorie par ID
 */
router.get('/:id', authenticate, (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);

  if (!category) {
    return res.status(404).json({ error: 'Catégorie non trouvée' });
  }

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN category_members cm ON u.id = cm.user_id
    WHERE cm.category_id = ?
  `).all(category.id);

  res.json({ ...category, members });
});

/**
 * POST /api/categories
 * Créer une nouvelle catégorie (admin seulement)
 */
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { name, description, color = '#3b82f6', members = [] } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Nom requis' });
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO categories (id, name, description, color)
    VALUES (?, ?, ?, ?)
  `).run(id, name, description, color);

  // Ajouter les membres
  const insertMember = db.prepare(`
    INSERT INTO category_members (category_id, user_id) VALUES (?, ?)
  `);
  members.forEach(userId => {
    insertMember.run(id, userId);
  });

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  const categoryMembers = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN category_members cm ON u.id = cm.user_id
    WHERE cm.category_id = ?
  `).all(id);

  res.status(201).json({ ...category, members: categoryMembers });
});

/**
 * PUT /api/categories/:id
 * Modifier une catégorie (admin seulement)
 */
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description, color, members } = req.body;

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({ error: 'Catégorie non trouvée' });
  }

  db.prepare(`
    UPDATE categories
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        color = COALESCE(?, color)
    WHERE id = ?
  `).run(name, description, color, id);

  // Mettre à jour les membres si fournis
  if (members) {
    db.prepare('DELETE FROM category_members WHERE category_id = ?').run(id);
    const insertMember = db.prepare(`
      INSERT INTO category_members (category_id, user_id) VALUES (?, ?)
    `);
    members.forEach(userId => {
      insertMember.run(id, userId);
    });
  }

  const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  const categoryMembers = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN category_members cm ON u.id = cm.user_id
    WHERE cm.category_id = ?
  `).all(id);

  res.json({ ...updatedCategory, members: categoryMembers });
});

/**
 * DELETE /api/categories/:id
 * Supprimer une catégorie (admin seulement)
 */
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;

  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({ error: 'Catégorie non trouvée' });
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);

  res.json({ message: 'Catégorie supprimée' });
});

/**
 * POST /api/categories/:id/members
 * Ajouter un membre à la catégorie
 */
router.post('/:id/members', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'ID utilisateur requis' });
  }

  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({ error: 'Catégorie non trouvée' });
  }

  db.prepare(`
    INSERT OR IGNORE INTO category_members (category_id, user_id) VALUES (?, ?)
  `).run(id, userId);

  res.json({ message: 'Membre ajouté' });
});

/**
 * DELETE /api/categories/:id/members/:userId
 * Retirer un membre de la catégorie
 */
router.delete('/:id/members/:userId', authenticate, requireAdmin, (req, res) => {
  const { id, userId } = req.params;

  db.prepare(`
    DELETE FROM category_members WHERE category_id = ? AND user_id = ?
  `).run(id, userId);

  res.json({ message: 'Membre retiré' });
});

module.exports = router;
