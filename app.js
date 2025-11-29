/**
 * ============================================================================
 * MICROCOASTER WEBAPP - MAIN APPLICATION SERVER
 * ============================================================================
 * Express.js application with Socket.io for real-time IoT module management
 *
 * @version 1.0.0
 * @description Web interface for MicroCoaster IoT modules control and monitoring
 * @features Real-time updates, User authentication, Admin panel, Module control
 * ============================================================================
 */

require('dotenv').config();

// ============================================================================
// DEPENDENCIES & IMPORTS
// ============================================================================

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

const AppLogger = require('./utils/logger');

// TEMPORARY FIX: Expose Logger globally to prevent Express error
global.Logger = AppLogger;
const databaseManager = require('./bdd/DatabaseManager');
const RealTimeAPI = require('./api');
const websocketHandler = require('./websocket/handlers');
const ESP32WebSocketServer = require('./websocket/esp-server');
const SocketWSBridge = require('./websocket/socket-ws-bridge');

const { router: authRoutes } = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const moduleRoutes = require('./routes/modules');
const dashboardRoutes = require('./routes/dashboard');
const timelinesRoutes = require('./routes/timelines');
const languageRoutes = require('./routes/language');

// Language middleware
const { languageMiddleware } = require('./middleware/language');

// ============================================================================
// APPLICATION SETUP
// ============================================================================

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.WS_CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  path: '/socket.io/', // Path explicite pour Socket.IO (par défaut mais explicité)
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  // Utiliser SEULEMENT polling pour une séparation complète
  transports: ['polling'],
  allowEIO3: true, // Compatibilité avec différentes versions
});

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
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
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: parseInt(process.env.COOKIE_MAX_AGE) || 24 * 60 * 60 * 1000,
  },
});

app.use(sessionMiddleware);

// Language middleware - must be after session for cookie access
app.use(languageMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// ============================================================================
// STATIC FILES & ROUTES
// ============================================================================

app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/modules', moduleRoutes);
app.use('/timelines', timelinesRoutes);
app.use('/api/language', languageRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found');
});

// ============================================================================
// WEBSOCKET SETUP & REAL-TIME API INITIALIZATION
// ============================================================================

io.app = app;

let realTimeAPI = null;

async function initializeRealTimeAPI() {
  try {
    await databaseManager.initialize();
    await databaseManager.initializeDatabase();

    realTimeAPI = new RealTimeAPI(io, databaseManager);
    realTimeAPI.initialize();
    app.locals.realTimeAPI = realTimeAPI;

    AppLogger.app.info('🔄 Real-time Events API initialized early');
  } catch (error) {
    AppLogger.app.error('❌ Real-time API initialization failed:', error);
    throw error;
  }
}

// Initialize real-time API before starting server
initializeRealTimeAPI()
  .then(() => {
    startServer();
  })
  .catch(error => {
    AppLogger.app.error('❌ Failed to initialize real-time API:', error);
    process.exit(1);
  });

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Fixed: The error was caused by LocaleLoader constructor issue in routes/language.js

// Catch unhandled errors
process.on('uncaughtException', error => {
  AppLogger.app.error('❌ Uncaught Exception:', error.message);
  AppLogger.app.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  AppLogger.app.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

/**
 * Initialize and start the MicroCoaster server
 * @async
 * @function startServer
 */
async function startServer() {
  try {
    // Real-time API already initialized above

    // Initialiser les handlers Socket.IO (clients web uniquement)
    websocketHandler(io, null); // Temporaire: sans bridge

    databaseManager.startModuleStatusCleanup(1, 5);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      AppLogger.app.info(`🚀 MicroCoaster Server running on port ${PORT}`);
      AppLogger.app.info(`📱 Web interface: http://localhost:${PORT}`);
      AppLogger.app.info(`🔌 WebSocket: ws://localhost:${PORT}`);

      // Initialiser ESP32 APRÈS que le serveur soit opérationnel
      setTimeout(() => {
        try {
          AppLogger.app.info('🔄 Initializing ESP32 WebSocket Server...');
          const esp32Server = new ESP32WebSocketServer(server, realTimeAPI);
          esp32Server.initialize();
          esp32Server.startHeartbeatChecker();

          AppLogger.app.info('🔄 Initializing Socket-WebSocket Bridge...');
          const socketWSBridge = new SocketWSBridge(realTimeAPI, esp32Server);
          app.locals.esp32Server = esp32Server;
          app.locals.socketWSBridge = socketWSBridge;

          AppLogger.app.info('✅ ESP32 WebSocket Server initialized successfully');
        } catch (error) {
          AppLogger.app.error('❌ ESP32 initialization failed:', error);
        }
      }, 1000); // Délai de 1 seconde après démarrage
    });
  } catch (error) {
    AppLogger.app.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

module.exports = { app, server, io };
