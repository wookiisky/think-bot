/**
 * mini-confirmation.js - Minimal intrusive confirmation component
 * Shows a small confirmation popup near the clicked button
 */

import { i18n } from '../../js/modules/i18n.js';
// Import createLogger from utils
import { createLogger } from '../modules/utils.js';

const logger = createLogger('MiniConfirmation');

/**
 * MiniConfirmation class for managing minimal confirmation dialogs
 */
class MiniConfirmation {
  constructor() {
    this.isVisible = false;
    this.pendingCallback = null;
    this.confirmationElement = null;
    this.targetElement = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the mini confirmation component
   */
  init() {
    if (this.isInitialized) {
      return;
    }

    this.createConfirmationElement();
    this.setupEventListeners();
    this.isInitialized = true;
    logger.info('MiniConfirmation initialized');
  }

  /**
   * Create the confirmation DOM element
   */
  createConfirmationElement() {
    this.confirmationElement = document.createElement('div');
    this.confirmationElement.className = 'mini-confirmation';
    this.confirmationElement.innerHTML = `
      <div class="mini-confirmation-content">
        <div class="mini-confirmation-message" data-i18n="sidebar_miniConfirmation_areYouSure">Are you sure?</div>
        <div class="mini-confirmation-actions">
          <button class="mini-btn mini-btn-cancel" type="button" data-i18n="sidebar_miniConfirmation_cancel">Cancel</button>
          <button class="mini-btn mini-btn-confirm" type="button" data-i18n="sidebar_miniConfirmation_confirm">Confirm</button>
        </div>
      </div>
      <div class="mini-confirmation-arrow"></div>
    `;

    // Add to document body
    document.body.appendChild(this.confirmationElement);

    // Debug: Verify the DOM structure was created correctly
    logger.debug('Created confirmation element with HTML:', this.confirmationElement.innerHTML);

    // Wait a moment for DOM to be fully processed
    setTimeout(() => {
      const createdConfirmBtn = this.confirmationElement.querySelector('.mini-btn-confirm');
      const createdCancelBtn = this.confirmationElement.querySelector('.mini-btn-cancel');
      const allCreatedButtons = this.confirmationElement.querySelectorAll('button');

      logger.debug('Created buttons verification (after timeout):', {
        confirmBtn: !!createdConfirmBtn,
        cancelBtn: !!createdCancelBtn,
        confirmBtnClass: createdConfirmBtn?.className,
        cancelBtnClass: createdCancelBtn?.className,
        totalButtons: allCreatedButtons.length,
        buttonDetails: Array.from(allCreatedButtons).map(btn => ({
          className: btn.className,
          textContent: btn.textContent,
          outerHTML: btn.outerHTML
        }))
      });
    }, 0);
  }

  /**
   * Force recreation of the confirmation element
   */
  forceRecreateElement() {
    // Clean up any existing elements first
    const existingElements = document.querySelectorAll('.mini-confirmation');
    existingElements.forEach(el => el.remove());

    // Reset state
    this.confirmationElement = null;
    this.isVisible = false;

    // Recreate
    this.createConfirmationElement();
    this.setupEventListeners();

    logger.info('Confirmation element forcefully recreated');
  }

  /**
   * Setup event listeners for confirmation interactions
   */
  setupEventListeners() {
    if (!this.confirmationElement) return;

    const confirmBtn = this.confirmationElement.querySelector('.mini-btn-confirm');
    const cancelBtn = this.confirmationElement.querySelector('.mini-btn-cancel');

    if (!confirmBtn || !cancelBtn) {
      logger.error('Button elements not found during event listener setup', {
        confirmBtn: !!confirmBtn,
        cancelBtn: !!cancelBtn
      });
      return;
    }

    // Confirm button
    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleConfirm();
    });

