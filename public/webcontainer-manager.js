/**
 * CodeForge WebContainer Manager
 * Handles WebContainer initialization with retry logic and error handling
 */

class CodeForgeWebContainerManager {
  constructor() {
    this.container = null;
    this.retries = 0;
    this.maxRetries = 3;
    this.isInitializing = false;
    this.initPromise = null;
  }

  /**
   * Initialize WebContainer with retry logic
   */
  async initialize() {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.container) {
      return this.container;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  async _doInitialize() {
    try {
      if (typeof WebContainer === 'undefined') {
        throw new Error('WebContainer SDK not loaded');
      }

      console.log('[WebContainer] Initializing...');
      
      this.container = await WebContainer.boot({
        coep: 'require-corp',
      });

      console.log('[WebContainer] ✓ Initialized successfully');
      this.retries = 0;
      this.attachLifecycleListeners();
      return this.container;

    } catch (error) {
      console.error('[WebContainer] ✗ Initialization failed:', error.message);
      
      if (this.retries < this.maxRetries) {
        this.retries++;
        const backoffMs = Math.pow(2, this.retries) * 1000;
        console.log(`[WebContainer] Retrying in ${backoffMs}ms (${this.retries}/${this.maxRetries})...`);
        
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        this.initPromise = null;
        return this.initialize();
      }

      const message = `Failed to initialize WebContainer after ${this.maxRetries} attempts: ${error.message}`;
      console.error('[WebContainer]', message);
      throw new Error(message);
    }
  }

  /**
   * Attach lifecycle listeners for debugging
   */
  attachLifecycleListeners() {
    if (!this.container) return;

    // Monitor process spawn
    const originalSpawn = this.container.spawn;
    if (originalSpawn && typeof originalSpawn === 'function') {
      this.container.spawn = async (...args) => {
        const [command, cmdArgs, options] = args;
        const cmdStr = `${command} ${(cmdArgs || []).join(' ')}`.trim();
        
        console.log(`[WebContainer] Spawning: ${cmdStr}`);
        
        try {
          const process = await originalSpawn.apply(this.container, args);
          
          // Monitor process exit
          if (process.exit) {
            process.exit.then((code) => {
              console.log(`[WebContainer] Process exited: ${cmdStr} (code: ${code})`);
            }).catch((err) => {
              console.error(`[WebContainer] Process error: ${cmdStr}`, err);
            });
          }
          
          return process;
        } catch (error) {
          console.error(`[WebContainer] Failed to spawn: ${cmdStr}`, error);
          throw error;
        }
      };
    }

    // Monitor filesystem operations
    const originalFs = this.container.fs;
    if (originalFs) {
      console.log('[WebContainer] Filesystem ready');
    }
  }

  /**
   * Get current container instance
   */
  getContainer() {
    return this.container;
  }

  /**
   * Check if initialized
   */
  isInitialized() {
    return this.container !== null;
  }

  /**
   * Get initialization status
   */
  getStatus() {
    return {
      initialized: this.isInitialized(),
      initializing: this.initPromise !== null,
      retries: this.retries,
      container: this.container ? 'available' : 'not available'
    };
  }

  /**
   * Cleanup and reset
   */
  async cleanup() {
    try {
      if (this.container) {
        console.log('[WebContainer] Cleaning up...');
        // Add any cleanup logic here
        this.container = null;
      }
    } catch (error) {
      console.error('[WebContainer] Cleanup error:', error);
    }
  }
}

// Export as global
window.WebContainerManager = CodeForgeWebContainerManager;

export default CodeForgeWebContainerManager;
