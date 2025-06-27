/**
 * Handle canceling LLM request
 * @param {Object} data - Request data containing url and tabId
 * @param {Object} serviceLogger - Service logger instance
 * @param {Object} loadingStateCache - Loading state cache instance
 * @returns {Promise<Object>} Operation result
 */
async function handleCancelLlmRequest(data, serviceLogger, loadingStateCache) {
    const { url, tabId } = data;
    
    if (!url || !tabId) {
        const error = 'Missing required fields: url and tabId are required';
        serviceLogger.error('CANCEL_LLM_REQUEST: Missing required fields');
        return { type: 'CANCEL_LLM_REQUEST_ERROR', error };
    }
    
    try {
        serviceLogger.info(`CANCEL_LLM_REQUEST: Canceling request for tab ${tabId}`);
        
        // Get current loading state
        const loadingState = await loadingStateCache.getLoadingState(url, tabId);
        
        if (!loadingState) {

            return { 
                type: 'CANCEL_LLM_REQUEST_ERROR', 
                error: 'No active request found to cancel'
            };
        }
        
        if (loadingState.status !== 'loading') {
            serviceLogger.warn(`CANCEL_LLM_REQUEST: Request not in loading state: ${loadingState.status}`);
            return { 
                type: 'CANCEL_LLM_REQUEST_ERROR', 
                error: `Request is not active (status: ${loadingState.status})`
            };
        }
        
        // First try to cancel the actual HTTP request using RequestTracker
        let httpRequestCancelled = false;
        if (typeof RequestTracker !== 'undefined') {
            httpRequestCancelled = RequestTracker.cancelRequest(tabId);
            if (httpRequestCancelled) {
                serviceLogger.info(`CANCEL_LLM_REQUEST: HTTP request cancelled for tab ${tabId}`);
            } else {
                serviceLogger.warn(`CANCEL_LLM_REQUEST: No active HTTP request found for tab ${tabId}`);
            }
        }

        // Update loading state to cancelled
        const success = await loadingStateCache.cancelLoadingState(url, tabId);

        if (success || httpRequestCancelled) {
            serviceLogger.info(`CANCEL_LLM_REQUEST: Successfully cancelled for tab ${tabId}`, {
                httpRequestCancelled,
                loadingStateCancelled: success
            });

            // Broadcast cancellation to all sidebar instances for this URL
            broadcastLoadingStateUpdate(url, tabId, 'cancelled');

            return {
                type: 'LLM_REQUEST_CANCELLED',
                success: true
            };
        } else {
            serviceLogger.warn(`CANCEL_LLM_REQUEST: Failed to cancel for tab ${tabId}`);
            return {
                type: 'CANCEL_LLM_REQUEST_ERROR',
                error: 'Failed to cancel request'
            };
        }
    } catch (error) {
        serviceLogger.error('CANCEL_LLM_REQUEST error:', error.message);
        return { 
            type: 'CANCEL_LLM_REQUEST_ERROR', 
            error: error.message || 'Failed to cancel LLM request' 
        };
    }
}

/**
 * Broadcast loading state updates to all connected sidebars
 * @param {string} url - Page URL
 * @param {string} tabId - Tab ID
 * @param {string} status - Loading status
 * @param {string} result - Optional result for completed status
 * @param {string} error - Optional error for error status
 */
function broadcastLoadingStateUpdate(url, tabId, status, result = null, error = null) {
    try {
        chrome.tabs.query({}, (tabs) => {
            if (tabs && tabs.length > 0) {
                tabs.forEach((tab) => {
                    if (tab.url && (tab.url === url || tab.url.includes(new URL(url).hostname))) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'LOADING_STATE_UPDATE',
                            url: url,
                            tabId: tabId,
                            status: status,
                            result: result,
                            error: error,
                            timestamp: Date.now()
                        }).catch(() => {
                            // Silent fail for broadcast errors
                        });
                    }
                });
            }
        });
    } catch (error) {
        // Silent fail for broadcast errors
    }
} 