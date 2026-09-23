/**
 * CodeForge — Frontend Git Integration
 * Handles Git UI and API calls
 */

class GitIntegration {
  constructor() {
    this.currentProject = null;
    this.isRepository = false;
  }

  /**
   * Initialize Git integration for a project
   */
  async initializeProject(projectId) {
    this.currentProject = projectId;
    await this.checkRepository();
  }

  /**
   * Check if current directory is a git repository
   */
  async checkRepository() {
    try {
      const response = await fetch(
        `/api/git/isrepo?project=${encodeURIComponent(this.currentProject)}`
      );
      const data = await response.json();
      this.isRepository = data.isRepository;
      return this.isRepository;
    } catch (e) {
      console.error("Error checking repository:", e);
      return false;
    }
  }

  /**
   * Get repository status
   */
  async getStatus() {
    if (!this.currentProject) return null;
    try {
      const response = await fetch(
        `/api/git/status?project=${encodeURIComponent(this.currentProject)}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.status || "";
    } catch (e) {
      console.error("Error getting status:", e);
      return null;
    }
  }

  /**
   * Get commit log
   */
  async getLog(limit = 10) {
    if (!this.currentProject || !this.isRepository) return [];
    try {
      const response = await fetch(
        `/api/git/log?project=${encodeURIComponent(
          this.currentProject
        )}&limit=${limit}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      return data.commits || [];
    } catch (e) {
      console.error("Error getting log:", e);
      return [];
    }
  }

  /**
   * Get branches
   */
  async getBranches() {
    if (!this.currentProject || !this.isRepository) return [];
    try {
      const response = await fetch(
        `/api/git/branches?project=${encodeURIComponent(this.currentProject)}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      return data.branches || [];
    } catch (e) {
      console.error("Error getting branches:", e);
      return [];
    }
  }

  /**
   * Initialize a new git repository
   */
  async initRepository(userName = "User", userEmail = "user@example.com") {
    if (!this.currentProject) return { ok: false, error: "No project selected" };
    try {
      const response = await fetch(
        `/api/git/init?project=${encodeURIComponent(this.currentProject)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName, userEmail }),
        }
      );
      const data = await response.json();
      if (data.ok) {
        this.isRepository = true;
      }
      return data;
    } catch (e) {
      console.error("Error initializing repository:", e);
      return { ok: false, error: e.message };
    }
  }

  /**
   * Render git status in UI
   */
  async renderGitStatus(container) {
    const status = await this.getStatus();
    if (!status) {
      container.innerHTML = '<div class="git-status-empty">Not a git repository</div>';
      return;
    }

    const lines = status.split("\n").filter((l) => l.trim());
    if (!lines.length) {
      container.innerHTML = '<div class="git-status-clean">✓ Working directory clean</div>';
      return;
    }

    let html = '<div class="git-status-changes">';
    lines.forEach((line) => {
      const status = line.substring(0, 2);
      const filename = line.substring(3);
      const statusClass = this.getStatusClass(status);
      html += `<div class="git-file git-${statusClass}"><span class="git-status-badge">${status}</span> ${filename}</div>`;
    });
    html += "</div>";
    container.innerHTML = html;
  }

  /**
   * Get status class for styling
   */
  getStatusClass(status) {
    const code = status.trim();
    if (code.includes("A")) return "added";
    if (code.includes("M")) return "modified";
    if (code.includes("D")) return "deleted";
    if (code.includes("?")) return "untracked";
    if (code.includes("!")) return "ignored";
    return "unknown";
  }

  /**
   * Render commit log
   */
  async renderLog(container, limit = 10) {
    const commits = await this.getLog(limit);
    if (!commits.length) {
      container.innerHTML = '<div class="git-log-empty">No commits yet</div>';
      return;
    }

    let html = '<div class="git-log">';
    commits.forEach((commit) => {
      const shortHash = commit.hash.substring(0, 7);
      const date = new Date(commit.date).toLocaleDateString();
      html += `
        <div class="git-commit">
          <div class="commit-meta">
            <span class="commit-hash">${shortHash}</span>
            <span class="commit-date">${date}</span>
          </div>
          <div class="commit-author">${commit.author} &lt;${commit.email}&gt;</div>
          <div class="commit-subject">${commit.subject}</div>
        </div>
      `;
    });
    html += "</div>";
    container.innerHTML = html;
  }
}

/**
 * Preview Integration
 */
class PreviewIntegration {
  constructor() {
    this.currentProject = null;
    this.isRunning = false;
    this.previewUrl = null;
  }

  /**
   * Initialize preview for a project
   */
  async initializeProject(projectId) {
    this.currentProject = projectId;
  }

  /**
   * Start Node.js/Express preview
   */
  async startNodePreview(entryFile = "server.js") {
    if (!this.currentProject) return { ok: false, error: "No project selected" };
    try {
      const response = await fetch(
        `/api/preview/start-node?project=${encodeURIComponent(
          this.currentProject
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryFile }),
        }
      );
      const data = await response.json();
      if (data.ok) {
        this.isRunning = true;
        this.previewUrl = data.url;
      }
      return data;
    } catch (e) {
      console.error("Error starting preview:", e);
      return { ok: false, error: e.message };
    }
  }

  /**
   * Start static preview
   */
  async startStaticPreview(publicDir = "public") {
    if (!this.currentProject) return { ok: false, error: "No project selected" };
    try {
      const response = await fetch(
        `/api/preview/start-static?project=${encodeURIComponent(
          this.currentProject
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicDir }),
        }
      );
      const data = await response.json();
      if (data.ok) {
        this.isRunning = true;
        this.previewUrl = data.url;
      }
      return data;
    } catch (e) {
      console.error("Error starting preview:", e);
      return { ok: false, error: e.message };
    }
  }

  /**
   * Stop preview
   */
  async stopPreview() {
    if (!this.currentProject) return { ok: false, error: "No project selected" };
    try {
      const response = await fetch(
        `/api/preview/stop?project=${encodeURIComponent(this.currentProject)}`,
        { method: "POST" }
      );
      const data = await response.json();
      if (data.ok) {
        this.isRunning = false;
        this.previewUrl = null;
      }
      return data;
    } catch (e) {
      console.error("Error stopping preview:", e);
      return { ok: false, error: e.message };
    }
  }

  /**
   * Get list of running previews
   */
  async getRunningPreviews() {
    try {
      const response = await fetch("/api/preview/list");
      if (!response.ok) return [];
      const data = await response.json();
      return data.previews || [];
    } catch (e) {
      console.error("Error getting previews:", e);
      return [];
    }
  }

  /**
   * Open preview in new window
   */
  openPreview() {
    if (this.previewUrl) {
      window.open(this.previewUrl, "preview", "width=1200,height=800");
    }
  }
}

// Make available globally
window.GitIntegration = GitIntegration;
window.PreviewIntegration = PreviewIntegration;
