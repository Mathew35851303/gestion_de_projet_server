const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/tasks
 * Liste les tâches (filtrées par projet si spécifié)
 */
router.get('/', authenticate, (req, res) => {
  const { projectId, status, assignee } = req.query;

  let query = `
    SELECT t.*, u.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.created_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (projectId) {
    query += ` AND t.project_id = ?`;
    params.push(projectId);
  }

  if (status) {
    query += ` AND t.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY t.created_at DESC`;

  const tasks = db.prepare(query).all(...params);

  // Récupérer les assignés pour chaque tâche
  const getAssignees = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN task_assignees ta ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `);

  const result = tasks.map(task => ({
    ...task,
    tags: task.tags ? JSON.parse(task.tags) : [],
    dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
    assignees: getAssignees.all(task.id),
  }));

  // Filtrer par assigné si spécifié
  if (assignee) {
    return res.json(result.filter(t => t.assignees.some(a => a.id === assignee)));
  }

  res.json(result);
});

/**
 * GET /api/tasks/:id
 * Récupérer une tâche par ID
 */
router.get('/:id', authenticate, (req, res) => {
  const task = db.prepare(`
    SELECT t.*, u.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Tâche non trouvée' });
  }

  const assignees = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN task_assignees ta ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `).all(task.id);

  res.json({
    ...task,
    tags: task.tags ? JSON.parse(task.tags) : [],
    dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
    assignees,
  });
});

/**
 * POST /api/tasks
 * Créer une nouvelle tâche
 */
router.post('/', authenticate, (req, res) => {
  const {
    projectId,
    title,
    description,
    status = 'todo',
    priority = 'medium',
    assignees = [],
    dueDate,
    timeEstimate,
    tags = [],
    dependencies = [],
  } = req.body;

  if (!projectId || !title) {
    return res.status(400).json({ error: 'Projet et titre requis' });
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, status, priority, created_by, due_date, time_estimate, tags, dependencies)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    title,
    description,
    status,
    priority,
    req.user.id,
    dueDate || null,
    timeEstimate || null,
    JSON.stringify(tags),
    JSON.stringify(dependencies)
  );

  // Ajouter les assignés
  const insertAssignee = db.prepare(`
    INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)
  `);
  assignees.forEach(userId => {
    insertAssignee.run(id, userId);
  });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  const taskAssignees = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN task_assignees ta ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `).all(id);

  res.status(201).json({
    ...task,
    tags: JSON.parse(task.tags || '[]'),
    dependencies: JSON.parse(task.dependencies || '[]'),
    assignees: taskAssignees,
  });
});

/**
 * PUT /api/tasks/:id
 * Modifier une tâche
 */
router.put('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    status,
    priority,
    assignees,
    dueDate,
    timeEstimate,
    timeSpent,
    tags,
    dependencies,
  } = req.body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    return res.status(404).json({ error: 'Tâche non trouvée' });
  }

  db.prepare(`
    UPDATE tasks
    SET title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        due_date = COALESCE(?, due_date),
        time_estimate = COALESCE(?, time_estimate),
        time_spent = COALESCE(?, time_spent),
        tags = COALESCE(?, tags),
        dependencies = COALESCE(?, dependencies),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title,
    description,
    status,
    priority,
    dueDate,
    timeEstimate,
    timeSpent,
    tags ? JSON.stringify(tags) : null,
    dependencies ? JSON.stringify(dependencies) : null,
    id
  );

  // Mettre à jour les assignés si fournis
  if (assignees) {
    db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(id);
    const insertAssignee = db.prepare(`
      INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)
    `);
    assignees.forEach(userId => {
      insertAssignee.run(id, userId);
    });
  }

  const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  const taskAssignees = db.prepare(`
    SELECT u.id, u.name, u.email, u.color
    FROM users u
    INNER JOIN task_assignees ta ON u.id = ta.user_id
    WHERE ta.task_id = ?
  `).all(id);

  res.json({
    ...updatedTask,
    tags: JSON.parse(updatedTask.tags || '[]'),
    dependencies: JSON.parse(updatedTask.dependencies || '[]'),
    assignees: taskAssignees,
  });
});

/**
 * DELETE /api/tasks/:id
 * Supprimer une tâche
 */
router.delete('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!task) {
    return res.status(404).json({ error: 'Tâche non trouvée' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

  res.json({ message: 'Tâche supprimée' });
});

/**
 * PATCH /api/tasks/:id/status
 * Changer le statut d'une tâche
 */
router.patch('/:id/status', authenticate, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['todo', 'in-progress', 'review', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!task) {
    return res.status(404).json({ error: 'Tâche non trouvée' });
  }

  db.prepare(`
    UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, id);

  res.json({ message: 'Statut mis à jour', status });
});

module.exports = router;
