// background/handlers/clearAllLoadingStatesForUrlHandler.js

async function handleClearAllLoadingStatesForUrl(data, serviceLogger, loadingStateCache) {
    const { url } = data;
    
    if (!url) {
        const error = 'Missing required field: url is required';
        serviceLogger.error('CLEAR_ALL_LOADING_STATES_FOR_URL error:', error);
        return { type: 'CLEAR_ALL_LOADING_STATES_FOR_URL_ERROR', error };
    }
    
    try {
        serviceLogger.info(`Clearing all loading states for URL: ${url}`);
        
        const success = await loadingStateCache.clearAllLoadingStatesForUrl(url);
        
        if (success) {
            serviceLogger.info(`All loading states cleared successfully for URL: ${url}`);
            return { 
                type: 'ALL_LOADING_STATES_CLEARED', 
                success: true 
            };
        } else {
            serviceLogger.warn(`Failed to clear all loading states for URL: ${url}`);
            return { 
                type: 'CLEAR_ALL_LOADING_STATES_FOR_URL_ERROR', 
                error: 'Failed to clear all loading states'
            };
        }
    } catch (error) {
        serviceLogger.error('Error clearing all loading states for URL:', error);
        return { 
            type: 'CLEAR_ALL_LOADING_STATES_FOR_URL_ERROR', 
            error: error.message || 'Failed to clear all loading states' 
        };
    }
}

// Export the handler function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = handleClearAllLoadingStatesForUrl;
}
