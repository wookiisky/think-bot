// background/request-tracker.js

/**
 * Global request tracker for managing AbortControllers
 * Allows cancellation of ongoing LLM requests by tabId
 */

// Map to store active requests: tabId -> { abortController, url, timestamp }
const activeRequests = new Map();

// Logger for request tracker
const requestTrackerLogger = logger ? logger.createModuleLogger('RequestTracker') : console;

/**
 * Register a new request with its AbortController
 * @param {string} tabId - Tab ID
 * @param {string} url - Page URL
 * @param {AbortController} abortController - Abort controller for the request
 */
function registerRequest(tabId, url, abortController) {
    if (!tabId || !url || !abortController) {
        requestTrackerLogger.error('Cannot register request: missing required parameters', {
            tabId, url, hasAbortController: !!abortController
        });
        return false;
    }

    // Cancel any existing request for this tab
    if (activeRequests.has(tabId)) {
        requestTrackerLogger.info('Cancelling existing request for tab before registering new one', { tabId });
        cancelRequest(tabId);
    }

    const requestInfo = {
        abortController,
        url,
        timestamp: Date.now()
    };

    activeRequests.set(tabId, requestInfo);
    requestTrackerLogger.info('Request registered successfully', {
        tabId,
        url,
        activeRequestsCount: activeRequests.size
    });

    return true;
}

/**
 * Cancel a request by tabId
 * @param {string} tabId - Tab ID
 * @returns {boolean} Success status
 */
function cancelRequest(tabId) {
    if (!tabId) {
        requestTrackerLogger.error('Cannot cancel request: tabId is required');
        return false;
    }

    const requestInfo = activeRequests.get(tabId);
    if (!requestInfo) {
        requestTrackerLogger.warn('No active request found to cancel', { tabId });
        return false;
    }

    try {
        // Abort the request
        requestInfo.abortController.abort();
        
        // Remove from active requests
        activeRequests.delete(tabId);
        
        requestTrackerLogger.info('Request cancelled successfully', {
            tabId,
            url: requestInfo.url,
            requestDuration: Date.now() - requestInfo.timestamp,
            activeRequestsCount: activeRequests.size
        });

        return true;
    } catch (error) {
        requestTrackerLogger.error('Error cancelling request', {
            tabId,
            error: error.message
        });
        return false;
    }
}

/**
 * Unregister a completed request
 * @param {string} tabId - Tab ID
 */
function unregisterRequest(tabId) {
    if (!tabId) {
        requestTrackerLogger.error('Cannot unregister request: tabId is required');
        return;
    }

    const requestInfo = activeRequests.get(tabId);
    if (requestInfo) {
        activeRequests.delete(tabId);
        requestTrackerLogger.info('Request unregistered successfully', {
            tabId,
            url: requestInfo.url,
            requestDuration: Date.now() - requestInfo.timestamp,
            activeRequestsCount: activeRequests.size
        });
    }
}

/**
 * Get active request info for a tab
 * @param {string} tabId - Tab ID
 * @returns {Object|null} Request info or null if not found
 */
function getRequestInfo(tabId) {
    return activeRequests.get(tabId) || null;
}

/**
 * Get all active requests
 * @returns {Array} Array of active request info
 */
function getAllActiveRequests() {
    const requests = [];
    for (const [tabId, requestInfo] of activeRequests) {
        requests.push({
            tabId,
            url: requestInfo.url,
            timestamp: requestInfo.timestamp,
            duration: Date.now() - requestInfo.timestamp
        });
    }
    return requests;
}

/**
 * Cancel all active requests
 * @returns {number} Number of requests cancelled
 */
function cancelAllRequests() {
    const count = activeRequests.size;
    
    for (const [tabId, requestInfo] of activeRequests) {
        try {
            requestInfo.abortController.abort();
            requestTrackerLogger.info('Request cancelled during cleanup', {
                tabId,
                url: requestInfo.url
            });
        } catch (error) {
            requestTrackerLogger.error('Error cancelling request during cleanup', {
                tabId,
                error: error.message
            });
        }
    }
    
    activeRequests.clear();
    requestTrackerLogger.info('All requests cancelled', { cancelledCount: count });
    
    return count;
}

/**
 * Cleanup stale requests (older than 30 minutes)
 */
function cleanupStaleRequests() {
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    const staleTabIds = [];

    for (const [tabId, requestInfo] of activeRequests) {
        if (now - requestInfo.timestamp > STALE_THRESHOLD) {
            staleTabIds.push(tabId);
        }
    }

    for (const tabId of staleTabIds) {
        requestTrackerLogger.warn('Cleaning up stale request', {
            tabId,
            age: now - activeRequests.get(tabId).timestamp
        });
        cancelRequest(tabId);
    }

    if (staleTabIds.length > 0) {
        requestTrackerLogger.info('Stale requests cleanup completed', {
            cleanedCount: staleTabIds.length,
            remainingCount: activeRequests.size
        });
    }
}

// Periodic cleanup of stale requests (every 10 minutes)
setInterval(cleanupStaleRequests, 10 * 60 * 1000);

// Export functions for use in service worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        registerRequest,
        cancelRequest,
        unregisterRequest,
        getRequestInfo,
        getAllActiveRequests,
        cancelAllRequests,
        cleanupStaleRequests
    };
} else {
    // Make functions available globally in service worker context
    self.RequestTracker = {
        registerRequest,
        cancelRequest,
        unregisterRequest,
        getRequestInfo,
        getAllActiveRequests,
        cancelAllRequests,
        cleanupStaleRequests
    };
}
