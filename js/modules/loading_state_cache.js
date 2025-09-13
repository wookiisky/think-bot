// Think Bot Loading State Cache Module
// Manages loading states for LLM calls with timeout handling and compression
// Note: storage-keys.js should be loaded before this module

// Create a global loadingStateCache object
var loadingStateCache = {};

// Create module logger
const loadingLogger = logger.createModuleLogger('LoadingStateCache');

// Constants for loading state management
const LOADING_STATE_PREFIX = CACHE_KEYS.LOADING_STATE_PREFIX;
const LOADING_TIMEOUT_MINUTES = CACHE_CONFIG.LOADING_TIMEOUT_MINUTES; // Increased from 10 to 20 minutes for long text generation
const LOADING_TIMEOUT_MS = CACHE_CONFIG.LOADING_TIMEOUT_MS;
const CLEANUP_INTERVAL_MS = CACHE_CONFIG.CLEANUP_INTERVAL_MS; // Clean up every minute

// Check if cache compression is available
const loadingStateCacheCompressionAvailable = typeof cacheCompression !== 'undefined';
if (!loadingStateCacheCompressionAvailable) {
  loadingLogger.warn('Cache compression module not available, loading states will be stored uncompressed');
}

/**
 * Compress loading state data if it's beneficial
 * @param {Object} loadingState - The loading state to compress
 * @returns {Object} - Compressed or original loading state
 */
function compressLoadingStateIfBeneficial(loadingState) {
  if (!loadingState || typeof loadingState !== 'object') {
    return loadingState;
  }
  
  try {
    // Use cache compression module if available
    if (typeof cacheCompression !== 'undefined' && cacheCompression.compressWithBestMethod) {
      const loadingStateStr = JSON.stringify(loadingState);
      const compressed = cacheCompression.compressWithBestMethod(loadingStateStr);
      
      // If compression was applied and beneficial
      if (compressed !== loadingStateStr && typeof compressed === 'object' && compressed.__compressed__) {

        return compressed;
      } else {

        return loadingState;
      }
    } else {
      loadingLogger.warn('Cache compression module not available');
      return loadingState;
    }
  } catch (error) {
    loadingLogger.warn('Error compressing loading state:', error.message);
    return loadingState;
  }
}

/**
 * Decompress loading state data if compressed
 * @param {Object} data - The data to decompress
 * @returns {Object} - Decompressed or original loading state
 */
function decompressLoadingStateIfNeeded(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  try {
    // Use cache compression module if available
    if (typeof cacheCompression !== 'undefined' && cacheCompression.decompressWithMethod) {
      const decompressed = cacheCompression.decompressWithMethod(data);
      
      // If decompression was successful and returned a different object
      if (decompressed !== data && typeof decompressed === 'string') {
        const loadingState = JSON.parse(decompressed);
        return loadingState;
      } else if (decompressed !== data) {
        // Data was already decompressed or wasn't compressed
        return decompressed;
      }
    }
    
    // Return original data if not compressed or decompression failed
    return data;
    
  } catch (error) {
    loadingLogger.error('Error decompressing loading state:', error.message);
    return data;
  }
}

/**
 * Save loading state for a specific tab
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @param {Object} loadingInfo - Loading information
 * @returns {Promise<boolean>} Success status
 */
loadingStateCache.saveLoadingState = async function(url, tabId, loadingInfo) {
  if (!url || !tabId) {
    loadingLogger.error('Cannot save loading state: URL or tabId is empty');
    return false;
  }
  
  try {
    const cacheKey = getLoadingStateKey(url, tabId);
    const loadingState = {
      ...loadingInfo,
      timestamp: Date.now(),
      status: 'loading',
      url: url,
      tabId: tabId
    };
    
    // Compress loading state if beneficial
    const loadingStateToStore = compressLoadingStateIfBeneficial(loadingState);
    
    await chrome.storage.local.set({ [cacheKey]: loadingStateToStore });
    loadingLogger.info('Loading state saved successfully', { 
      url, 
      tabId, 
      cacheKey,
      messageCount: loadingInfo.messageCount || 0,
      compressed: loadingStateToStore.__compressed__ || false
    });
    
    return true;
  } catch (error) {
    loadingLogger.error('Error saving loading state:', { url, tabId, error: error.message });
    return false;
  }
};

/**
 * Update loading state to completed
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @param {string} result - LLM response result
 * @returns {Promise<boolean>} Success status
 */
