// Think Bot Options Page JavaScript
// Main entry point for the options page

// Import modules
import { domElements, domGroups } from './modules/dom-elements.js';
import { UIConfigManager } from './modules/ui-config-manager.js';
import { FormHandler } from './modules/form-handler.js';
import { QuickInputsManager } from './modules/quick-inputs.js';
import { ModelManager } from './modules/model-manager.js';
import { blacklistConfig } from './modules/blacklist-config.js';
import { i18n } from '../js/modules/i18n.js';
import { confirmationDialog } from '../js/modules/ui/confirmation-dialog.js';

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('Options') : console;

// Main Options Page Controller
class OptionsPage {
  
  constructor() {
    this.domElements = domElements;
    this.domGroups = domGroups;
    this.hasUnsavedChanges = false;
    this.isAutoSyncing = false;
    this.isInitializing = true; // Add initialization flag to prevent accidental syncEnabled reset during page load
    this.activeTab = 'basic';
    this.quickInputsOrderLastModified = 0;
    this.modelOrderLastModified = 0;
    // Initialize ModelManager with change notification callback
    this.modelManager = new ModelManager(domElements, (changeType) => {
      if (changeType === 'order') {
        this.touchModelOrderLastModified();
      }
      this.markAsChanged();
      this.updateBranchModelSelector(); // Update branch model selector when models change
    });
  }
  
  // Initialize the options page
  async init() {
    // Initialize i18n system first
    await i18n.init();

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
    await blacklistConfig.init();

    // Set up event listeners
    this.setupEventListeners();

    // Set up tab navigation
    this.setupTabNavigation();

    // Apply initial theme if no config was loaded
    if (!this.domElements.theme.value) {
      this.applyTheme({ basic: { theme: 'system' } });
    }

    // Setup language switcher
    this.setupLanguageSwitcher();

    // Ensure language selector shows current language
    this.updateLanguageSelector();

    // Check for and display any caught errors
    this.displayCaughtError();
  }

