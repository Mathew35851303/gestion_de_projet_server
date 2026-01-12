const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuration de multer pour le stockage des fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Créer des sous-dossiers par type
    let subDir = 'misc';
    if (file.mimetype.startsWith('image/')) {
      subDir = 'images';
    } else if (file.mimetype.startsWith('video/')) {
      subDir = 'videos';
    } else if (file.mimetype.startsWith('audio/')) {
      subDir = 'audio';
    }

    const dir = path.join(uploadsDir, subDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Générer un nom unique
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// Filtrer les types de fichiers acceptés
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
  },
});

/**
 * POST /api/uploads
 * Upload un fichier
 */
router.post('/', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier fourni' });
  }

  // Construire l'URL du fichier
  const relativePath = path.relative(uploadsDir, req.file.path).replace(/\\/g, '/');

  // Utiliser l'URL de base si configurée, sinon URL relative
  const baseUrl = process.env.BASE_URL || '';
  const fileUrl = `${baseUrl}/uploads/${relativePath}`;

  res.json({
    url: fileUrl,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

/**
 * POST /api/uploads/multiple
 * Upload plusieurs fichiers
 */
router.post('/multiple', authenticate, upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Aucun fichier fourni' });
  }

  const baseUrl = process.env.BASE_URL || '';
  const files = req.files.map(file => {
    const relativePath = path.relative(uploadsDir, file.path).replace(/\\/g, '/');
    return {
      url: `${baseUrl}/uploads/${relativePath}`,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  });

  res.json({ files });
});

/**
 * DELETE /api/uploads/:filename
 * Supprimer un fichier
 */
router.delete('/:subdir/:filename', authenticate, (req, res) => {
  const { subdir, filename } = req.params;

  // Sécurité: vérifier que le filename ne contient pas de traversée
  if (filename.includes('..') || subdir.includes('..')) {
    return res.status(400).json({ error: 'Chemin invalide' });
  }

  const filePath = path.join(uploadsDir, subdir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier non trouvé' });
  }

  fs.unlinkSync(filePath);

  res.json({ message: 'Fichier supprimé' });
});

// Gestion des erreurs multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Fichier trop volumineux (max 50MB)' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;