loadingStateCache.completeLoadingState = async function(url, tabId, result) {
  if (!url || !tabId) {
    loadingLogger.error('Cannot complete loading state: URL or tabId is empty');
    return false;
  }
  
  try {
    const cacheKey = getLoadingStateKey(url, tabId);
    const existingState = await loadingStateCache.getLoadingState(url, tabId);
    
    if (!existingState) {
      loadingLogger.warn('No existing loading state found to complete', { url, tabId });
      return false;
    }
    
    const completedState = {
      ...existingState,
      status: 'completed',
      result: result,
      completedTimestamp: Date.now()
    };
    
    // Compress completed state if beneficial
    const completedStateToStore = compressLoadingStateIfBeneficial(completedState);
    
    await chrome.storage.local.set({ [cacheKey]: completedStateToStore });
    loadingLogger.info('Loading state completed successfully', { 
      url, 
      tabId, 
      cacheKey,
      compressed: completedStateToStore.__compressed__ || false
    });
    
    return true;
  } catch (error) {
    loadingLogger.error('Error completing loading state:', { url, tabId, error: error.message });
    return false;
  }
};

/**
 * Update loading state to error
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @param {string} error - Error message
 * @returns {Promise<boolean>} Success status
 */
loadingStateCache.errorLoadingState = async function(url, tabId, error) {
  if (!url || !tabId) {
    loadingLogger.error('Cannot update loading state to error: URL or tabId is empty');
    return false;
  }
  
  try {
    const cacheKey = getLoadingStateKey(url, tabId);
    const existingState = await loadingStateCache.getLoadingState(url, tabId);
    
    if (!existingState) {
      loadingLogger.warn('No existing loading state found to update to error', { url, tabId });
      return false;
    }
    
    const errorState = {
      ...existingState,
      status: 'error',
      error: error,
      errorTimestamp: Date.now()
    };
    
    await chrome.storage.local.set({ [cacheKey]: errorState });
    loadingLogger.info('Loading state updated to error successfully', { url, tabId, cacheKey, error });
    
    return true;
  } catch (error) {
    loadingLogger.error('Error updating loading state to error:', { url, tabId, error: error.message });
    return false;
  }
};

/**
 * Update loading state to cancelled
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @returns {Promise<boolean>} Success status
 */
loadingStateCache.cancelLoadingState = async function(url, tabId) {
  if (!url || !tabId) {
    loadingLogger.error('Cannot cancel loading state: URL or tabId is empty');
    return false;
  }
  
  try {
    const cacheKey = getLoadingStateKey(url, tabId);
    const existingState = await loadingStateCache.getLoadingState(url, tabId);
    
    if (!existingState) {
      loadingLogger.warn('No existing loading state found to cancel', { url, tabId });
      return false;
    }
    
    const cancelledState = {
      ...existingState,
      status: 'cancelled',
      cancelledTimestamp: Date.now()
    };
    
    await chrome.storage.local.set({ [cacheKey]: cancelledState });
    loadingLogger.info('Loading state cancelled successfully', { url, tabId, cacheKey });
    
    return true;
  } catch (error) {
    loadingLogger.error('Error cancelling loading state:', { url, tabId, error: error.message });
    return false;
  }
};

/**
 * Get loading state for a specific tab
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @returns {Promise<Object|null>} Loading state or null
 */
loadingStateCache.getLoadingState = async function(url, tabId) {
  if (!url || !tabId) {
    loadingLogger.error('Cannot get loading state: URL or tabId is empty');
    return null;
  }
  
  try {
    const cacheKey = getLoadingStateKey(url, tabId);
    const result = await chrome.storage.local.get(cacheKey);
    
    if (!result[cacheKey]) {
      return null;
    }
    
    // Decompress loading state if needed
    let loadingState = decompressLoadingStateIfNeeded(result[cacheKey]);
    
    // Check if loading state is stale (over 20 minutes)
    if (loadingState.status === 'loading') {
      const timeSinceStart = Date.now() - loadingState.timestamp;
      if (timeSinceStart > LOADING_TIMEOUT_MS) {
        loadingLogger.info('Loading state is stale, auto-canceling', { 
          url, 
          tabId, 
          timeSinceStart: Math.round(timeSinceStart / 1000 / 60),
          timeoutMinutes: LOADING_TIMEOUT_MINUTES,
          wasCompressed: result[cacheKey].__compressed__ || false
        });
        
        // Update state to timeout
        const timeoutState = {
          ...loadingState,
          status: 'timeout',
          timeoutTimestamp: Date.now()
        };
        
        await chrome.storage.local.set({ [cacheKey]: timeoutState });
        return timeoutState;
      }
    }
    

    
    return loadingState;
  } catch (error) {
    loadingLogger.error('Error getting loading state:', { url, tabId, error: error.message });
    return null;
  }
};

