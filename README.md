# CodeForge Enhanced ✨

A fast, private, browser-based code editor with **integrated Git support**, **Node.js/npm terminal**, and **local project preview**. Everything runs locally on your machine — nothing ever leaves your device.

## 🚀 New Features (v7.0.0)

### 1. **Integrated Git Support**
- **Git Status** — View file changes in real-time
- **Commit History** — Browse past commits with author, date, and message
- **Branch Management** — List and manage git branches
- **Repository Init** — Initialize new git repositories from the UI
- **Git Terminal** — Full git command support in the terminal

### 2. **Enhanced Terminal**
- **Real Shell Integration** — Full bash/zsh/PowerShell/cmd support
- **Git Commands** — `git clone`, `git commit`, `git push`, etc.
- **npm/yarn Support** — Install packages, run scripts, manage dependencies
- **Node.js** — Run Node.js applications directly
- **Python & More** — Execute any installed command-line tool
- **Auto-detection** — Terminal automatically detects your system shell

### 3. **Local Project Preview**
- **Express/Node.js Preview** — Run and preview Express.js servers
- **Static Server** — Preview HTML/CSS/JS projects on localhost
- **Multiple Ports** — Run multiple projects simultaneously on different ports
- **Quick Links** — One-click preview access to running servers
- **Auto Port Management** — Automatically finds available ports

### 4. **Development Workflow**
- **Package.json Recognition** — Detects Node.js projects automatically
- **npm Scripts** — Run custom scripts defined in package.json
- **Hot Reload Ready** — Compatible with nodemon and other dev tools
- **Build Tools** — Supports webpack, Vite, Parcel, and more

## 📋 Requirements

- **Node.js** ≥ 14 (for running locally)
- **npm** or **yarn** (for package management)
- **Git** (optional, for git integration)

### Recommended Dependencies

```bash
# Install full dependencies for best experience
npm install

# For real PTY support (better TUI apps like vim, htop)
npm install node-pty
```

## 🚀 Quick Start

### Option 1: Simple Serve (No Build Required)
```bash
npm install
npm run serve
# Open http://localhost:5500 in your browser
```

### Option 2: Development Mode (With Hot Reload)
```bash
npm install
npm run dev
# Open http://localhost:5173 in your browser (or the port shown)
```

### Option 3: Build for Production
```bash
npm install
npm run build
# Deploy dist/ folder to any static host
```

## 📁 Project Structure

```
CodeForge-Enhanced/
├── public/                    # Static assets
│   ├── app.js                # Main application logic
│   ├── terminal.js           # Terminal UI
│   ├── git-integration.js    # Git UI integration
│   ├── style.css             # Styles
│   └── vendor/               # Dependencies (Monaco, xterm, etc)
├── server/
│   ├── terminal-backend.js   # Terminal server (shell execution)
│   ├── git-handler.js        # Git command executor
│   ├── preview-manager.js    # Preview server manager
│   └── enhanced-api.js       # API endpoints
├── index.html                # Main HTML
├── server.js                 # Express server entry point
├── package.json              # Dependencies
└── vite.config.mjs          # Vite configuration
```

## 🔧 Core Features

### Terminal Panel

**Keyboard Shortcuts:**
- `Ctrl+`` — Toggle terminal panel
- `Ctrl+Shift+`` — Open new terminal tab
- `Ctrl+C` — Kill current process
- `Ctrl+D` — Exit terminal session

**Quick Commands:**
- `npm install` — Install dependencies
- `npm start` — Run start script
- `npm run dev` — Run dev script
- `git init` — Initialize repository
- `git clone` — Clone repository
- `git status` — Check status
- `node app.js` — Run Node.js file
- `npx create-react-app` — Create React app

### Git Integration

**Access via:**
1. **Source Control Panel** (in sidebar) — Visual git interface
2. **Terminal** — Full git command support
3. **API** (`/api/git/`) — Programmatic access

**Git APIs:**
```javascript
// In browser console or git-integration.js
const git = new GitIntegration();
await git.initializeProject('my-project');
await git.getStatus();     // Get file changes
await git.getLog(10);      // Get commit history
await git.getBranches();   // Get branches
await git.initRepository('Your Name', 'you@example.com'); // Init repo
```

### Preview Servers

**Access via:**
1. **Quick Commands** — Click "Start Preview" button
2. **Terminal** — `npm start` or `node server.js`
3. **API** (`/api/preview/`) — Programmatic control

**Starting Previews:**
```javascript
// In browser console
const preview = new PreviewIntegration();
await preview.initializeProject('my-project');

// For Express/Node.js servers
await preview.startNodePreview('server.js');
// Returns: { ok: true, url: 'http://localhost:3000', ... }

// For static HTML projects
await preview.startStaticPreview('public');
// Returns: { ok: true, url: 'http://localhost:3001', ... }

preview.openPreview(); // Open in new window
```

