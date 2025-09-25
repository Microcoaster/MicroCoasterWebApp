// Charger les variables d'environnement
require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const cors = require('cors');

// Routes
const { router: authRoutes } = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const moduleRoutes = require('./routes/modules');
const dashboardRoutes = require('./routes/dashboard');
const timelinesRoutes = require('./routes/timelines');
const documentationsRoutes = require('./routes/documentations');

// WebSocket handlers
const websocketHandler = require('./websocket/handlers');

// Database
const databaseManager = require('./bdd/DatabaseManager');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.WS_CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  },
  // 🔧 AUGMENTER LES TIMEOUTS
  pingTimeout: 60000,      // 60 secondes avant timeout
  pingInterval: 25000,     // Ping toutes les 25 secondes  
  connectTimeout: 45000    // 45 secondes pour se connecter
});

// Configuration Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware de sécurité CSP
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self' ws: wss:; " +
    "font-src 'self';"
  );
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration des sessions
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true', // true en HTTPS
    maxAge: parseInt(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000 // 24 heures
  }
});

app.use(sessionMiddleware);

// Partage des sessions avec Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Servir les fichiers statiques (CSS, JS, images)
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/modules', moduleRoutes);
app.use('/timelines', timelinesRoutes);
app.use('/documentations', documentationsRoutes);

// Gestion WebSocket
websocketHandler(io);

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Initialisation de la base de données
async function startServer() {
  try {
    // Initialiser le gestionnaire de base de données
    await databaseManager.initialize();
    
    // Initialiser la base de données si nécessaire
    await databaseManager.initializeDatabase();
    
    // Démarrer le nettoyage automatique des statuts des modules
    databaseManager.startModuleStatusCleanup(1, 5); // Chaque minute, max 5 min
    
    // Démarrer le serveur
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 MicroCoaster Server running on port ${PORT}`);
      console.log(`📱 Web interface: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Démarrer l'application
startServer();

module.exports = { app, server, io };
