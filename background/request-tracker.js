// background/request-tracker.js

/**
 * Global request tracker for managing AbortControllers
 * Allows cancellation of ongoing LLM requests by tabId
 */

// Map to store active requests: requestKey -> { abortController, url, timestamp, tabId, branchId }
// requestKey format: "tabId" for main requests, "tabId:branchId" for branch requests
const activeRequests = new Map();

// Logger for request tracker
const requestTrackerLogger = logger ? logger.createModuleLogger('RequestTracker') : console;

/**
 * Generate request key from tabId and optional branchId
 * @param {string} tabId - Tab ID
 * @param {string} branchId - Optional branch ID
 * @returns {string} Request key
 */
function generateRequestKey(tabId, branchId) {
    return branchId ? `${tabId}:${branchId}` : tabId;
}

/**
 * Register a new request with its AbortController
 * @param {string} tabId - Tab ID
 * @param {string} url - Page URL
 * @param {AbortController} abortController - Abort controller for the request
 * @param {string} branchId - Optional branch ID for branch requests
 */
function registerRequest(tabId, url, abortController, branchId = null) {
    if (!tabId || !url || !abortController) {
        requestTrackerLogger.error('Cannot register request: missing required parameters', {
            tabId, url, branchId, hasAbortController: !!abortController
        });
        return false;
    }

    const requestKey = generateRequestKey(tabId, branchId);

    // Cancel any existing request for this key
    if (activeRequests.has(requestKey)) {
        requestTrackerLogger.info('Cancelling existing request before registering new one', { 
            tabId, branchId, requestKey 
        });
        cancelRequestByKey(requestKey);
    }

    const requestInfo = {
        abortController,
        url,
        timestamp: Date.now(),
        tabId,
        branchId
    };

    activeRequests.set(requestKey, requestInfo);
    requestTrackerLogger.info('Request registered successfully', {
        tabId,
        branchId,
        requestKey,
        url,
        activeRequestsCount: activeRequests.size
    });

    return true;
}

/**
 * Cancel a request by key (internal function)
 * @param {string} requestKey - Request key
 * @returns {boolean} Success status
 */
function cancelRequestByKey(requestKey) {
    if (!requestKey) {
        requestTrackerLogger.error('Cannot cancel request: requestKey is required');
        return false;
    }

    const requestInfo = activeRequests.get(requestKey);
    if (!requestInfo) {
        requestTrackerLogger.warn('No active request found to cancel', { requestKey });
        return false;
    }

    try {
        // Abort the request
        requestInfo.abortController.abort();
        
        // Remove from active requests
        activeRequests.delete(requestKey);
        
        requestTrackerLogger.info('Request cancelled successfully', {
            requestKey,
            tabId: requestInfo.tabId,
            branchId: requestInfo.branchId,
            url: requestInfo.url,
            requestDuration: Date.now() - requestInfo.timestamp,
            activeRequestsCount: activeRequests.size
        });

        return true;
    } catch (error) {
        requestTrackerLogger.error('Error cancelling request', {
            requestKey,
            error: error.message
        });
        return false;
    }
}

/**
 * Cancel a request by tabId (for main requests or all requests in a tab)
 * @param {string} tabId - Tab ID
 * @param {boolean} cancelAll - If true, cancel all requests for this tab including branches
 * @returns {boolean} Success status
 */
function cancelRequest(tabId, cancelAll = false) {
    if (!tabId) {
        requestTrackerLogger.error('Cannot cancel request: tabId is required');
        return false;
    }

    if (cancelAll) {
        // Cancel all requests for this tab (including branches)
        return cancelAllRequestsForTab(tabId) > 0;
    } else {
        // Cancel only the main request for this tab
        const requestKey = generateRequestKey(tabId);
        return cancelRequestByKey(requestKey);
    }
}

/**
 * Cancel a specific branch request
 * @param {string} tabId - Tab ID
 * @param {string} branchId - Branch ID
 * @returns {boolean} Success status
 */
function cancelBranchRequest(tabId, branchId) {
    if (!tabId || !branchId) {
        requestTrackerLogger.error('Cannot cancel branch request: tabId and branchId are required', {
            tabId, branchId
        });
        return false;
    }

    const requestKey = generateRequestKey(tabId, branchId);
    return cancelRequestByKey(requestKey);
}