  setupTabNavigation() {
    this.tabButtons = Array.from(document.querySelectorAll('.tab-button'));
    this.tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

    if (!this.tabButtons.length || !this.tabPanels.length) {
      return;
    }

    this.tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tabTarget;
        if (targetTab) {
          this.switchTab(targetTab);
        }
      });
    });

    this.switchTab(this.activeTab);
  }

  switchTab(tabId) {
    if (!this.tabButtons || !this.tabPanels) {
      return;
    }

    const availableTabs = this.tabPanels.map(panel => panel.id.replace('tab-', ''));
    const targetTab = availableTabs.includes(tabId) ? tabId : (availableTabs[0] || 'basic');
    const targetPanelId = `tab-${targetTab}`;

    this.tabButtons.forEach((button) => {
      const isActive = button.dataset.tabTarget === targetTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    this.tabPanels.forEach((panel) => {
      const isActive = panel.id === targetPanelId;
      panel.classList.toggle('active', isActive);
      panel.toggleAttribute('hidden', !isActive);
    });

    this.activeTab = targetTab;
  }

  // Load settings from storage and populate form
  async loadSettings() {
    const config = await UIConfigManager.loadSettings();
    if (config) {
      // Initialize model manager first to populate model selector options
      this.modelManager.init(config, (changeType) => {
        if (changeType === 'order') {
          this.touchModelOrderLastModified();
        }
        this.markAsChanged();
      });

      // Then populate form with loaded config (including default model selection)
      FormHandler.populateForm(config, this.domElements);

      // Initialize branch model selector
      this.initializeBranchModelSelector(config);

      this.initializeOrderTimestamps(config);

      // Apply theme based on loaded configuration
      this.applyTheme(config);

      // Render quick inputs
      QuickInputsManager.renderQuickInputs(config.quickInputs || [], this.domElements, this.modelManager);

      // Toggle appropriate settings based on current values
      FormHandler.toggleExtractionMethodSettings(this.domElements, this.domGroups);
      
      // Load sync settings and update storage type UI
      const loadedStorageType = await FormHandler.populateSyncSettings(this.domElements);
      this.toggleStorageTypeSettings();

      // Load sync status after form is populated
      await this.loadSyncStatus();
    }
    
    // Initialize floating label manager after form is populated
    if (window.floatingLabelManager) {
      window.floatingLabelManager.refresh();
    }
    
    logger.info('Options page loaded, current storage type:', this.domElements.storageType.value);
    logger.info('Options page loaded, syncEnabled state:', {
      checked: this.domElements.syncEnabled.checked,
      value: this.domElements.syncEnabled.value,
      disabled: this.domElements.syncEnabled.disabled
    });
    
    // Mark initialization complete, allow event listeners to work normally
    this.isInitializing = false;
    logger.info('Initialization complete; event listeners are now active');
  }

  
  // Mark form as changed (has unsaved changes)
  markAsChanged() {
    this.hasUnsavedChanges = true;
    this.updateSaveButtonState();
  }

  initializeOrderTimestamps(config) {
    const quickInputs = config.quickInputs || [];
    const models = config.llm_models?.models || [];

    this.quickInputsOrderLastModified = config.quickInputsOrderLastModified || this.deriveLatestTimestamp(quickInputs);
    this.modelOrderLastModified = config.llm_models?.orderLastModified || this.deriveLatestTimestamp(models);
  }

  deriveLatestTimestamp(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return 0;
    }
    return items.reduce((latest, item) => {
      const timestamp = item?.lastModified || 0;
      return timestamp > latest ? timestamp : latest;
    }, 0);
  }

  getQuickInputsOrderLastModified() {
    return this.quickInputsOrderLastModified || 0;
  }

  touchQuickInputsOrderLastModified() {
    this.quickInputsOrderLastModified = Date.now();
  }

  getModelOrderLastModified() {
    return this.modelOrderLastModified || 0;
  }

  touchModelOrderLastModified() {
    this.modelOrderLastModified = Date.now();
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


      // Show saving state
      saveBtn.classList.add('saving');
      saveBtn.querySelector('span').textContent = i18n.getMessage('options_js_saving');
      saveBtn.classList.add('saved');

      // Save config and sync settings
      const result = await UIConfigManager.saveSettings(config, syncSettings);
      
      if (result.success) {
        this.hasUnsavedChanges = false;
        
        // Show success state
        saveBtn.classList.remove('saving');
        
        saveBtn.querySelector('span').textContent = i18n.getMessage('options_js_saved');
        

        // Re-render quick inputs to remove any empty items that were filtered out during save
        QuickInputsManager.renderQuickInputs(config.quickInputs || [], this.domElements, this.modelManager);

        // Check if auto sync is enabled and perform sync
        if (syncSettings.enabled && typeof syncManager !== 'undefined') {
          logger.info('Auto sync enabled, performing sync after save');
          await this.performAutoSyncAfterSave(saveBtn);
        } else {
          // Reset button state after 2 seconds if no sync is needed
          setTimeout(() => {
            if (saveBtn.classList.contains('saved')) {
              saveBtn.classList.remove('saved');
              saveBtn.querySelector('span').textContent = i18n.getMessage('common_save');
            }
          }, 2000);
        }
        
      } else {
        logger.error('Failed to save settings:', result.error);
        this.showSaveError(saveBtn, result.error);
      }
    } catch (error) {
      // Log detailed error for easier debugging
      logger.error('Error during save:', error);
      this.showSaveError(saveBtn, error?.message);
    }
  }

  // Save settings and force a sync operation regardless of auto-sync toggle
  async saveAndSync() {
    const saveBtn = this.domElements.saveBtn;
    try {
      // First save using existing save logic (but avoid double UI updates)
      // Build config from form
      const config = UIConfigManager.buildConfigFromForm(this.domElements, this.modelManager);
      const syncSettings = this.buildSyncConfigFromForm();

      // Show visual saving state on the Save & Sync button if available
      const syncBtn = this.domElements.saveAndSyncBtn;
      if (syncBtn) {
        syncBtn.classList.add('saving');
        syncBtn.querySelector('span').textContent = i18n.getMessage('options_js_saving');
      }

      const result = await UIConfigManager.saveSettings(config, syncSettings);
      if (result.success) {
        this.hasUnsavedChanges = false;

        // Re-render quick inputs
        QuickInputsManager.renderQuickInputs(config.quickInputs || [], this.domElements, this.modelManager);

        // Perform sync using syncManager if available
        if (typeof syncManager !== 'undefined') {
          try {
            this.updateSyncStatus('syncing', i18n.getMessage('common_syncing'));
            const syncResult = await syncManager.fullSync();
            if (syncResult.success) {
              this.updateSyncStatus('success', i18n.getMessage('options_js_sync_completed_successfully'));
              
              // Clean up soft-deleted models after successful sync
              this.modelManager.cleanupDeletedModels();
              
              if (syncBtn) {
                syncBtn.classList.remove('saving');
                syncBtn.classList.add('saved');
                syncBtn.querySelector('span').textContent = i18n.getMessage('options_js_sync_synced');
              }
            } else {
              this.updateSyncStatus('error', syncResult.error || i18n.getMessage('options_js_sync_operation_failed'));
              if (syncBtn) {
                syncBtn.classList.remove('saving');
                syncBtn.classList.add('error');
                syncBtn.querySelector('span').textContent = i18n.getMessage('options_js_sync_error');
              }
            }
          } catch (syncError) {
            logger.error('Error during explicit saveAndSync:', syncError);
            this.updateSyncStatus('error', i18n.getMessage('options_js_sync_operation_failed'));
            if (syncBtn) {
              syncBtn.classList.remove('saving');
              syncBtn.classList.add('error');
              syncBtn.querySelector('span').textContent = i18n.getMessage('options_js_sync_error');
            }
          }
        } else {
          // No sync manager available
          this.updateSyncStatus('idle', i18n.getMessage('options_sync_status_not_configured'));
          if (syncBtn) {
            syncBtn.classList.remove('saving');
            syncBtn.classList.add('saved');
            syncBtn.querySelector('span').textContent = i18n.getMessage('options_js_saved');
          }
        }
      } else {
        // Save failed
        this.showSaveError(saveBtn, result.error);
        if (this.domElements.saveAndSyncBtn) {
          const b = this.domElements.saveAndSyncBtn;
          b.classList.remove('saving');
          b.classList.add('error');
        }
      }
    } catch (error) {
      logger.error('Unexpected error in saveAndSync:', error);
      this.showSaveError(saveBtn, error?.message);
      if (this.domElements.saveAndSyncBtn) {
        const b = this.domElements.saveAndSyncBtn;
        b.classList.remove('saving');
        b.classList.add('error');
      }
    } finally {
      // Reset Save & Sync button text after a short delay
      if (this.domElements.saveAndSyncBtn) {
        setTimeout(() => {
          const b = this.domElements.saveAndSyncBtn;
          b.classList.remove('saved', 'error', 'saving');
          b.querySelector('span').textContent = i18n.getMessage('options_save_and_sync') || 'Save & Sync';
        }, 3000);
      }
    }
  }
  
  // Show error state on save button
  showSaveError(saveBtn, error = null) {
    saveBtn.classList.remove('saving', 'saved');
    saveBtn.classList.add('error');
    saveBtn.querySelector('span').textContent = i18n.getMessage('options_js_error');

    if (error) {
        const errorDisplayContainer = document.getElementById('errorDisplayContainer');
        const errorDisplayContent = document.getElementById('errorDisplayContent');
        if (errorDisplayContainer && errorDisplayContent) {
            errorDisplayContent.textContent = `Save failed: ${error}\n\nThis is likely due to exceeding storage capacity. Please export your settings, then reset the extension or clear some large quick inputs.`;
            errorDisplayContainer.style.display = 'block';
        }
    }
    
    // Reset button state after 3 seconds
    setTimeout(() => {
      saveBtn.classList.remove('error');
      saveBtn.querySelector('span').textContent = i18n.getMessage('common_save');
    }, 3000);
  }
  
  // Set up all event listeners
  setupEventListeners() {
    // Default extraction method toggle
    this.domElements.defaultExtractionMethod.addEventListener('change', () => {
      FormHandler.toggleExtractionMethodSettings(this.domElements, this.domGroups);
      this.markAsChanged();
    });
    
    // Storage type toggle
    this.domElements.storageType.addEventListener('change', () => {
      this.toggleStorageTypeSettings();
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
    // Save & Sync button - triggers save then immediate sync regardless of auto-sync toggle
    if (this.domElements.saveAndSyncBtn) {
      this.domElements.saveAndSyncBtn.addEventListener('click', async () => {
        await this.saveAndSync();
      });
    }
    
    // Model manager will handle its own event listeners and change notifications
    
    // Reset settings button
    this.domElements.resetBtn.addEventListener('click', () => {
      UIConfigManager.resetSettings();
    });
    
    // Set up quick inputs event listeners
    QuickInputsManager.setupEventListeners(this.domElements, (changeType) => {
      if (changeType === 'order') {
        this.touchQuickInputsOrderLastModified();
      }
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
      this.domElements.languageSelector,
      this.domElements.filterCOT,
      this.domElements.syncEnabled,
      this.domElements.storageType,
      this.domElements.gistToken,
      this.domElements.gistId,
      this.domElements.webdavUrl,
      this.domElements.webdavUsername,
      this.domElements.webdavPassword
    ];

    inputs.forEach(input => {
      if (input) {
        const eventType = input.type === 'textarea' ? 'input' : 'change';
        input.addEventListener(eventType, () => {
          this.markAsChanged();

          // Apply theme immediately when theme selection changes
          if (input === this.domElements.theme) {
            const config = { basic: { theme: input.value } };
            this.applyTheme(config);
          }
        });
      }
    });
  }

  // Toggle storage type settings visibility
  toggleStorageTypeSettings() {
    const storageType = this.domElements.storageType.value;
    const gistGroup = this.domGroups.gistConfigGroup;
    const webdavGroup = this.domGroups.webdavConfigGroup;

    if (storageType === 'gist') {
      gistGroup.style.display = 'block';
      webdavGroup.style.display = 'none';
    } else if (storageType === 'webdav') {
      gistGroup.style.display = 'none';
      webdavGroup.style.display = 'block';
    }

    // Clear sync status when storage type changes
    this.updateSyncStatus('idle', i18n.getMessage('options_sync_status_not_configured'));
    this.domElements.syncErrorMessage.style.display = 'none';
    
    // Only automatically disable auto sync when user actually changes storage type (not during initialization)
    if (!this.isInitializing && this.domElements.syncEnabled.checked) {
      this.domElements.syncEnabled.checked = false;
      this.disableAutoSync();
    }
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
      logger.error(i18n.getMessage('options_js_cache_stats_error'), error);
      this.domElements.totalCacheDisplay.textContent = i18n.getMessage('options_js_error');
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
    // Get clear cache button for positioning
    const clearBtn = this.domElements.clearAllCacheBtn;
    
    confirmationDialog.confirmClear({
      target: clearBtn,
      message: i18n.getMessage('options_confirm_clear_all_cache') || 'Are you sure you want to clear all cached data? This action cannot be undone.',
      confirmText: i18n.getMessage('common_clear') || 'Clear',
      cancelText: i18n.getMessage('common_cancel') || 'Cancel',
      onConfirm: async () => {
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
          logger.error('Error clearing cache', error);
          alert(i18n.getMessage('options_js_clear_cache_error'));
        }
      }
    });
  }

  // Export configuration to JSON file
  async exportConfiguration() {
    try {
      await UIConfigManager.exportConfiguration(this.domElements, this.modelManager);
    } catch (error) {
      logger.error('Error exporting configuration', error);
      alert(i18n.getMessage('options_js_export_error'));
    }
  }

  // Import configuration from JSON file
  async importConfiguration(file) {
    try {
      await UIConfigManager.importConfiguration(file, this.domElements, this.modelManager);
    } catch (error) {
      logger.error('Error importing configuration', error);
      alert(i18n.getMessage('options_js_import_error'));
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

    // Sync configuration inputs - including all gist and webdav related fields
    [
      this.domElements.gistToken, 
      this.domElements.gistId,
      this.domElements.webdavUrl,
      this.domElements.webdavUsername,
      this.domElements.webdavPassword
    ].forEach(input => {
      input.addEventListener('input', () => {
        this.markAsChanged();
        // Clear previous error messages when user starts typing
        this.updateSyncStatus('idle', 'Not configured');

        // Only automatically disable sync when page initialization is complete and user manually changes credentials
        if (!this.isInitializing && this.domElements.syncEnabled.checked) {
          logger.info('User changed sync credentials, automatically disabling sync functionality');
          this.domElements.syncEnabled.checked = false;
          this.disableAutoSync();
        }
      });
    });
  }

  // Enable auto sync: test connection and perform initial sync
  async enableAutoSync() {
    try {
      // Use the existing validateSyncConfig method to check configuration for both Gist and WebDAV
      const validation = this.validateSyncConfig();
      
      if (!validation.isValid) {
        this.updateSyncStatus('error', i18n.getMessage('options_js_sync_missing_fields', { fields: validation.errors.join(', ') }));
        this.domElements.syncEnabled.checked = false;
        return;
      }

      this.updateSyncStatus('testing', i18n.getMessage('options_js_sync_testing_connection'));

      // Test connection first
      const connectionResult = await this.testSyncConnection();

      if (connectionResult && connectionResult.success) {
        // Connection successful, now perform initial sync
        this.updateSyncStatus('syncing', i18n.getMessage('common_syncing'));

        if (typeof syncManager !== 'undefined') {
          try {
            // Save sync configuration first before attempting sync
            const syncSettings = this.buildSyncConfigFromForm();
            const storageType = syncSettings.storageType;
            
            if (storageType === 'gist') {
              logger.info('Attempting to save Gist sync settings:', {
                enabled: syncSettings.enabled,
                storageType: storageType,
                hasToken: !!syncSettings.gistToken,
                hasGistId: !!syncSettings.gistId,
                tokenLength: syncSettings.gistToken.length,
                gistIdLength: syncSettings.gistId.length
              });
            } else if (storageType === 'webdav') {
              logger.info('Attempting to save WebDAV sync settings:', {
                enabled: syncSettings.enabled,
                storageType: storageType,
                hasWebdavUrl: !!syncSettings.webdavUrl,
                hasWebdavUsername: !!syncSettings.webdavUsername,
                hasWebdavPassword: !!syncSettings.webdavPassword,
                webdavUrlLength: syncSettings.webdavUrl.length,
                webdavUsernameLength: syncSettings.webdavUsername.length
              });
            }

            if (typeof syncConfig !== 'undefined') {
              const saveResult = await syncConfig.saveSyncConfig(syncSettings);
              logger.info('Sync configuration save result:', saveResult);

              if (!saveResult) {
                this.updateSyncStatus('error', i18n.getMessage('options_js_sync_save_config_error'));
                this.domElements.syncErrorMessage.textContent = i18n.getMessage('options_js_sync_save_config_error');
                this.domElements.syncErrorMessage.style.display = 'block';
                this.domElements.syncEnabled.checked = false;
                return;
              }

              // Wait a moment for the save to complete
              await new Promise(resolve => setTimeout(resolve, 200));

              // Verify the save worked based on storage type
              const verifyConfig = await syncConfig.getSyncConfig();
              
              let configValid = false;
              if (verifyConfig.storageType === 'gist') {
                logger.info('Verified saved Gist config:', {
                  storageType: verifyConfig.storageType,
                  hasToken: !!verifyConfig.gistToken,
                  hasGistId: !!verifyConfig.gistId,
                  tokenLength: verifyConfig.gistToken ? verifyConfig.gistToken.length : 0,
                  gistIdLength: verifyConfig.gistId ? verifyConfig.gistId.length : 0
                });
                configValid = !!(verifyConfig.gistToken && verifyConfig.gistId);
              } else if (verifyConfig.storageType === 'webdav') {
                logger.info('Verified saved WebDAV config:', {
                  storageType: verifyConfig.storageType,
                  hasWebdavUrl: !!verifyConfig.webdavUrl,
                  hasWebdavUsername: !!verifyConfig.webdavUsername,
                  hasWebdavPassword: !!verifyConfig.webdavPassword,
                  webdavUrlLength: verifyConfig.webdavUrl ? verifyConfig.webdavUrl.length : 0,
                  webdavUsernameLength: verifyConfig.webdavUsername ? verifyConfig.webdavUsername.length : 0
                });
                configValid = !!(verifyConfig.webdavUrl && verifyConfig.webdavUsername && verifyConfig.webdavPassword);
              }

              if (!configValid) {
                this.updateSyncStatus('error', i18n.getMessage('options_js_sync_config_not_saved_properly'));
                this.domElements.syncErrorMessage.textContent = i18n.getMessage('options_js_sync_config_not_saved_properly_details');
                this.domElements.syncErrorMessage.style.display = 'block';
                this.domElements.syncEnabled.checked = false;
                return;
              }
            }

            // Perform sync operation
            const syncResult = await syncManager.fullSync();
            if (syncResult.success) {
              // Clean up soft-deleted models after successful initial sync
              this.modelManager.cleanupDeletedModels();
              
              // Reload sync status to get the updated lastSyncTime from syncConfig
              try {
                const status = await syncManager.getSyncStatus();
                this.updateSyncStatus('success', i18n.getMessage('options_js_sync_completed_successfully'), status.lastSyncTime);
              } catch (statusError) {
                // Fallback to current time if we can't get status
                this.updateSyncStatus('success', i18n.getMessage('options_js_sync_completed_successfully'));
                logger.warn('Could not reload sync status after successful sync:', statusError);
              }

              // Hide any error messages
              this.domElements.syncErrorMessage.style.display = 'none';

              logger.info('Auto sync enabled and initial sync completed');
            } else {
              this.updateSyncStatus('error', i18n.getMessage('options_js_sync_failed_after_test'));
              this.domElements.syncErrorMessage.textContent = syncResult.error || i18n.getMessage('options_js_sync_operation_failed');
              this.domElements.syncErrorMessage.style.display = 'block';
              this.domElements.syncEnabled.checked = false;
            }
          } catch (syncError) {
            logger.error('Error during initial sync:', syncError);
            this.updateSyncStatus('error', i18n.getMessage('options_js_sync_initial_sync_failed'));
            this.domElements.syncErrorMessage.textContent = syncError.message;
            this.domElements.syncErrorMessage.style.display = 'block';
            this.domElements.syncEnabled.checked = false;
          }
        } else {
          this.updateSyncStatus('success', i18n.getMessage('options_js_sync_completed_successfully'));
        }
      } else {
        // Connection failed, disable auto sync
        this.domElements.syncEnabled.checked = false;
        this.updateSyncStatus('error', i18n.getMessage('options_js_sync_connection_failed_disabled'));
        this.domElements.syncErrorMessage.textContent = connectionResult.error || i18n.getMessage('options_js_sync_connection_test_failed');
        this.domElements.syncErrorMessage.style.display = 'block';
      }
    } catch (error) {
      logger.error('Error enabling auto sync:', error);
      this.updateSyncStatus('error', i18n.getMessage('options_js_sync_enable_auto_sync_failed'));
      this.domElements.syncErrorMessage.textContent = error.message;
      this.domElements.syncErrorMessage.style.display = 'block';
      this.domElements.syncEnabled.checked = false;
    }
  }

  // Disable auto sync: clear status information
  disableAutoSync() {
    try {
      // Clear status display
      this.updateSyncStatus('idle', i18n.getMessage('options_sync_status_not_configured'));

      // Hide error messages
      this.domElements.syncErrorMessage.style.display = 'none';
      this.domElements.syncErrorMessage.textContent = '';

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
  async performAutoSyncAfterSave(saveBtn) {
    // Prevent concurrent syncs
    if (this.isAutoSyncing) {
      logger.info('Auto sync already in progress, skipping sync after save');
      return;
    }

    this.isAutoSyncing = true;

    if (typeof syncManager === 'undefined') {
      logger.warn('Sync manager not available, skipping auto-sync after save.');
      this.isAutoSyncing = false;
      // Reset button state if sync manager is not available
      if (saveBtn) {
        setTimeout(() => {
          if (saveBtn.classList.contains('saved')) {
            saveBtn.classList.remove('saved');
            saveBtn.querySelector('span').textContent = 'Save';
          }
        }, 2000);
      }
      return;
    }

    logger.info('Performing auto-sync after configuration save');

    // Update save button to show syncing state
    if (saveBtn) {
      saveBtn.classList.remove('saved');
      saveBtn.classList.add('syncing');
      saveBtn.querySelector('span').textContent = i18n.getMessage('common_syncing');
    }

    this.updateSyncStatus('syncing', 'Auto-syncing after save...');

    try {
      const syncResult = await syncManager.fullSync();
      if (syncResult.success) {
        this.updateSyncStatus('success', i18n.getMessage('options_js_sync_completed_successfully'));
        logger.info('Auto-sync after save completed successfully');

        // Clean up soft-deleted models after successful sync
        this.modelManager.cleanupDeletedModels();

        // Update save button to show sync success
        if (saveBtn) {
          saveBtn.classList.remove('syncing');
          saveBtn.classList.add('saved');
          saveBtn.querySelector('span').textContent = i18n.getMessage('options_js_sync_synced');
        }
      } else {
        this.updateSyncStatus('error', syncResult.message || 'Auto-sync failed');
        logger.error('Auto-sync after save failed:', syncResult.error);

        // Update save button to show sync error
        if (saveBtn) {
          saveBtn.classList.remove('syncing');
          saveBtn.classList.add('error');
          saveBtn.querySelector('span').textContent = i18n.getMessage('options_js_sync_error');
        }
      }
    } catch (error) {
      logger.error('An error occurred during auto-sync after save:', error);
      this.updateSyncStatus('error', 'Sync failed');

      // Update save button to show sync error
      if (saveBtn) {
        saveBtn.classList.remove('syncing');
        saveBtn.classList.add('error');
        saveBtn.querySelector('span').textContent = i18n.getMessage('options_js_sync_error');
      }
    } finally {
      // After sync attempt, reload status from storage to reflect the final state
      const status = await syncManager.getSyncStatus();
      this.displaySyncStatus(status);
      this.isAutoSyncing = false; // Reset flag

      // Reset button state after 3 seconds
      if (saveBtn) {
        setTimeout(() => {
          saveBtn.classList.remove('saved', 'error');
          saveBtn.querySelector('span').textContent = i18n.getMessage('common_save');
        }, 3000);
      }
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
      this.updateSyncStatus('error', i18n.getMessage('options_js_sync_load_status_error'));
    }
  }

  // Display sync status in UI
  displaySyncStatus(status) {
    const statusText = this.getSyncStatusText(status);
    this.updateSyncStatus(status.status, statusText, status.lastSyncTime);

    // Show error message if any
    if (status.lastError) {
      this.domElements.syncErrorMessage.textContent = status.lastError;
      this.domElements.syncErrorMessage.style.display = 'block';
    } else {
      this.domElements.syncErrorMessage.style.display = 'none';
    }
  }

  // Format date to yyyy-mm-dd HH:MM:SS format
  formatSyncDate(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0') + ' ' +
      String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0') + ':' +
      String(date.getSeconds()).padStart(2, '0');
  }

  // Get human-readable status text
  getSyncStatusText(status) {
    switch (status.status) {
      case 'idle':
        return status.isConfigured ? i18n.getMessage('options_js_sync_status_ready') : i18n.getMessage('options_sync_status_not_configured');
      case 'testing':
        return i18n.getMessage('options_js_sync_testing_connection');
      case 'uploading':
        return i18n.getMessage('options_js_sync_status_uploading');
      case 'downloading':
        return i18n.getMessage('options_js_sync_status_downloading');
      case 'syncing':
        return i18n.getMessage('common_syncing');
      case 'success':
        return i18n.getMessage('options_js_sync_completed_successfully');
      case 'error':
        return i18n.getMessage('options_js_sync_status_config_error');
      default:
        return i18n.getMessage('options_js_sync_status_unknown');
    }
  }

  // Update sync status indicator
  updateSyncStatus(status, message, lastSyncTime = null) {
    const statusText = this.domElements.syncStatusText;
    if (statusText) {
      let displayText = message;

      // Add sync time information if provided
      if (lastSyncTime) {
        const syncDate = new Date(lastSyncTime);
        displayText += `\n${i18n.getMessage('options_js_sync_last_sync', { time: this.formatSyncDate(syncDate) })}`;
      } else if (status === 'success') {
        // For success status without specific time, use current time
        const now = new Date();
        displayText += `\n${i18n.getMessage('options_js_sync_last_sync', { time: this.formatSyncDate(now) })}`;
      }

      statusText.textContent = displayText;

      // Remove all status classes
      statusText.className = 'status-text';
      // Add current status class for styling
      statusText.classList.add(status);
    }
  }

  // Test sync connection
  async testSyncConnection() {
    logger.info('testSyncConnection called');
    try {
      const storageType = this.domElements.storageType.value;
      
      let credentials = {};
      let validationErrors = [];
      
      if (storageType === 'gist') {
        const token = this.domElements.gistToken.value.trim();
        const gistId = this.domElements.gistId.value.trim();
        
        if (!token) validationErrors.push('GitHub Token');
        if (!gistId) validationErrors.push('Gist ID');
        
        credentials = { token, gistId };
      } else if (storageType === 'webdav') {
        const webdavUrl = this.domElements.webdavUrl.value.trim();
        const webdavUsername = this.domElements.webdavUsername.value.trim();
        const webdavPassword = this.domElements.webdavPassword.value.trim();
        
        if (!webdavUrl) validationErrors.push('WebDAV URL');
        if (!webdavUsername) validationErrors.push('Username');
        if (!webdavPassword) validationErrors.push('Password');
        
        credentials = { webdavUrl, webdavUsername, webdavPassword };
      }

      if (validationErrors.length > 0) {
        const result = { 
          success: false, 
          error: `Missing required fields: ${validationErrors.join(', ')}` 
        };
        this.updateSyncStatus('error', result.error);
        return result;
      }

      logger.info(`Testing ${storageType} connection via background script...`);

      // Use background script to handle network requests to avoid CORS issues
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_SYNC_CONNECTION',
        storageType: storageType,
        ...credentials
      });

      logger.info('Background script response:', response);

      if (response.type === 'TEST_SYNC_CONNECTION_RESULT') {
        if (response.success) {
          // Log connection info if available
          if (response.gistInfo) {
            logger.info('Gist info:', response.gistInfo);
          }
          if (response.serverInfo) {
            logger.info('WebDAV server info:', response.serverInfo);
          }

          return {
            success: true,
            message: response.message || i18n.getMessage('options_js_sync_connection_successful'),
            gistInfo: response.gistInfo,
            serverInfo: response.serverInfo
          };
        } else {
          return {
            success: false,
            error: response.error || 'Unknown error',
            message: response.message || i18n.getMessage('options_js_sync_connection_failed')
          };
        }
      } else if (response.type === 'ERROR') {
        return {
          success: false,
          error: response.error || i18n.getMessage('options_js_sync_bg_script_error')
        };
      } else {
        return {
          success: false,
          error: i18n.getMessage('options_js_sync_unexpected_response')
        };
      }
    } catch (error) {
      logger.error('Error testing sync connection:', error);
      return {
        success: false,
        error: error.message || i18n.getMessage('options_js_sync_test_failed')
      };
    }
  }

  // Validate sync configuration
  validateSyncConfig() {
    const storageType = this.domElements.storageType.value;
    const errors = [];
    
    if (storageType === 'gist') {
      const token = this.domElements.gistToken.value.trim();
      const gistId = this.domElements.gistId.value.trim();
      
      if (!token) errors.push(i18n.getMessage('options_js_sync_github_token_required'));
      if (!gistId) errors.push(i18n.getMessage('options_js_sync_gist_id_required'));
      
      return {
        isValid: errors.length === 0,
        errors: errors,
        storageType: storageType,
        token: token,
        gistId: gistId
      };
    } else if (storageType === 'webdav') {
      const webdavUrl = this.domElements.webdavUrl.value.trim();
      const webdavUsername = this.domElements.webdavUsername.value.trim();
      const webdavPassword = this.domElements.webdavPassword.value.trim();
      
      if (!webdavUrl) errors.push('WebDAV URL is required');
      if (!webdavUsername) errors.push('WebDAV Username is required');
      if (!webdavPassword) errors.push('WebDAV Password is required');
      
      return {
        isValid: errors.length === 0,
        errors: errors,
        storageType: storageType,
        webdavUrl: webdavUrl,
        webdavUsername: webdavUsername,
        webdavPassword: webdavPassword
      };
    } else {
      errors.push('Invalid storage type');
      return {
        isValid: false,
        errors: errors,
        storageType: storageType
      };
    }
  }

  // Build sync configuration from form
  buildSyncConfigFromForm() {
    const config = {
      enabled: this.domElements.syncEnabled.checked, // Auto sync enabled/disabled
      storageType: this.domElements.storageType.value, // Storage type: 'gist' or 'webdav'
      // Gist configuration
      gistToken: this.domElements.gistToken.value.trim(),
      gistId: this.domElements.gistId.value.trim(),
      // WebDAV configuration
      webdavUrl: this.domElements.webdavUrl.value.trim(),
      webdavUsername: this.domElements.webdavUsername.value.trim(),
      webdavPassword: this.domElements.webdavPassword.value.trim(),
      lastSyncTime: null, // Will be updated by sync operations
      syncStatus: 'idle',
      lastError: null,
      autoSync: this.domElements.syncEnabled.checked // Legacy field, same as enabled
    };
    
    // Add debug logs to verify configuration reading
    logger.info('Building sync configuration from form:', {
      enabled: config.enabled,
      storageType: config.storageType,
      hasGistToken: !!config.gistToken,
      hasGistId: !!config.gistId,
      hasWebdavUrl: !!config.webdavUrl,
      hasWebdavUsername: !!config.webdavUsername,
      hasWebdavPassword: !!config.webdavPassword,
      gistTokenLength: config.gistToken.length,
      gistIdLength: config.gistId.length,
      webdavUrlLength: config.webdavUrl.length,
      webdavUsernameLength: config.webdavUsername.length
    });
    
    return config;
  }

  /**
   * Apply theme based on configuration
   * @param {Object} config - The application configuration
   */
  applyTheme(config) {
    // Support both old and new config formats
    const basicConfig = config.basic || config;
    const theme = basicConfig.theme || 'system';
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

  // Setup language switcher
  setupLanguageSwitcher() {
    this.domElements.languageSelector.addEventListener('change', async (event) => {
      const selectedLanguage = event.target.value;
      logger.info(`Language changed to: ${selectedLanguage}`);
      
      try {
        // Immediately apply language change using the new i18n system
        await i18n.changeLanguage(selectedLanguage);
        
        // Mark the form as having unsaved changes so it will be saved
        this.markAsChanged();
        
        // Show a success message
        this.showLanguageChangeSuccess(selectedLanguage);
        
        logger.info(`Language successfully changed to: ${selectedLanguage}`);
      } catch (error) {
        logger.error('Failed to change language:', error);
        
        // Revert the selector to the previous language
        this.domElements.languageSelector.value = i18n.getCurrentLanguage();
        
        // Show error message
        this.showLanguageChangeError(error.message);
      }
    });
  }

  // Update language selector to show current language
  updateLanguageSelector() {
    const currentLanguage = i18n.getCurrentLanguage();
    this.domElements.languageSelector.value = currentLanguage;
    logger.info(`Language selector updated to: ${currentLanguage}`);
  }

  // Show language change success message
  showLanguageChangeSuccess(language) {
    const message = i18n.getMessage('options_language_change_success', { language: language });
    this.showTemporaryMessage(message, 'success');
  }

  // Show language change error message
  showLanguageChangeError(errorMessage) {
    const message = i18n.getMessage('options_language_change_error', { error: errorMessage });
    this.showTemporaryMessage(message, 'error');
  }

  // Show temporary message to user
  showTemporaryMessage(message, type = 'info') {
    // Create or get existing message container
    let messageContainer = document.getElementById('languageChangeMessage');
    if (!messageContainer) {
      messageContainer = document.createElement('div');
      messageContainer.id = 'languageChangeMessage';
      messageContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 4px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(messageContainer);
    }

    // Set message and style based on type
    messageContainer.textContent = message;
    messageContainer.className = `language-message ${type}`;
    
    // Apply type-specific styling
    if (type === 'success') {
      messageContainer.style.backgroundColor = '#4caf50';
    } else if (type === 'error') {
      messageContainer.style.backgroundColor = '#f44336';
    } else {
      messageContainer.style.backgroundColor = '#2196f3';
    }

    // Show message
    messageContainer.style.opacity = '1';
    messageContainer.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
      messageContainer.style.opacity = '0';
      setTimeout(() => {
        messageContainer.style.display = 'none';
      }, 300);
    }, 3000);
  }

  // Initialize branch model selector with configuration
  initializeBranchModelSelector(config) {
    const basicConfig = config.basic || config;
    const branchModelIds = basicConfig.branchModelIds || [];
    const allModels = this.modelManager.getAllModels();
    
    // Populate and update branch model selector
    UIConfigManager.populateBranchModelSelector(this.domElements, allModels, branchModelIds);
    
    // Setup event listeners for branch model selector
    this.setupBranchModelEventListeners();
  }

  // Update branch model selector when models change
  updateBranchModelSelector() {
    const allModels = this.modelManager.getAllModels();
    const currentBranchModelIds = UIConfigManager.getBranchModelIds(this.domElements);
    
    UIConfigManager.populateBranchModelSelector(this.domElements, allModels, currentBranchModelIds);

    // Also update quick input branch model selectors
    this.updateQuickInputBranchModelSelectors(allModels);
  }

  // Update branch model selectors for all quick input items
  updateQuickInputBranchModelSelectors(allModels) {
    const items = this.domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    items.forEach(item => {
      const currentIds = QuickInputsManager.getQuickInputBranchModelIds(item);
      QuickInputsManager.populateQuickInputBranchModels(item, allModels, currentIds);
    });
  }

  // Setup event listeners for branch model selector
  setupBranchModelEventListeners() {
    // Toggle dropdown
    this.domElements.branchModelsToggle.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleBranchModelDropdown();
    });

    // Click on selected items area to toggle dropdown
    this.domElements.selectedBranchModels.addEventListener('click', (e) => {
      if (!e.target.closest('.model-remove-icon')) {
        this.toggleBranchModelDropdown();
      }
    });

    // Handle option selection and removal
    this.domElements.branchModelsDropdown.addEventListener('click', (e) => {
      const optionItem = e.target.closest('.option-item');
      if (optionItem) {
        e.preventDefault();
        const modelId = optionItem.dataset.value;
        this.toggleBranchModelSelection(modelId);
      }
    });

    // Handle selected model removal
    this.domElements.selectedBranchModels.addEventListener('click', (e) => {
      const removeIcon = e.target.closest('.model-remove-icon');
      if (removeIcon) {
        e.preventDefault();
        const modelId = removeIcon.dataset.modelId;
        this.removeBranchModelSelection(modelId);
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#branchModelSelect')) {
        this.closeBranchModelDropdown();
      }
    });
  }

  // Toggle branch model dropdown visibility
  toggleBranchModelDropdown() {
    const dropdown = this.domElements.branchModelsDropdown;
    const toggle = this.domElements.branchModelsToggle;
    const multiSelect = this.domElements.branchModelSelect;

    const isOpen = dropdown.classList.contains('open');
    
    if (isOpen) {
      dropdown.classList.remove('open');
      toggle.classList.remove('open');
      multiSelect.classList.remove('dropdown-open');
    } else {
      dropdown.classList.add('open');
      toggle.classList.add('open');
      multiSelect.classList.add('dropdown-open');
    }
  }

  // Close branch model dropdown
  closeBranchModelDropdown() {
    const dropdown = this.domElements.branchModelsDropdown;
    const toggle = this.domElements.branchModelsToggle;
    const multiSelect = this.domElements.branchModelSelect;

    dropdown.classList.remove('open');
    toggle.classList.remove('open');
    multiSelect.classList.remove('dropdown-open');
  }

  // Toggle branch model selection
  toggleBranchModelSelection(modelId) {
    const currentIds = UIConfigManager.getBranchModelIds(this.domElements);
    const isSelected = currentIds.includes(modelId);
    
    let newIds;
    if (isSelected) {
      newIds = currentIds.filter(id => id !== modelId);
    } else {
      newIds = [...currentIds, modelId];
    }
    
    const allModels = this.modelManager.getAllModels();
    UIConfigManager.updateBranchModelSelection(this.domElements, allModels, newIds);
    this.markAsChanged();
  }

  // Remove branch model selection
  removeBranchModelSelection(modelId) {
    const currentIds = UIConfigManager.getBranchModelIds(this.domElements);
    const newIds = currentIds.filter(id => id !== modelId);
    
    const allModels = this.modelManager.getAllModels();
    UIConfigManager.updateBranchModelSelection(this.domElements, allModels, newIds);
    this.markAsChanged();
  }

  // Check for and display errors caught by global handlers
  async displayCaughtError() {
    const errorDisplayContainer = document.getElementById('errorDisplayContainer');
    const errorDisplayContent = document.getElementById('errorDisplayContent');
    const clearErrorBtn = document.getElementById('clearErrorBtn');

    if (!errorDisplayContainer || !errorDisplayContent || !clearErrorBtn) return;

    const result = await chrome.storage.local.get('last_error');
    if (result.last_error) {
      const error = result.last_error;
      const errorString = `Page: ${error.page}\nTimestamp: ${error.timestamp}\nMessage: ${error.message}\nSource: ${error.source}:${error.lineno}:${error.colno}\nStack: ${error.error}`;
      errorDisplayContent.textContent = errorString;
      errorDisplayContainer.style.display = 'block';

      clearErrorBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove('last_error');
        errorDisplayContainer.style.display = 'none';
      });
    }
  }
}

// Initialize options page when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize logger for options page
  if (window.logger) {
    // Use configure method for configuration, not the non-existent init method
    window.logger.configure({
      level: window.LOG_LEVELS.INFO,
      enableConsole: true,
      modulePrefix: true
    });
  }
  
  const optionsPage = new OptionsPage();
  // Set global reference for access from other modules
  window.optionsPage = optionsPage;
  await optionsPage.init();
});