## 📡 API Endpoints

### Git Endpoints

```
GET  /api/git/status?project=PROJECT_ID
GET  /api/git/log?project=PROJECT_ID&limit=10
GET  /api/git/branches?project=PROJECT_ID
GET  /api/git/isrepo?project=PROJECT_ID
POST /api/git/init?project=PROJECT_ID
```

### Preview Endpoints

```
POST /api/preview/start-node?project=PROJECT_ID
POST /api/preview/start-static?project=PROJECT_ID
POST /api/preview/stop?project=PROJECT_ID
GET  /api/preview/list
```

### Project Endpoints

```
GET /api/project/info?id=PROJECT_ID
```

## 🎯 Usage Examples

### Example 1: Create and Preview Express App

1. **Create new project** → Click "New Empty Project"
2. **Create server.js:**
   ```javascript
   const express = require('express');
   const app = express();
   const PORT = process.env.PORT || 3000;
   
   app.get('/', (req, res) => res.send('Hello World!'));
   app.listen(PORT, () => console.log(`Server on port ${PORT}`));
   ```
3. **Create package.json:** Click terminal → type `npm init -y`
4. **Install Express:** Type `npm install express`
5. **Start Preview:** Terminal → type `npm start`
6. **View:** Access http://localhost:3000 (auto-linked in preview panel)

### Example 2: Clone and Develop

1. **Open terminal** → Click terminal icon
2. **Clone repo:** `git clone https://github.com/user/repo.git`
3. **Install deps:** `cd repo && npm install`
4. **View status:** Terminal → `git status`
5. **Start dev:** `npm run dev`
6. **Preview:** Automatically opens at http://localhost:3000+

### Example 3: Create React App

1. **Terminal:** `npx create-react-app my-app`
2. **Navigate:** `cd my-app`
3. **Start:** `npm start`
4. **Preview:** React app opens at http://localhost:3000
5. **Edit:** Make changes in editor, see live reload in preview

## ⚙️ Configuration

### Server Configuration

**Environment Variables:**
```bash
PORT=5500                 # Server port (default: 5500)
HOST=127.0.0.1           # Server host (default: localhost only)
NODE_ENV=development     # Environment mode
```

**Starting with custom port:**
```bash
PORT=8000 npm run serve
# or
node server.js 8000
```

### Preview Server Configuration

**Default Ports:**
- Node.js previews: Start at 3000, increment for each project
- Static previews: Start at 3500, increment for each project
- Automatic port detection prevents conflicts

## 🔐 Security

✅ **All local** — Terminal execution restricted to workspace directory
✅ **CORS protected** — WebSocket and API restricted to localhost origins
✅ **Path traversal prevented** — Safe path resolution, no escape attempts
✅ **Sandbox directory** — All work in `.codeforge-workspace/`
✅ **On-device only** — Zero data transmission to external servers

## 🐛 Troubleshooting

### Terminal not working?
```bash
# Ensure ws dependency is installed
npm install ws

# For better PTY support (optional)
npm install node-pty
```

### Preview server won't start?
1. Check if port is already in use: `lsof -i :3000`
2. Check for syntax errors in server.js
3. Check terminal output for detailed error message

### Git not working?
```bash
# Ensure Git is installed
git --version

# Check if project is a git repository
cd .codeforge-workspace/your-project
git status
```

### Out of memory with large projects?
- Close unused previews: Terminal → Click "X" on preview tabs
- Increase Node.js heap: `node --max-old-space-size=4096 server.js`

## 📦 Deployment

### Static Deploy (Editor Only, No Terminal)
```bash
npm run build
# Deploy dist/ to:
# - Netlify
# - Vercel
# - GitHub Pages
# - Cloudflare Pages
# - Any static host
```

### Local Development (Full Features)
```bash
npm install
npm run serve
```

## 🔗 Related Files

- **Terminal Backend:** `server/terminal-backend.js`
- **Git Handler:** `server/git-handler.js`
- **Preview Manager:** `server/preview-manager.js`
- **Enhanced API:** `server/enhanced-api.js`
- **Git Integration UI:** `public/git-integration.js`
- **Main App:** `public/app.js`
- **Terminal UI:** `public/terminal.js`

## 📝 License

CodeForge Enhanced — Based on CodeForge by Zed Shaw
Enhanced with Git and Preview features

## 🎓 Learning Resources

- [Node.js Docs](https://nodejs.org/docs/)
- [npm Docs](https://docs.npmjs.com/)
- [Git Docs](https://git-scm.com/doc)
- [Express.js Guide](https://expressjs.com/)

---

**Happy Coding! 🚀**

Questions? Found a bug? Create an issue or contribute!
