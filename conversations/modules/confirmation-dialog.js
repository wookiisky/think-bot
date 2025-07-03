/**
 * Confirmation Dialog Module
 * Manages the confirmation dialog for actions like deletion.
 */
import { createLogger } from '../../sidebar/modules/utils.js';
const logger = createLogger('ConfirmationDialog');

export class ConfirmationDialog {
  constructor(dialogId, confirmBtnId, cancelBtnId, titleId, messageId, detailsId) {
    this.dialogOverlay = document.getElementById(dialogId);
    this.confirmBtn = document.getElementById(confirmBtnId);
    this.cancelBtn = document.getElementById(cancelBtnId);
    this.titleEl = document.getElementById(titleId);
    this.messageEl = document.getElementById(messageId);
    this.detailsEl = document.getElementById(detailsId);
    
    this.resolvePromise = null;

    this.init();
  }

  init() {
    if (!this.dialogOverlay || !this.confirmBtn || !this.cancelBtn) {
      logger.error('Confirmation dialog elements not found');
      return;
    }

    this.confirmBtn.addEventListener('click', () => this.handleConfirm());
    this.cancelBtn.addEventListener('click', () => this.handleCancel());
    this.dialogOverlay.addEventListener('click', (e) => {
      if (e.target === this.dialogOverlay) {
        this.handleCancel();
      }
    });
  }

  show(options) {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;

      const {
        title = chrome.i18n.getMessage('confirmation_dialog_default_title'),
        message = chrome.i18n.getMessage('confirmation_dialog_default_message'),
        details = '',
        confirmText = chrome.i18n.getMessage('confirmation_dialog_default_confirm_button'),
        cancelText = chrome.i18n.getMessage('confirmation_dialog_default_cancel_button')
      } = options;

      this.titleEl.textContent = title;
      this.messageEl.textContent = message;
      
      if (details) {
        this.detailsEl.innerHTML = details;
        this.detailsEl.style.display = 'block';
      } else {
        this.detailsEl.style.display = 'none';
      }

      this.confirmBtn.textContent = confirmText;
      this.cancelBtn.textContent = cancelText;
      
      this.dialogOverlay.classList.remove('hidden');
    });
  }

  hide() {
    this.dialogOverlay.classList.add('hidden');
  }

  handleConfirm() {
    if (this.resolvePromise) {
      this.resolvePromise(true);
    }
    this.hide();
  }

  handleCancel() {
    if (this.resolvePromise) {
      this.resolvePromise(false);
    }
    this.hide();
  }
}
