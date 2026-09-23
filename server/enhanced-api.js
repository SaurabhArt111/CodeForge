/**
 * CodeForge — Enhanced API Module
 * Provides Git, npm, and preview endpoints
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { GitHandler } = require("./git-handler");
const { PreviewManager } = require("./preview-manager");

function createEnhancedAPI(workspaceRoot) {
  const gitHandler = new GitHandler(workspaceRoot);
  const previewManager = new PreviewManager();

  /**
   * Handle API requests
   */
  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Set CORS headers for API requests
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return true;
    }

    // Git endpoints
    if (pathname.startsWith("/api/git/")) {
      return await handleGitRequest(req, res, pathname);
    }

    // Preview endpoints
    if (pathname.startsWith("/api/preview/")) {
      return await handlePreviewRequest(req, res, pathname);
    }

    // Project info endpoints
    if (pathname.startsWith("/api/project/")) {
      return await handleProjectRequest(req, res, pathname);
    }

    return false; // Not handled
  }

  /**
   * Handle Git-related requests
   */
  async function handleGitRequest(req, res, pathname) {
    try {
      const projectId = new URL(`http://localhost${pathname}`, "http://localhost").searchParams.get("project");
      if (!projectId) {
        sendJson(res, 400, { error: "Missing project parameter" });
        return true;
      }

      const projectPath = path.join(workspaceRoot, projectId);

      // Check path traversal
      if (!projectPath.startsWith(workspaceRoot)) {
        sendJson(res, 403, { error: "Access denied" });
        return true;
      }

      if (pathname.endsWith("/status")) {
        const status = await gitHandler.getStatus(projectPath);
        sendJson(res, status.ok ? 200 : 400, status);
        return true;
      }

      if (pathname.endsWith("/log")) {
        const limit = new URL(`http://localhost${pathname}`, "http://localhost").searchParams.get("limit") || 10;
        const log = await gitHandler.getLog(projectPath, parseInt(limit));
        sendJson(res, log.ok ? 200 : 400, log);
        return true;
      }

      if (pathname.endsWith("/branches")) {
        const branches = await gitHandler.getBranches(projectPath);
        sendJson(res, branches.ok ? 200 : 400, branches);
        return true;
      }

      if (pathname.endsWith("/init")) {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return true;
        }
        const body = await readJsonBody(req, 1024);
        const result = await gitHandler.initRepo(projectPath, body);
        sendJson(res, result.ok ? 200 : 400, result);
        return true;
      }

      if (pathname.endsWith("/isrepo")) {
        const isRepo = await gitHandler.isGitRepo(projectPath);
        sendJson(res, 200, { isRepository: isRepo });
        return true;
      }

      sendJson(res, 404, { error: "Git endpoint not found" });
      return true;
    } catch (e) {
      sendJson(res, 500, { error: e.message });
      return true;
    }
  }

  /**
   * Handle Preview-related requests
   */
  async function handlePreviewRequest(req, res, pathname) {
    try {
      const projectId = new URL(`http://localhost${pathname}`, "http://localhost").searchParams.get("project");
      if (!projectId) {
        sendJson(res, 400, { error: "Missing project parameter" });
        return true;
      }

      const projectPath = path.join(workspaceRoot, projectId);

      // Check path traversal
      if (!projectPath.startsWith(workspaceRoot)) {
        sendJson(res, 403, { error: "Access denied" });
        return true;
      }

      if (pathname.endsWith("/start-node")) {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return true;
        }
        const body = await readJsonBody(req, 1024);
        const entryFile = body.entryFile || "server.js";
        const result = await previewManager.startNodePreview(projectPath, entryFile);
        sendJson(res, result.ok ? 200 : 400, result);
        return true;
      }

      if (pathname.endsWith("/start-static")) {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return true;
        }
        const body = await readJsonBody(req, 1024);
        const publicDir = body.publicDir || "public";
        const result = await previewManager.startStaticPreview(projectPath, publicDir);
        sendJson(res, result.ok ? 200 : 400, result);
        return true;
      }

      if (pathname.endsWith("/stop")) {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return true;
        }
        const result = previewManager.stopPreview(projectId);
        sendJson(res, result.ok ? 200 : 400, result);
        return true;
      }

      if (pathname.endsWith("/list")) {
        const previews = previewManager.getRunningPreviews();
        sendJson(res, 200, { previews });
        return true;
      }

      sendJson(res, 404, { error: "Preview endpoint not found" });
      return true;
    } catch (e) {
      sendJson(res, 500, { error: e.message });
      return true;
    }
  }

  /**
   * Handle Project info requests
   */
  async function handleProjectRequest(req, res, pathname) {
    try {
      const projectId = new URL(`http://localhost${pathname}`, "http://localhost").searchParams.get("id");
      if (!projectId) {
        sendJson(res, 400, { error: "Missing id parameter" });
        return true;
      }

      const projectPath = path.join(workspaceRoot, projectId);

      // Check path traversal
      if (!projectPath.startsWith(workspaceRoot)) {
        sendJson(res, 403, { error: "Access denied" });
        return true;
      }

      if (pathname.endsWith("/info")) {
        const info = {
          id: projectId,
          path: projectPath,
          exists: fs.existsSync(projectPath),
          hasPackageJson: fs.existsSync(path.join(projectPath, "package.json")),
          hasGit: fs.existsSync(path.join(projectPath, ".git")),
        };
        sendJson(res, 200, info);
        return true;
      }

      sendJson(res, 404, { error: "Project endpoint not found" });
      return true;
    } catch (e) {
      sendJson(res, 500, { error: e.message });
      return true;
    }
  }

  /**
   * Cleanup all resources
   */
  function cleanup() {
    previewManager.stopAll();
  }

  return {
    handleRequest,
    cleanup,
    previewManager,
  };
}

/**
 * Utility functions
 */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

module.exports = { createEnhancedAPI };
