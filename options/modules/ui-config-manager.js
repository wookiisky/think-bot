// UI Configuration Manager
// Handles configuration operations for the options page UI
// Communicates with the storage config manager via message passing

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('UIConfigManager') : console;

export class UIConfigManager {
  
  // Load settings from storage via message passing
  static async loadSettings() {
    try {
      logger.info('Loading settings from storage');

      const response = await chrome.runtime.sendMessage({
        type: 'GET_CONFIG'
      });

      if (response && response.type === 'CONFIG_LOADED') {
        return response.config;
      } else {
        logger.error('Failed to load configuration from storage');
        return null;
      }
    } catch (error) {
      logger.error('Error loading settings from storage:', error.message);
      return null;
    }
  }

  // Save settings to storage via message passing
  static async saveSettings(config, syncSettings = null) {
    try {
      logger.info('Saving settings to storage');

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CONFIG',
        config: config
      });

      // Save sync settings separately if provided
      if (syncSettings && typeof syncConfig !== 'undefined') {
        await syncConfig.saveSyncConfig(syncSettings);
      }

      if (response && response.type === 'CONFIG_SAVED') {
        return true;
      } else {
        logger.error('Failed to save configuration to storage');
        return false;
      }
    } catch (error) {
      logger.error('Error saving settings to storage:', error.message);
      return false;
    }
  }

  // Reset settings to defaults via message passing
  static async resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      return false;
    }

    try {
      logger.info('Resetting settings to defaults');

      const response = await chrome.runtime.sendMessage({
        type: 'RESET_CONFIG'
      });

      if (response && response.type === 'CONFIG_RESET') {
        location.reload();
        return true;
      } else {
        logger.error('Failed to reset configuration');
        return false;
      }
    } catch (error) {
      logger.error('Error resetting settings:', error.message);
      return false;
    }
  }
  
  // Build config object from form values for UI operations
  static buildConfigFromForm(domElements, modelManager) {
    logger.info('Building configuration from form values');

    // Extract quick inputs from DOM with IDs preserved and auto-trigger settings
    const quickInputs = [];
    const quickInputItems = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    quickInputItems.forEach(item => {
      const displayText = item.querySelector('.quick-input-display').value.trim();
      const sendText = item.querySelector('.quick-input-send').value.trim();
      const idInput = item.querySelector('.quick-input-id');
      const autoTriggerCheckbox = item.querySelector('.auto-trigger-checkbox');

      if (displayText && sendText) {
        // Generate UUID-based ID if not present
        let id = idInput ? idInput.value : null;
        if (!id) {
          const timestamp = Date.now().toString(36);
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
          id = `qi_${timestamp}_${uuid}`;
        }

        // Get auto-trigger setting directly from the checkbox in this item
        const autoTrigger = autoTriggerCheckbox ? autoTriggerCheckbox.checked : false;

        quickInputs.push({
          id,
          displayText,
          sendText,
          autoTrigger
          // Note: lastModified timestamp will be calculated during save by comparing with old config
        });
      }
    });

    const config = {
      llm_models: {
        defaultModelId: modelManager.getDefaultModelId(),
        models: modelManager.getAllModels() // Get all models with timestamps preserved
      },
      quickInputs: quickInputs,
      basic: {
        defaultExtractionMethod: domElements.defaultExtractionMethod.value,
        jinaApiKey: domElements.jinaApiKey.value,
        jinaResponseTemplate: domElements.jinaResponseTemplate.value,
        systemPrompt: domElements.systemPrompt.value,
        contentDisplayHeight: Math.min(Math.max(parseInt(domElements.contentDisplayHeight.value), 0), 600),
        theme: domElements.theme.value,
        lastModified: Date.now()
      }
    };

    logger.info(`Built configuration with ${quickInputs.length} quick inputs and ${config.llm_models.models.length} models`);
    return config;
  }

  // Export configuration to JSON file (UI-specific operation)
  static async exportConfiguration(domElements, modelManager) {
    try {
      logger.info('Starting configuration export');

      // Build complete config including quick inputs from current form state
      const config = this.buildConfigFromForm(domElements, modelManager);

      // Get blacklist and sync configurations via message passing
      const [blacklistResponse, syncResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_BLACKLIST_PATTERNS' }).catch(() => ({ patterns: [] })),
        chrome.runtime.sendMessage({ type: 'GET_SYNC_CONFIG' }).catch(() => ({}))
      ]);

      // Add blacklist configuration
      if (blacklistResponse && blacklistResponse.type === 'BLACKLIST_PATTERNS_LOADED' && blacklistResponse.patterns) {
        config.blacklist = { patterns: blacklistResponse.patterns };
      }

      // Add sync configuration (exportable version without sensitive data)
      if (syncResponse && syncResponse.type === 'SYNC_CONFIG_LOADED' && syncResponse.config) {
        config.sync = {
          enabled: syncResponse.config.enabled || false,
          autoSync: syncResponse.config.autoSync || false,
          lastSyncTime: syncResponse.config.lastSyncTime || null,
          deviceId: syncResponse.config.deviceId || null
          // Exclude gistToken and gistId for security
        };
      }

      // Create export data with metadata
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '2.0', // Updated version to indicate new format
        exportedBy: 'ThinkBot Extension',
        config: config
      };

      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
                       new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      const filename = `thinkbot_config_${timestamp}.json`;

      // Create and trigger download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = filename;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);

      logger.info(`Configuration exported successfully: ${filename}`);
      return true;
    } catch (error) {
      logger.error('Error exporting configuration:', error.message);
      alert('Failed to export configuration. Please check the console for details.');
      return false;
    }
  }

  // Import configuration from JSON file (UI-specific operation)
  static async importConfiguration(file, domElements, modelManager) {
    try {
      logger.info('Starting configuration import');

      // Validate file type
      if (!file || file.type !== 'application/json') {
        throw new Error('Please select a valid JSON file');
      }

      // Parse file content
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate import data structure
      if (!importData.config) {
        throw new Error('Invalid configuration file format - missing config section');
      }

      const config = importData.config;

      // Validate required configuration fields (support both old and new formats)
      const basicConfig = config.basic || config;
      if (!basicConfig.defaultExtractionMethod) {
        throw new Error('Configuration missing required field: defaultExtractionMethod');
      }

      // Check if blacklist or sync configurations are included
      const hasBlacklist = config.blacklist && config.blacklist.patterns;
      const hasSync = config.sync;

      // Show confirmation dialog with import details
      let confirmMessage = `Are you sure you want to import this configuration?\n\n` +
                           `Export Date: ${importData.exportedAt || 'Unknown'}\n` +
                           `Version: ${importData.version || 'Unknown'}\n` +
                           `Exported By: ${importData.exportedBy || 'Unknown'}\n`;

      if (hasBlacklist) {
        confirmMessage += `\nBlacklist patterns: ${config.blacklist.patterns.length} patterns`;
      }

      if (hasSync) {
        confirmMessage += `\nSync settings: Included (sensitive data excluded)`;
      }

      confirmMessage += `\n\nThis will replace your current settings and reload the page.`;

      if (!confirm(confirmMessage)) {
        logger.info('Configuration import cancelled by user');
        return false;
      }

      // Save imported configuration via storage manager
      const success = await this.saveSettings(config);

      if (success) {
        logger.info('Configuration imported successfully');

        // Show success message with details about what was imported
        let successMessage = 'Configuration imported successfully!';
        if (hasBlacklist) {
          successMessage += `\n- ${config.blacklist.patterns.length} blacklist patterns imported`;
        }
        if (hasSync) {
          successMessage += '\n- Sync settings imported (tokens preserved)';
        }
        successMessage += '\n\nThe page will reload to apply changes.';

        alert(successMessage);
        location.reload();
        return true;
      } else {
        throw new Error('Failed to save imported configuration to storage');
      }

    } catch (error) {
      logger.error('Error importing configuration:', error.message);
      alert(`Failed to import configuration: ${error.message}`);
      return false;
    }
  }

  // Check configuration health and storage usage via message passing
  static async checkConfigurationHealth() {
    try {
      logger.info('Requesting configuration health check from storage manager');

      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_CONFIG_HEALTH'
      });

      if (response && response.type === 'CONFIG_HEALTH_CHECKED') {
        logger.info('Configuration health check completed');
        return response.healthInfo;
      } else {
        logger.error('Failed to get configuration health information');
        return null;
      }
    } catch (error) {
      logger.error('Error checking configuration health:', error.message);
      return null;
    }
  }

  // Validate configuration size before saving (delegates to StorageUsageDisplay)
  static validateConfigurationSize(config) {
    logger.info('Validating configuration size');

    // Delegate to StorageUsageDisplay class if available
    if (typeof StorageUsageDisplay !== 'undefined') {
      return StorageUsageDisplay.validateConfigurationSize(config);
    }

    logger.warn('StorageUsageDisplay module not available for size validation');
    return []; // Return empty errors if validation module not available
  }

  // Display storage size validation errors in the UI
  static displayStorageErrors(errors, saveButton) {
    logger.info(`Displaying ${errors.length} storage validation errors`);

    // Remove any existing error display
    const existingError = document.getElementById('storageErrorDisplay');
    if (existingError) {
      existingError.remove();
    }

    if (errors.length === 0) {
      return;
    }

    // Create error display element
    const errorDisplay = document.createElement('div');
    errorDisplay.id = 'storageErrorDisplay';
    errorDisplay.className = 'storage-error-display';

    errorDisplay.innerHTML = `
      <h4>Configuration Size Errors</h4>
      <p>The following items exceed storage limits:</p>
      <ul>
        ${errors.map(error => `<li>${error}</li>`).join('')}
      </ul>
      <p>Please reduce the size of these items before saving.</p>
    `;

    // Insert error display before the save button
    saveButton.parentNode.insertBefore(errorDisplay, saveButton);

    // Scroll to error display for user attention
    errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}