/**
 * CodeForge Error Handler
 * Captures and reports application errors for better debugging
 */

class CodeForgeErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 100; // Keep last 100 errors
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    // Catch synchronous errors
    window.addEventListener('error', (event) => {
      this.captureError({
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        timestamp: new Date().toISOString()
      });
      
      console.error('[ERROR]', event.message, event.error);
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        type: 'unhandledRejection',
        reason: event.reason?.toString(),
        stack: event.reason?.stack,
        timestamp: new Date().toISOString()
      });
      
      console.error('[UNHANDLED REJECTION]', event.reason);
    });

    // Monitor resource loading failures
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        // Resource loading error
        const target = event.target;
        this.captureError({
          type: 'resourceError',
          resource: target.src || target.href,
          resourceType: target.tagName,
          timestamp: new Date().toISOString()
        });
        
        console.warn('[RESOURCE ERROR]', `Failed to load ${target.tagName}: ${target.src || target.href}`);
      }
    }, true);
  }

  captureError(error) {
    this.errors.push(error);
    
    // Keep only last N errors to prevent memory leaks
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log to window.__appErrors if available (from index.html)
    if (window.__appErrors) {
      window.__appErrors.push(error);
    }

    return error;
  }

  getErrors() {
    return [...this.errors];
  }

  clearErrors() {
    this.errors = [];
  }

  getErrorReport() {
    return {
      totalErrors: this.errors.length,
      errors: this.getErrors(),
      systemInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        language: navigator.language,
        timestamp: new Date().toISOString()
      }
    };
  }

  exportErrorReport() {
    const report = this.getErrorReport();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codeforge-error-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Export as global
window.ErrorHandler = CodeForgeErrorHandler;

// Auto-initialize early
if (!window.__errorHandler) {
  window.__errorHandler = new CodeForgeErrorHandler();
}

export default CodeForgeErrorHandler;
