/**
 * confirmation-dialog.js - Universal confirmation dialog component
 * Provides a consistent confirmation dialog experience across the extension
 */

import { i18n } from '../i18n.js';

// Create logger instance using the unified logger system
const createLogger = (moduleName) => {
  // Check if the unified logger is available
  if (typeof window !== 'undefined' && window.logger && typeof window.logger.createModuleLogger === 'function') {
    return window.logger.createModuleLogger(moduleName);
  }
  
  // Fallback to console if logger is not available
  return {
    debug: (...args) => console.debug(`[${moduleName}]`, ...args),
    info: (...args) => console.info(`[${moduleName}]`, ...args),
    warn: (...args) => console.warn(`[${moduleName}]`, ...args),
    error: (...args) => console.error(`[${moduleName}]`, ...args)
  };
};

const logger = createLogger('ConfirmationDialog');

/**
 * Universal ConfirmationDialog class for managing confirmation dialogs
 */
class ConfirmationDialog {
  constructor() {
    this.isVisible = false;
    this.pendingCallback = null;
    this.confirmationElement = null;
    this.targetElement = null;
    this.isInitialized = false;
    this.currentType = 'default';
    this.outsideClickHandler = null;
  }

  /**
   * Initialize the confirmation dialog component
   */
  init() {
    if (this.isInitialized) {
      return;
    }

    this.createConfirmationElement();
    this.setupEventListeners();
    this.isInitialized = true;
    logger.info('ConfirmationDialog initialized');
  }

