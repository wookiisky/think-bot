/**
 * message-preview-overlay.js - Overlay to preview full branch message content
 */

import { createLogger } from '../modules/utils.js';
import { i18n } from '../../js/modules/i18n.js';

const logger = createLogger('MessagePreviewOverlay');

const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const MAX_WIDTH_PX = 900;
const MAX_HEIGHT_PX = 900;
const KEYBOARD_STEP = 24;

class MessagePreviewOverlay {
  constructor() {
    this.overlayElement = null;
    this.isVisible = false;
    this.keydownHandler = null;
    this.resizeState = {
      isActive: false,
      startX: 0,
      startY: 0,
      startWidth: 0,
      startHeight: 0,
      pointerId: null,
    };
    this.currentSize = null;
    this.handleResizeStart = this.handleResizeStart.bind(this);
    this.handleResizeMove = this.handleResizeMove.bind(this);
    this.handleResizeEnd = this.handleResizeEnd.bind(this);
    this.handleWindowResize = this.handleWindowResize.bind(this);
    this.handleResizeKeydown = this.handleResizeKeydown.bind(this);
  }

  // Initialize overlay DOM (idempotent)
  init() {
    if (this.overlayElement) {
      return;
    }
    try {
      this.overlayElement = document.createElement('div');
      this.overlayElement.className = 'message-preview-overlay';
      this.overlayElement.setAttribute('aria-hidden', 'true');

      this.overlayElement.innerHTML = `
        <div class="overlay-backdrop" data-action="backdrop"></div>
        <div class="overlay-content" role="dialog" aria-modal="true" aria-labelledby="previewTitle">
          <div class="overlay-header">
            <h3 id="previewTitle">Preview</h3>
          </div>
          <div class="overlay-body">
            <div class="preview-body">
              <div class="message-content"></div>
            </div>
          </div>
          <button type="button" class="overlay-resize-handle" aria-hidden="false"></button>
        </div>
      `;

      document.body.appendChild(this.overlayElement);

      // Close on backdrop click
      const backdrop = this.overlayElement.querySelector('[data-action="backdrop"]');
      backdrop.addEventListener('click', () => {
        logger.info('Backdrop clicked, closing preview overlay');
        this.hide();
      });

      // ESC to close
      this.keydownHandler = (e) => {
        if (this.isVisible && e.key === 'Escape') {
          logger.info('Escape key pressed, closing preview overlay');
          this.hide();
        }
      };
      document.addEventListener('keydown', this.keydownHandler);

      this.setupResizeHandle();
      window.addEventListener('resize', this.handleWindowResize);

      logger.info('MessagePreviewOverlay initialized');
    } catch (error) {
      logger.error('Failed to initialize MessagePreviewOverlay:', error);
    }
  }

  // Show overlay with HTML content
  show({ html = '', title = 'Preview' } = {}) {
    if (!this.overlayElement) {
      this.init();
    }
    try {
      const titleEl = this.overlayElement.querySelector('#previewTitle');
      const bodyEl = this.overlayElement.querySelector('.preview-body .message-content');
      const overlayBody = this.overlayElement.querySelector('.overlay-body');
      const overlayContent = this.overlayElement.querySelector('.overlay-content');

      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.innerHTML = html || '';

      this.overlayElement.style.display = 'flex';
      if (overlayContent) {
        this.applyCurrentSize(overlayContent);
      }
      // Use requestAnimationFrame to ensure transition applies
      requestAnimationFrame(() => {
        this.overlayElement.classList.add('visible');
        try {
          if (overlayBody) overlayBody.scrollTop = 0;
        } catch (e) {
          logger.debug('Failed to reset overlay body scrollTop in rAF:', e);
        }
      });
      try {
        if (overlayBody) overlayBody.scrollTop = 0;
      } catch (e) {
        logger.debug('Failed to reset overlay body scrollTop:', e);
      }
      this.overlayElement.setAttribute('aria-hidden', 'false');
      this.isVisible = true;
      logger.info('Message preview overlay shown');
    } catch (error) {
      logger.error('Failed to show MessagePreviewOverlay:', error);
    }
  }

