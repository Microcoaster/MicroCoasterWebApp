# 🎢 MicroCoaster WebApp

<div align="center">

![MicroCoaster Logo](public/assets/img/logo.png)

**Modern web interface for ESP32-based roller coaster control system**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.18-blue.svg)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-red.svg)](https://socket.io/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange.svg)](https://mysql.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [API](#-api) • [Contributing](#-contributing)

</div>

---

## 🎯 Overview

MicroCoaster WebApp is a comprehensive web-based control system for managing ESP32-powered roller coaster modules. Built with modern web technologies, it provides real-time monitoring, control, and telemetry for various coaster components including stations, launch tracks, lighting systems, and safety mechanisms.

### 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │◄──►│  Express Server │◄──►│   MySQL DB      │
│   (Frontend)    │    │   (Backend)     │    │   (Storage)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └─────────────►│   Socket.io     │◄─────────────┘
                        │  (Real-time)    │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │   ESP32 Modules │
                        │   (Hardware)    │
                        └─────────────────┘
```

## ✨ Features

### 🎮 **Module Control**

- **Station Management**: Gates, harness locks, dispatch systems, emergency stops
- **Launch Track**: Variable speed control, direction switching, duration settings
- **Switch Track**: Automated track switching with position feedback
- **Light FX**: RGB lighting control with custom patterns
- **Smoke Machine**: Timed smoke effects with duration control
- **Audio Player**: Multi-track audio playback with playlist management

### 🔄 **Real-time Communication**

- **Socket.io Integration**: Bi-directional real-time communication
- **Live Telemetry**: Real-time status updates from ESP32 modules
- **Presence Detection**: Online/offline module status monitoring
- **Command Feedback**: Instant confirmation of control actions

### 🛡️ **Security & Authentication**

- **Session-based Auth**: Secure user authentication system
- **Access Control**: User-specific module permissions
- **Environment Variables**: Secure configuration management
- **CORS Protection**: Configurable cross-origin resource sharing

### 📱 **Modern UI/UX**

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time Updates**: Live status indicators and animations
- **Interactive Controls**: Touch-friendly interface elements
- **Visual Feedback**: LED indicators, progress bars, and status badges

## 🚀 Installation

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **MySQL** 8.0+ ([Download](https://mysql.com/downloads/))
- **Git** ([Download](https://git-scm.com/))

### Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/CyberSpaceRS/MicroCoasterWebApp.git
   cd MicroCoasterWebApp
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Setup database**

   ```sql
   CREATE DATABASE s37_MicroCoaster_WebApp;

   -- Import your database schema
   -- CREATE TABLE access_codes (id, code, name);
   -- CREATE TABLE modules (id, name, type, user_id);
   ```

5. **Start the server**

   ```bash
   npm start
   # or for development
   npm run dev
   ```

6. **Access the application**
   - Web Interface: `http://localhost:3000`
   - WebSocket: `ws://localhost:3000`

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Application
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-secret-key-here

# Database
DB_HOST=your-database-host
DB_PORT=3306
DB_USER=your-username
DB_PASSWORD=your-password
DB_NAME=your-database-name
DB_CHARSET=utf8mb4
DB_CONNECTION_TIMEOUT=5000
DB_CONNECTION_LIMIT=10

# WebSocket
WS_CORS_ORIGIN=*

# Security
COOKIE_SECURE=false
COOKIE_MAX_AGE=86400000
```

### Database Schema

```sql
-- Access codes table
CREATE TABLE access_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modules table
CREATE TABLE modules (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('Station', 'Switch Track', 'Light FX', 'Launch Track', 'Smoke Machine', 'Audio Player') NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES access_codes(id)
);
```

## 🎮 Usage

### Web Interface

1. **Login**: Enter your access code
2. **Dashboard**: View all your modules and their status
3. **Control**: Click on module elements to send commands
4. **Monitor**: Watch real-time status updates

### ESP32 Integration

Connect your ESP32 modules using the Socket.io protocol:

```cpp
// Arduino example
#include <WiFi.h>
#include <SocketIoClient.h>

SocketIoClient webSocket;

void setup() {
    // Connect to WiFi
    WiFi.begin("your-wifi", "password");

    // Connect to server
    webSocket.begin("your-server-ip", 3000);
    webSocket.on("module_command", handleCommand);
}

void handleCommand(const char* payload, size_t length) {
    // Handle incoming commands
}
```

### Module Simulator

Test without hardware using the included simulator:

```bash
node sim-esp-socketio.cjs
```

## 📡 API Reference

### Socket.io Events

#### Client → Server

| Event            | Description              | Payload                                 |
| ---------------- | ------------------------ | --------------------------------------- |
| `module_command` | Send command to ESP32    | `{moduleId, command, params}`           |
| `register`       | Register as ESP32 module | `{role: "esp32", moduleId, moduleType}` |

#### Server → Client

| Event              | Description            | Payload                        |
| ------------------ | ---------------------- | ------------------------------ |
| `modules_state`    | Current modules status | `[{moduleId, online}]`         |
| `module_online`    | Module came online     | `{moduleId}`                   |
| `module_offline`   | Module went offline    | `{moduleId}`                   |
| `module_telemetry` | Module status update   | `{moduleId, ...telemetryData}` |

### HTTP Routes

| Method | Route      | Description       |
| ------ | ---------- | ----------------- |
| `GET`  | `/`        | Login page        |
| `POST` | `/login`   | Authenticate user |
| `GET`  | `/modules` | Modules dashboard |
| `POST` | `/logout`  | Logout user       |

## 🗂️ Project Structure

```
MicroCoasterWebApp/
├── 📁 bdd/                 # Database access objects (DAO)
│   ├── BaseDAO.js          # Base class for all DAOs
│   ├── DatabaseManager.js  # Main database manager
│   ├── ModuleDAO.js        # Module data access
│   └── UserDAO.js          # User data access
├── 📁 public/              # Static assets
│   ├── 📁 assets/          # Images, icons
│   ├── 📁 css/             # Stylesheets
│   └── 📁 js/              # Client-side JavaScript
├── 📁 routes/              # Express routes
│   ├── auth.js             # Authentication routes
│   └── modules.js          # Module management
├── 📁 views/               # EJS templates
│   ├── login.ejs           # Login page
│   └── modules.ejs         # Dashboard
├── 📁 websocket/           # Socket.io handlers
│   └── handlers.js         # WebSocket logic
├── app.js                  # Main application
├── sim-esp-socketio.cjs    # ESP32 simulator
├── package.json            # Dependencies
├── .env.example            # Environment template
└── README.md               # This file
```

## 🛠️ Development

### Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server
npm test           # Run tests
npm run lint       # Code linting
```

### Adding New Module Types

1. **Define module controller** in `public/js/modules.js`
2. **Add database entry** with new module type
3. **Create ESP32 firmware** for the module
4. **Update UI templates** if needed

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Troubleshooting

### Common Issues

**Database Connection Failed**

```bash
# Check your .env configuration
# Verify MySQL is running
# Test connection: npm run test-db
```

**WebSocket Connection Failed**

```bash
# Check firewall settings
# Verify port 3000 is available
# Check CORS configuration
```

**ESP32 Not Connecting**

```bash
# Verify WiFi credentials
# Check server IP address
# Monitor serial output for errors
```

## 📋 Requirements

### Hardware

- ESP32 development boards
- Various sensors and actuators (LEDs, servos, sensors)
- WiFi network connectivity

### Software

- Node.js 18+
- MySQL 8.0+
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📧 **Email**: yamakajump@gmail.com
- 💬 **Issues**: [GitHub Issues](https://github.com/CyberSpaceRS/MicroCoasterWebApp/issues)
- 📖 **Wiki**: [Project Wiki](https://github.com/CyberSpaceRS/MicroCoasterWebApp/wiki)

---

<div align="center">

**Made with ❤️ for the maker community**

[⬆ Back to top](#-microcoaster-webapp)

</div>
