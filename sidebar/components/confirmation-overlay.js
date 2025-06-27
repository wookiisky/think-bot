/**
 * confirmation-overlay.js - Blacklist confirmation overlay component
 * Handles the confirmation dialog when accessing blacklisted pages
 */

import { createLogger } from '../modules/utils.js';

const logger = createLogger('ConfirmationOverlay');

/**
 * ConfirmationOverlay class for managing blacklist confirmation dialogs
 */
class ConfirmationOverlay {
  constructor() {
    this.isVisible = false;
    this.pendingCallback = null;
    this.overlayElement = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the overlay component
   */
  init() {
    if (this.isInitialized) {
      return;
    }

    this.createOverlayElement();
    this.setupEventListeners();
    this.isInitialized = true;
    logger.info('ConfirmationOverlay initialized');
  }

  /**
   * Create the overlay DOM element
   */
  createOverlayElement() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'blacklist-overlay';
    this.overlayElement.innerHTML = `
      <div class="overlay-backdrop"></div>
      <div class="overlay-content">
        <div class="overlay-header">
          <h3>Blacklist Page Detected</h3>
        </div>
        <div class="overlay-body">
          <p class="overlay-message">This page is in your blacklist. Do you want to continue using Think Bot?</p>
          <div class="overlay-pattern-info">
            <small class="pattern-description"></small>
          </div>
        </div>
        <div class="overlay-actions">
          <button class="btn-secondary overlay-cancel-btn" type="button">Cancel</button>
          <button class="btn-primary overlay-confirm-btn" type="button">Continue</button>
        </div>
      </div>
    `;

    // Add to document body
    document.body.appendChild(this.overlayElement);
  }

  /**
   * Setup event listeners for overlay interactions
   */
  setupEventListeners() {
    if (!this.overlayElement) return;

    const confirmBtn = this.overlayElement.querySelector('.overlay-confirm-btn');
    const cancelBtn = this.overlayElement.querySelector('.overlay-cancel-btn');
    const backdrop = this.overlayElement.querySelector('.overlay-backdrop');

    // Confirm button
    confirmBtn.addEventListener('click', () => {
      this.handleConfirm();
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      this.handleCancel();
    });

    // Backdrop click (cancel)
    backdrop.addEventListener('click', () => {
      this.handleCancel();
    });

    // Escape key
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isVisible) {
        this.handleCancel();
      }
    });

    // Prevent clicks on overlay content from bubbling to backdrop
    const overlayContent = this.overlayElement.querySelector('.overlay-content');
    overlayContent.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  /**
   * Show the confirmation overlay
   * @param {Object} options - Display options
   * @param {string} options.message - Custom message to display
   * @param {Object} options.matchedPattern - The matched blacklist pattern
   * @param {Function} options.onConfirm - Callback for confirm action
   * @param {Function} options.onCancel - Callback for cancel action
   */
  show(options = {}) {
    if (!this.isInitialized) {
      this.init();
    }

    if (this.isVisible) {
      logger.warn('Overlay is already visible');
      return;
    }

    const {
      message = 'This page is in your blacklist. Do you want to continue using Think Bot?',
      matchedPattern = null,
      onConfirm = () => {},
      onCancel = () => {}
    } = options;

    // Store callbacks
    this.pendingCallback = { onConfirm, onCancel };

    // Update message
    const messageElement = this.overlayElement.querySelector('.overlay-message');
    messageElement.textContent = message;

    // Update pattern info
    const patternInfoElement = this.overlayElement.querySelector('.pattern-description');
    if (matchedPattern && matchedPattern.pattern) {
      patternInfoElement.textContent = `Matched pattern: ${matchedPattern.pattern}`;
      patternInfoElement.style.display = 'block';
    } else {
      patternInfoElement.style.display = 'none';
    }

    // Show overlay
    this.overlayElement.style.display = 'flex';
    this.isVisible = true;

    // Add animation class after a brief delay for smooth transition
    setTimeout(() => {
      this.overlayElement.classList.add('visible');
    }, 10);

    // Focus on confirm button for accessibility
    setTimeout(() => {
      const confirmBtn = this.overlayElement.querySelector('.overlay-confirm-btn');
      confirmBtn.focus();
    }, 100);

    logger.info('Confirmation overlay shown');
  }

  /**
   * Hide the confirmation overlay
   */
  hide() {
    if (!this.isVisible) {
      return;
    }

    // Remove animation class
    this.overlayElement.classList.remove('visible');

    // Hide after animation completes
    setTimeout(() => {
      this.overlayElement.style.display = 'none';
      this.isVisible = false;
      this.pendingCallback = null;
    }, 300); // Match CSS transition duration

    logger.info('Confirmation overlay hidden');
  }

  /**
   * Handle confirm action
   */
  handleConfirm() {
    logger.info('User confirmed to continue on blacklisted page');
    
    if (this.pendingCallback && this.pendingCallback.onConfirm) {
      this.pendingCallback.onConfirm();
    }
    
    this.hide();
  }

  /**
   * Handle cancel action
   */
  handleCancel() {
    logger.info('User cancelled on blacklisted page');
    
    if (this.pendingCallback && this.pendingCallback.onCancel) {
      this.pendingCallback.onCancel();
    }
    
    this.hide();
  }

  /**
   * Check if overlay is currently visible
   * @returns {boolean} Visibility status
   */
  isOverlayVisible() {
    return this.isVisible;
  }

  /**
   * Destroy the overlay component
   */
  destroy() {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    
    this.overlayElement = null;
    this.isVisible = false;
    this.pendingCallback = null;
    this.isInitialized = false;
    
    logger.info('ConfirmationOverlay destroyed');
  }
}

// Create and export a singleton instance
const confirmationOverlay = new ConfirmationOverlay();

export { confirmationOverlay, ConfirmationOverlay };