    // Cancel button
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleCancel();
    });

    // Click outside to cancel
    document.addEventListener('click', (e) => {
      if (this.isVisible && !this.confirmationElement.contains(e.target) && e.target !== this.targetElement) {
        this.handleCancel();
      }
    });

    // Escape key
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isVisible) {
        this.handleCancel();
      }
    });

    // Prevent clicks on confirmation content from bubbling
    const confirmationContent = this.confirmationElement.querySelector('.mini-confirmation-content');
    confirmationContent.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  /**
   * Show the mini confirmation near the target element
   * @param {Object} options - Display options
   * @param {HTMLElement} options.target - Target element to position near
   * @param {string} options.message - Custom message to display
   * @param {string} options.confirmText - Text for confirm button
   * @param {string} options.cancelText - Text for cancel button
   * @param {string} options.confirmButtonClass - CSS class for confirm button
   * @param {Function} options.onConfirm - Callback for confirm action
   * @param {Function} options.onCancel - Callback for cancel action
   */
  show(options = {}) {
    if (!this.isInitialized) {
      this.init();
    }

    if (this.isVisible) {
      logger.warn('Mini confirmation is already visible');
      return;
    }

    const {
      target,
      message = i18n.getMessage('sidebar_miniConfirmation_areYouSure'),
      confirmText = i18n.getMessage('sidebar_miniConfirmation_confirm'),
      cancelText = i18n.getMessage('sidebar_miniConfirmation_cancel'),
      confirmButtonClass = 'mini-btn-confirm',
      onConfirm = () => {},
      onCancel = () => {}
    } = options;

    if (!target) {
      logger.error('Target element is required for mini confirmation');
      return;
    }

    // Ensure confirmation element exists and is properly structured
    if (!this.confirmationElement) {
      logger.error('Confirmation element not found, reinitializing...');
      this.forceRecreateElement();
    } else {
      // Verify the DOM structure is intact
      const confirmBtn = this.confirmationElement.querySelector('.mini-btn-confirm');
      const cancelBtn = this.confirmationElement.querySelector('.mini-btn-cancel');

      if (!confirmBtn || !cancelBtn) {
        logger.warn('DOM structure corrupted, forcing recreation...');
        this.forceRecreateElement();
      }
    }

    // Debug: Log the current DOM structure
    logger.debug('Confirmation element HTML:', this.confirmationElement.innerHTML);

    // Store callbacks and target
    this.pendingCallback = { onConfirm, onCancel };
    this.targetElement = target;

    // Update message
    const messageElement = this.confirmationElement.querySelector('.mini-confirmation-message');
    if (!messageElement) {
      logger.error('Message element not found in confirmation DOM');
      return;
    }
    messageElement.textContent = message;

    // Update button texts - search for buttons again
    logger.debug('Searching for buttons in confirmation element...');
    let confirmBtn = this.confirmationElement.querySelector('.mini-btn-confirm');
    let cancelBtn = this.confirmationElement.querySelector('.mini-btn-cancel');

    // Debug: Log all buttons found
    const allButtons = this.confirmationElement.querySelectorAll('button');
    const allMiniButtons = this.confirmationElement.querySelectorAll('.mini-btn');
    logger.debug('Button search results:', {
      confirmBtn: !!confirmBtn,
      cancelBtn: !!cancelBtn,
      allButtonsCount: allButtons.length,
      allMiniButtonsCount: allMiniButtons.length,
      allButtons: Array.from(allButtons).map(btn => ({
        className: btn.className,
        textContent: btn.textContent,
        hasConfirmClass: btn.classList.contains('mini-btn-confirm'),
        hasCancelClass: btn.classList.contains('mini-btn-cancel')
      }))
    });

    if (!confirmBtn || !cancelBtn) {
      logger.error('Button elements not found in confirmation DOM', {
        confirmBtn: !!confirmBtn,
        cancelBtn: !!cancelBtn,
        allButtonsCount: allButtons.length,
        innerHTML: this.confirmationElement.innerHTML
      });

      // Try to recreate the element one more time
      logger.warn('Attempting to recreate confirmation element...');
      this.forceRecreateElement();

      // Try again after recreation
      const retryConfirmBtn = this.confirmationElement.querySelector('.mini-btn-confirm');
      const retryCancelBtn = this.confirmationElement.querySelector('.mini-btn-cancel');

      if (!retryConfirmBtn || !retryCancelBtn) {
        logger.error('Still cannot find buttons after recreation, aborting');
        return;
      }

      // Use the retry buttons
      confirmBtn = retryConfirmBtn;
      cancelBtn = retryCancelBtn;
      logger.info('Successfully found buttons after recreation');
    }

    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    // Update confirm button class while preserving base classes
    // Reset to base classes first
    confirmBtn.className = 'mini-btn mini-btn-confirm';
    // Add additional class if it's different from the default
    if (confirmButtonClass && confirmButtonClass !== 'mini-btn-confirm') {
      confirmBtn.classList.add(confirmButtonClass);
    }

    // Show confirmation first to get proper dimensions
    this.confirmationElement.style.display = 'block';
    this.confirmationElement.style.visibility = 'hidden'; // Hide visually but keep in layout
    this.isVisible = true;

    // Position the confirmation near the target (now that it's in the layout)
    this.positionConfirmation(target);

    // Make visible and add animation
    this.confirmationElement.style.visibility = 'visible';

    // Add animation class after a brief delay for smooth transition
    setTimeout(() => {
      this.confirmationElement.classList.add('visible');
    }, 10);

    // Focus on cancel button for safety (for destructive actions)
    setTimeout(() => {
      cancelBtn.focus();
    }, 100);

    logger.info('Mini confirmation shown');
  }

  /**
   * Position the confirmation relative to the target element
   * @param {HTMLElement} target - Target element
   */
  positionConfirmation(target) {
    if (!target || !this.confirmationElement) {
      logger.error('Invalid target or confirmation element for positioning');
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const confirmationRect = this.confirmationElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Log for debugging
    logger.debug('Positioning confirmation', {
      targetRect: {
        top: targetRect.top,
        left: targetRect.left,
        bottom: targetRect.bottom,
        right: targetRect.right,
        width: targetRect.width,
        height: targetRect.height
      },
      confirmationRect: {
        width: confirmationRect.width,
        height: confirmationRect.height
      },
      viewport: { width: viewportWidth, height: viewportHeight }
    });

    // Default position: below and to the right of the target
    let top = targetRect.bottom + 8;
    let left = targetRect.left;

    // Use default dimensions if confirmation rect is not available yet
    const confirmationWidth = confirmationRect.width || 280; // max-width from CSS
    const confirmationHeight = confirmationRect.height || 80; // estimated height

    // Adjust if confirmation would go off-screen horizontally
    if (left + confirmationWidth > viewportWidth - 16) {
      left = targetRect.right - confirmationWidth;
    }

    // Adjust if confirmation would go off-screen vertically
    if (top + confirmationHeight > viewportHeight - 16) {
      top = targetRect.top - confirmationHeight - 8;
      this.confirmationElement.classList.add('above');
    } else {
      this.confirmationElement.classList.remove('above');
    }

    // Ensure minimum margins and stay within viewport
    left = Math.max(16, Math.min(left, viewportWidth - confirmationWidth - 16));
    top = Math.max(16, Math.min(top, viewportHeight - confirmationHeight - 16));

    // Apply position
    this.confirmationElement.style.left = `${left}px`;
    this.confirmationElement.style.top = `${top}px`;

    logger.debug('Final position', { left, top });
  }

  /**
   * Hide the mini confirmation
   */
  hide() {
    if (!this.isVisible) {
      return;
    }

    // Remove animation class
    this.confirmationElement.classList.remove('visible');

    // Hide after animation completes
    setTimeout(() => {
      this.confirmationElement.style.display = 'none';
      this.confirmationElement.classList.remove('above');
      this.isVisible = false;
      this.pendingCallback = null;
      this.targetElement = null;
    }, 200); // Match CSS transition duration

    logger.info('Mini confirmation hidden');
  }

  /**
   * Handle confirm action
   */
  handleConfirm() {
    logger.info('User confirmed action');
    
    if (this.pendingCallback && this.pendingCallback.onConfirm) {
      this.pendingCallback.onConfirm();
    }
    
    this.hide();
  }

  /**
   * Handle cancel action
   */
  handleCancel() {
    logger.info('User cancelled action');
    
    if (this.pendingCallback && this.pendingCallback.onCancel) {
      this.pendingCallback.onCancel();
    }
    
    this.hide();
  }

  /**
   * Check if confirmation is currently visible
   * @returns {boolean} Visibility status
   */
  isConfirmationVisible() {
    return this.isVisible;
  }

  /**
   * Destroy the mini confirmation component
   */
  destroy() {
    if (this.confirmationElement && this.confirmationElement.parentNode) {
      this.confirmationElement.parentNode.removeChild(this.confirmationElement);
    }
    
    this.confirmationElement = null;
    this.isVisible = false;
    this.pendingCallback = null;
    this.targetElement = null;
    this.isInitialized = false;
    
    logger.info('MiniConfirmation destroyed');
  }
}

// Create and export a singleton instance
const miniConfirmation = new MiniConfirmation();

export { miniConfirmation, MiniConfirmation };
