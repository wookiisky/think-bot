// Think Bot Blacklist Manager Module
// Handles blacklist pattern management and URL matching
// Note: storage-keys.js should be loaded before this module

// Create a global blacklistManager object
var blacklistManager = {};

// Create module logger
const blacklistLogger = logger.createModuleLogger('BlacklistManager');

// Storage key for blacklist patterns
const BLACKLIST_PATTERNS_KEY = CONFIG_KEYS.BLACKLIST_PATTERNS;

// Default blacklist patterns for common search engines
const DEFAULT_BLACKLIST_PATTERNS = [
  {
    pattern: 'google\\.com/search',
    enabled: true
  },
  {
    pattern: 'bing\\.com/search',
    enabled: true
  },
  {
    pattern: 'baidu\\.com/s',
    enabled: true
  }
];

/**
 * Generate a simple UUID for pattern identification
 * @returns {string} UUID string
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get all blacklist patterns from storage
 * @returns {Promise<Array>} Array of blacklist patterns
 */
blacklistManager.getPatterns = async function() {
  try {
    const result = await chrome.storage.local.get([BLACKLIST_PATTERNS_KEY]);
    let patterns = result[BLACKLIST_PATTERNS_KEY] || [];

    // If no patterns exist, initialize with defaults
    if (patterns.length === 0) {
      blacklistLogger.info('No blacklist patterns found, initializing with defaults');
      const initSuccess = await blacklistManager.initializeDefaultPatterns();
      if (initSuccess) {
        // Re-fetch patterns after successful initialization
        const newResult = await chrome.storage.local.get([BLACKLIST_PATTERNS_KEY]);
        patterns = newResult[BLACKLIST_PATTERNS_KEY] || [];
      } else {
        blacklistLogger.error('Failed to initialize default patterns, returning empty array');
        return [];
      }
    }

    blacklistLogger.info(`Loaded ${patterns.length} blacklist patterns`);
    return patterns;
  } catch (error) {
    blacklistLogger.error('Error loading blacklist patterns:', error);
    return [];
  }
};

/**
 * Save blacklist patterns to storage
 * @param {Array} patterns - Array of blacklist patterns
 * @returns {Promise<boolean>} Success status
 */
blacklistManager.savePatterns = async function(patterns) {
  try {
    await chrome.storage.local.set({ [BLACKLIST_PATTERNS_KEY]: patterns });
    blacklistLogger.info(`Saved ${patterns.length} blacklist patterns`);
    return true;
  } catch (error) {
    blacklistLogger.error('Error saving blacklist patterns:', error);
    return false;
  }
};

/**
 * Initialize default blacklist patterns
 * @returns {Promise<boolean>} Success status
 */
blacklistManager.initializeDefaultPatterns = async function() {
  try {
    const defaultPatterns = DEFAULT_BLACKLIST_PATTERNS.map(pattern => ({
      id: generateUUID(),
      pattern: pattern.pattern,
      enabled: pattern.enabled
    }));

    const success = await blacklistManager.savePatterns(defaultPatterns);
    if (success) {
      blacklistLogger.info('Initial blacklist patterns created successfully');
    }
    return success;
  } catch (error) {
    blacklistLogger.error('Error initializing default patterns:', error);
    return false;
  }
};

/**
 * Add a new blacklist pattern
 * @param {Object} patternData - Pattern data (pattern, description, enabled)
 * @returns {Promise<boolean>} Success status
 */
blacklistManager.addPattern = async function(patternData) {
  try {
    // Validate pattern data
    if (!patternData.pattern || typeof patternData.pattern !== 'string') {
      throw new Error('Pattern is required and must be a string');
    }
    
    // Test if the pattern is a valid regex
    try {
      new RegExp(patternData.pattern, 'i');
    } catch (regexError) {
      throw new Error(`Invalid regex pattern: ${regexError.message}`);
    }
    
    const patterns = await blacklistManager.getPatterns();
    const newPattern = {
      id: generateUUID(),
      pattern: patternData.pattern.trim(),
      enabled: patternData.enabled !== false // Default to true
    };
    
    patterns.push(newPattern);
    const success = await blacklistManager.savePatterns(patterns);
    
    if (success) {
      blacklistLogger.info(`Added new blacklist pattern: ${newPattern.pattern}`);
    }
    return success;
  } catch (error) {
    blacklistLogger.error('Error adding blacklist pattern:', error);
    return false;
  }
};

