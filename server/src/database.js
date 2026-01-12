const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// S'assurer que le dossier data existe
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);

// Activer les clés étrangères
db.pragma('foreign_keys = ON');

// Créer les tables si elles n'existent pas
db.exec(`
  -- Table des utilisateurs
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    color TEXT DEFAULT '#3b82f6',
    avatar TEXT,
    allowed_pages TEXT, -- JSON array
    must_change_password INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Table des projets
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    cover_image TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'on-hold', 'completed')),
    start_date TEXT DEFAULT (datetime('now')),
    end_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Table des membres de projet
  CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Table des catégories/services
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Table des membres de catégorie
  CREATE TABLE IF NOT EXISTS category_members (
    category_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (category_id, user_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Table des tâches
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in-progress', 'review', 'done')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
    created_by TEXT NOT NULL,
    due_date TEXT,
    time_estimate REAL,
    time_spent REAL DEFAULT 0,
    tags TEXT, -- JSON array
    dependencies TEXT, -- JSON array of task IDs
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Table des assignés aux tâches
  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (task_id, user_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Table des bugs
  CREATE TABLE IF NOT EXISTS bugs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT DEFAULT 'major' CHECK(severity IN ('minor', 'major', 'critical', 'blocker')),
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in-progress', 'testing', 'closed')),
    steps_to_reproduce TEXT, -- JSON array
    attachments TEXT, -- JSON array of URLs
    category_id TEXT,
    reported_by TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (reported_by) REFERENCES users(id)
  );

  -- Table des notifications
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Table des documents
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    markdown TEXT,
    created_by TEXT NOT NULL,
    doc_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Table des événements calendrier
  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT DEFAULT 'other' CHECK(type IN ('meeting', 'deadline', 'vacation', 'milestone', 'other')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Table des assets
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'other' CHECK(type IN ('sprite', 'model', 'audio', 'texture', 'animation', 'other')),
    status TEXT DEFAULT 'concept' CHECK(status IN ('concept', 'wip', 'review', 'approved', 'integrated')),
    assigned_to TEXT,
    version TEXT DEFAULT '1.0',
    file_url TEXT,
    thumbnail TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id)
  );

  -- Index pour améliorer les performances
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id);
  CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
`);

module.exports = db;
