/**
 * Script d'initialisation de la base de données
 * Crée un utilisateur admin par défaut et des données de démonstration
 */

require('dotenv').config();
const db = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

console.log('🔧 Initialisation de la base de données...\n');

// Vérifier si des utilisateurs existent déjà
const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();

if (existingUsers.count > 0) {
  console.log('⚠️  La base de données contient déjà des données.');
  console.log('   Pour réinitialiser, supprimez le fichier data/database.sqlite\n');
  process.exit(0);
}

// Créer le mot de passe hashé
const defaultPassword = bcrypt.hashSync('admin123', 10);
const userPassword = bcrypt.hashSync('password123', 10);

// Créer l'utilisateur admin par défaut
const adminId = uuidv4();
db.prepare(`
  INSERT INTO users (id, email, name, password, role, color, must_change_password)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(adminId, 'admin@gamedev.com', 'Administrateur', defaultPassword, 'admin', '#3b82f6', 1);

console.log('✅ Utilisateur admin créé:');
console.log('   Email: admin@gamedev.com');
console.log('   Mot de passe: admin123');
console.log('   ⚠️  Changez ce mot de passe à la première connexion!\n');

// Créer quelques utilisateurs de démonstration
const users = [
  { email: 'dev@gamedev.com', name: 'Bob Developer', role: 'admin', color: '#10b981' },
  { email: 'designer@gamedev.com', name: 'Charlie Designer', role: 'user', color: '#f59e0b' },
  { email: 'artist@gamedev.com', name: 'Diana Artist', role: 'user', color: '#ec4899' },
  { email: 'sound@gamedev.com', name: 'Eve Sound Designer', role: 'user', color: '#8b5cf6' },
  { email: 'qa@gamedev.com', name: 'Frank QA', role: 'user', color: '#ef4444' },
];

const userIds = [adminId];
const insertUser = db.prepare(`
  INSERT INTO users (id, email, name, password, role, color, must_change_password)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

users.forEach(user => {
  const id = uuidv4();
  userIds.push(id);
  insertUser.run(id, user.email, user.name, userPassword, user.role, user.color, 0);
});

console.log('✅ Utilisateurs de démonstration créés (mot de passe: password123)\n');

// Créer les catégories/services
const categories = [
  { name: 'UI/UX', description: 'Interface utilisateur et expérience utilisateur', color: '#8b5cf6' },
  { name: 'Développement', description: 'Équipe de développement backend et frontend', color: '#10b981' },
  { name: 'QA', description: 'Assurance qualité et tests', color: '#ef4444' },
  { name: 'Audio', description: 'Sound design et musique', color: '#f59e0b' },
  { name: 'Production', description: 'Gestion de projet et coordination', color: '#06b6d4' },
];

const categoryIds = [];
const insertCategory = db.prepare(`
  INSERT INTO categories (id, name, description, color)
  VALUES (?, ?, ?, ?)
`);

const insertCategoryMember = db.prepare(`
  INSERT INTO category_members (category_id, user_id)
  VALUES (?, ?)
`);

categories.forEach((cat, index) => {
  const id = uuidv4();
  categoryIds.push(id);
  insertCategory.run(id, cat.name, cat.description, cat.color);

  // Assigner quelques membres aux catégories
  if (index < userIds.length - 1) {
    insertCategoryMember.run(id, userIds[index + 1]);
  }
});

console.log('✅ Catégories/Services créés\n');

// Créer un projet de démonstration
const projectId = uuidv4();
db.prepare(`
  INSERT INTO projects (id, name, description, created_by, color)
  VALUES (?, ?, ?, ?, ?)
`).run(
  projectId,
  'Projet Démo',
  'Un projet de démonstration pour tester les fonctionnalités',
  adminId,
  '#3b82f6'
);

// Ajouter tous les utilisateurs au projet
const insertProjectMember = db.prepare(`
  INSERT INTO project_members (project_id, user_id)
  VALUES (?, ?)
`);

userIds.forEach(userId => {
  insertProjectMember.run(projectId, userId);
});

console.log('✅ Projet de démonstration créé\n');

// Créer quelques tâches de démonstration
const tasks = [
  { title: 'Configurer le serveur', status: 'done', priority: 'high' },
  { title: 'Créer l\'interface utilisateur', status: 'in-progress', priority: 'high' },
  { title: 'Implémenter l\'authentification', status: 'done', priority: 'critical' },
  { title: 'Tester les fonctionnalités', status: 'todo', priority: 'medium' },
  { title: 'Déployer en production', status: 'todo', priority: 'high' },
];

const insertTask = db.prepare(`
  INSERT INTO tasks (id, project_id, title, status, priority, created_by, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

tasks.forEach(task => {
  insertTask.run(
    uuidv4(),
    projectId,
    task.title,
    task.status,
    task.priority,
    adminId,
    JSON.stringify(['demo'])
  );
});

console.log('✅ Tâches de démonstration créées\n');

console.log('═══════════════════════════════════════════════════════');
console.log('🎉 Base de données initialisée avec succès !');
console.log('═══════════════════════════════════════════════════════');
console.log('\nVous pouvez maintenant démarrer le serveur avec: npm start\n');