/**
 * Update an existing blacklist pattern
 * @param {string} patternId - Pattern ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<boolean>} Success status
 */
blacklistManager.updatePattern = async function(patternId, updateData) {
  try {
    const patterns = await blacklistManager.getPatterns();
    const patternIndex = patterns.findIndex(p => p.id === patternId);
    
    if (patternIndex === -1) {
      throw new Error(`Pattern with ID ${patternId} not found`);
    }
    
    // Validate regex if pattern is being updated
    if (updateData.pattern) {
      try {
        new RegExp(updateData.pattern, 'i');
      } catch (regexError) {
        throw new Error(`Invalid regex pattern: ${regexError.message}`);
      }
    }
    
    // Update the pattern
    patterns[patternIndex] = {
      ...patterns[patternIndex],
      ...updateData
    };
    
    const success = await blacklistManager.savePatterns(patterns);
    if (success) {
      blacklistLogger.info(`Updated blacklist pattern: ${patternId}`);
    }
    return success;
  } catch (error) {
    blacklistLogger.error('Error updating blacklist pattern:', error);
    return false;
  }
};

/**
 * Delete a blacklist pattern
 * @param {string} patternId - Pattern ID
 * @returns {Promise<boolean>} Success status
 */
blacklistManager.deletePattern = async function(patternId) {
  try {
    const patterns = await blacklistManager.getPatterns();
    const filteredPatterns = patterns.filter(p => p.id !== patternId);

    if (filteredPatterns.length === patterns.length) {
      throw new Error(`Pattern with ID ${patternId} not found`);
    }

    const success = await blacklistManager.savePatterns(filteredPatterns);
    if (success) {
      blacklistLogger.info(`Deleted blacklist pattern: ${patternId}`);
    }
    return success;
  } catch (error) {
    blacklistLogger.error('Error deleting blacklist pattern:', error);
    return false;
  }
};

/**
 * Check if a URL matches any enabled blacklist pattern
 * @param {string} url - URL to check
 * @returns {Promise<Object>} Match result with status and matched pattern
 */
blacklistManager.isBlacklistedUrl = async function(url) {
  try {
    if (!url || typeof url !== 'string') {
      return { isBlacklisted: false, matchedPattern: null };
    }

    const patterns = await blacklistManager.getPatterns();
    const enabledPatterns = patterns.filter(p => p.enabled);

    if (enabledPatterns.length === 0) {
      return { isBlacklisted: false, matchedPattern: null };
    }

    // Remove protocol part from URL for matching
    const urlWithoutProtocol = url.replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '');

    for (const pattern of enabledPatterns) {
      try {
        const regex = new RegExp(pattern.pattern, 'i');
        if (regex.test(urlWithoutProtocol)) {
          blacklistLogger.info(`URL ${url} matched blacklist pattern: ${pattern.pattern}`);
          return {
            isBlacklisted: true,
            matchedPattern: pattern
          };
        }
      } catch (regexError) {
        blacklistLogger.warn(`Invalid regex pattern skipped: ${pattern.pattern}`, regexError);
        continue;
      }
    }

    return { isBlacklisted: false, matchedPattern: null };
  } catch (error) {
    blacklistLogger.error('Error checking blacklist URL:', error);
    return { isBlacklisted: false, matchedPattern: null };
  }
};

/**
 * Test a pattern against a URL
 * @param {string} pattern - Regex pattern to test
 * @param {string} url - URL to test against
 * @returns {Object} Test result with status and details
 */
