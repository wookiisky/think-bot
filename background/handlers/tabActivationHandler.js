// background/handlers/tabActivationHandler.js

// Ensure necessary global variables (like serviceLogger, isRestrictedPage, safeSendMessage) 
// are available from service-worker.js or passed as parameters.

async function handleTabActivated(activeInfo, serviceLogger, isRestrictedPage, safeSendMessage) {
    const { tabId } = activeInfo;
    serviceLogger.info(`TAB_ACTIVATED: Processing tab ${tabId}`);

    try {
        // Get tab details first
        let tab;
        try {
            tab = await chrome.tabs.get(tabId);
        } catch (getTabError) {
            serviceLogger.error(`TAB_ACTIVATED: Failed to get tab details for ${tabId}:`, getTabError.message);
            return;
        }

        if (!tab) {
            serviceLogger.warn(`TAB_ACTIVATED: Tab object not retrieved for ${tabId}`);
            return;
        }

        const currentUrl = tab.url;
        serviceLogger.info(`TAB_ACTIVATED: Active tab ${tabId} - ${currentUrl}`);

        // Close side panel when switching tabs to meet UX requirement
        // If the sidebar is not open, message will be ignored by safeSendMessage
        safeSendMessage({ type: 'CLOSE_SIDEBAR' });
        serviceLogger.info('TAB_ACTIVATED: Sent CLOSE_SIDEBAR to side panel');

        // Notify the sidebar about the tab change if URL is available (for state sync when reopened)
        if (currentUrl) {
            safeSendMessage({
                type: 'TAB_CHANGED',
                url: currentUrl
            });
        } else {
            serviceLogger.info(`TAB_ACTIVATED: Tab ${tabId} has undefined URL`);
        }

        // Remove sidePanel enable/disable toggle to avoid race with manual open
        // Opening is handled via action click with restricted page checks

    } catch (error) {
        serviceLogger.error(`TAB_ACTIVATED: Critical error for tab ${tabId}:`, error.message);
    }
} 
