// background/handlers/clearLoadingStateHandler.js

async function handleClearLoadingState(data, serviceLogger, loadingStateCache) {
    const { url, tabId } = data;
    
    if (!url || !tabId) {
        const error = 'Missing required fields: url and tabId are required';
        serviceLogger.error('CLEAR_LOADING_STATE error:', error);
        return { type: 'CLEAR_LOADING_STATE_ERROR', error };
    }
    
    try {
        serviceLogger.info(`Clearing loading state for URL: ${url}, tabId: ${tabId}`);
        
        const success = await loadingStateCache.clearLoadingState(url, tabId);
        
        if (success) {
            serviceLogger.info(`Loading state cleared successfully for tab ${tabId}`);
            return { 
                type: 'LOADING_STATE_CLEARED', 
                success: true 
            };
        } else {
            serviceLogger.warn(`Failed to clear loading state for tab ${tabId}`);
            return { 
                type: 'CLEAR_LOADING_STATE_ERROR', 
                error: 'Failed to clear loading state'
            };
        }
    } catch (error) {
        serviceLogger.error('Error clearing loading state:', error);
        return { 
            type: 'CLEAR_LOADING_STATE_ERROR', 
            error: error.message || 'Failed to clear loading state' 
        };
    }
} 