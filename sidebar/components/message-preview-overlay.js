/**
 * message-preview-overlay.js - Overlay to preview full branch message content
 */

import { createLogger } from '../modules/utils.js';

const logger = createLogger('MessagePreviewOverlay');

class MessagePreviewOverlay {
  constructor() {
    this.overlayElement = null;
    this.isVisible = false;
    this.keydownHandler = null;
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
        <div class=\"overlay-backdrop\" data-action=\"backdrop\"></div>
        <div class=\"overlay-content\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"previewTitle\">
          <div class=\"overlay-header\">
            <h3 id=\"previewTitle\">Preview</h3>
          </div>
          <div class=\"overlay-body\">
            <div class=\"preview-body\">
              <div class=\"message-content\"></div>
            </div>
          </div>
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

      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.innerHTML = html || '';

      this.overlayElement.style.display = 'flex';
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
      this.overlayElement.classList.remove('visible');
      this.overlayElement.setAttribute('aria-hidden', 'true');
      this.isVisible = false;
      // Wait for opacity transition then hide
      setTimeout(() => {
        if (!this.isVisible) {
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
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
    this.isVisible = false;
    logger.info('MessagePreviewOverlay destroyed');
  }
}

const messagePreviewOverlay = new MessagePreviewOverlay();

export { messagePreviewOverlay, MessagePreviewOverlay };
