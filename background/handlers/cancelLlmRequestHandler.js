/**
 * Handle canceling LLM request
 * @param {Object} data - Request data containing url, tabId, and optional branchId
 * @param {Object} serviceLogger - Service logger instance
 * @param {Object} loadingStateCache - Loading state cache instance
 * @returns {Promise<Object>} Operation result
 */
async function handleCancelLlmRequest(data, serviceLogger, loadingStateCache) {
    const { url, tabId, branchId } = data;
    
    if (!url || !tabId) {
        const error = 'Missing required fields: url and tabId are required';
        serviceLogger.error('CANCEL_LLM_REQUEST: Missing required fields');
        return { type: 'CANCEL_LLM_REQUEST_ERROR', error };
    }
    
    try {
        const branchInfo = branchId ? ` and branch ${branchId}` : '';
        serviceLogger.info(`CANCEL_LLM_REQUEST: Canceling request for tab ${tabId}${branchInfo}`);
        
        // Get current loading state
        const cacheKey = branchId ? `${tabId}:${branchId}` : tabId;
        const loadingState = await loadingStateCache.getLoadingState(url, cacheKey);
        
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
            if (branchId) {
                // Cancel specific branch request
                httpRequestCancelled = RequestTracker.cancelBranchRequest(tabId, branchId);
                if (httpRequestCancelled) {
                    serviceLogger.info(`CANCEL_LLM_REQUEST: HTTP request cancelled for tab ${tabId} branch ${branchId}`);
                } else {
                    serviceLogger.warn(`CANCEL_LLM_REQUEST: No active HTTP request found for tab ${tabId} branch ${branchId}`);
                }
            } else {
                // Cancel main request
                httpRequestCancelled = RequestTracker.cancelRequest(tabId);
                if (httpRequestCancelled) {
                    serviceLogger.info(`CANCEL_LLM_REQUEST: HTTP request cancelled for tab ${tabId}`);
                } else {
                    serviceLogger.warn(`CANCEL_LLM_REQUEST: No active HTTP request found for tab ${tabId}`);
                }
            }
        }

        // Update loading state to cancelled
        const success = await loadingStateCache.cancelLoadingState(url, cacheKey);

        if (success || httpRequestCancelled) {
            serviceLogger.info(`CANCEL_LLM_REQUEST: Successfully cancelled for tab ${tabId}${branchInfo}`, {
                httpRequestCancelled,
                loadingStateCancelled: success,
                branchId: branchId || null
            });

            // Broadcast cancellation to all sidebar instances for this URL
            broadcastLoadingStateUpdate(url, tabId, 'cancelled', null, null, null, null, branchId);

            return {
                type: 'LLM_REQUEST_CANCELLED',
                success: true,
                branchId: branchId || null
            };
        } else {
            serviceLogger.warn(`CANCEL_LLM_REQUEST: Failed to cancel for tab ${tabId}${branchInfo}`);
            return {
                type: 'CANCEL_LLM_REQUEST_ERROR',
                error: 'Failed to cancel request',
                branchId: branchId || null
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
 * @param {string} finishReason - Optional finish reason
 * @param {string} errorDetails - Optional error details
 * @param {string} branchId - Optional branch ID
 */
function broadcastLoadingStateUpdate(url, tabId, status, result = null, error = null, finishReason = null, errorDetails = null, branchId = null) {
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
                            finishReason: finishReason,
                            errorDetails: errorDetails,
                            branchId: branchId,
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