/**
 * CodeForge Device Capability + Mobile Strategy v4.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects device capability and applies appropriate mode:
 *
 *   FULL MODE  — desktop/tablet with capable browser
 *     • Web Workers enabled
 *     • Full autocomplete + linting
 *     • Syntax highlighting at full fidelity
 *     • All panels visible
 *
 *   LITE MODE  — mobile or low-end devices
 *     • Web Workers still used (they help on mobile too)
 *     • Autocomplete debounce increased to 200ms
 *     • Syntax highlighting throttled
 *     • Sidebar hidden by default
 *     • Font size bumped for touch
 *     • Virtual keyboard safe area respected
 *
 * Detection criteria:
 *   • Touch device with screen < 768px width → lite mode
 *   • navigator.hardwareConcurrency < 2 → lite mode
 *   • deviceMemory < 2 (GB) → lite mode
 */

'use strict';

const DeviceCapability = (() => {
  // ── Detection ──────────────────────────────────────────────────────────────
  function _detect() {
    const isTouchSmall = ('ontouchstart' in window || navigator.maxTouchPoints > 0)
      && window.innerWidth < 768;
    const isLowCPU = (navigator.hardwareConcurrency || 4) < 2;
    const isLowRAM = (navigator.deviceMemory || 8) < 2;
    const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isLowDPI = window.devicePixelRatio < 1.5;

    return {
      isLiteMode: isTouchSmall || (isMobileUA && (isLowCPU || isLowRAM)),
      isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      isMobile: isMobileUA,
      isSmallScreen: window.innerWidth < 768,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: navigator.deviceMemory || 4,
      pixelRatio: window.devicePixelRatio || 1,
    };
  }

  const caps = _detect();

  // ── Apply lite mode ────────────────────────────────────────────────────────
  function applyLiteMode() {
    if (!caps.isLiteMode) return;

    console.log('[CodeForge] Lite mode activated (mobile/low-end device)');

    // Show lite mode banner
    const banner = document.querySelector('.lite-mode-banner');
    if (banner) banner.classList.add('visible');

    // Increase AC debounce
    window._AC_DEBOUNCE_MS = 200;

    // Bump font size for touch
    if (state.settings.fontSize < 16) {
      state.settings.fontSize = 16;
      applySettingsToEditor();
    }

    // Hide sidebar on mobile by default (save space)
    if (caps.isSmallScreen && state.sidebarVisible) {
      state.sidebarVisible = false;
      document.getElementById('sidebar')?.classList.add('hidden');
      document.getElementById('content-area')?.classList.add('sidebar-hidden');
    }

    // Hide panel on mobile by default
    if (caps.isSmallScreen && state.panelVisible) {
      state.panelVisible = false;
      document.getElementById('panel')?.classList.add('hidden');
    }

    // Disable minimap (expensive on mobile)
    state.settings.minimap = false;

    // Throttle syntax highlighting to 250ms (from RAF)
    window._HL_THROTTLE_MS = 250;

    // Disable word wrap issues on mobile
    state.settings.wordWrap = true;
    applySettingsToEditor();

    // Keyboard safe area: adjust editor height when virtual keyboard appears
    _setupVirtualKeyboardHandler();

    // Larger tab close targets
    document.querySelectorAll('.tab-close').forEach(el => {
      el.style.minWidth = '32px';
      el.style.minHeight = '32px';
    });
  }

  // ── Virtual keyboard handler (iOS/Android) ─────────────────────────────────
  function _setupVirtualKeyboardHandler() {
    if (!caps.isTouchDevice) return;

    let lastHeight = window.innerHeight;

    // Visual Viewport API (modern)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const vvHeight = window.visualViewport.height;
        const diff = window.innerHeight - vvHeight;
        const main = document.getElementById('main-content') || document.querySelector('.editor-area');
        if (main) {
          main.style.paddingBottom = diff > 100 ? `${diff}px` : '0';
        }
      });
    } else {
      // Fallback: resize event
      window.addEventListener('resize', () => {
        const newHeight = window.innerHeight;
        const diff = lastHeight - newHeight;
        if (diff > 100) {
          // Keyboard appeared
          document.querySelector('.editor-area')?.style.setProperty('padding-bottom', `${diff}px`);
        } else if (diff < -50) {
          // Keyboard disappeared
          document.querySelector('.editor-area')?.style.setProperty('padding-bottom', '0');
        }
        lastHeight = newHeight;
      });
    }

    // Scroll active textarea into view when keyboard opens
    document.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('code-area') || e.target.id === 'terminal-input') {
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350); // wait for keyboard animation
      }
    });
  }

  // ── Touch gesture support ──────────────────────────────────────────────────
  function setupTouchGestures() {
    if (!caps.isTouchDevice) return;

    // Swipe right to open sidebar
    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (touchStartX < 20 && dx > 60) {
        // Swipe right from edge → open sidebar
        if (!state.sidebarVisible) toggleSidebar();
      } else if (dx < -60 && state.sidebarVisible && touchStartX < 260) {
        // Swipe left on sidebar → close it
        if (state.sidebarVisible) toggleSidebar();
      }
    }, { passive: true });
  }

  // ── Performance mode toggle (UI) ──────────────────────────────────────────
  function showCapabilityInfo() {
    const lines = [
      `Device: ${caps.isMobile ? 'Mobile' : 'Desktop'}`,
      `Mode: ${caps.isLiteMode ? 'Lite' : 'Full'}`,
      `CPU cores: ${caps.hardwareConcurrency}`,
      `RAM: ~${caps.deviceMemory}GB`,
      `Web Workers: ${WorkerBridge.isAvailable() ? '✓ Active' : '✗ Unavailable'}`,
      `Screen: ${window.innerWidth}×${window.innerHeight} @ ${caps.pixelRatio}x`,
    ];
    notify(lines.join(' | '));
  }

  // ── Initialize ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    applyLiteMode();
    setupTouchGestures();

    // Add performance info to settings page
    const perfDiv = document.getElementById('device-capability-info');
    if (perfDiv) {
      perfDiv.innerHTML = `
        <div style="font-size:12px;color:var(--text-muted);padding:8px 0">
          <div>Mode: <strong style="color:${caps.isLiteMode?'#d19a66':'#98c379'}">${caps.isLiteMode?'Lite':'Full'}</strong></div>
          <div>CPU: ${caps.hardwareConcurrency} cores</div>
          <div>RAM: ~${caps.deviceMemory}GB</div>
          <div>Workers: <strong style="color:${WorkerBridge.isAvailable()?'#98c379':'#e06c75'}">${WorkerBridge.isAvailable()?'Active':'Unavailable'}</strong></div>
        </div>
      `;
    }
  }, { once: true });

  return {
    ...caps,
    applyLiteMode,
    showCapabilityInfo,
    isFullMode: !caps.isLiteMode,
  };
})();

// Expose globally for settings panel
window.DeviceCapability = DeviceCapability;
