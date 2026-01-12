const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';

/**
 * Middleware d'authentification
 * Vérifie le token JWT dans le header Authorization
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token d\'authentification requis' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Vérifier que l'utilisateur existe toujours
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    // Ajouter l'utilisateur à la requête
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      color: user.color,
      allowedPages: user.allowed_pages ? JSON.parse(user.allowed_pages) : [],
      mustChangePassword: user.must_change_password === 1,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
}

/**
 * Middleware pour vérifier si l'utilisateur est admin
 */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

/**
 * Middleware pour vérifier l'accès à une page spécifique
 */
function requirePageAccess(pageName) {
  return (req, res, next) => {
    // Les admins ont accès à tout
    if (req.user.role === 'admin') {
      return next();
    }

    // Si allowedPages est vide, l'utilisateur a accès à tout
    if (!req.user.allowedPages || req.user.allowedPages.length === 0) {
      return next();
    }

    // Vérifier si la page est dans la liste des pages autorisées
    if (req.user.allowedPages.includes(pageName)) {
      return next();
    }

    return res.status(403).json({ error: 'Accès non autorisé à cette page' });
  };
}

/**
 * Générer un token JWT
 */
function generateToken(userId) {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: `${process.env.JWT_EXPIRES_IN || 24}h` }
  );
}

module.exports = {
  authenticate,
  requireAdmin,
  requirePageAccess,
  generateToken,
};