blacklistManager.testPattern = function(pattern, url) {
  try {
    if (!pattern || !url) {
      return {
        isMatch: false,
        error: 'Pattern and URL are required'
      };
    }

    // Validate regex pattern
    let regex;
    try {
      regex = new RegExp(pattern, 'i');
    } catch (regexError) {
      return {
        isMatch: false,
        error: `Invalid regex pattern: ${regexError.message}`
      };
    }

    // Remove protocol from URL
    const urlWithoutProtocol = url.replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '');

    const isMatch = regex.test(urlWithoutProtocol);

    return {
      isMatch,
      testedUrl: urlWithoutProtocol,
      pattern,
      error: null
    };
  } catch (error) {
    return {
      isMatch: false,
      error: `Test error: ${error.message}`
    };
  }
};

/**
 * Validate a regex pattern
 * @param {string} pattern - Pattern to validate
 * @returns {Object} Validation result
 */
blacklistManager.validatePattern = function(pattern) {
  try {
    if (!pattern || typeof pattern !== 'string') {
      return {
        isValid: false,
        error: 'Pattern is required and must be a string'
      };
    }

    // Test regex compilation
    new RegExp(pattern, 'i');

    return {
      isValid: true,
      error: null
    };
  } catch (regexError) {
    return {
      isValid: false,
      error: `Invalid regex pattern: ${regexError.message}`
    };
  }
};

/**
 * Get pattern by ID
 * @param {string} patternId - Pattern ID
 * @returns {Promise<Object|null>} Pattern object or null if not found
 */
blacklistManager.getPatternById = async function(patternId) {
  try {
    const patterns = await blacklistManager.getPatterns();
    return patterns.find(p => p.id === patternId) || null;
  } catch (error) {
    blacklistLogger.error('Error getting pattern by ID:', error);
    return null;
  }
};

/**
 * Get blacklist configuration for export
 * @returns {Promise<Object>} Exportable blacklist configuration
 */
blacklistManager.getExportableConfig = async function() {
  try {
    const patterns = await blacklistManager.getPatterns();

    // Clean patterns for export - only include necessary fields
    const cleanPatterns = patterns.map(pattern => ({
      id: pattern.id,
      pattern: pattern.pattern,
      enabled: pattern.enabled
    }));

    return {
      patterns: cleanPatterns
    };
  } catch (error) {
    blacklistLogger.error('Error getting exportable blacklist config:', error);
    return { patterns: [] };
  }
};

/**
 * Import blacklist configuration
 * @param {Object} blacklistConfig - Blacklist configuration to import
 * @returns {Promise<boolean>} Success status
 */
blacklistManager.importConfig = async function(blacklistConfig) {
  try {
    if (!blacklistConfig || !Array.isArray(blacklistConfig.patterns)) {
      blacklistLogger.warn('Invalid blacklist configuration for import');
      return false;
    }

    // Validate and clean patterns
    const validPatterns = [];
    for (const pattern of blacklistConfig.patterns) {
      if (pattern.pattern && typeof pattern.pattern === 'string') {
        // Ensure pattern has required fields
        const cleanPattern = {
          id: pattern.id || generateUUID(),
          pattern: pattern.pattern.trim(),
          enabled: pattern.enabled !== false // Default to true
        };

        // Validate regex pattern
        try {
          new RegExp(cleanPattern.pattern, 'i');
          validPatterns.push(cleanPattern);
        } catch (regexError) {
          blacklistLogger.warn(`Skipping invalid regex pattern: ${cleanPattern.pattern}`, regexError);
        }
      }
    }

    // Save imported patterns
    await chrome.storage.local.set({ [BLACKLIST_PATTERNS_KEY]: validPatterns });
    blacklistLogger.info(`Imported ${validPatterns.length} blacklist patterns`);
    return true;
  } catch (error) {
    blacklistLogger.error('Error importing blacklist configuration:', error);
    return false;
  }
};

/**
 * Reset to default patterns (removes all custom patterns)
 * @returns {Promise<boolean>} Success status
 */
blacklistManager.resetToDefaults = async function() {
  try {
    // Clear existing patterns
    await chrome.storage.local.remove([BLACKLIST_PATTERNS_KEY]);

    // Initialize with defaults
    const success = await blacklistManager.initializeDefaultPatterns();
    if (success) {
      blacklistLogger.info('Blacklist patterns reset to defaults');
    }
    return success;
  } catch (error) {
    blacklistLogger.error('Error resetting to default patterns:', error);
    return false;
  }
};
