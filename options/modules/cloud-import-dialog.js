/**
 * cloud-import-dialog.js - Cloud config import dialog component
 * Allows importing quick input configurations from remote URLs
 */

import { i18n } from '../../js/modules/i18n.js';
import { QuickInputsManager } from './quick-inputs.js';

// Create logger instance
const createLogger = (moduleName) => {
  if (typeof window !== 'undefined' && window.logger && typeof window.logger.createModuleLogger === 'function') {
    return window.logger.createModuleLogger(moduleName);
  }
  
  return {
    debug: (...args) => console.debug(`[${moduleName}]`, ...args),
    info: (...args) => console.info(`[${moduleName}]`, ...args),
    warn: (...args) => console.warn(`[${moduleName}]`, ...args),
    error: (...args) => console.error(`[${moduleName}]`, ...args)
  };
};

const logger = createLogger('CloudImportDialog');

/**
 * CloudImportDialog class for managing cloud config import
 */
class CloudImportDialog {
  constructor() {
    this.isVisible = false;
    this.dialogElement = null;
    this.isInitialized = false;
    this.defaultUrl = 'https://raw.githubusercontent.com/wookiisky/think-bot/refs/heads/main/quick_input_tabs.json';
  }

  /**
   * Initialize the dialog component
   */
  init() {
    if (this.isInitialized) {
      return;
    }

    this.createDialogElement();
    this.setupEventListeners();
    this.isInitialized = true;
    logger.info('CloudImportDialog initialized');
  }

