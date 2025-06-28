// Think Bot Options Page JavaScript
// Main entry point for the options page

// Import modules
import { domElements, domGroups } from './modules/dom-elements.js';
import { UIConfigManager } from './modules/ui-config-manager.js';
import { FormHandler } from './modules/form-handler.js';
import { QuickInputsManager } from './modules/quick-inputs.js';
import { ModelManager } from './modules/model-manager.js';
import { StorageUsageDisplay } from './modules/storage-usage.js';

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('Options') : console;

// Main Options Page Controller
class OptionsPage {
  
  constructor() {
    this.domElements = domElements;
    this.domGroups = domGroups;
    this.hasUnsavedChanges = false;
    this.isAutoSyncing = false;
    // Initialize ModelManager with change notification callback
    this.modelManager = new ModelManager(domElements, () => this.markAsChanged());
  }
  
  // Initialize the options page
  async init() {
    if (typeof syncManager === 'undefined') {
      logger.warn('Sync modules not loaded properly');
    }

    // Load current settings
    await this.loadSettings();

    // Initialize sortable functionality for both sections
    this.modelManager.initializeSortable();
    QuickInputsManager.initializeSortable(this.domElements);

    // Load cache statistics
    await this.loadCacheStats();

    // Initialize blacklist configuration
    if (typeof blacklistConfig !== 'undefined') {
      await blacklistConfig.init();
    } else {
      logger.warn('Blacklist configuration module not loaded');
    }

    // Set up event listeners
    this.setupEventListeners();

    // Apply initial theme if no config was loaded
    if (!this.domElements.theme.value) {
      this.applyTheme({ theme: 'system' });
    }
  }
  
  // Load settings from storage and populate form
  async loadSettings() {
    const config = await UIConfigManager.loadSettings();
    if (config) {
      // Initialize model manager first to populate model selector options
      this.modelManager.init(config, () => this.markAsChanged());

      // Then populate form with loaded config (including default model selection)
      FormHandler.populateForm(config, this.domElements);

      // Apply theme based on loaded configuration
      this.applyTheme(config);

      // Render quick inputs
      QuickInputsManager.renderQuickInputs(config.quickInputs || [], this.domElements);

      // Toggle appropriate settings based on current values
      FormHandler.toggleExtractionMethodSettings(this.domElements, this.domGroups);

      // Initialize storage usage display
      StorageUsageDisplay.init(this.domElements);

      // Load sync status after form is populated
      await this.loadSyncStatus();
    }
  }

  
  // Mark form as changed (has unsaved changes)
  markAsChanged() {
    this.hasUnsavedChanges = true;
    this.updateSaveButtonState();
  }
  
  // Update save button visual state
  updateSaveButtonState() {
    const saveBtn = this.domElements.saveBtn;
    if (!saveBtn) return;
    
    if (this.hasUnsavedChanges) {
      saveBtn.classList.remove('saved');
      saveBtn.classList.remove('error');
    }
  }
  
  // Manual save settings with validation and visual feedback
  async saveSettings() {
    const saveBtn = this.domElements.saveBtn;
    if (!saveBtn) return;
    
    logger.info('Saving settings');
    
    // Remove any existing error displays
    const existingError = document.getElementById('storageErrorDisplay');
    if (existingError) {
      existingError.remove();
    }
    
    try {
      // Build config from form
      const config = UIConfigManager.buildConfigFromForm(this.domElements, this.modelManager);

      // Build sync config from form
      const syncSettings = this.buildSyncConfigFromForm();

      // Validate configuration size before saving
      const sizeErrors = UIConfigManager.validateConfigurationSize(config);

      if (sizeErrors.length > 0) {
        logger.warn('Configuration size validation failed');
        UIConfigManager.displayStorageErrors(sizeErrors, saveBtn);
        return;
      }

      // Show saving state
      saveBtn.classList.add('saving');
      saveBtn.querySelector('span').textContent = 'Saving...';
      saveBtn.classList.add('saved');

      // Save config and sync settings
      const success = await UIConfigManager.saveSettings(config, syncSettings);
      
      if (success) {
        this.hasUnsavedChanges = false;
        
        // Show success state
        saveBtn.classList.remove('saving');
        
        saveBtn.querySelector('span').textContent = 'Saved!';
        
        // Update storage usage display after save
        StorageUsageDisplay.updateAllUsageDisplays(this.domElements);

        // Check if auto sync is enabled and perform sync
        if (syncSettings.enabled && typeof syncManager !== 'undefined') {
          logger.info('Auto sync enabled, performing sync after save');
          this.performAutoSyncAfterSave();
        }

        // Reset button state after 2 seconds
        setTimeout(() => {
          if (saveBtn.classList.contains('saved')) {
            saveBtn.classList.remove('saved');
            saveBtn.querySelector('span').textContent = 'Save';
          }
        }, 2000);
        
      } else {
        logger.error('Failed to save settings');
        this.showSaveError(saveBtn);
      }
    } catch (error) {
      logger.error('Error during save');
      this.showSaveError(saveBtn);
    }
  }
  