/**
 * Clear loading state for a specific tab
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @returns {Promise<boolean>} Success status
 */
loadingStateCache.clearLoadingState = async function(url, tabId) {
  if (!url || !tabId) {
    loadingLogger.error('Cannot clear loading state: URL or tabId is empty');
    return false;
  }
  
  try {
    const cacheKey = getLoadingStateKey(url, tabId);
    await chrome.storage.local.remove(cacheKey);
    loadingLogger.info('Loading state cleared successfully', { url, tabId, cacheKey });
    
    return true;
  } catch (error) {
    loadingLogger.error('Error clearing loading state:', { url, tabId, error: error.message });
    return false;
  }
};

/**
 * Clear all loading states for a URL (all tabs)
 * @param {string} url - Page URL
 * @returns {Promise<boolean>} Success status
 */
loadingStateCache.clearAllLoadingStatesForUrl = async function(url) {
  if (!url) {
    loadingLogger.error('Cannot clear loading states: URL is empty');
    return false;
  }

  try {
    const result = await chrome.storage.local.get(null);
    const loadingStateKeys = Object.keys(result).filter(key =>
      key.startsWith(LOADING_STATE_PREFIX) && key.includes(normalizeUrl(url))
    );

    if (loadingStateKeys.length > 0) {
      await chrome.storage.local.remove(loadingStateKeys);
      loadingLogger.info('All loading states cleared for URL', {
        url,
        keysRemoved: loadingStateKeys.length
      });
    }

    return true;
  } catch (error) {
    loadingLogger.error('Error clearing all loading states for URL:', { url, error: error.message });
    return false;
  }
};

/**
 * Cancel all active loading states
 * @returns {Promise<number>} Number of loading states cancelled
 */
loadingStateCache.cancelAllLoadingStates = async function() {
  try {
    loadingLogger.info('Cancelling all active loading states');

    const result = await chrome.storage.local.get(null);
    const loadingStateKeys = Object.keys(result).filter(key =>
      key.startsWith(LOADING_STATE_PREFIX)
    );

    let cancelledCount = 0;
    const updatePromises = [];

    for (const key of loadingStateKeys) {
      const state = result[key];

      // Decompress state if needed
      const loadingState = decompressLoadingStateIfNeeded(state);

      // Only cancel states that are currently loading
      if (loadingState && loadingState.status === 'loading') {
        const cancelledState = {
          ...loadingState,
          status: 'cancelled',
          cancelledTimestamp: Date.now()
        };

        updatePromises.push(
          chrome.storage.local.set({ [key]: cancelledState })
        );
        cancelledCount++;

        loadingLogger.debug('Cancelling loading state', {
          key,
          url: loadingState.url,
          tabId: loadingState.tabId
        });
      }
    }

    // Wait for all updates to complete
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    loadingLogger.info('All active loading states cancelled', {
      totalStatesChecked: loadingStateKeys.length,
      cancelledCount
    });

    return cancelledCount;
  } catch (error) {
    loadingLogger.error('Error cancelling all loading states:', error.message);
    return 0;
  }
};

/**
 * Get all active loading states
 * @returns {Promise<Array>} Array of active loading states
 */
loadingStateCache.getActiveLoadingStates = async function() {
  try {
    const result = await chrome.storage.local.get(null);
    const loadingStates = [];
    
    for (const key in result) {
      if (key.startsWith(LOADING_STATE_PREFIX)) {
        const state = result[key];
        if (state && state.status === 'loading') {
          // Check if still within timeout
          const timeSinceStart = Date.now() - state.timestamp;
          if (timeSinceStart <= LOADING_TIMEOUT_MS) {
            loadingStates.push(state);
          }
        }
      }
    }
    
    // loadingLogger.info('Retrieved active loading states', { count: loadingStates.length });
    return loadingStates;
  } catch (error) {
    loadingLogger.error('Error getting active loading states:', error.message);
    return [];
  }
};

// Helper functions

/**
 * Get storage key for loading state
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @returns {string} Storage key
 */
function getLoadingStateKey(url, tabId) {
  return KeyHelpers.getLoadingStateKey(normalizeUrl(url), tabId);
}

/**
 * Normalize URL for consistency
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    return url.trim().toLowerCase();
  } catch (error) {
    loadingLogger.error('Error normalizing URL:', error.message);
    return url;
  }
} 