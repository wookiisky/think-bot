// Think Bot Storage Keys Constants
// Centralized management of all storage keys used throughout the application

/**
 * Configuration Storage Keys
 * Used for storing user settings and configuration data
 */
var CONFIG_KEYS = {
  // Main configuration storage
  MAIN_CONFIG: 'ThinkBotConfig',

  // System prompt storage
  SYSTEM_PROMPT: 'ThinkBotSystemPrompt',

  // Quick inputs management
  QUICK_INPUTS_INDEX: 'ThinkBotQuickInputsIndex',
  QUICK_INPUT_PREFIX: 'ThinkBotQuickInput_',

  // Blacklist patterns
  BLACKLIST_PATTERNS: 'blacklistPatterns',

  // Sync configuration
  SYNC_CONFIG: 'ThinkBotSyncConfig'
};

/**
 * Cache Storage Keys
 * Used for storing page content, chat history, and temporary data
 */
var CACHE_KEYS = {
  // Page content storage prefixes
  PAGE_PREFIX: 'ThinkBotPage_',
  CHAT_PREFIX: 'ThinkBotChat_',

  // Recent URLs tracking
  RECENT_URLS: 'ThinkBotRecentUrls',

  // Loading state management
  LOADING_STATE_PREFIX: 'loading_state_'
};

/**
 * UI Storage Keys
 * Used for storing UI state and preferences
 */
var UI_KEYS = {
  // Content section height for sidebar
  CONTENT_SECTION_HEIGHT: 'contentSectionHeight'
};

/**
 * Cache Configuration Constants
 * Related to cache management and cleanup
 */
var CACHE_CONFIG = {
  // Maximum cache age in days
  MAX_CACHE_AGE_DAYS: 90,
  
  // Maximum cache age in milliseconds
  MAX_CACHE_AGE_MS: 90 * 24 * 60 * 60 * 1000,
  
  // Loading timeout in minutes
  LOADING_TIMEOUT_MINUTES: 20,
  
  // Loading timeout in milliseconds
  LOADING_TIMEOUT_MS: 20 * 60 * 1000,
  
  // Cleanup interval in milliseconds
  CLEANUP_INTERVAL_MS: 60 * 1000
};

/**
 * Helper Functions for Key Generation
 */
var KeyHelpers = {
  /**
   * Generate a quick input storage key
   * @param {string} id - Quick input ID
   * @returns {string} Storage key
   */
  getQuickInputKey(id) {
    return `${CONFIG_KEYS.QUICK_INPUT_PREFIX}${id}`;
  },
  
  /**
   * Generate a page content storage key
   * @param {string} normalizedUrl - Normalized URL
   * @returns {string} Storage key
   */
  getPageKey(normalizedUrl) {
    return `${CACHE_KEYS.PAGE_PREFIX}${normalizedUrl}`;
  },
  
  /**
   * Generate a chat history storage key
   * @param {string} normalizedUrl - Normalized URL
   * @returns {string} Storage key
   */
  getChatKey(normalizedUrl) {
    return `${CACHE_KEYS.CHAT_PREFIX}${normalizedUrl}`;
  },
  
  /**
   * Generate a loading state storage key
   * @param {string} normalizedUrl - Normalized URL
   * @param {string} tabId - Tab ID
   * @returns {string} Storage key
   */
  getLoadingStateKey(normalizedUrl, tabId) {
    return `${CACHE_KEYS.LOADING_STATE_PREFIX}${normalizedUrl}#${tabId}`;
  }
};

/**
 * Storage Type Definitions
 * Defines which storage API to use for different types of data
 */
var STORAGE_TYPES = {
  // Configuration data - uses chrome.storage.sync for cross-device sync
  CONFIG: 'sync',
  
  // Cache data - uses chrome.storage.local for larger storage capacity
  CACHE: 'local',
  
  // UI state - uses chrome.storage.local for device-specific settings
  UI: 'local'
};

/**
 * Get all storage keys by category
 * Useful for debugging and maintenance operations
 */
var getAllKeys = function() {
  return {
    config: Object.values(CONFIG_KEYS),
    cache: Object.values(CACHE_KEYS),
    ui: Object.values(UI_KEYS)
  };
};

/**
 * Check if a key belongs to a specific category
 * @param {string} key - Storage key to check
 * @param {string} category - Category to check against ('config', 'cache', 'ui')
 * @returns {boolean} Whether the key belongs to the category
 */
var isKeyInCategory = function(key, category) {
  switch (category) {
    case 'config':
      return Object.values(CONFIG_KEYS).some(configKey => 
        key === configKey || key.startsWith(configKey)
      );
    case 'cache':
      return Object.values(CACHE_KEYS).some(cacheKey => 
        key === cacheKey || key.startsWith(cacheKey)
      );
    case 'ui':
      return Object.values(UI_KEYS).some(uiKey => 
        key === uiKey || key.startsWith(uiKey)
      );
    default:
      return false;
  }
};
