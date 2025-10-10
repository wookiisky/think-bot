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
  storageType: 'gist', // 'gist' or 'webdav'
  // Gist configuration
  gistToken: '',
  gistId: '',
  // WebDAV configuration
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
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
    const result = await chrome.storage.local.get(SYNC_CONFIG_KEY);
    
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
    const result = await chrome.storage.local.get(SYNC_CONFIG_KEY);
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
    // Record saved configuration information (excluding sensitive data)
    syncConfigLogger.info('保存同步配置:', {
      enabled: config.enabled,
      storageType: config.storageType,
      hasGistToken: !!config.gistToken,
      hasGistId: !!config.gistId,
      hasWebdavUrl: !!config.webdavUrl,
      hasWebdavUsername: !!config.webdavUsername,
      hasWebdavPassword: !!config.webdavPassword,
      gistTokenLength: config.gistToken ? config.gistToken.length : 0,
      gistIdLength: config.gistId ? config.gistId.length : 0,
      webdavUrlLength: config.webdavUrl ? config.webdavUrl.length : 0,
      webdavUsernameLength: config.webdavUsername ? config.webdavUsername.length : 0
    });
    
    await chrome.storage.local.set({ [SYNC_CONFIG_KEY]: config });
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
  const storageType = config.storageType || 'gist';
  
  if (storageType === 'gist') {
    // Validate Gist configuration
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
  } else if (storageType === 'webdav') {
    // Validate WebDAV configuration
    if (!config.webdavUrl || config.webdavUrl.trim() === '') {
      errors.push('WebDAV URL is required');
    }
    
    if (!config.webdavUsername || config.webdavUsername.trim() === '') {
      errors.push('WebDAV Username is required');
    }
    
    if (!config.webdavPassword || config.webdavPassword.trim() === '') {
      errors.push('WebDAV Password is required');
    }
    
    // Basic URL format validation
    if (config.webdavUrl && !config.webdavUrl.trim().match(/^https?:\/\/.+/)) {
      errors.push('Invalid WebDAV URL format (must start with http:// or https://)');
    }
  } else {
    errors.push('Invalid storage type. Must be "gist" or "webdav"');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

/**
 * Test sync configuration by attempting to access the storage
 * Uses background script to avoid CORS issues in extension context
 */
syncConfig.testConnection = async function(storageType, credentials) {
  try {
    if (storageType === 'gist') {
      const { token, gistId } = credentials;
      
      // Check if we're in an extension context
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        // Use background script for network requests
        const response = await chrome.runtime.sendMessage({
          type: 'TEST_SYNC_CONNECTION',
          storageType: 'gist',
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
    } else if (storageType === 'webdav') {
      const { webdavUrl, webdavUsername, webdavPassword } = credentials;
      
      // Check if we're in an extension context
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        // Use background script for network requests
        const response = await chrome.runtime.sendMessage({
          type: 'TEST_SYNC_CONNECTION',
          storageType: 'webdav',
          webdavUrl: webdavUrl,
          webdavUsername: webdavUsername,
          webdavPassword: webdavPassword
        });

        if (response.type === 'TEST_SYNC_CONNECTION_RESULT') {
          return {
            success: response.success,
            message: response.message || (response.success ? 'WebDAV connection successful' : 'WebDAV connection failed'),
            error: response.error,
            serverInfo: response.serverInfo
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
        // Fallback: use webdav client directly for non-extension contexts
        if (typeof webdavClient !== 'undefined') {
          return await webdavClient.testConnection(webdavUrl, webdavUsername, webdavPassword);
        } else {
          return {
            success: false,
            message: 'WebDAV client not available',
            error: 'WebDAV client module not loaded'
          };
        }
      }
    } else {
      return {
        success: false,
        message: 'Invalid storage type',
        error: `Unsupported storage type: ${storageType}`
      };
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
    // Exclude credentials by default for safety
  };
};

/**
 * Get full sync configuration including sensitive credentials.
 * This should only be used in trusted contexts (e.g., manual exports
 * initiated by the user from the options page).
 */
syncConfig.getFullConfigForExport = async function() {
  const config = await this.getSyncConfig();
  // Return a shallow copy to avoid accidental mutations by callers
  return { ...config };
};

// Initialize sync configuration when module loads
if (typeof chrome !== 'undefined' && chrome.storage) {
  syncConfig.initializeIfNeeded().catch(error => {
    syncConfigLogger.error('Failed to initialize sync configuration:', error.message);
  });
}
