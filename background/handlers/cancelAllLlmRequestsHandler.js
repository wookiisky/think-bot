// background/handlers/cancelAllLlmRequestsHandler.js

/**
 * Handle cancelling all LLM requests
 * @param {Object} serviceLogger - Service logger instance
 * @param {Object} loadingStateCache - Loading state cache instance
 * @returns {Promise<Object>} Response object
 */
async function handleCancelAllLlmRequests(serviceLogger, loadingStateCache) {
    try {
        serviceLogger.info('CANCEL_ALL_LLM_REQUESTS: Starting to cancel all active LLM requests');

        let totalCancelled = 0;
        let httpRequestsCancelled = 0;
        let loadingStatesCancelled = 0;

        // First, cancel all HTTP requests using RequestTracker
        if (typeof RequestTracker !== 'undefined') {
            httpRequestsCancelled = RequestTracker.cancelAllRequests();
            serviceLogger.info(`CANCEL_ALL_LLM_REQUESTS: Cancelled ${httpRequestsCancelled} HTTP requests`);
            totalCancelled += httpRequestsCancelled;
        } else {
            serviceLogger.warn('CANCEL_ALL_LLM_REQUESTS: RequestTracker not available');
        }

        // Then, cancel all loading states
        if (loadingStateCache && loadingStateCache.cancelAllLoadingStates) {
            loadingStatesCancelled = await loadingStateCache.cancelAllLoadingStates();
            serviceLogger.info(`CANCEL_ALL_LLM_REQUESTS: Cancelled ${loadingStatesCancelled} loading states`);
            totalCancelled += loadingStatesCancelled;
        } else {
            serviceLogger.warn('CANCEL_ALL_LLM_REQUESTS: Loading state cache not available or missing cancelAllLoadingStates method');
        }

        serviceLogger.info(`CANCEL_ALL_LLM_REQUESTS: Successfully cancelled all requests`, {
            httpRequestsCancelled,
            loadingStatesCancelled,
            totalCancelled
        });

        return {
            type: 'ALL_LLM_REQUESTS_CANCELLED',
            success: true,
            httpRequestsCancelled,
            loadingStatesCancelled,
            totalCancelled
        };

    } catch (error) {
        serviceLogger.error('CANCEL_ALL_LLM_REQUESTS error:', error.message);
        return {
            type: 'CANCEL_ALL_LLM_REQUESTS_ERROR',
            success: false,
            error: error.message || 'Failed to cancel all requests'
        };
    }
}
