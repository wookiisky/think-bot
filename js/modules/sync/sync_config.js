// Think Bot Sync Configuration Module
// Manages sync-related configuration settings
// Note: storage-keys.js should be loaded before this module

// Create a global syncConfig object
var syncConfig = {};

// Create module logger
const syncConfigLogger = logger.createModuleLogger('SyncConfig');

// Storage keys for sync configuration
const SYNC_CONFIG_KEY = CONFIG_KEYS.SYNC_CONFIG;

// Default sync configuration
const DEFAULT_SYNC_CONFIG = {
  enabled: false, // Auto sync enabled/disabled
  gistToken: '',
  gistId: '',
  lastSyncTime: null,
  syncStatus: 'idle', // 'idle', 'syncing', 'error', 'success'
  lastError: null,
  autoSync: false, // Legacy field, now using 'enabled' for auto sync
  deviceId: null
};

/**
 * Initialize sync configuration if needed
 */
syncConfig.initializeIfNeeded = async function() {
  try {
    const result = await chrome.storage.sync.get(SYNC_CONFIG_KEY);
    
    if (!result[SYNC_CONFIG_KEY]) {
      syncConfigLogger.info('Initializing default sync configuration');
      await this.saveSyncConfig(DEFAULT_SYNC_CONFIG);
    }
  } catch (error) {
    syncConfigLogger.error('Sync configuration initialization error:', error.message);
  }
};

/**
 * Get current sync configuration
 */
syncConfig.getSyncConfig = async function() {
  try {
    const result = await chrome.storage.sync.get(SYNC_CONFIG_KEY);
    const config = result[SYNC_CONFIG_KEY] || DEFAULT_SYNC_CONFIG;
    
    // Ensure all default fields exist
    const mergedConfig = { ...DEFAULT_SYNC_CONFIG, ...config };
    
    // Generate device ID if not exists
    if (!mergedConfig.deviceId) {
      mergedConfig.deviceId = this.generateDeviceId();
      await this.saveSyncConfig(mergedConfig);
    }
    
    return mergedConfig;
  } catch (error) {
    syncConfigLogger.error('Error getting sync configuration:', error.message);
    return DEFAULT_SYNC_CONFIG;
  }
};

/**
 * Save sync configuration
 */
syncConfig.saveSyncConfig = async function(config) {
  try {
    await chrome.storage.sync.set({ [SYNC_CONFIG_KEY]: config });
    syncConfigLogger.info('Sync configuration saved successfully');
    return true;
  } catch (error) {
    syncConfigLogger.error('Error saving sync configuration:', error.message);
    return false;
  }
};

/**
 * Update sync status
 */
syncConfig.updateSyncStatus = async function(status, error = null) {
  try {
    const config = await this.getSyncConfig();
    config.syncStatus = status;
    config.lastError = error;
    
    if (status === 'success') {
      config.lastSyncTime = Date.now();
      config.lastError = null;
    }
    
    await this.saveSyncConfig(config);
    syncConfigLogger.info('Sync status updated:', { status, error });
    return true;
  } catch (error) {
    syncConfigLogger.error('Error updating sync status:', error.message);
    return false;
  }
};

/**
 * Validate sync configuration
 */
syncConfig.validateConfig = function(config) {
  const errors = [];
  
  if (!config.gistToken || config.gistToken.trim() === '') {
    errors.push('Gist Token is required');
  }
  
  if (!config.gistId || config.gistId.trim() === '') {
    errors.push('Gist ID is required');
  }
  
  // Basic token format validation (GitHub tokens are typically 40 characters)
  if (config.gistToken && !/^[a-zA-Z0-9_]{20,}$/.test(config.gistToken.trim())) {
    errors.push('Invalid Gist Token format');
  }
  
  // Basic Gist ID format validation (GitHub Gist IDs are alphanumeric)
  if (config.gistId && !/^[a-zA-Z0-9]{20,}$/.test(config.gistId.trim())) {
    errors.push('Invalid Gist ID format');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

/**
 * Test sync configuration by attempting to access the Gist
 * Uses background script to avoid CORS issues in extension context
 */
syncConfig.testConnection = async function(token, gistId) {
  try {
    // Check if we're in an extension context
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // Use background script for network requests
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_SYNC_CONNECTION',
        token: token,
        gistId: gistId
      });

      if (response.type === 'TEST_SYNC_CONNECTION_RESULT') {
        return {
          success: response.success,
          message: response.message || (response.success ? 'Connection successful' : 'Connection failed'),
          error: response.error,
          gistInfo: response.gistInfo
        };
      } else if (response.type === 'ERROR') {
        return {
          success: false,
          message: 'Background script error',
          error: response.error
        };
      } else {
        return {
          success: false,
          message: 'Unexpected response from background script',
          error: 'Invalid response format'
        };
      }
    } else {
      // Fallback to direct fetch for non-extension contexts (like test pages)
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ThinkBot-Extension'
        }
      });

      if (response.ok) {
        const gist = await response.json();
        return {
          success: true,
          message: 'Connection successful',
          gistInfo: {
            description: gist.description,
            isPublic: gist.public,
            filesCount: Object.keys(gist.files).length,
            updatedAt: gist.updated_at
          }
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          message: `Connection failed: ${response.status} ${response.statusText}`,
          error: errorData.message || 'Unknown error'
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      message: 'Connection test failed',
      error: error.message
    };
  }
};

/**
 * Generate a unique device ID
 */
syncConfig.generateDeviceId = function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `device_${timestamp}_${random}`;
};

/**
 * Reset sync configuration to defaults
 */
syncConfig.resetSyncConfig = async function() {
  try {
    await this.saveSyncConfig(DEFAULT_SYNC_CONFIG);
    syncConfigLogger.info('Sync configuration reset to defaults');
    return true;
  } catch (error) {
    syncConfigLogger.error('Error resetting sync configuration:', error.message);
    return false;
  }
};

/**
 * Get sync configuration for export (without sensitive data)
 */
syncConfig.getExportableConfig = async function() {
  const config = await this.getSyncConfig();
  return {
    enabled: config.enabled,
    autoSync: config.autoSync,
    lastSyncTime: config.lastSyncTime,
    deviceId: config.deviceId
    // Exclude gistToken and gistId for security
  };
};

// Initialize sync configuration when module loads
if (typeof chrome !== 'undefined' && chrome.storage) {
  syncConfig.initializeIfNeeded().catch(error => {
    syncConfigLogger.error('Failed to initialize sync configuration:', error.message);
  });
}
