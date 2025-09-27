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
const path = require('path');
const cors = require('cors');

const Logger = require('./utils/logger');
const databaseManager = require('./bdd/DatabaseManager');
const RealTimeAPI = require('./api');
const websocketHandler = require('./websocket/handlers');

const { router: authRoutes } = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const moduleRoutes = require('./routes/modules');
const dashboardRoutes = require('./routes/dashboard');
const timelinesRoutes = require('./routes/timelines');
const documentationsRoutes = require('./routes/documentations');

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
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
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
app.use('/documentations', documentationsRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found');
});

// ============================================================================
// WEBSOCKET SETUP
// ============================================================================

io.app = app;
websocketHandler(io);

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
    await databaseManager.initialize();
    await databaseManager.initializeDatabase();

    const realTimeAPI = new RealTimeAPI(io, databaseManager);
    realTimeAPI.initialize();
    app.locals.realTimeAPI = realTimeAPI;

    Logger.app.info('🔄 Real-time Events API initialized');

    databaseManager.startModuleStatusCleanup(1, 5);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      Logger.app.info(`🚀 MicroCoaster Server running on port ${PORT}`);
      Logger.app.info(`📱 Web interface: http://localhost:${PORT}`);
      Logger.app.info(`🔌 WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    Logger.app.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
