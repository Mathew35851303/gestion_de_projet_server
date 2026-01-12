const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/projects
 * Liste les projets (filtrés selon le rôle)
 */
router.get('/', authenticate, (req, res) => {
  let projects;

  if (req.user.role === 'admin') {
    // Admin voit tous les projets
    projects = db.prepare(`
      SELECT p.*, u.name as creator_name
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `).all();
  } else {
    // Utilisateur normal voit ses projets
    projects = db.prepare(`
      SELECT p.*, u.name as creator_name
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      INNER JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  }

  // Récupérer les membres pour chaque projet
  const getMembers = db.prepare(`
    SELECT u.id, u.name, u.email, u.color, u.avatar
    FROM users u
    INNER JOIN project_members pm ON u.id = pm.user_id
    WHERE pm.project_id = ?
  `);

  const result = projects.map(project => ({
    ...project,
    members: getMembers.all(project.id),
  }));

  res.json(result);
});

/**
 * GET /api/projects/:id
 * Récupérer un projet par ID
 */
router.get('/:id', authenticate, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name as creator_name
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!project) {
    return res.status(404).json({ error: 'Projet non trouvé' });
  }

  // Vérifier l'accès si non-admin
  if (req.user.role !== 'admin') {
    const isMember = db.prepare(`
      SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
    `).get(project.id, req.user.id);

    if (!isMember) {
      return res.status(403).json({ error: 'Accès non autorisé à ce projet' });
    }
  }

  // Récupérer les membres
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.color, u.avatar
    FROM users u
    INNER JOIN project_members pm ON u.id = pm.user_id
    WHERE pm.project_id = ?
  `).all(project.id);

  res.json({ ...project, members });
});

/**
 * POST /api/projects
 * Créer un nouveau projet (admin seulement)
 */
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { name, description, color = '#3b82f6', members = [] } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Nom du projet requis' });
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO projects (id, name, description, created_by, color)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description, req.user.id, color);

  // Ajouter le créateur et les membres
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)
  `);

  // Toujours ajouter le créateur
  insertMember.run(id, req.user.id);

  // Ajouter les autres membres
  members.forEach(userId => {
    insertMember.run(id, userId);
  });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  const projectMembers = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN project_members pm ON u.id = pm.user_id
    WHERE pm.project_id = ?
  `).all(id);

  res.status(201).json({ ...project, members: projectMembers });
});

/**
 * PUT /api/projects/:id
 * Modifier un projet (admin seulement)
 */
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description, color, members } = req.body;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({ error: 'Projet non trouvé' });
  }

  db.prepare(`
    UPDATE projects
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        color = COALESCE(?, color),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(name, description, color, id);

  // Mettre à jour les membres si fournis
  if (members) {
    // Supprimer les anciens membres
    db.prepare('DELETE FROM project_members WHERE project_id = ?').run(id);

    // Ajouter les nouveaux membres
    const insertMember = db.prepare(`
      INSERT INTO project_members (project_id, user_id) VALUES (?, ?)
    `);
    members.forEach(userId => {
      insertMember.run(id, userId);
    });
  }

  const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  const projectMembers = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN project_members pm ON u.id = pm.user_id
    WHERE pm.project_id = ?
  `).all(id);

  res.json({ ...updatedProject, members: projectMembers });
});

/**
 * DELETE /api/projects/:id
 * Supprimer un projet (admin seulement)
 */
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({ error: 'Projet non trouvé' });
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);

  res.json({ message: 'Projet supprimé' });
});

/**
 * POST /api/projects/:id/members
 * Ajouter un membre au projet
 */
router.post('/:id/members', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'ID utilisateur requis' });
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({ error: 'Projet non trouvé' });
  }

  db.prepare(`
    INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)
  `).run(id, userId);

  res.json({ message: 'Membre ajouté' });
});

/**
 * DELETE /api/projects/:id/members/:userId
 * Retirer un membre du projet
 */
router.delete('/:id/members/:userId', authenticate, requireAdmin, (req, res) => {
  const { id, userId } = req.params;

  db.prepare(`
    DELETE FROM project_members WHERE project_id = ? AND user_id = ?
  `).run(id, userId);

  res.json({ message: 'Membre retiré' });
});

module.exports = router;
