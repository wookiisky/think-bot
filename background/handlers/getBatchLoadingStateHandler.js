/**
 * Handle GET_BATCH_LOADING_STATE message
 * Optimized batch processing for multiple loading state requests
 * @param {Object} data - Message data containing urls and tabIds arrays
 * @param {Object} serviceLogger - Service worker logger
 * @param {Object} loadingStateCache - Loading state cache module
 * @returns {Promise<Object>} Response object with all loading states
 */
async function handleGetBatchLoadingState(data, serviceLogger, loadingStateCache) {
  const { url, tabIds } = data;
  
  if (!url || !Array.isArray(tabIds) || tabIds.length === 0) {
    serviceLogger.warn('GET_BATCH_LOADING_STATE: Missing url or tabIds array');
    return { type: 'BATCH_LOADING_STATE_ERROR', error: 'Missing url or tabIds array' };
  }
  
  try {
    const startTime = Date.now();
    serviceLogger.info(`GET_BATCH_LOADING_STATE: Fetching loading states for ${tabIds.length} tabs`);

    const normalize = (value) => {
      if (!value || typeof value !== 'string') {
        return '';
      }
      return value.trim().toLowerCase();
    };
    const normalizedUrl = normalize(url);

    // Preload active loading states once so we can aggregate branch loaders per tab
    let activeStates = [];
    try {
      activeStates = await loadingStateCache.getActiveLoadingStates();
    } catch (activeError) {
      serviceLogger.warn('GET_BATCH_LOADING_STATE: Failed to load active branch states, continuing with direct lookups', activeError.message);
      activeStates = [];
    }
    
    // Process all tab IDs in parallel for better performance
    const loadingStatePromises = tabIds.map(async (tabId) => {
      try {
        let loadingState = await loadingStateCache.getLoadingState(url, tabId);

        // If no direct state or not actively loading, attempt to aggregate branch loading states
        if (!loadingState || loadingState.status !== 'loading') {
          const matchingStates = (activeStates || []).filter((state) => {
            if (!state) {
              return false;
            }
            const sameUrl = normalize(state.url) === normalizedUrl;
            if (!sameUrl) {
              return false;
            }
            if (state.tabId === tabId) {
              return true;
            }
            return typeof state.tabId === 'string' && state.tabId.startsWith(`${tabId}:`);
          });

          if (matchingStates.length > 0) {
            loadingState = matchingStates.reduce((latest, current) => {
              if (!latest) {
                return current;
              }
              return current.timestamp > latest.timestamp ? current : latest;
            }, null);
            serviceLogger.info(`GET_BATCH_LOADING_STATE: Aggregated branch loading state for tab ${tabId}`, {
              totalMatches: matchingStates.length,
              aggregatedTabId: loadingState?.tabId
            });
          }
        }
        
        return {
          tabId: tabId,
          url: url,
          loadingState: loadingState,
          success: true
        };
      } catch (error) {
        serviceLogger.warn(`GET_BATCH_LOADING_STATE: Error fetching loading state for tab ${tabId}:`, error.message);
        return {
          tabId: tabId,
          url: url,
          loadingState: null,
          success: false,
          error: error.message
        };
      }
    });
    
    // Wait for all requests to complete
    const results = await Promise.all(loadingStatePromises);
    
    const requestTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    serviceLogger.info(`GET_BATCH_LOADING_STATE: Completed ${tabIds.length} requests in ${requestTime}ms (${successCount} success, ${failedCount} failed)`);
    
    return {
      type: 'BATCH_LOADING_STATE_LOADED',
      url: url,
      results: results,
      success: true,
      requestTime: requestTime
    };
    
  } catch (error) {
    serviceLogger.error('GET_BATCH_LOADING_STATE: Error processing batch request:', error.message);
    return { 
      type: 'BATCH_LOADING_STATE_ERROR', 
      error: error.message 
    };
  }
}