  /**
   * Create the dialog DOM element
   */
  createDialogElement() {
    this.dialogElement = document.createElement('div');
    this.dialogElement.className = 'cloud-import-dialog';
    this.dialogElement.innerHTML = `
      <div class="cloud-import-backdrop"></div>
      <div class="cloud-import-dialog-content">
        <div class="cloud-import-dialog-header">
          <h3 data-i18n="options_cloud_import_dialog_title">Import Cloud Config</h3>
          <button class="cloud-import-close-btn" type="button" aria-label="Close">
            <i class="material-icons">close</i>
          </button>
        </div>
        <div class="cloud-import-dialog-body">
          <div class="cloud-import-url-section">
            <div class="floating-label-field">
              <input type="url" id="cloudConfigUrl" class="cloud-config-url-input" value="${this.defaultUrl}">
              <label for="cloudConfigUrl" class="floating-label" data-i18n="options_cloud_import_url_label">Config URL</label>
            </div>
            <button type="button" class="cloud-import-fetch-btn" data-i18n="options_cloud_import_fetch_button">Fetch Config</button>
          </div>
          <div class="cloud-import-error" style="display: none;"></div>
          <div class="cloud-import-loading" style="display: none;">
            <div class="loading-spinner"></div>
            <span data-i18n="common_loading">Loading...</span>
          </div>
          <div class="cloud-import-table-container" style="display: none;">
            <table class="cloud-import-table">
              <thead>
                <tr>
                  <th data-i18n="options_quick_input_button_text_label">Button Text</th>
                  <th data-i18n="options_quick_input_message_label">Message Preview</th>
                  <th >Copy</th>
                </tr>
              </thead>
              <tbody class="cloud-import-table-body">
                <!-- Table rows will be inserted here -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.dialogElement);
    
    // Apply i18n translations
    if (i18n && i18n.applyToDOM) {
      this.dialogElement.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (key) {
          elem.textContent = i18n.getMessage(key);
        }
      });
    }

    // Initialize floating label for URL input
    if (window.floatingLabelManager) {
      window.floatingLabelManager.refresh();
    }
    
    logger.debug('Created cloud import dialog element');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (!this.dialogElement) return;

    const closeBtn = this.dialogElement.querySelector('.cloud-import-close-btn');
    const backdrop = this.dialogElement.querySelector('.cloud-import-backdrop');
    const fetchBtn = this.dialogElement.querySelector('.cloud-import-fetch-btn');
    const urlInput = this.dialogElement.querySelector('.cloud-config-url-input');

    // Close button
    closeBtn.addEventListener('click', () => {
      this.hide();
    });

    // Backdrop click to close
    backdrop.addEventListener('click', () => {
      this.hide();
    });

    // Fetch button
    fetchBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        this.fetchCloudConfig(url);
      }
    });

    // Enter key in URL input
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (url) {
          this.fetchCloudConfig(url);
        }
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    // Event delegation for copy buttons
    const tableBody = this.dialogElement.querySelector('.cloud-import-table-body');
    tableBody.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.cloud-import-copy-btn');
      if (copyBtn) {
        const index = parseInt(copyBtn.dataset.index, 10);
        if (!isNaN(index) && this.currentConfig && this.currentConfig[index]) {
          this.copyQuickInput(this.currentConfig[index], copyBtn);
        }
      }
    });
  }

  /**
   * Show the dialog
   */
  show() {
    if (!this.isInitialized) {
      this.init();
    }

    if (this.isVisible) {
      return;
    }

    this.dialogElement.style.display = 'block';
    this.isVisible = true;

    // Trigger reflow for animation
    setTimeout(() => {
      this.dialogElement.classList.add('visible');
    }, 10);

    // Focus URL input
    setTimeout(() => {
      const urlInput = this.dialogElement.querySelector('.cloud-config-url-input');
      if (urlInput) {
        urlInput.focus();
        urlInput.select();
      }
    }, 100);

    // Refresh floating labels
    if (window.floatingLabelManager) {
      window.floatingLabelManager.refresh();
    }

    logger.info('Cloud import dialog shown');
  }

  /**
   * Hide the dialog
   */
  hide() {
    if (!this.isVisible) {
      return;
    }

    this.dialogElement.classList.remove('visible');

    setTimeout(() => {
      this.dialogElement.style.display = 'none';
      this.isVisible = false;
      this.clearError();
      this.hideLoading();
    }, 200);

    logger.info('Cloud import dialog hidden');
  }

  /**
   * Fetch cloud config from URL
   * @param {string} url - The URL to fetch from
   */
  async fetchCloudConfig(url) {
    logger.info('Fetching cloud config from:', url);

    this.clearError();
    this.showLoading();
    this.hideTable();

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate data structure
      if (!data || !data.quickInputs || !Array.isArray(data.quickInputs)) {
        throw new Error(i18n.getMessage('options_cloud_import_error_invalid') || 'Invalid config format');
      }

      logger.info(`Fetched ${data.quickInputs.length} quick input configurations`);

      this.currentConfig = data.quickInputs;
      this.renderTable(data.quickInputs);
      this.hideLoading();
      this.showTable();

    } catch (error) {
      logger.error('Error fetching cloud config:', error);
      this.hideLoading();
      
      let errorMessage = i18n.getMessage('options_cloud_import_error_fetch') || 'Failed to fetch config';
      if (error.message.includes('JSON')) {
        errorMessage = i18n.getMessage('options_cloud_import_error_parse') || 'Invalid JSON format';
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      this.showError(errorMessage);
    }
  }

  /**
   * Render the config table
   * @param {Array} quickInputs - Array of quick input configurations
   */
  renderTable(quickInputs) {
    const tableBody = this.dialogElement.querySelector('.cloud-import-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    quickInputs.forEach((item, index) => {
      const row = document.createElement('tr');
      row.className = 'cloud-import-table-row';
      
      // Convert \n to actual line breaks for tooltip
      const tooltipText = item.sendText ? item.sendText.replace(/\\n/g, '\n') : '';
      
      // Get first line of sendText for preview
      const firstLine = item.sendText ? item.sendText.split(/\\n|\n/)[0] : '';
      const messagePreview = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
      
      row.innerHTML = `
        <td class="cloud-import-cell-display">
          ${this.escapeHtml(item.displayText || '')}
        </td>
        <td class="cloud-import-cell-message" title="${this.escapeHtml(tooltipText)}">
          ${this.escapeHtml(messagePreview)}
        </td>
        <td class="cloud-import-cell-actions">
          <button type="button" class="cloud-import-copy-btn" data-index="${index}" data-i18n="options_cloud_import_copy_button">
            Copy
          </button>
        </td>
      `;
      
      tableBody.appendChild(row);
    });

    // Apply i18n to newly created elements
    if (i18n && i18n.applyToDOM) {
      tableBody.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (key) {
          elem.textContent = i18n.getMessage(key);
        }
      });
    }
  }

  /**
   * Copy a quick input to local configuration
   * @param {Object} item - The quick input item to copy
   * @param {HTMLElement} button - The copy button element
   */
  copyQuickInput(item, button) {
    logger.info('Copying quick input:', item.displayText);

    try {
      // Get DOM elements from options page
      const domElements = window.optionsPage?.domElements;
      if (!domElements) {
        throw new Error('Options page not initialized');
      }

      // Generate new random ID to avoid conflicts
      const newId = QuickInputsManager.generateRandomId();

      // Add the quick input to the DOM
      QuickInputsManager.addQuickInput(
        domElements,
        item.displayText || '',
        item.sendText || '',
        newId
      );

      // Set auto-trigger state if specified
      if (item.autoTrigger !== undefined) {
        QuickInputsManager.setAutoTriggerState(newId, item.autoTrigger, domElements);
      }

      // Set branch model IDs if specified
      if (item.branchModelIds && Array.isArray(item.branchModelIds) && item.branchModelIds.length > 0) {
        const newItem = domElements.quickInputsContainer.querySelector('.quick-input-item:last-child');
        if (newItem) {
          const modelManager = window.optionsPage?.modelManager;
          if (modelManager) {
            const allModels = modelManager.getAllModels();
            QuickInputsManager.populateQuickInputBranchModels(newItem, allModels, item.branchModelIds);
            QuickInputsManager.updateQuickInputBranchModelSelection(newItem, allModels, item.branchModelIds);
          }
        }
      }

      // Mark as changed
      if (window.optionsPage?.markAsChanged) {
        window.optionsPage.markAsChanged();
      }

      // Show success message on the button
      this.showCopySuccess(button);

      logger.info('Successfully copied quick input to local config');

    } catch (error) {
      logger.error('Error copying quick input:', error);
      this.showError(`${i18n.getMessage('options_cloud_import_error_fetch') || 'Copy failed'}: ${error.message}`);
    }
  }

  /**
   * Show copy success feedback on button
   * @param {HTMLElement} button - The button element
   */
  showCopySuccess(button) {
    const originalText = button.textContent;
    button.textContent = i18n.getMessage('options_cloud_import_copy_success') || 'Copied!';
    button.classList.add('success');
    button.disabled = true;

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('success');
      button.disabled = false;
    }, 2000);
  }

  /**
   * Show loading state
   */
  showLoading() {
    const loading = this.dialogElement.querySelector('.cloud-import-loading');
    if (loading) {
      loading.style.display = 'flex';
    }
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    const loading = this.dialogElement.querySelector('.cloud-import-loading');
    if (loading) {
      loading.style.display = 'none';
    }
  }

  /**
   * Show table
   */
  showTable() {
    const tableContainer = this.dialogElement.querySelector('.cloud-import-table-container');
    if (tableContainer) {
      tableContainer.style.display = 'block';
    }
  }

  /**
   * Hide table
   */
  hideTable() {
    const tableContainer = this.dialogElement.querySelector('.cloud-import-table-container');
    if (tableContainer) {
      tableContainer.style.display = 'none';
    }
  }

  /**
   * Show error message
   * @param {string} message - The error message to display
   */
  showError(message) {
    const errorDiv = this.dialogElement.querySelector('.cloud-import-error');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  /**
   * Clear error message
   */
  clearError() {
    const errorDiv = this.dialogElement.querySelector('.cloud-import-error');
    if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Destroy the dialog component
   */
  destroy() {
    if (this.dialogElement && this.dialogElement.parentNode) {
      this.dialogElement.parentNode.removeChild(this.dialogElement);
    }
    
    this.dialogElement = null;
    this.isVisible = false;
    this.isInitialized = false;
    this.currentConfig = null;
    
    logger.info('CloudImportDialog destroyed');
  }
}

// Create and export a singleton instance
const cloudImportDialog = new CloudImportDialog();

export { cloudImportDialog, CloudImportDialog };