  // Show error state on save button
  showSaveError(saveBtn) {
    saveBtn.classList.remove('saving', 'saved');
    saveBtn.classList.add('error');
    saveBtn.querySelector('span').textContent = 'Error';
    
    // Reset button state after 3 seconds
    setTimeout(() => {
      saveBtn.classList.remove('error');
      saveBtn.querySelector('span').textContent = 'Save';
    }, 3000);
  }
  
  // Set up all event listeners
  setupEventListeners() {
    // Default extraction method toggle
    this.domElements.defaultExtractionMethod.addEventListener('change', () => {
      FormHandler.toggleExtractionMethodSettings(this.domElements, this.domGroups);
      this.markAsChanged();
    });
    
    // Set up change listeners for form inputs
    this.setupChangeListeners();
    
    // Save button click handler with debounce to prevent multiple rapid clicks
    let saveTimeout;
    const debouncedSaveSettings = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        this.saveSettings();
      }, 300); // 300ms debounce delay
    };

    this.domElements.saveBtn.addEventListener('click', debouncedSaveSettings);
    
    // Model manager will handle its own event listeners and change notifications
    
    // Reset settings button
    this.domElements.resetBtn.addEventListener('click', () => {
      UIConfigManager.resetSettings();
    });
    
    // Set up quick inputs event listeners
    QuickInputsManager.setupEventListeners(this.domElements, () => {
      this.markAsChanged();
    });

    // Clear All Cache button
    this.domElements.clearAllCacheBtn.addEventListener('click', () => {
      this.clearAllCache();
    });

    // Export configuration button
    this.domElements.exportConfigBtn.addEventListener('click', () => {
      this.exportConfiguration();
    });

    // Import configuration button
    this.domElements.importConfigBtn.addEventListener('click', () => {
      this.domElements.importConfigFile.click();
    });

    // Import configuration file input
    this.domElements.importConfigFile.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        this.importConfiguration(file);
        // Reset file input
        event.target.value = '';
      }
    });

    // Sync settings event listeners
    logger.info('Setting up sync event listeners...');
    this.setupSyncEventListeners();
  }
  
  // Setup change listeners for form inputs
  setupChangeListeners() {
    const inputs = [
      this.domElements.jinaApiKey,
      this.domElements.jinaResponseTemplate,
      this.domElements.contentDisplayHeight,
      this.domElements.systemPrompt,
      this.domElements.defaultModelSelect,
      this.domElements.theme,
      this.domElements.syncEnabled,
      this.domElements.gistToken,
      this.domElements.gistId
    ];

    inputs.forEach(input => {
      if (input) {
        const eventType = input.type === 'textarea' ? 'input' : 'change';
        input.addEventListener(eventType, () => {
          this.markAsChanged();

          // Apply theme immediately when theme selection changes
          if (input === this.domElements.theme) {
            const config = { theme: input.value };
            this.applyTheme(config);
          }
        });
      }
    });
  }
  
  // Load cache statistics and update the UI
  async loadCacheStats() {
    try {
      const items = await chrome.storage.local.get(null);
      let totalCacheCount = 0;
      let totalCacheSize = 0;
      let pageCacheCount = 0;
      let chatHistoryCount = 0;

      for (const key in items) {
        if (Object.prototype.hasOwnProperty.call(items, key)) {
          const dataSize = this.calculateDataSize(items[key]);

          if (key.startsWith(CACHE_KEYS.CHAT_PREFIX)) {
            chatHistoryCount++;
            totalCacheCount++;
            totalCacheSize += dataSize;
          } else if (key.startsWith(CACHE_KEYS.PAGE_PREFIX)) {
            // New unified page data storage (includes content, metadata, and pageState)
            totalCacheCount++;
            totalCacheSize += dataSize;
          }
        }
      }

      // Update unified cache display - only show storage size
      this.domElements.totalCacheDisplay.textContent = this.formatDataSize(totalCacheSize);

      logger.info(`Total cache stats: ${totalCacheCount} items (${this.formatDataSize(totalCacheSize)}) - Pages: ${pageCacheCount}, Chats: ${chatHistoryCount}`);
    } catch (error) {
      logger.error('Error loading cache statistics');
      this.domElements.totalCacheDisplay.textContent = 'Error';
    }
  }
  
  // Calculate the size of data in bytes
  calculateDataSize(data) {
    try {
      // Convert data to JSON string and calculate byte size
      const jsonString = JSON.stringify(data);
      return new Blob([jsonString]).size;
    } catch (error) {
      logger.warn('Error calculating data size');
      return 0;
    }
  }
  
  // Format data size for display
  formatDataSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(0)) + '' + units[i];
  }

  // Clear all cached data (pages, chats, states, and unified page data)
  async clearAllCache() {
    try {
      const items = await chrome.storage.local.get(null);
      const keysToRemove = [];
      for (const key in items) {
        if (key.startsWith(CACHE_KEYS.CHAT_PREFIX) ||
            key.startsWith(CACHE_KEYS.PAGE_PREFIX) ||
            key === CACHE_KEYS.RECENT_URLS) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        logger.info(`Cleared ${keysToRemove.length} cache items`);
      }

      // Reload cache stats to update UI
      await this.loadCacheStats();

    } catch (error) {
      logger.error('Error clearing cache');
      alert('Error clearing cache. See console for details.');
    }
  }

  // Export configuration to JSON file
  async exportConfiguration() {
    try {
      await UIConfigManager.exportConfiguration(this.domElements, this.modelManager);
    } catch (error) {
      logger.error('Error exporting configuration');
      alert('Failed to export configuration. Please check the console for details.');
    }
  }

  // Import configuration from JSON file
  async importConfiguration(file) {
    try {
      await UIConfigManager.importConfiguration(file, this.domElements, this.modelManager);
    } catch (error) {
      logger.error('Error importing configuration');
      alert('Failed to import configuration. Please check the console for details.');
    }
  }

  // Setup sync-related event listeners
  setupSyncEventListeners() {

    // Auto sync toggle
    this.domElements.syncEnabled.addEventListener('change', async (event) => {
      this.markAsChanged();

      if (event.target.checked) {
        // When enabled: test connection and perform sync
        await this.enableAutoSync();
      } else {
        // When disabled: clear status information
        this.disableAutoSync();
      }
    });

    // Sync configuration inputs
    [this.domElements.gistToken, this.domElements.gistId].forEach(input => {
      input.addEventListener('input', () => {
        this.markAsChanged();
        // Clear previous error messages when user starts typing
        this.updateSyncStatus('idle', 'Not configured');

        // If auto sync is enabled, disable it when credentials change
        if (this.domElements.syncEnabled.checked) {
          this.domElements.syncEnabled.checked = false;
          this.disableAutoSync();
        }
      });
    });
  }

  // Enable auto sync: test connection and perform initial sync
  async enableAutoSync() {
    try {
      const token = this.domElements.gistToken.value.trim();
      const gistId = this.domElements.gistId.value.trim();

      if (!token || !gistId) {
        const missingFields = [];
        if (!token) missingFields.push('GitHub Token');
        if (!gistId) missingFields.push('Gist ID');
        this.updateSyncStatus('error', `Missing ${missingFields.join(' and ')}`);
        this.domElements.syncEnabled.checked = false;
        return;
      }

      this.updateSyncStatus('testing', 'Testing connection...');

      // Test connection first
      const connectionResult = await this.testSyncConnection();

      if (connectionResult && connectionResult.success) {
        // Connection successful, now perform initial sync
        this.updateSyncStatus('syncing', 'Syncing...');

        if (typeof syncManager !== 'undefined') {
          try {
            // Save sync configuration first before attempting sync
            const syncSettings = this.buildSyncConfigFromForm();
            logger.info('Attempting to save sync settings:', {
              enabled: syncSettings.enabled,
              hasToken: !!syncSettings.gistToken,
              hasGistId: !!syncSettings.gistId,
              tokenLength: syncSettings.gistToken.length,
              gistIdLength: syncSettings.gistId.length
            });

            if (typeof syncConfig !== 'undefined') {
              const saveResult = await syncConfig.saveSyncConfig(syncSettings);
              logger.info('Sync configuration save result:', saveResult);

              if (!saveResult) {
                this.updateSyncStatus('error', 'Failed to save sync configuration');
                this.domElements.syncErrorMessage.textContent = 'Failed to save sync configuration';
                this.domElements.syncErrorMessage.style.display = 'block';
                this.domElements.syncEnabled.checked = false;
                return;
              }

              // Wait a moment for the save to complete
              await new Promise(resolve => setTimeout(resolve, 200));

              // Verify the save worked
              const verifyConfig = await syncConfig.getSyncConfig();
              logger.info('Verified saved config:', {
                hasToken: !!verifyConfig.gistToken,
                hasGistId: !!verifyConfig.gistId,
                tokenLength: verifyConfig.gistToken ? verifyConfig.gistToken.length : 0,
                gistIdLength: verifyConfig.gistId ? verifyConfig.gistId.length : 0
              });

              if (!verifyConfig.gistToken || !verifyConfig.gistId) {
                this.updateSyncStatus('error', 'Configuration not saved properly');
                this.domElements.syncErrorMessage.textContent = 'Configuration was not saved properly. Please try again.';
                this.domElements.syncErrorMessage.style.display = 'block';
                this.domElements.syncEnabled.checked = false;
                return;
              }
            }

            // Perform sync operation
            const syncResult = await syncManager.fullSync();
            if (syncResult.success) {
              this.updateSyncStatus('success', 'Synchronized');

              // Reload sync status to get the updated lastSyncTime from syncConfig
              try {
                const status = await syncManager.getSyncStatus();
                if (status.lastSyncTime) {
                  const lastSyncDate = new Date(status.lastSyncTime);
                  this.domElements.syncLastTime.textContent = `Last sync: ${lastSyncDate.toLocaleString()}`;
                } else {
                  // Fallback to current time if syncConfig doesn't have lastSyncTime yet
                  const now = new Date();
                  this.domElements.syncLastTime.textContent = `Last sync: ${now.toLocaleString()}`;
                }
              } catch (statusError) {
                // Fallback to current time if we can't get status
                const now = new Date();
                this.domElements.syncLastTime.textContent = `Last sync: ${now.toLocaleString()}`;
                logger.warn('Could not reload sync status after successful sync:', statusError);
              }

              // Hide any error messages
              this.domElements.syncErrorMessage.style.display = 'none';

              logger.info('Auto sync enabled and initial sync completed');
            } else {
              this.updateSyncStatus('error', 'Sync failed after connection test');
              this.domElements.syncErrorMessage.textContent = syncResult.error || 'Sync operation failed';
              this.domElements.syncErrorMessage.style.display = 'block';
              this.domElements.syncEnabled.checked = false;
            }
          } catch (syncError) {
            logger.error('Error during initial sync:', syncError);
            this.updateSyncStatus('error', 'Initial sync failed');
            this.domElements.syncErrorMessage.textContent = syncError.message;
            this.domElements.syncErrorMessage.style.display = 'block';
            this.domElements.syncEnabled.checked = false;
          }
        } else {
          this.updateSyncStatus('success', 'Auto sync enabled (sync manager not available)');

          // Update last sync time display even when sync manager is not available
          const now = new Date();
          this.domElements.syncLastTime.textContent = `Last sync: ${now.toLocaleString()}`;
        }
      } else {
        // Connection failed, disable auto sync
        this.domElements.syncEnabled.checked = false;
        this.updateSyncStatus('error', 'Connection failed - Auto sync disabled');
        this.domElements.syncErrorMessage.textContent = connectionResult.error || 'Connection test failed';
        this.domElements.syncErrorMessage.style.display = 'block';
      }
    } catch (error) {
      logger.error('Error enabling auto sync:', error);
      this.updateSyncStatus('error', 'Failed to enable auto sync');
      this.domElements.syncErrorMessage.textContent = error.message;
      this.domElements.syncErrorMessage.style.display = 'block';
      this.domElements.syncEnabled.checked = false;
    }
  }

  // Disable auto sync: clear status information
  disableAutoSync() {
    try {
      // Clear status display
      this.updateSyncStatus('idle', 'Not configured');

      // Hide error messages
      this.domElements.syncErrorMessage.style.display = 'none';
      this.domElements.syncErrorMessage.textContent = '';

      // Reset last sync time
      this.domElements.syncLastTime.textContent = 'Never synced';

      logger.info('Auto sync disabled and status cleared');
    } catch (error) {
      logger.error('Error disabling auto sync:', error);
    }
  }

  // Perform auto-sync on page load if enabled
  async performAutoSync() {
    // Prevent concurrent syncs
    if (this.isAutoSyncing) return;
    this.isAutoSyncing = true;

    if (typeof syncManager === 'undefined') {
      logger.warn('Sync manager not available, skipping auto-sync.');
      this.isAutoSyncing = false;
      return;
    }

    logger.info('Auto-sync enabled, performing sync on page load.');
    this.updateSyncStatus('syncing', 'Syncing...');

    try {
      await syncManager.fullSync();
    } catch (error) {
      logger.error('An error occurred during auto-sync:', error);
    } finally {
      // After sync attempt, reload status from storage to reflect the final state
      const status = await syncManager.getSyncStatus();
      this.displaySyncStatus(status);
      this.isAutoSyncing = false; // Reset flag
    }
  }

  // Perform auto-sync after saving configuration
  async performAutoSyncAfterSave() {
    // Prevent concurrent syncs
    if (this.isAutoSyncing) {
      logger.info('Auto sync already in progress, skipping sync after save');
      return;
    }

    this.isAutoSyncing = true;

    if (typeof syncManager === 'undefined') {
      logger.warn('Sync manager not available, skipping auto-sync after save.');
      this.isAutoSyncing = false;
      return;
    }

    logger.info('Performing auto-sync after configuration save');
    this.updateSyncStatus('syncing', 'Auto-syncing after save...');

    try {
      const syncResult = await syncManager.fullSync();
      if (syncResult.success) {
        this.updateSyncStatus('success', 'Auto-sync completed');
        logger.info('Auto-sync after save completed successfully');
      } else {
        this.updateSyncStatus('error', syncResult.message || 'Auto-sync failed');
        logger.error('Auto-sync after save failed:', syncResult.error);
      }
    } catch (error) {
      logger.error('An error occurred during auto-sync after save:', error);
      this.updateSyncStatus('error', 'Sync failed');
    } finally {
      // After sync attempt, reload status from storage to reflect the final state
      const status = await syncManager.getSyncStatus();
      this.displaySyncStatus(status);
      this.isAutoSyncing = false; // Reset flag
    }
  }

  // Load and display current sync status
  async loadSyncStatus() {
    try {
      if (typeof syncManager !== 'undefined') {
        const status = await syncManager.getSyncStatus();
        this.displaySyncStatus(status);

        // Note: Removed automatic sync on page load as per user request
        // Users must manually enable auto sync to trigger sync operations
        logger.info('Sync status loaded. Auto sync on page load is disabled.');
      }
    } catch (error) {
      logger.error('Error loading sync status:', error);
      this.updateSyncStatus('error', 'Failed to load sync status');
    }
  }

  // Display sync status in UI
  displaySyncStatus(status) {
    const statusText = this.getSyncStatusText(status);
    this.updateSyncStatus(status.status, statusText);

    // Update last sync time
    if (status.lastSyncTime) {
      const lastSyncDate = new Date(status.lastSyncTime);
      this.domElements.syncLastTime.textContent = `Last sync: ${lastSyncDate.toLocaleString()}`;
    } else {
      this.domElements.syncLastTime.textContent = 'Never synced';
    }

    // Show error message if any
    if (status.lastError) {
      this.domElements.syncErrorMessage.textContent = status.lastError;
      this.domElements.syncErrorMessage.style.display = 'block';
    } else {
      this.domElements.syncErrorMessage.style.display = 'none';
    }
  }

  // Get human-readable status text
  getSyncStatusText(status) {
    switch (status.status) {
      case 'idle':
        return status.isConfigured ? 'Ready to sync' : 'Not configured';
      case 'testing':
        return 'Testing connection...';
      case 'uploading':
        return 'Uploading data...';
      case 'downloading':
        return 'Downloading data...';
      case 'syncing':
        return 'Syncing data...';
      case 'success':
        return status.enabled ? 'Auto sync enabled' : 'Connected and ready';
      case 'error':
        return 'Configuration error';
      default:
        return 'Unknown status';
    }
  }

  // Update sync status indicator
  updateSyncStatus(status, message) {
    const indicator = this.domElements.syncStatusIndicator;
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');

    // Remove all status classes
    dot.className = 'status-dot';
    // Add current status class
    dot.classList.add(status);

    text.textContent = message;
  }

  // Test sync connection
  async testSyncConnection() {
    logger.info('testSyncConnection called');
    try {
      const token = this.domElements.gistToken.value.trim();
      const gistId = this.domElements.gistId.value.trim();

      if (!token || !gistId) {
        const result = { success: false, error: 'Token and Gist ID required' };
        this.updateSyncStatus('error', result.error);
        return result;
      }

      logger.info('Testing connection via background script...');

      // Use background script to handle network requests to avoid CORS issues
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_SYNC_CONNECTION',
        token: token,
        gistId: gistId
      });

      logger.info('Background script response:', response);

      if (response.type === 'TEST_SYNC_CONNECTION_RESULT') {
        if (response.success) {
          // Log gist info if available
          if (response.gistInfo) {
            logger.info('Gist info:', response.gistInfo);
          }

          return {
            success: true,
            message: response.message || 'Connection successful',
            gistInfo: response.gistInfo
          };
        } else {
          return {
            success: false,
            error: response.error || 'Unknown error',
            message: response.message || 'Connection failed'
          };
        }
      } else if (response.type === 'ERROR') {
        return {
          success: false,
          error: response.error || 'Background script error'
        };
      } else {
        return {
          success: false,
          error: 'Unexpected response from background script'
        };
      }
    } catch (error) {
      logger.error('Error testing sync connection:', error);
      return {
        success: false,
        error: error.message || 'Test failed'
      };
    }
  }

  // Validate sync configuration
  validateSyncConfig() {
    const token = this.domElements.gistToken.value.trim();
    const gistId = this.domElements.gistId.value.trim();

    const errors = [];
    if (!token) errors.push('GitHub Token is required');
    if (!gistId) errors.push('Gist ID is required');

    return {
      isValid: errors.length === 0,
      errors: errors,
      token: token,
      gistId: gistId
    };
  }

  // Build sync configuration from form
  buildSyncConfigFromForm() {
    return {
      enabled: this.domElements.syncEnabled.checked, // Auto sync enabled/disabled
      gistToken: this.domElements.gistToken.value.trim(),
      gistId: this.domElements.gistId.value.trim(),
      lastSyncTime: null, // Will be updated by sync operations
      syncStatus: 'idle',
      lastError: null,
      autoSync: this.domElements.syncEnabled.checked // Legacy field, same as enabled
    };
  }

  /**
   * Apply theme based on configuration
   * @param {Object} config - The application configuration
   */
  applyTheme(config) {
    const theme = config.theme || 'system';
    const body = document.body;

    // Remove existing theme classes
    body.classList.remove('dark-theme');

    if (theme === 'dark') {
      body.classList.add('dark-theme');
    } else if (theme === 'light') {
      // Light theme is default, no class needed
    } else {
      // System theme - check user's system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        body.classList.add('dark-theme');
      }
    }

    logger.info(`Applied theme: ${theme}`);
  }
}

// Initialize the options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const optionsPage = new OptionsPage();
  optionsPage.init();
});