  // Hide overlay
  hide() {
    if (!this.overlayElement) return;
    try {
      if (this.resizeState.isActive) {
        this.handleResizeEnd();
      }
      this.overlayElement.classList.remove('visible');
      this.overlayElement.setAttribute('aria-hidden', 'true');
      this.isVisible = false;
      // Wait for opacity transition then hide
      setTimeout(() => {
        if (!this.isVisible && this.overlayElement) {
          this.overlayElement.style.display = 'none';
        }
      }, 200);
      logger.info('Message preview overlay hidden');
    } catch (error) {
      logger.error('Failed to hide MessagePreviewOverlay:', error);
    }
  }

  // Destroy overlay and listeners
  destroy() {
    if (this.resizeState.isActive) {
      this.handleResizeEnd();
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    window.removeEventListener('resize', this.handleWindowResize);
    this.teardownResizeHandle();
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
    this.isVisible = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    logger.info('MessagePreviewOverlay destroyed');
  }

  setupResizeHandle() {
    if (!this.overlayElement) return;
    try {
      const overlayContent = this.overlayElement.querySelector('.overlay-content');
      if (!overlayContent) return;

      let handle = overlayContent.querySelector('.overlay-resize-handle');
      if (!handle) {
        handle = overlayContent.appendChild(document.createElement('button'));
        handle.type = 'button';
        handle.className = 'overlay-resize-handle';
      }

      const resizeLabel =
        (i18n && typeof i18n.getMessage === 'function'
          ? i18n.getMessage('sidebar_preview_resizeHandle_label')
          : null) || 'Drag to resize';
      handle.setAttribute('title', resizeLabel);
      handle.setAttribute('aria-label', resizeLabel);
      handle.addEventListener('pointerdown', this.handleResizeStart);
      handle.addEventListener('keydown', this.handleResizeKeydown);
    } catch (error) {
      logger.error('Failed to set up resize handle:', error);
    }
  }

  teardownResizeHandle() {
    if (!this.overlayElement) return;
    try {
      const overlayContent = this.overlayElement.querySelector('.overlay-content');
      const handle = overlayContent ? overlayContent.querySelector('.overlay-resize-handle') : null;
      if (handle) {
        handle.removeEventListener('pointerdown', this.handleResizeStart);
        handle.removeEventListener('keydown', this.handleResizeKeydown);
      }
    } catch (error) {
      logger.error('Failed to tear down resize handle:', error);
    }
  }

  handleResizeStart(event) {
    if (!this.overlayElement) return;
    const overlayContent = this.overlayElement.querySelector('.overlay-content');
    if (!overlayContent) return;

    try {
      event.preventDefault();
      event.stopPropagation();

      const rect = overlayContent.getBoundingClientRect();
      this.resizeState = {
        isActive: true,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        pointerId: event.pointerId,
      };

      overlayContent.classList.add('is-resizing');
      const handle = event.currentTarget;
      if (handle && typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) {
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (err) {
          logger.debug('Failed to set pointer capture on resize handle:', err);
        }
      }

      window.addEventListener('pointermove', this.handleResizeMove);
      window.addEventListener('pointerup', this.handleResizeEnd);
      window.addEventListener('pointercancel', this.handleResizeEnd);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'nwse-resize';
    } catch (error) {
      logger.error('Failed to start resizing preview overlay:', error);
    }
  }

  handleResizeMove(event) {
    if (!this.overlayElement || !this.resizeState.isActive) return;
    const overlayContent = this.overlayElement.querySelector('.overlay-content');
    if (!overlayContent) return;

    try {
      const deltaX = event.clientX - this.resizeState.startX;
      const deltaY = event.clientY - this.resizeState.startY;

      let newWidth = this.resizeState.startWidth + deltaX;
      let newHeight = this.resizeState.startHeight + deltaY;

      newWidth = this.clampWidth(newWidth);
      newHeight = this.clampHeight(newHeight);

      overlayContent.style.width = `${newWidth}px`;
      overlayContent.style.height = `${newHeight}px`;
    } catch (error) {
      logger.error('Failed to resize preview overlay:', error);
    }
  }

  handleResizeEnd() {
    if (!this.overlayElement || !this.resizeState.isActive) return;
    const overlayContent = this.overlayElement.querySelector('.overlay-content');
    if (!overlayContent) return;

    try {
      overlayContent.classList.remove('is-resizing');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      window.removeEventListener('pointermove', this.handleResizeMove);
      window.removeEventListener('pointerup', this.handleResizeEnd);
      window.removeEventListener('pointercancel', this.handleResizeEnd);

      const handle = this.overlayElement.querySelector('.overlay-resize-handle');
      if (
        handle &&
        typeof handle.releasePointerCapture === 'function' &&
        this.resizeState.pointerId !== null &&
        this.resizeState.pointerId !== undefined
      ) {
        try {
          handle.releasePointerCapture(this.resizeState.pointerId);
        } catch (err) {
          logger.debug('Failed to release pointer capture on resize handle:', err);
        }
      }

      const rect = overlayContent.getBoundingClientRect();
      this.currentSize = {
        width: this.clampWidth(rect.width),
        height: this.clampHeight(rect.height),
      };

      overlayContent.style.width = `${this.currentSize.width}px`;
      overlayContent.style.height = `${this.currentSize.height}px`;
    } catch (error) {
      logger.error('Failed to finish resizing preview overlay:', error);
    } finally {
      this.resizeState = {
        isActive: false,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0,
        pointerId: null,
      };
    }
  }

  handleWindowResize() {
    if (!this.overlayElement || !this.currentSize) return;
    const overlayContent = this.overlayElement.querySelector('.overlay-content');
    if (!overlayContent) return;

    try {
      const adjustedWidth = this.clampWidth(this.currentSize.width);
      const adjustedHeight = this.clampHeight(this.currentSize.height);

      this.currentSize = {
        width: adjustedWidth,
        height: adjustedHeight,
      };

      overlayContent.style.width = `${adjustedWidth}px`;
      overlayContent.style.height = `${adjustedHeight}px`;
    } catch (error) {
      logger.error('Failed to handle window resize for preview overlay:', error);
    }
  }

  applyCurrentSize(overlayContent) {
    if (!overlayContent) return;
    if (!this.currentSize) {
      overlayContent.style.width = '';
      overlayContent.style.height = '';
      return;
    }

    const width = this.clampWidth(this.currentSize.width);
    const height = this.clampHeight(this.currentSize.height);

    overlayContent.style.width = `${width}px`;
    overlayContent.style.height = `${height}px`;
    this.currentSize = { width, height };
  }

  handleResizeKeydown(event) {
    if (!this.overlayElement) return;
    const overlayContent = this.overlayElement.querySelector('.overlay-content');
    if (!overlayContent) return;

    if (event.key === 'Home') {
      event.preventDefault();
      this.currentSize = null;
      overlayContent.style.width = '';
      overlayContent.style.height = '';
      return;
    }

    const rect = overlayContent.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;
    const step = event.shiftKey ? KEYBOARD_STEP * 2 : KEYBOARD_STEP;
    let changed = false;

    switch (event.key) {
      case 'ArrowRight':
        width += step;
        changed = true;
        break;
      case 'ArrowLeft':
        width -= step;
        changed = true;
        break;
      case 'ArrowDown':
        height += step;
        changed = true;
        break;
      case 'ArrowUp':
        height -= step;
        changed = true;
        break;
      default:
        break;
    }

    if (!changed) {
      return;
    }

    event.preventDefault();

    width = this.clampWidth(width);
    height = this.clampHeight(height);

    overlayContent.style.width = `${width}px`;
    overlayContent.style.height = `${height}px`;
    this.currentSize = { width, height };
  }

  clampWidth(width) {
    const maxWidth = Math.min(window.innerWidth * 0.95, MAX_WIDTH_PX);
    return Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, maxWidth));
  }

  clampHeight(height) {
    const maxHeight = Math.min(window.innerHeight * 0.9, MAX_HEIGHT_PX);
    return Math.min(Math.max(height, MIN_HEIGHT), Math.max(MIN_HEIGHT, maxHeight));
  }
}

const messagePreviewOverlay = new MessagePreviewOverlay();

export { messagePreviewOverlay, MessagePreviewOverlay };
