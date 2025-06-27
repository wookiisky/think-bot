/**
 * blacklist-config.js - Blacklist configuration management for options page
 * Handles the blacklist patterns table and related operations
 */

// Create module logger
const blacklistConfigLogger = logger.createModuleLogger('BlacklistConfig');

/**
 * BlacklistConfig class for managing blacklist configuration UI
 */
class BlacklistConfig {
  constructor() {
    this.tableBody = null;
    this.addButton = null;
    this.isInitialized = false;
    this.editingPatternId = null;
  }

  /**
   * Initialize the blacklist configuration component
   */
  async init() {
    if (this.isInitialized) {
      return;
    }

    this.setupElements();
    this.setupEventListeners();
    await this.loadAndRenderPatterns();
    this.isInitialized = true;
    blacklistConfigLogger.info('BlacklistConfig initialized');
  }

  /**
   * Setup DOM element references
   */
  setupElements() {
    this.tableBody = document.getElementById('blacklistTableBody');
    this.addButton = document.getElementById('addBlacklistBtn');
    this.resetButton = document.getElementById('resetBlacklistBtn');

    if (!this.tableBody) {
      blacklistConfigLogger.error('Blacklist table body not found');
      return;
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.addButton) {
      this.addButton.addEventListener('click', () => {
        this.showAddPatternDialog();
      });
    }

    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => {
        this.resetToDefaults();
      });
    }
  }

  /**
   * Load patterns from storage and render the table
   */
  async loadAndRenderPatterns() {
    try {
      const patterns = await blacklistManager.getPatterns();
      this.renderPatternsTable(patterns);
      blacklistConfigLogger.info(`Loaded ${patterns.length} blacklist patterns`);
    } catch (error) {
      blacklistConfigLogger.error('Error loading blacklist patterns:', error);
      this.showError('Failed to load blacklist patterns');
    }
  }

  /**
   * Render the patterns table
   * @param {Array} patterns - Array of blacklist patterns
   */
  renderPatternsTable(patterns) {
    if (!this.tableBody) return;

    this.tableBody.innerHTML = '';

    if (patterns.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td class="empty-state">
            No blacklist patterns configured. Click "Add Pattern" to create one.
          </td>
        </tr>
      `;
      return;
    }

    patterns.forEach(pattern => {
      const row = this.createPatternRow(pattern);
      this.tableBody.appendChild(row);
    });
  }

  /**
   * Create a table row for a pattern
   * @param {Object} pattern - Pattern object
   * @returns {HTMLElement} Table row element
   */
  createPatternRow(pattern) {
    const row = document.createElement('tr');
    row.className = 'blacklist-pattern-row';
    row.dataset.patternId = pattern.id;

    const enabledClass = pattern.enabled ? 'enabled' : 'disabled';

    row.innerHTML = `
      <td class="pattern-row-cell">
        <div class="pattern-row-content">
          <div class="pattern-checkbox-container">
            <label class="custom-checkbox">
              <input type="checkbox" ${pattern.enabled ? 'checked' : ''}
                     data-pattern-id="${pattern.id}" class="pattern-toggle">
              <span class="checkmark"></span>
            </label>
          </div>
          <div class="pattern-info ${enabledClass}">
            <code class="pattern-text">${this.escapeHtml(pattern.pattern)}</code>
          </div>
          <div class="pattern-actions">
            <button type="button" class="icon-btn edit-btn"
                    data-pattern-id="${pattern.id}"
                    title="Edit Pattern">
              <i class="material-icons">edit</i>
            </button>
            <button type="button" class="icon-btn delete-btn"
                    data-pattern-id="${pattern.id}"
                    title="Delete Pattern">
              <i class="material-icons">delete</i>
            </button>
          </div>
        </div>
      </td>
    `;

    // Add event listeners
    this.setupRowEventListeners(row, pattern);

    return row;
  }

  /**
   * Setup event listeners for a pattern row
   * @param {HTMLElement} row - Table row element
   * @param {Object} pattern - Pattern object
   */
  setupRowEventListeners(row, pattern) {
    // Toggle checkbox
    const toggleCheckbox = row.querySelector('.pattern-toggle');
    if (toggleCheckbox) {
      toggleCheckbox.addEventListener('change', (e) => {
        this.togglePattern(pattern.id, e.target.checked);
      });
    }

    // Edit button - open edit dialog
    const editBtn = row.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this.showPatternDialog(pattern);
      });
    }

    // Delete button
    const deleteBtn = row.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deletePattern(pattern.id);
      });
    }
  }

  /**
   * Toggle pattern enabled status
   * @param {string} patternId - Pattern ID
   * @param {boolean} enabled - New enabled status
   */
  async togglePattern(patternId, enabled) {
    try {
      const success = await blacklistManager.updatePattern(patternId, { enabled });
      if (success) {
        await this.loadAndRenderPatterns();
        this.showSuccess(`Pattern ${enabled ? 'enabled' : 'disabled'} successfully`);
      } else {
        this.showError('Failed to update pattern');
      }
    } catch (error) {
      blacklistConfigLogger.error('Error toggling pattern:', error);
      this.showError('Failed to update pattern');
    }
  }



  /**
   * Delete a pattern
   * @param {string} patternId - Pattern ID
   */
  async deletePattern(patternId) {
    try {
      const pattern = await blacklistManager.getPatternById(patternId);
      if (!pattern) {
        this.showError('Pattern not found');
        return;
      }

      const confirmed = confirm(`Are you sure you want to delete the pattern "${pattern.description}"?`);
      if (!confirmed) {
        return;
      }

      const success = await blacklistManager.deletePattern(patternId);
      if (success) {
        await this.loadAndRenderPatterns();
        this.showSuccess('Pattern deleted successfully');
      } else {
        this.showError('Failed to delete pattern');
      }
    } catch (error) {
      blacklistConfigLogger.error('Error deleting pattern:', error);
      this.showError('Failed to delete pattern');
    }
  }



  /**
   * Show add pattern dialog
   */
  showAddPatternDialog() {
    this.showPatternDialog();
  }

  /**
   * Show edit pattern dialog
   * @param {Object} pattern - Pattern to edit
   */
  showEditPatternDialog(pattern) {
    this.editingPatternId = pattern.id;
    this.showPatternDialog(pattern);
  }

  /**
   * Escape HTML characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    blacklistConfigLogger.info('Success:', message);
    // For now, use console.log. Could be enhanced with toast notifications later
    console.log('✅ ' + message);
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    blacklistConfigLogger.error('Error:', message);
    alert('❌ ' + message);
  }

  /**
   * Show pattern dialog (add/edit)
   * @param {Object} pattern - Pattern to edit (null for add)
   */
  showPatternDialog(pattern = null) {
    const isEdit = pattern !== null;
    const title = isEdit ? 'Edit Blacklist Pattern' : 'Add Blacklist Pattern';

    const dialogHtml = `
      <div class="modal-overlay" id="patternDialog">
        <div class="modal-content">
          <div class="modal-header">
            <h3>${title}</h3>
            <button type="button" class="close-btn" id="patternDialogCloseBtn">
              <i class="material-icons">close</i>
            </button>
          </div>
          <div class="modal-body">
            <form id="patternForm">
              <div class="form-group">
                <label for="patternInput">URL Pattern (Regex)</label>
                <input type="text" id="patternInput" class="form-control"
                       placeholder="e.g., google\\.com/search"
                       value="${pattern ? this.escapeHtml(pattern.pattern) : ''}" required>
                <small class="form-text">Use regex pattern to match URLs (without protocol)</small>
              </div>

              <div class="form-group test-url-section">
                <label for="testUrlInput">Test URL (Optional)</label>
                <div class="test-url-container">
                  <input type="text" id="testUrlInput" class="form-control"
                         placeholder="e.g., https://www.google.com/search?q=test">                  
                </div>
                <div id="testResult" class="test-result" style="display: none;"></div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="secondary-btn" id="patternDialogCancelBtn">
              Cancel
            </button>
            <button type="button" class="primary-btn" id="patternDialogSaveBtn">
              ${isEdit ? 'Update' : 'Add'} Pattern
            </button>
          </div>
        </div>
      </div>
    `;

    // Remove existing dialog if any
    this.closePatternDialog();

    // Add dialog to page
    document.body.insertAdjacentHTML('beforeend', dialogHtml);

    // Setup event listeners
    this.setupPatternDialogEventListeners();

    // Focus on pattern input
    setTimeout(() => {
      document.getElementById('patternInput').focus();
    }, 100);
  }

  /**
   * Setup event listeners for pattern dialog
   */
  setupPatternDialogEventListeners() {
    // Close button
    const closeBtn = document.getElementById('patternDialogCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closePatternDialog();
      });
    }

    // Cancel button
    const cancelBtn = document.getElementById('patternDialogCancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.closePatternDialog();
      });
    }

    // Save button
    const saveBtn = document.getElementById('patternDialogSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.savePattern();
      });
    }

    // Test pattern button
    const testBtn = document.getElementById('testPatternBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        this.testPattern();
      });
    }

    // Auto-test when pattern or URL changes
    const patternInput = document.getElementById('patternInput');
    const testUrlInput = document.getElementById('testUrlInput');

    if (patternInput && testUrlInput) {
      const autoTest = () => {
        const pattern = patternInput.value.trim();
        const testUrl = testUrlInput.value.trim();
        if (pattern && testUrl) {
          this.testPattern();
        } else {
          this.clearTestResult();
        }
      };

      patternInput.addEventListener('input', autoTest);
      testUrlInput.addEventListener('input', autoTest);
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('patternDialog')) {
        this.closePatternDialog();
      }
    });
  }

  /**
   * Close pattern dialog
   */
  closePatternDialog() {
    const dialog = document.getElementById('patternDialog');
    if (dialog) {
      dialog.remove();
    }
    this.editingPatternId = null;
  }

  /**
   * Test pattern against URL
   */
  testPattern() {
    const patternInput = document.getElementById('patternInput');
    const testUrlInput = document.getElementById('testUrlInput');
    const testResult = document.getElementById('testResult');

    if (!patternInput || !testUrlInput || !testResult) {
      return;
    }

    const pattern = patternInput.value.trim();
    const testUrl = testUrlInput.value.trim();

    if (!pattern || !testUrl) {
      this.clearTestResult();
      return;
    }

    // Test the pattern using blacklistManager
    const result = blacklistManager.testPattern(pattern, testUrl);

    // Display result
    testResult.style.display = 'block';

    if (result.error) {
      testResult.className = 'test-result error';
      testResult.innerHTML = `
        <div class="test-result-header">
          <i class="material-icons">error</i>
          <span>Test Error</span>
        </div>
        <div class="test-result-content">${this.escapeHtml(result.error)}</div>
      `;
    } else {
      const isMatch = result.isMatch;
      testResult.className = `test-result ${isMatch ? 'match' : 'no-match'}`;
      testResult.innerHTML = `
        <div class="test-result-header">
          <i class="material-icons">${isMatch ? 'check_circle' : 'cancel'}</i>
          <span>${isMatch ? 'Pattern Matches' : 'Pattern Does Not Match'}</span>
        </div>
        <div class="test-result-content">
          <div class="test-detail">
            <strong>Pattern:</strong> <code>${this.escapeHtml(result.pattern)}</code>
          </div>
          <div class="test-detail">
            <strong>Tested URL:</strong> <code>${this.escapeHtml(result.testedUrl)}</code>
          </div>
        </div>
      `;
    }
  }

  /**
   * Clear test result display
   */
  clearTestResult() {
    const testResult = document.getElementById('testResult');
    if (testResult) {
      testResult.style.display = 'none';
      testResult.innerHTML = '';
    }
  }





  /**
   * Save pattern from dialog
   */
  async savePattern() {
    const patternInput = document.getElementById('patternInput');

    const pattern = patternInput.value.trim();
    const enabled = true; // Default to enabled for new patterns

    if (!pattern) {
      this.showError('Please enter a pattern');
      return;
    }

    // Validate pattern
    const validation = blacklistManager.validatePattern(pattern);
    if (!validation.isValid) {
      this.showError(validation.error);
      return;
    }

    try {
      let success;
      if (this.editingPatternId) {
        // Update existing pattern - only update the pattern, keep existing enabled state
        success = await blacklistManager.updatePattern(this.editingPatternId, {
          pattern
        });
      } else {
        // Add new pattern
        success = await blacklistManager.addPattern({
          pattern,
          enabled
        });
      }

      if (success) {
        this.closePatternDialog();
        await this.loadAndRenderPatterns();
        this.showSuccess(`Pattern ${this.editingPatternId ? 'updated' : 'added'} successfully`);
      } else {
        this.showError('Failed to save pattern');
      }
    } catch (error) {
      blacklistConfigLogger.error('Error saving pattern:', error);
      this.showError('Failed to save pattern');
    }
  }

  /**
   * Reset blacklist to default patterns
   */
  async resetToDefaults() {
    const currentPatterns = await blacklistManager.getPatterns();
    const patternCount = currentPatterns.length;

    const confirmed = confirm(
      `Reset to Default Patterns?\n\n` +
      `This will:\n` +
      `• Delete all ${patternCount} current patterns\n` +
      `• Restore default search engine patterns\n` +
      `• Cannot be undone\n\n` +
      `Continue?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const success = await blacklistManager.resetToDefaults();
      if (success) {
        await this.loadAndRenderPatterns();
        this.showSuccess('Blacklist patterns reset to defaults successfully');
        blacklistConfigLogger.info('Blacklist patterns reset to defaults');
      } else {
        this.showError('Failed to reset blacklist patterns');
      }
    } catch (error) {
      blacklistConfigLogger.error('Error resetting blacklist patterns:', error);
      this.showError('Failed to reset blacklist patterns');
    }
  }








}

// Create global instance
const blacklistConfig = new BlacklistConfig();
