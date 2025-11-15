// background/handlers/tabActivationHandler.js

// Ensure necessary global variables (like serviceLogger, isRestrictedPage, safeSendMessage) 
// are available from service-worker.js or passed as parameters.

async function handleTabActivated(activeInfo, serviceLogger, isRestrictedPage, safeSendMessage) {
    const { tabId } = activeInfo;
    serviceLogger.info(`TAB_ACTIVATED: Processing tab ${tabId}`);

    try {
        // Phase 1: Get tab details.
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
        serviceLogger.info(`TAB_ACTIVATED: Processing tab ${tabId} - ${currentUrl}`);

        // Phase 2: Set side panel state based on page type
        // Enable for normal pages, disable for restricted pages
        try {
            const shouldEnable = currentUrl && !isRestrictedPage(currentUrl);
            await chrome.sidePanel.setOptions({
                tabId: tabId,
                enabled: shouldEnable
            });
            serviceLogger.info(`TAB_ACTIVATED: Side panel ${shouldEnable ? 'enabled' : 'disabled'} for tab ${tabId}`);
        } catch (error) {
            serviceLogger.warn(`TAB_ACTIVATED: Error setting side panel state for tab ${tabId}:`, error.message);
        }

        // Phase 3: Notify the sidebar about the tab change if URL is available.
        if (currentUrl) {
            safeSendMessage({
                type: 'TAB_CHANGED',
                url: currentUrl
            });
        } else {
            serviceLogger.info(`TAB_ACTIVATED: Tab ${tabId} has undefined URL`);
        }

    } catch (error) {
        serviceLogger.error(`TAB_ACTIVATED: Critical error for tab ${tabId}:`, error.message);
    }
} 