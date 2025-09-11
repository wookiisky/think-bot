// background/handlers/getLoadingStateHandler.js

async function handleGetLoadingState(data, serviceLogger, loadingStateCache) {
    const { url, tabId } = data;
    
    if (!url || !tabId) {
        const error = 'Missing required fields: url and tabId are required';
        serviceLogger.error('GET_LOADING_STATE error:', error);
        return { type: 'GET_LOADING_STATE_ERROR', error };
    }
    
    try {
        // First, try direct lookup (works for non-branch keys)
        const directState = await loadingStateCache.getLoadingState(url, tabId);
        if (directState && directState.status === 'loading') {
            serviceLogger.info(`Loading state (direct) for tab ${tabId}:`, directState.status);
            return { type: 'LOADING_STATE_LOADED', loadingState: directState };
        }

        // Aggregate across branch keys: any active loading state for this tab or its branches
        const normalize = (u) => {
            try { return (u || '').trim().toLowerCase(); } catch { return u; }
        };
        const normalizedUrl = normalize(url);

        // Pull all active loading states once and filter
        const activeStates = await loadingStateCache.getActiveLoadingStates();
        const matchingStates = (activeStates || []).filter((state) => {
            if (!state) return false;
            const sameUrl = normalize(state.url) === normalizedUrl;
            const sameTabOrBranch = state.tabId === tabId || (typeof state.tabId === 'string' && state.tabId.startsWith(`${tabId}:`));
            return sameUrl && sameTabOrBranch;
        });

        if (matchingStates.length > 0) {
            // Choose the most recent loading state
            const latest = matchingStates.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
            serviceLogger.info(`Aggregated loading state found for tab ${tabId} with branches`, {
                count: matchingStates.length,
                latestTimestamp: latest.timestamp,
                exampleTabId: latest.tabId
            });
            return { type: 'LOADING_STATE_LOADED', loadingState: latest };
        }

        // If we had a non-loading direct state (completed/error/timeout), return it for completeness
        if (directState) {
            serviceLogger.info(`Loading state (direct, non-loading) for tab ${tabId}:`, directState.status);
            return { type: 'LOADING_STATE_LOADED', loadingState: directState };
        }

        // Nothing found
        return { type: 'LOADING_STATE_LOADED', loadingState: null };
    } catch (error) {
        serviceLogger.error('Error getting loading state:', error);
        return { 
            type: 'GET_LOADING_STATE_ERROR', 
            error: error.message || 'Failed to get loading state' 
        };
    }
} 