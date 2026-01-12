const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/notifications
 * Liste les notifications de l'utilisateur connecté
 */
router.get('/', authenticate, (req, res) => {
  const { unreadOnly } = req.query;

  let query = `
    SELECT * FROM notifications
    WHERE user_id = ?
  `;

  if (unreadOnly === 'true') {
    query += ` AND read = 0`;
  }

  query += ` ORDER BY created_at DESC LIMIT 100`;

  const notifications = db.prepare(query).all(req.user.id);

  res.json(notifications.map(n => ({
    ...n,
    read: n.read === 1,
  })));
});

/**
 * GET /api/notifications/count
 * Compte les notifications non lues
 */
router.get('/count', authenticate, (req, res) => {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND read = 0
  `).get(req.user.id);

  res.json({ count: result.count });
});

/**
 * POST /api/notifications
 * Créer une notification (généralement appelé par le système)
 */
router.post('/', authenticate, (req, res) => {
  const { userId, type, title, message, link } = req.body;

  if (!userId || !type || !title) {
    return res.status(400).json({ error: 'userId, type et title requis' });
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, link)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, type, title, message, link);

  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);

  res.status(201).json({
    ...notification,
    read: false,
  });
});

/**
 * POST /api/notifications/bulk
 * Créer plusieurs notifications en une fois
 */
router.post('/bulk', authenticate, (req, res) => {
  const { notifications } = req.body;

  if (!Array.isArray(notifications)) {
    return res.status(400).json({ error: 'notifications doit être un tableau' });
  }

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, link)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((notifs) => {
    for (const n of notifs) {
      insertNotif.run(uuidv4(), n.userId, n.type, n.title, n.message, n.link);
    }
  });

  insertMany(notifications);

  res.status(201).json({ message: `${notifications.length} notifications créées` });
});

/**
 * PATCH /api/notifications/:id/read
 * Marquer une notification comme lue
 */
router.patch('/:id/read', authenticate, (req, res) => {
  const { id } = req.params;

  const notification = db.prepare(`
    SELECT id FROM notifications WHERE id = ? AND user_id = ?
  `).get(id, req.user.id);

  if (!notification) {
    return res.status(404).json({ error: 'Notification non trouvée' });
  }

  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(id);

  res.json({ message: 'Notification marquée comme lue' });
});

/**
 * PATCH /api/notifications/read-all
 * Marquer toutes les notifications comme lues
 */
router.patch('/read-all', authenticate, (req, res) => {
  db.prepare(`
    UPDATE notifications SET read = 1 WHERE user_id = ?
  `).run(req.user.id);

  res.json({ message: 'Toutes les notifications marquées comme lues' });
});

/**
 * DELETE /api/notifications/:id
 * Supprimer une notification
 */
router.delete('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  const notification = db.prepare(`
    SELECT id FROM notifications WHERE id = ? AND user_id = ?
  `).get(id, req.user.id);

  if (!notification) {
    return res.status(404).json({ error: 'Notification non trouvée' });
  }

  db.prepare('DELETE FROM notifications WHERE id = ?').run(id);

  res.json({ message: 'Notification supprimée' });
});

/**
 * DELETE /api/notifications
 * Supprimer toutes les notifications de l'utilisateur
 */
router.delete('/', authenticate, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);

  res.json({ message: 'Toutes les notifications supprimées' });
});

module.exports = router;
