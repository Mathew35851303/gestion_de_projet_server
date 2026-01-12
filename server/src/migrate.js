/**
 * Script de migration pour ajouter les nouvelles colonnes
 * Executer une seule fois sur le serveur: node src/migrate.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);

console.log('Migration de la base de donnees...');

// Verifier et ajouter les colonnes manquantes pour projects
const projectColumns = db.pragma('table_info(projects)').map(col => col.name);

if (!projectColumns.includes('cover_image')) {
  console.log('Ajout de la colonne cover_image a projects...');
  db.exec('ALTER TABLE projects ADD COLUMN cover_image TEXT');
}

if (!projectColumns.includes('status')) {
  console.log('Ajout de la colonne status a projects...');
  db.exec("ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active'");
}

if (!projectColumns.includes('start_date')) {
  console.log('Ajout de la colonne start_date a projects...');
  // SQLite ne permet pas datetime('now') comme default dans ALTER TABLE
  db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
  // Mettre a jour les projets existants avec created_at
  console.log('Mise a jour des projets existants...');
  db.exec('UPDATE projects SET start_date = created_at WHERE start_date IS NULL');
}

if (!projectColumns.includes('end_date')) {
  console.log('Ajout de la colonne end_date a projects...');
  db.exec('ALTER TABLE projects ADD COLUMN end_date TEXT');
}

// Verifier que la colonne avatar existe pour users (devrait deja exister)
const userColumns = db.pragma('table_info(users)').map(col => col.name);

if (!userColumns.includes('avatar')) {
  console.log('Ajout de la colonne avatar a users...');
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
}

console.log('Migration terminee avec succes!');
db.close();
