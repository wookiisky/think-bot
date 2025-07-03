/**
 * Confirmation Dialog Module
 * Manages the confirmation dialog for actions like deletion.
 */
import { createLogger } from '../../sidebar/modules/utils.js';
import { i18n } from '../../js/modules/i18n.js';
const logger = createLogger('ConfirmationDialog');

/**
 * Confirmation dialog for user actions
 */
export class ConfirmationDialog {
  constructor() {
    this.isOpen = false;
    this.currentResolve = null;
    this.overlay = null;
    this.dialog = null;
    this.init();
  }

  /**
   * Initialize the confirmation dialog
   */
  init() {
    this.createDialog();
    this.attachEventListeners();
  }

  /**
   * Create the dialog elements
   */
  createDialog() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'confirmation-overlay';
    this.overlay.style.display = 'none';
    
    // Create dialog
    this.dialog = document.createElement('div');
    this.dialog.className = 'confirmation-dialog';
    
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);
  }

  /**
   * Show confirmation dialog
   * @param {Object} options - Dialog options
   * @param {string} options.title - Dialog title
   * @param {string} options.message - Dialog message
   * @param {string} options.details - Optional details (HTML allowed)
   * @param {string} options.confirmText - Confirm button text
   * @param {string} options.cancelText - Cancel button text
   * @returns {Promise<boolean>} - True if confirmed, false if cancelled
   */
  async show({
    title = i18n.getMessage('confirmation_dialog_default_title'),
    message = i18n.getMessage('confirmation_dialog_default_message'),
    details = '',
    confirmText = i18n.getMessage('confirmation_dialog_default_confirm_button'),
    cancelText = i18n.getMessage('confirmation_dialog_default_cancel_button')
  } = {}) {
    return new Promise((resolve) => {
      this.currentResolve = resolve;
      
      // Build dialog HTML
      this.dialog.innerHTML = `
        <div class="confirmation-header">
          <h3>${title}</h3>
        </div>
        <div class="confirmation-body">
          <p>${message}</p>
          ${details ? `<div class="confirmation-details">${details}</div>` : ''}
        </div>
        <div class="confirmation-footer">
          <button class="confirmation-btn cancel-btn">${cancelText}</button>
          <button class="confirmation-btn confirm-btn">${confirmText}</button>
        </div>
      `;
      
      // Show overlay
      this.overlay.style.display = 'flex';
      this.isOpen = true;
      
      // Focus on confirm button
      const confirmBtn = this.dialog.querySelector('.confirm-btn');
      if (confirmBtn) {
        confirmBtn.focus();
      }
    });
  }

  /**
   * Hide the dialog
   */
  hide() {
    this.overlay.style.display = 'none';
    this.isOpen = false;
    this.currentResolve = null;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Handle clicking outside dialog
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.handleCancel();
      }
    });
    
    // Handle button clicks
    this.dialog.addEventListener('click', (e) => {
      if (e.target.classList.contains('confirm-btn')) {
        this.handleConfirm();
      } else if (e.target.classList.contains('cancel-btn')) {
        this.handleCancel();
      }
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.handleCancel();
      }
    });
  }

  /**
   * Handle confirm action
   */
  handleConfirm() {
    if (this.currentResolve) {
      this.currentResolve(true);
    }
    this.hide();
  }

  /**
   * Handle cancel action
   */
  handleCancel() {
    if (this.currentResolve) {
      this.currentResolve(false);
    }
    this.hide();
  }
}
