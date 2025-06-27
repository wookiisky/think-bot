// background/handlers/blacklistHandler.js

/**
 * Handle getting blacklist patterns
 * @param {Object} data - Request data
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleGetBlacklistPatterns(data, serviceLogger) {
  try {
    serviceLogger.info('Getting blacklist patterns');
    const patterns = await blacklistManager.getPatterns();

    // Clean patterns - only include necessary fields
    const cleanPatterns = patterns.map(pattern => ({
      id: pattern.id,
      pattern: pattern.pattern,
      enabled: pattern.enabled
    }));

    return {
      type: 'BLACKLIST_PATTERNS_LOADED',
      patterns: cleanPatterns
    };
  } catch (error) {
    serviceLogger.error('Error getting blacklist patterns:', error);
    return {
      type: 'BLACKLIST_PATTERNS_ERROR',
      error: error.message
    };
  }
}

/**
 * Handle adding a blacklist pattern
 * @param {Object} data - Request data with pattern info
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleAddBlacklistPattern(data, serviceLogger) {
  try {
    const { pattern, description, enabled } = data;
    serviceLogger.info('Adding blacklist pattern:', pattern);
    
    const success = await blacklistManager.addPattern({
      pattern,
      description,
      enabled
    });
    
    if (success) {
      return {
        type: 'BLACKLIST_PATTERN_ADDED',
        success: true
      };
    } else {
      return {
        type: 'BLACKLIST_PATTERN_ERROR',
        error: 'Failed to add pattern'
      };
    }
  } catch (error) {
    serviceLogger.error('Error adding blacklist pattern:', error);
    return {
      type: 'BLACKLIST_PATTERN_ERROR',
      error: error.message
    };
  }
}

/**
 * Handle updating a blacklist pattern
 * @param {Object} data - Request data with pattern ID and updates
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleUpdateBlacklistPattern(data, serviceLogger) {
  try {
    const { patternId, updates } = data;
    serviceLogger.info('Updating blacklist pattern:', patternId);
    
    const success = await blacklistManager.updatePattern(patternId, updates);
    
    if (success) {
      return {
        type: 'BLACKLIST_PATTERN_UPDATED',
        success: true
      };
    } else {
      return {
        type: 'BLACKLIST_PATTERN_ERROR',
        error: 'Failed to update pattern'
      };
    }
  } catch (error) {
    serviceLogger.error('Error updating blacklist pattern:', error);
    return {
      type: 'BLACKLIST_PATTERN_ERROR',
      error: error.message
    };
  }
}

/**
 * Handle deleting a blacklist pattern
 * @param {Object} data - Request data with pattern ID
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleDeleteBlacklistPattern(data, serviceLogger) {
  try {
    const { patternId } = data;
    serviceLogger.info('Deleting blacklist pattern:', patternId);
    
    const success = await blacklistManager.deletePattern(patternId);
    
    if (success) {
      return {
        type: 'BLACKLIST_PATTERN_DELETED',
        success: true
      };
    } else {
      return {
        type: 'BLACKLIST_PATTERN_ERROR',
        error: 'Failed to delete pattern'
      };
    }
  } catch (error) {
    serviceLogger.error('Error deleting blacklist pattern:', error);
    return {
      type: 'BLACKLIST_PATTERN_ERROR',
      error: error.message
    };
  }
}

/**
 * Handle checking if URL is blacklisted
 * @param {Object} data - Request data with URL
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleCheckBlacklistUrl(data, serviceLogger) {
  try {
    const { url } = data;
    serviceLogger.info('Checking blacklist for URL:', url);
    
    const result = await blacklistManager.isBlacklistedUrl(url);
    
    return {
      type: 'BLACKLIST_CHECK_RESULT',
      isBlacklisted: result.isBlacklisted,
      matchedPattern: result.matchedPattern
    };
  } catch (error) {
    serviceLogger.error('Error checking blacklist URL:', error);
    return {
      type: 'BLACKLIST_CHECK_ERROR',
      error: error.message
    };
  }
}

/**
 * Handle testing a pattern against URLs
 * @param {Object} data - Request data with pattern and URLs
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleTestBlacklistPattern(data, serviceLogger) {
  try {
    const { pattern, urls } = data;
    serviceLogger.info('Testing blacklist pattern:', pattern);
    
    // Validate pattern first
    const validation = blacklistManager.validatePattern(pattern);
    if (!validation.isValid) {
      return {
        type: 'BLACKLIST_TEST_ERROR',
        error: validation.error
      };
    }
    
    // Test against URLs
    const results = urls.map(url => {
      const testResult = blacklistManager.testPattern(pattern, url);
      return {
        url,
        ...testResult
      };
    });
    
    return {
      type: 'BLACKLIST_TEST_RESULT',
      results: results
    };
  } catch (error) {
    serviceLogger.error('Error testing blacklist pattern:', error);
    return {
      type: 'BLACKLIST_TEST_ERROR',
      error: error.message
    };
  }
}

/**
 * Handle resetting blacklist to defaults
 * @param {Object} data - Request data
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleResetBlacklistToDefaults(data, serviceLogger) {
  try {
    serviceLogger.info('Resetting blacklist to defaults');
    
    const success = await blacklistManager.resetToDefaults();
    
    if (success) {
      return {
        type: 'BLACKLIST_RESET_SUCCESS',
        success: true
      };
    } else {
      return {
        type: 'BLACKLIST_RESET_ERROR',
        error: 'Failed to reset blacklist'
      };
    }
  } catch (error) {
    serviceLogger.error('Error resetting blacklist:', error);
    return {
      type: 'BLACKLIST_RESET_ERROR',
      error: error.message
    };
  }
}
