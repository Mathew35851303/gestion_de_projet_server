const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/bugs
 * Liste les bugs (filtrés par projet si spécifié)
 */
router.get('/', authenticate, (req, res) => {
  const { projectId, status, severity, categoryId } = req.query;

  let query = `
    SELECT b.*, u.name as reporter_name, c.name as category_name, c.color as category_color
    FROM bugs b
    LEFT JOIN users u ON b.reported_by = u.id
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (projectId) {
    query += ` AND b.project_id = ?`;
    params.push(projectId);
  }

  if (status) {
    query += ` AND b.status = ?`;
    params.push(status);
  }

  if (severity) {
    query += ` AND b.severity = ?`;
    params.push(severity);
  }

  if (categoryId) {
    query += ` AND b.category_id = ?`;
    params.push(categoryId);
  }

  query += ` ORDER BY b.created_at DESC`;

  const bugs = db.prepare(query).all(...params);

  const result = bugs.map(bug => ({
    ...bug,
    stepsToReproduce: bug.steps_to_reproduce ? JSON.parse(bug.steps_to_reproduce) : [],
    attachments: bug.attachments ? JSON.parse(bug.attachments) : [],
  }));

  res.json(result);
});

/**
 * GET /api/bugs/:id
 * Récupérer un bug par ID
 */
router.get('/:id', authenticate, (req, res) => {
  const bug = db.prepare(`
    SELECT b.*, u.name as reporter_name, c.name as category_name, c.color as category_color
    FROM bugs b
    LEFT JOIN users u ON b.reported_by = u.id
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!bug) {
    return res.status(404).json({ error: 'Bug non trouvé' });
  }

  res.json({
    ...bug,
    stepsToReproduce: bug.steps_to_reproduce ? JSON.parse(bug.steps_to_reproduce) : [],
    attachments: bug.attachments ? JSON.parse(bug.attachments) : [],
  });
});

/**
 * POST /api/bugs
 * Créer un nouveau bug
 */
router.post('/', authenticate, (req, res) => {
  const {
    projectId,
    title,
    description,
    severity = 'major',
    status = 'open',
    stepsToReproduce = [],
    attachments = [],
    categoryId,
  } = req.body;

  if (!projectId || !title) {
    return res.status(400).json({ error: 'Projet et titre requis' });
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO bugs (id, project_id, title, description, severity, status, steps_to_reproduce, attachments, category_id, reported_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    title,
    description,
    severity,
    status,
    JSON.stringify(stepsToReproduce),
    JSON.stringify(attachments),
    categoryId || null,
    req.user.id
  );

  const bug = db.prepare(`
    SELECT b.*, u.name as reporter_name, c.name as category_name, c.color as category_color
    FROM bugs b
    LEFT JOIN users u ON b.reported_by = u.id
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.id = ?
  `).get(id);

  res.status(201).json({
    ...bug,
    stepsToReproduce: JSON.parse(bug.steps_to_reproduce || '[]'),
    attachments: JSON.parse(bug.attachments || '[]'),
  });
});

/**
 * PUT /api/bugs/:id
 * Modifier un bug
 */
router.put('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    severity,
    status,
    stepsToReproduce,
    attachments,
    categoryId,
  } = req.body;

  const bug = db.prepare('SELECT * FROM bugs WHERE id = ?').get(id);
  if (!bug) {
    return res.status(404).json({ error: 'Bug non trouvé' });
  }

  // Déterminer resolved_at
  let resolvedAt = bug.resolved_at;
  if (status === 'closed' && bug.status !== 'closed') {
    resolvedAt = new Date().toISOString();
  } else if (status && status !== 'closed') {
    resolvedAt = null;
  }

  db.prepare(`
    UPDATE bugs
    SET title = COALESCE(?, title),
        description = COALESCE(?, description),
        severity = COALESCE(?, severity),
        status = COALESCE(?, status),
        steps_to_reproduce = COALESCE(?, steps_to_reproduce),
        attachments = COALESCE(?, attachments),
        category_id = COALESCE(?, category_id),
        resolved_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title,
    description,
    severity,
    status,
    stepsToReproduce ? JSON.stringify(stepsToReproduce) : null,
    attachments ? JSON.stringify(attachments) : null,
    categoryId,
    resolvedAt,
    id
  );

  const updatedBug = db.prepare(`
    SELECT b.*, u.name as reporter_name, c.name as category_name, c.color as category_color
    FROM bugs b
    LEFT JOIN users u ON b.reported_by = u.id
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.id = ?
  `).get(id);

  res.json({
    ...updatedBug,
    stepsToReproduce: JSON.parse(updatedBug.steps_to_reproduce || '[]'),
    attachments: JSON.parse(updatedBug.attachments || '[]'),
  });
});

/**
 * DELETE /api/bugs/:id
 * Supprimer un bug
 */
router.delete('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  const bug = db.prepare('SELECT id FROM bugs WHERE id = ?').get(id);
  if (!bug) {
    return res.status(404).json({ error: 'Bug non trouvé' });
  }

  db.prepare('DELETE FROM bugs WHERE id = ?').run(id);

  res.json({ message: 'Bug supprimé' });
});

/**
 * PATCH /api/bugs/:id/status
 * Changer le statut d'un bug
 */
router.patch('/:id/status', authenticate, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['open', 'in-progress', 'testing', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  const bug = db.prepare('SELECT * FROM bugs WHERE id = ?').get(id);
  if (!bug) {
    return res.status(404).json({ error: 'Bug non trouvé' });
  }

  const resolvedAt = status === 'closed' ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE bugs SET status = ?, resolved_at = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, resolvedAt, id);

  res.json({ message: 'Statut mis à jour', status });
});

/**
 * PATCH /api/bugs/:id/severity
 * Changer la sévérité d'un bug
 */
router.patch('/:id/severity', authenticate, (req, res) => {
  const { id } = req.params;
  const { severity } = req.body;

  if (!['minor', 'major', 'critical', 'blocker'].includes(severity)) {
    return res.status(400).json({ error: 'Sévérité invalide' });
  }

  const bug = db.prepare('SELECT id FROM bugs WHERE id = ?').get(id);
  if (!bug) {
    return res.status(404).json({ error: 'Bug non trouvé' });
  }

  db.prepare(`
    UPDATE bugs SET severity = ?, updated_at = datetime('now') WHERE id = ?
  `).run(severity, id);

  res.json({ message: 'Sévérité mise à jour', severity });
});

module.exports = router;