  /**
   * Create the confirmation DOM element
   */
  createConfirmationElement() {
    this.confirmationElement = document.createElement('div');
    this.confirmationElement.className = 'confirmation-dialog';
    this.confirmationElement.innerHTML = `
      <div class="confirmation-dialog-content">
        <div class="confirmation-dialog-message" data-i18n="confirmationDialog_areYouSure">Are you sure?</div>
        <div class="confirmation-dialog-actions">
          <button class="confirmation-btn confirmation-btn-cancel" type="button" data-i18n="confirmationDialog_cancel">Cancel</button>
          <button class="confirmation-btn confirmation-btn-confirm" type="button" data-i18n="confirmationDialog_confirm">Confirm</button>
        </div>
      </div>
      <div class="confirmation-dialog-arrow"></div>
    `;

    // Add to document body
    document.body.appendChild(this.confirmationElement);
    
    // Apply i18n translations to the newly created elements
    if (i18n && i18n.applyToDOM) {
      // Apply translations to elements with data-i18n attributes
      this.confirmationElement.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (key) {
          elem.textContent = i18n.getMessage(key);
        }
      });
    }
    
    logger.debug('Created confirmation dialog element');
  }

  /**
   * Force recreation of the confirmation element
   */
  forceRecreateElement() {
    const existingElements = document.querySelectorAll('.confirmation-dialog');
    existingElements.forEach(el => el.remove());

    this.confirmationElement = null;
    this.isVisible = false;

    this.createConfirmationElement();
    this.setupEventListeners();
    logger.info('Confirmation dialog element forcefully recreated');
  }

  /**
   * Setup event listeners for confirmation interactions
   */
  setupEventListeners() {
    if (!this.confirmationElement) return;

    const confirmBtn = this.confirmationElement.querySelector('.confirmation-btn-confirm');
    const cancelBtn = this.confirmationElement.querySelector('.confirmation-btn-cancel');

    if (!confirmBtn || !cancelBtn) {
      logger.error('Button elements not found during event listener setup');
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

    // Escape key
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isVisible) {
        this.handleCancel();
      }
    });

    // Enter key to confirm
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && this.isVisible) {
        this.handleConfirm();
      }
    });

    // Prevent clicks on confirmation content from bubbling
    const confirmationContent = this.confirmationElement.querySelector('.confirmation-dialog-content');
    confirmationContent.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  /**
   * Show the confirmation dialog
   * @param {Object} options - Display options
   * @param {HTMLElement} options.target - Target element to position near (optional)
   * @param {string} options.title - Optional title for the dialog
   * @param {string} options.message - Custom message to display
   * @param {string} options.confirmText - Text for confirm button
   * @param {string} options.cancelText - Text for cancel button
   * @param {string} options.type - Dialog type ('default', 'danger', 'warning', 'info')
   * @param {Function} options.onConfirm - Callback for confirm action
   * @param {Function} options.onCancel - Callback for cancel action
   */
  show(options = {}) {
    if (!this.isInitialized) {
      this.init();
    }

    if (this.isVisible) {
      return;
    }

    const {
      target = null,
      title = null,
      message = i18n.getMessage('confirmationDialog_areYouSure'),
      confirmText = i18n.getMessage('confirmationDialog_confirm'),
      cancelText = i18n.getMessage('confirmationDialog_cancel'),
      type = 'default',
      onConfirm = () => {},
      onCancel = () => {}
    } = options;

    // Ensure confirmation element exists
    if (!this.confirmationElement) {
      this.forceRecreateElement();
    }

    // Store callbacks and target
    this.pendingCallback = { onConfirm, onCancel };
    this.targetElement = target;
    this.currentType = type;

    // Update message
    const messageElement = this.confirmationElement.querySelector('.confirmation-dialog-message');
    messageElement.textContent = message;

    // Update button texts
    const confirmBtn = this.confirmationElement.querySelector('.confirmation-btn-confirm');
    const cancelBtn = this.confirmationElement.querySelector('.confirmation-btn-cancel');
    
    if (!confirmBtn || !cancelBtn) {
      logger.error('Button elements not found');
      return;
    }

    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    // Apply type-specific styling
    this.applyTypeStyles(type);

    // Show confirmation dialog
    this.confirmationElement.style.display = 'block';
    this.isVisible = true;

    // Position the dialog
    if (target) {
      this.positionDialog(target);
    } else {
      this.centerDialog();
    }

    // Add animation class
    setTimeout(() => {
      this.confirmationElement.classList.add('visible');
    }, 10);

    // Set up outside click handler - delay to avoid catching the triggering click
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
    }
    
    this.outsideClickHandler = (e) => {
      if (this.isVisible && !this.confirmationElement.contains(e.target) && e.target !== this.targetElement) {
        this.handleCancel();
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler);
    }, 0);

    // Focus management - focus cancel button for destructive actions
    setTimeout(() => {
      if (type === 'danger') {
        cancelBtn.focus();
      } else {
        confirmBtn.focus();
      }
    }, 100);

    logger.info('Confirmation dialog shown', { type, hasTarget: !!target });
  }

  /**
   * Apply type-specific styling to the dialog
   * @param {string} type - Dialog type
   */
  applyTypeStyles(type) {
    const confirmBtn = this.confirmationElement.querySelector('.confirmation-btn-confirm');
    
    // Reset classes
    confirmBtn.className = 'confirmation-btn confirmation-btn-confirm';
    this.confirmationElement.className = 'confirmation-dialog';

    // Apply type-specific classes
    switch (type) {
      case 'danger':
        confirmBtn.classList.add('confirmation-btn-danger');
        this.confirmationElement.classList.add('confirmation-dialog-danger');
        break;
      case 'warning':
        confirmBtn.classList.add('confirmation-btn-warning');
        this.confirmationElement.classList.add('confirmation-dialog-warning');
        break;
      case 'info':
        confirmBtn.classList.add('confirmation-btn-info');
        this.confirmationElement.classList.add('confirmation-dialog-info');
        break;
      default:
        // Default styling already applied
        break;
    }
  }

  /**
   * Position the dialog relative to the target element
   * @param {HTMLElement} target - Target element
   */
  positionDialog(target) {
    if (!target || !this.confirmationElement) {
      logger.error('Invalid target or confirmation element for positioning');
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const dialogRect = this.confirmationElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Default position: below and to the right of the target
    let top = targetRect.bottom + 8;
    let left = targetRect.left;

    // Use default dimensions if dialog rect is not available yet
    const dialogWidth = dialogRect.width || 280;
    const dialogHeight = dialogRect.height || 80;

    // Adjust if dialog would go off-screen horizontally
    if (left + dialogWidth > viewportWidth - 16) {
      left = targetRect.right - dialogWidth;
    }

    // Adjust if dialog would go off-screen vertically
    if (top + dialogHeight > viewportHeight - 16) {
      top = targetRect.top - dialogHeight - 8;
      this.confirmationElement.classList.add('above');
    } else {
      this.confirmationElement.classList.remove('above');
    }

    // Ensure minimum margins
    left = Math.max(16, Math.min(left, viewportWidth - dialogWidth - 16));
    top = Math.max(16, Math.min(top, viewportHeight - dialogHeight - 16));

    // Apply position
    this.confirmationElement.style.position = 'fixed';
    this.confirmationElement.style.left = `${left}px`;
    this.confirmationElement.style.top = `${top}px`;
    this.confirmationElement.style.zIndex = '9999';

    logger.debug('Dialog positioned', { left, top });
  }

  /**
   * Center the dialog in the viewport
   */
  centerDialog() {
    if (!this.confirmationElement) return;

    this.confirmationElement.style.position = 'fixed';
    this.confirmationElement.style.left = '50%';
    this.confirmationElement.style.top = '50%';
    this.confirmationElement.style.transform = 'translate(-50%, -50%)';
    this.confirmationElement.style.zIndex = '9999';
    this.confirmationElement.classList.add('centered');

    logger.debug('Dialog centered');
  }

  /**
   * Hide the confirmation dialog
   */
  hide() {
    if (!this.isVisible) {
      return;
    }

    // Remove outside click handler when hiding
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
    }

    this.confirmationElement.classList.remove('visible');

    setTimeout(() => {
      this.confirmationElement.style.display = 'none';
      this.confirmationElement.classList.remove('above', 'centered');
      this.confirmationElement.style.transform = '';
      this.isVisible = false;
      this.pendingCallback = null;
      this.targetElement = null;
      this.currentType = 'default';
    }, 200);

    logger.info('Confirmation dialog hidden');
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
   * Convenience method for delete confirmations
   * @param {Object} options - Options object
   */
  confirmDelete(options = {}) {
    return this.show({
      type: 'danger',
      message: options.message || i18n.getMessage('confirmationDialog_deleteMessage'),
      confirmText: options.confirmText || i18n.getMessage('confirmationDialog_deleteButton'),
      cancelText: options.cancelText || i18n.getMessage('confirmationDialog_cancel'),
      ...options
    });
  }

  /**
   * Convenience method for reset confirmations
   * @param {Object} options - Options object
   */
  confirmReset(options = {}) {
    return this.show({
      type: 'warning',
      message: options.message || i18n.getMessage('confirmationDialog_resetMessage'),
      confirmText: options.confirmText || i18n.getMessage('confirmationDialog_resetButton'),
      cancelText: options.cancelText || i18n.getMessage('confirmationDialog_cancel'),
      ...options
    });
  }

  /**
   * Convenience method for clear confirmations
   * @param {Object} options - Options object
   */
  confirmClear(options = {}) {
    return this.show({
      type: 'warning',
      message: options.message || i18n.getMessage('confirmationDialog_clearMessage'),
      confirmText: options.confirmText || i18n.getMessage('confirmationDialog_clearButton'),
      cancelText: options.cancelText || i18n.getMessage('confirmationDialog_cancel'),
      ...options
    });
  }

  /**
   * Check if confirmation is currently visible
   * @returns {boolean} Visibility status
   */
  isDialogVisible() {
    return this.isVisible;
  }

  /**
   * Destroy the confirmation dialog component
   */
  destroy() {
    // Remove outside click handler
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
    }
    
    if (this.confirmationElement && this.confirmationElement.parentNode) {
      this.confirmationElement.parentNode.removeChild(this.confirmationElement);
    }
    
    this.confirmationElement = null;
    this.isVisible = false;
    this.pendingCallback = null;
    this.targetElement = null;
    this.currentType = 'default';
    this.isInitialized = false;
    this.outsideClickHandler = null;
    
    logger.info('ConfirmationDialog destroyed');
  }
}

// Create and export a singleton instance
const confirmationDialog = new ConfirmationDialog();

export { confirmationDialog, ConfirmationDialog };