/**
 * Cancel all requests for a specific tab (including branches)
 * @param {string} tabId - Tab ID
 * @returns {number} Number of requests cancelled
 */
function cancelAllRequestsForTab(tabId) {
    if (!tabId) {
        requestTrackerLogger.error('Cannot cancel requests: tabId is required');
        return 0;
    }

    const keysToCancel = [];
    
    // Find all requests for this tab
    for (const [requestKey, requestInfo] of activeRequests) {
        if (requestInfo.tabId === tabId) {
            keysToCancel.push(requestKey);
        }
    }

    let cancelledCount = 0;
    for (const requestKey of keysToCancel) {
        if (cancelRequestByKey(requestKey)) {
            cancelledCount++;
        }
    }

    if (cancelledCount > 0) {
        requestTrackerLogger.info(`Cancelled ${cancelledCount} requests for tab`, { 
            tabId, cancelledCount 
        });
    }

    return cancelledCount;
}

/**
 * Unregister a completed request
 * @param {string} tabId - Tab ID
 * @param {string} branchId - Optional branch ID
 */
function unregisterRequest(tabId, branchId = null) {
    if (!tabId) {
        requestTrackerLogger.error('Cannot unregister request: tabId is required');
        return;
    }

    const requestKey = generateRequestKey(tabId, branchId);
    const requestInfo = activeRequests.get(requestKey);
    if (requestInfo) {
        activeRequests.delete(requestKey);
        requestTrackerLogger.info('Request unregistered successfully', {
            tabId,
            branchId,
            requestKey,
            url: requestInfo.url,
            requestDuration: Date.now() - requestInfo.timestamp,
            activeRequestsCount: activeRequests.size
        });
    }
}

/**
 * Get active request info for a tab
 * @param {string} tabId - Tab ID
 * @param {string} branchId - Optional branch ID
 * @returns {Object|null} Request info or null if not found
 */
function getRequestInfo(tabId, branchId = null) {
    const requestKey = generateRequestKey(tabId, branchId);
    return activeRequests.get(requestKey) || null;
}

/**
 * Check if there's an active request for tab/branch
 * @param {string} tabId - Tab ID
 * @param {string} branchId - Optional branch ID
 * @returns {boolean} True if request is active
 */
function hasActiveRequest(tabId, branchId = null) {
    const requestKey = generateRequestKey(tabId, branchId);
    return activeRequests.has(requestKey);
}

/**
 * Get all active requests
 * @returns {Array} Array of active request info
 */
function getAllActiveRequests() {
    const requests = [];
    for (const [requestKey, requestInfo] of activeRequests) {
        requests.push({
            requestKey,
            tabId: requestInfo.tabId,
            branchId: requestInfo.branchId,
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
    const staleRequestKeys = [];

    for (const [requestKey, requestInfo] of activeRequests) {
        if (now - requestInfo.timestamp > STALE_THRESHOLD) {
            staleRequestKeys.push(requestKey);
        }
    }

    for (const requestKey of staleRequestKeys) {
        const requestInfo = activeRequests.get(requestKey);
        if (requestInfo) {
            requestTrackerLogger.warn('Cleaning up stale request', {
                requestKey,
                tabId: requestInfo.tabId,
                branchId: requestInfo.branchId,
                age: now - requestInfo.timestamp
            });
            cancelRequestByKey(requestKey);
        }
    }

    if (staleRequestKeys.length > 0) {
        requestTrackerLogger.info('Stale requests cleanup completed', {
            cleanedCount: staleRequestKeys.length,
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
        cancelBranchRequest,
        cancelAllRequestsForTab,
        unregisterRequest,
        getRequestInfo,
        hasActiveRequest,
        getAllActiveRequests,
        cancelAllRequests,
        cleanupStaleRequests,
        generateRequestKey,
        cancelRequestByKey
    };
} else {
    // Make functions available globally in service worker context
    self.RequestTracker = {
        registerRequest,
        cancelRequest,
        cancelBranchRequest,
        cancelAllRequestsForTab,
        unregisterRequest,
        getRequestInfo,
        hasActiveRequest,
        getAllActiveRequests,
        cancelAllRequests,
        cleanupStaleRequests,
        generateRequestKey,
        cancelRequestByKey
    };
}
