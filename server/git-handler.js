/**
 * CodeForge — Git Handler Module
 * Provides Git integration for terminal commands
 */

"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class GitHandler {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
  }

  /**
   * Execute git command
   */
  executeGit(args, cwd) {
    return new Promise((resolve, reject) => {
      const gitProcess = spawn("git", args, {
        cwd: cwd || this.workspacePath,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      gitProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      gitProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      gitProcess.on("close", (code) => {
        resolve({
          code,
          stdout,
          stderr,
        });
      });

      gitProcess.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get repository status
   */
  async getStatus(cwd) {
    try {
      const result = await this.executeGit(["status", "--porcelain"], cwd);
      return {
        ok: result.code === 0,
        status: result.stdout,
        error: result.stderr,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Get commit log
   */
  async getLog(cwd, limit = 10) {
    try {
      const format = "%H|%an|%ae|%ad|%s";
      const result = await this.executeGit(
        ["log", `--max-count=${limit}`, `--format=${format}`, "--date=short"],
        cwd
      );
      if (result.code !== 0) {
        return { ok: false, error: result.stderr };
      }
      const commits = result.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, author, email, date, subject] = line.split("|");
          return { hash, author, email, date, subject };
        });
      return { ok: true, commits };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Get branches
   */
  async getBranches(cwd) {
    try {
      const result = await this.executeGit(
        ["branch", "-a", "--format=%(refname:short)|%(HEAD)"],
        cwd
      );
      if (result.code !== 0) {
        return { ok: false, error: result.stderr };
      }
      const branches = result.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, head] = line.split("|");
          return { name, current: head === "*" };
        });
      return { ok: true, branches };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Initialize git repository
   */
  async initRepo(cwd, config = {}) {
    try {
      const result = await this.executeGit(["init"], cwd);
      if (result.code !== 0) {
        return { ok: false, error: result.stderr };
      }

      // Set user config if provided
      if (config.userName) {
        await this.executeGit(["config", "user.name", config.userName], cwd);
      }
      if (config.userEmail) {
        await this.executeGit(["config", "user.email", config.userEmail], cwd);
      }

      return { ok: true, message: "Repository initialized" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Check if directory is a git repository
   */
  async isGitRepo(cwd) {
    try {
      const result = await this.executeGit(["rev-parse", "--git-dir"], cwd);
      return result.code === 0;
    } catch {
      return false;
    }
  }
}

module.exports = { GitHandler };
