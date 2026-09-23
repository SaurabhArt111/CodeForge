/**
 * CodeForge — Preview Manager
 * Manages local preview servers for projects
 */

"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class PreviewManager {
  constructor() {
    this.previewServers = new Map();
    this.previewPorts = new Map();
    this.nextPort = 3000;
  }

  /**
   * Find available port
   */
  async findAvailablePort(startPort = 3000) {
    const testServer = http.createServer();
    return new Promise((resolve, reject) => {
      testServer.listen(startPort, "127.0.0.1", () => {
        const port = testServer.address().port;
        testServer.close(() => resolve(port));
      });
      testServer.on("error", () => {
        resolve(this.findAvailablePort(startPort + 1));
      });
    });
  }

  /**
   * Start project preview (Express/Node.js)
   */
  async startNodePreview(projectPath, entryFile = "server.js") {
    const projectName = path.basename(projectPath);
    
    if (this.previewServers.has(projectName)) {
      return {
        ok: true,
        port: this.previewPorts.get(projectName),
        url: `http://localhost:${this.previewPorts.get(projectName)}`,
        message: "Server already running",
      };
    }

    try {
      const port = await this.findAvailablePort(this.nextPort);
      this.nextPort = port + 1;

      const mainFile = path.join(projectPath, entryFile);
      if (!fs.existsSync(mainFile)) {
        return {
          ok: false,
          error: `Entry file not found: ${entryFile}`,
          suggestion: "Create a server.js or index.js file",
        };
      }

      const child = spawn("node", [mainFile], {
        cwd: projectPath,
        env: {
          ...process.env,
          PORT: port,
          NODE_ENV: "development",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let isRunning = false;
      const startTimeout = setTimeout(() => {
        if (!isRunning) {
          child.kill();
          this.previewServers.delete(projectName);
          this.previewPorts.delete(projectName);
        }
      }, 5000);

      // Wait for port to be accessible
      const checkPort = setInterval(() => {
        const req = http.request(
          { hostname: "127.0.0.1", port, path: "/" },
          (res) => {
            clearInterval(checkPort);
            clearTimeout(startTimeout);
            isRunning = true;
            res.destroy();
          }
        );
        req.on("error", () => {
          // Port not ready yet
        });
        req.end();
      }, 100);

      child.stdout.on("data", (data) => {
        console.log(`[${projectName}] ${data.toString()}`);
      });

      child.stderr.on("data", (data) => {
        console.error(`[${projectName} ERR] ${data.toString()}`);
      });

      child.on("exit", (code) => {
        clearInterval(checkPort);
        this.previewServers.delete(projectName);
        this.previewPorts.delete(projectName);
        console.log(`[${projectName}] Process exited with code ${code}`);
      });

      this.previewServers.set(projectName, child);
      this.previewPorts.set(projectName, port);

      // Wait a bit for server to start
      await new Promise((resolve) => setTimeout(resolve, 1500));

      return {
        ok: true,
        port,
        url: `http://localhost:${port}`,
        message: "Preview server started",
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Start static server (for HTML/CSS/JS projects)
   */
  async startStaticPreview(projectPath, publicDir = "public") {
    const projectName = path.basename(projectPath);

    if (this.previewServers.has(projectName)) {
      return {
        ok: true,
        port: this.previewPorts.get(projectName),
        url: `http://localhost:${this.previewPorts.get(projectName)}`,
        message: "Server already running",
      };
    }

    try {
      const port = await this.findAvailablePort(this.nextPort);
      this.nextPort = port + 1;

      const serveDir = path.join(projectPath, publicDir);
      if (!fs.existsSync(serveDir)) {
        return {
          ok: false,
          error: `Directory not found: ${publicDir}`,
        };
      }

      const server = http.createServer((req, res) => {
        let filePath = path.join(serveDir, req.url === "/" ? "index.html" : req.url);
        filePath = path.normalize(filePath);

        // Security: ensure path doesn't escape serveDir
        if (!filePath.startsWith(serveDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }

          const ext = path.extname(filePath);
          const mimeTypes = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "text/javascript",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
          };
          const contentType = mimeTypes[ext] || "application/octet-stream";

          res.writeHead(200, { "Content-Type": contentType });
          fs.createReadStream(filePath).pipe(res);
        });
      });

      server.listen(port, "127.0.0.1");

      server.on("error", (err) => {
        console.error(`[${projectName}] Server error:`, err);
      });

      this.previewServers.set(projectName, server);
      this.previewPorts.set(projectName, port);

      return {
        ok: true,
        port,
        url: `http://localhost:${port}`,
        message: "Static preview started",
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Stop preview server
   */
  stopPreview(projectName) {
    const server = this.previewServers.get(projectName);
    if (!server) {
      return { ok: false, error: "Preview not running" };
    }

    try {
      if (server.kill) {
        server.kill();
      } else if (server.close) {
        server.close();
      }
      this.previewServers.delete(projectName);
      this.previewPorts.delete(projectName);
      return { ok: true, message: "Preview stopped" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Get all running previews
   */
  getRunningPreviews() {
    const previews = [];
    this.previewPorts.forEach((port, projectName) => {
      previews.push({
        projectName,
        port,
        url: `http://localhost:${port}`,
      });
    });
    return previews;
  }

  /**
   * Cleanup all servers
   */
  stopAll() {
    this.previewServers.forEach((server, projectName) => {
      try {
        if (server.kill) {
          server.kill();
        } else if (server.close) {
          server.close();
        }
      } catch (e) {
        console.error(`Error stopping ${projectName}:`, e.message);
      }
    });
    this.previewServers.clear();
    this.previewPorts.clear();
  }
}

module.exports = { PreviewManager };
