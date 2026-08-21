/**
 * CodeForge Resource Loader
 * Handles loading of scripts and stylesheets with fallback support
 */

class ResourceLoader {
  constructor() {
    this.loadedScripts = new Set();
    this.loadedStyles = new Set();
    this.loadingPromises = new Map();
  }

  /**
   * Load a script with fallback support
   * @param {string} src - Script URL
   * @param {Object} options - Options including fallback URL
   * @returns {Promise}
   */
  loadScript(src, options = {}) {
    // Return cached result if already loading/loaded
    if (this.loadingPromises.has(src)) {
      return this.loadingPromises.get(src);
    }

    if (this.loadedScripts.has(src)) {
      return Promise.resolve();
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = options.async !== false;

      const timeout = options.timeout || 30000; // 30 second timeout
      const timeoutId = setTimeout(() => {
        script.onerror = null;
        script.onload = null;
        reject(new Error(`Timeout loading script: ${src}`));
      }, timeout);

      script.onload = () => {
        clearTimeout(timeoutId);
        this.loadedScripts.add(src);
        console.log(`[ResourceLoader] ✓ Loaded: ${src}`);
        resolve();
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        console.error(`[ResourceLoader] ✗ Failed to load: ${src}`);

        if (options.fallback) {
          console.log(`[ResourceLoader] Trying fallback: ${options.fallback}`);
          this.loadScript(options.fallback, { 
            fallback: null,
            ...options 
          }).then(resolve).catch(reject);
        } else {
          reject(new Error(`Failed to load script: ${src}`));
        }
      };

      script.onabort = () => {
        clearTimeout(timeoutId);
        console.warn(`[ResourceLoader] Aborted loading: ${src}`);
        reject(new Error(`Loading aborted: ${src}`));
      };

      document.head.appendChild(script);
    });

    this.loadingPromises.set(src, promise);

    promise.finally(() => {
      this.loadingPromises.delete(src);
    });

    return promise;
  }

  /**
   * Load stylesheet with fallback support
   * @param {string} href - Stylesheet URL
   * @param {Object} options - Options including fallback URL
   * @returns {Promise}
   */
  loadStyles(href, options = {}) {
    // Return cached result if already loaded
    if (this.loadedStyles.has(href)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;

      const timeout = options.timeout || 15000; // 15 second timeout
      const timeoutId = setTimeout(() => {
        link.onerror = null;
        link.onload = null;
        reject(new Error(`Timeout loading stylesheet: ${href}`));
      }, timeout);

      link.onload = () => {
        clearTimeout(timeoutId);
        this.loadedStyles.add(href);
        console.log(`[ResourceLoader] ✓ Loaded styles: ${href}`);
        resolve();
      };

      link.onerror = () => {
        clearTimeout(timeoutId);
        console.error(`[ResourceLoader] ✗ Failed to load styles: ${href}`);

        if (options.fallback) {
          console.log(`[ResourceLoader] Trying fallback: ${options.fallback}`);
          this.loadStyles(options.fallback, { 
            fallback: null,
            ...options 
          }).then(resolve).catch(reject);
        } else {
          reject(new Error(`Failed to load stylesheet: ${href}`));
        }
      };

      document.head.appendChild(link);
    });
  }

  /**
   * Load multiple scripts in parallel
   * @param {Array} scripts - Array of {src, fallback?, ...options}
   * @returns {Promise}
   */
  async loadScripts(scripts) {
    const promises = scripts.map(script => {
      const { src, ...options } = script;
      return this.loadScript(src, options);
    });

    return Promise.all(promises);
  }

  /**
   * Load multiple stylesheets in parallel
   * @param {Array} stylesheets - Array of {href, fallback?, ...options}
   * @returns {Promise}
   */
  async loadStylesheets(stylesheets) {
    const promises = stylesheets.map(style => {
      const { href, ...options } = style;
      return this.loadStyles(href, options);
    });

    return Promise.all(promises);
  }

  /**
   * Get loading status
   */
  getStatus() {
    return {
      loadedScripts: Array.from(this.loadedScripts),
      loadedStyles: Array.from(this.loadedStyles),
      loadingScripts: Array.from(this.loadingPromises.keys()),
      totalLoaded: this.loadedScripts.size + this.loadedStyles.size
    };
  }

  /**
   * Clear cached results
   */
  reset() {
    this.loadedScripts.clear();
    this.loadedStyles.clear();
    this.loadingPromises.clear();
  }
}

// Export as global
window.ResourceLoader = ResourceLoader;

// Create default instance
if (!window.__resourceLoader) {
  window.__resourceLoader = new ResourceLoader();
}

export default ResourceLoader;
