// UI Configuration Manager
// Handles configuration operations for the options page UI
// Communicates with the storage config manager via message passing

// Import QuickInputsManager
import { QuickInputsManager } from './quick-inputs.js';
// Import confirmation dialog
import { confirmationDialog } from '../../js/modules/ui/confirmation-dialog.js';

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
        return { success: true };
      } else {
        logger.error('Failed to save configuration to storage');
        return { success: false, error: 'Failed to save configuration' };
      }
    } catch (error) {
      logger.error('Error saving settings to storage:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Reset settings to defaults via message passing
  static async resetSettings() {
    return new Promise((resolve) => {
      // Find the reset button for positioning
      const resetBtn = document.getElementById('resetBtn');
      
      confirmationDialog.confirmReset({
        target: resetBtn,
        message: i18n.getMessage('options_ui_config_reset_confirm'),
        confirmText: i18n.getMessage('common_reset') || 'Reset',
        cancelText: i18n.getMessage('common_cancel') || 'Cancel',
        onConfirm: async () => {
          try {
            logger.info('Resetting settings to defaults');

            const response = await chrome.runtime.sendMessage({
              type: 'RESET_CONFIG'
            });

            if (response && response.type === 'CONFIG_RESET') {
              location.reload();
              resolve(true);
            } else {
              logger.error('Failed to reset configuration');
              resolve(false);
            }
          } catch (error) {
            logger.error('Error resetting settings:', error.message);
            resolve(false);
          }
        },
        onCancel: () => {
          resolve(false);
        }
      });
    });
  }
  
  // Build config object from form values for UI operations
  static buildConfigFromForm(domElements, modelManager) {
    logger.info('Building configuration from form values');

    // Delegate quick inputs extraction to QuickInputsManager to handle soft deletes
    const quickInputs = QuickInputsManager.getQuickInputs(domElements);

    const config = {
      llm_models: {
        models: modelManager.getActiveModels() // Get only active (non-deleted) models for saving/syncing
      },
      quickInputs: quickInputs,
      basic: {
        defaultExtractionMethod: domElements.defaultExtractionMethod.value,
        jinaApiKey: domElements.jinaApiKey.value,
        jinaResponseTemplate: domElements.jinaResponseTemplate.value,
        systemPrompt: domElements.systemPrompt.value,
        contentDisplayHeight: Math.min(Math.max(parseInt(domElements.contentDisplayHeight.value), 0), 600),
        theme: domElements.theme.value,
        defaultModelId: modelManager.getDefaultModelId(), // Move to basic for timestamp protection
        branchModelIds: this.getBranchModelIds(domElements), // Add branch model IDs
        language: domElements.languageSelector.value,
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

      // Add complete sync configuration including credentials
      if (syncResponse && syncResponse.type === 'SYNC_CONFIG_LOADED' && syncResponse.config) {
        config.sync = {
          enabled: syncResponse.config.enabled || false,
          autoSync: syncResponse.config.autoSync || false,
          storageType: syncResponse.config.storageType || 'gist',
          // Gist configuration
          gistToken: syncResponse.config.gistToken || '',
          gistId: syncResponse.config.gistId || '',
          // WebDAV configuration
          webdavUrl: syncResponse.config.webdavUrl || '',
          webdavUsername: syncResponse.config.webdavUsername || '',
          webdavPassword: syncResponse.config.webdavPassword || '',
          // Status and metadata
          lastSyncTime: syncResponse.config.lastSyncTime || null,
          deviceId: syncResponse.config.deviceId || null,
          syncStatus: syncResponse.config.syncStatus || 'idle',
          lastError: syncResponse.config.lastError || null
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
      alert(i18n.getMessage('options_ui_config_export_error'));
      return false;
    }
  }

  // Import configuration from JSON file (UI-specific operation)
  static async importConfiguration(file, domElements, modelManager) {
    try {
      logger.info('Starting configuration import');

      // Validate file type
      if (!file || file.type !== 'application/json') {
        throw new Error(i18n.getMessage('options_ui_config_import_invalid_file'));
      }

      // Parse file content
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate import data structure
      if (!importData.config) {
        throw new Error(i18n.getMessage('options_ui_config_import_invalid_format'));
      }

      const config = importData.config;

      // Validate required configuration fields (support both old and new formats)
      const basicConfig = config.basic || config;
      if (!basicConfig.defaultExtractionMethod) {
        throw new Error(i18n.getMessage('options_ui_config_import_missing_field', { fieldName: 'defaultExtractionMethod' }));
      }

      // Show confirmation dialog with import details
      let confirmMessage = `${i18n.getMessage('options_ui_config_import_confirm_title')}\n\n` +
                           `${i18n.getMessage('options_ui_config_import_confirm_export_date', { date: importData.exportedAt || 'Unknown' })}\n` +
                           `${i18n.getMessage('options_ui_config_import_confirm_version', { version: importData.version || 'Unknown' })}\n` +
                           `${i18n.getMessage('options_ui_config_import_confirm_exported_by', { author: importData.exportedBy || 'Unknown' })}\n`;

      confirmMessage += `\n\n${i18n.getMessage('options_ui_config_import_confirm_footer')}`;

      if (!confirm(confirmMessage)) {
        logger.info('Configuration import cancelled by user');
        return false;
      }

      // Extract sync configuration if present
      let syncSettings = null;
      if (config.sync) {
        syncSettings = config.sync;
        // Remove sync from main config to avoid duplication
        delete config.sync;
        
        logger.info('Found sync configuration in import data:', {
          enabled: syncSettings.enabled,
          storageType: syncSettings.storageType,
          hasGistToken: !!syncSettings.gistToken,
          hasGistId: !!syncSettings.gistId,
          hasWebdavUrl: !!syncSettings.webdavUrl,
          hasWebdavUsername: !!syncSettings.webdavUsername,
          hasWebdavPassword: !!syncSettings.webdavPassword
        });
      }

      // Save imported configuration via storage manager
      const success = await this.saveSettings(config, syncSettings);

      if (success) {
        logger.info('Configuration imported successfully');

        // Show success message
        let successMessage = i18n.getMessage('options_ui_config_import_success');
        successMessage += `\n\n${i18n.getMessage('options_ui_config_import_success_footer')}`;

        alert(successMessage);
        location.reload();
        return true;
      } else {
        throw new Error(i18n.getMessage('options_ui_config_import_save_error'));
      }

    } catch (error) {
      logger.error('Error importing configuration:', error.message);
      alert(i18n.getMessage('options_ui_config_import_generic_error', { error: error.message }));
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

  // Get branch model IDs from the custom multi-select component
  static getBranchModelIds(domElements) {
    if (!domElements.selectedBranchModels) {
      return [];
    }
    
    const selectedItems = domElements.selectedBranchModels.querySelectorAll('.selected-model-item');
    return Array.from(selectedItems).map(item => item.dataset.modelId).filter(Boolean);
  }

  // Populate branch model selector with available models
  static populateBranchModelSelector(domElements, allModels, selectedIds = []) {
    if (!domElements.branchModelsDropdown || !domElements.selectedBranchModels) {
      return;
    }

    // Clear existing options
    domElements.branchModelsDropdown.innerHTML = '';
    
    // Add options for each model - filter out deleted and disabled models
    allModels.forEach(model => {
      if (!model.isDeleted && model.enabled) { // Only show enabled and non-deleted models
        const optionItem = document.createElement('div');
        optionItem.className = 'option-item';
        optionItem.dataset.value = model.id;
        optionItem.innerHTML = `<span class="option-text">${model.name || model.id}</span>`;
        domElements.branchModelsDropdown.appendChild(optionItem);
      }
    });

    // Update selected items display
    this.updateBranchModelSelection(domElements, allModels, selectedIds);
  }

  // Update the selected branch models display
  static updateBranchModelSelection(domElements, allModels, selectedIds) {
    if (!domElements.selectedBranchModels || !Array.isArray(selectedIds)) {
      return;
    }

    if (selectedIds.length === 0) {
      domElements.selectedBranchModels.innerHTML = '<span class="no-models-selected"></span>';
      return;
    }

    // Find the model objects for selected IDs and filter out deleted models
    const selectedModels = selectedIds.map(id => 
      allModels.find(model => model.id === id)
    ).filter(model => model && !model.isDeleted); // Filter out null/undefined models and deleted models

    // Render selected models
    const selectedItemsHtml = selectedModels.map(model => `
      <span class="selected-model-item" data-model-id="${model.id}">
        <span class="model-name">${model.name || model.id}</span>
        <span class="model-remove-icon" data-model-id="${model.id}">
          <i class="material-icons">close</i>
        </span>
      </span>
    `).join('');

    domElements.selectedBranchModels.innerHTML = selectedItemsHtml;

    // Update floating label state for the custom multi-select
    const multiSelectField = domElements.selectedBranchModels.closest('.floating-label-field');
    if (multiSelectField && window.floatingLabelManager) {
      const customMultiSelect = multiSelectField.querySelector('.custom-multi-select');
      if (customMultiSelect) {
        window.floatingLabelManager.updateCustomMultiSelectState(multiSelectField, customMultiSelect);
      }
    }
  }

}
