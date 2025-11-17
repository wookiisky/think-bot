// background/handlers/tabActivationHandler.js

// Ensure necessary global variables (like serviceLogger, isRestrictedPage, safeSendMessage) 
// are available from service-worker.js or passed as parameters.

async function handleTabActivated(activeInfo, serviceLogger, isRestrictedPage, safeSendMessage) {
    const { tabId } = activeInfo;
    serviceLogger.info(`TAB_ACTIVATED: Processing tab ${tabId}`);

    try {
        // Phase 1: Attempt to disable the side panel for the newly activated tab.
        try {
            await chrome.sidePanel.setOptions({
                tabId: tabId,
                enabled: false
            });
        } catch (error) {
            serviceLogger.warn(`TAB_ACTIVATED: Error disabling side panel for tab ${tabId}:`, error.message);
        }

        // Phase 2: Get tab details.
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

        // Phase 3: Conditionally re-enable the side panel after a short delay.
        setTimeout(async () => {
            try {
                if (!isRestrictedPage(currentUrl)) {
                    await chrome.sidePanel.setOptions({
                        tabId: tabId,
                        enabled: true
                    });
                }
            } catch (error) {
                serviceLogger.warn(`TAB_ACTIVATED: Error re-enabling side panel for tab ${tabId}:`, error.message);
            }
        }, 100);

        // Phase 4: Notify the sidebar about the tab change if URL is available.
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