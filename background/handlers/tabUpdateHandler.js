// background/handlers/tabUpdateHandler.js

async function handleTabUpdated(tabId, changeInfo, tab, serviceLogger, configManager, storage, safeSendMessage) {
    if (changeInfo.status === 'complete' && tab && tab.url) {
        serviceLogger.info(`TAB_UPDATED: Page loaded - ${tab.url}`);

        // Ping the sidebar to see if it's open before proceeding
        let isSidebarOpen = false;
        try {
            // Use a timeout to prevent waiting indefinitely
            const response = await Promise.race([
                chrome.runtime.sendMessage({ type: 'PING_SIDEBAR' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
            ]);

            if (response && response.type === 'PONG_SIDEBAR') {
                isSidebarOpen = true;
                serviceLogger.info('TAB_UPDATED: Sidebar is open, proceeding with checks.');
            }
        } catch (error) {
            // An error likely means the sidebar is closed and there's no one to answer the ping.
            // This is expected behavior.
            if (error.message.includes('Could not establish connection. Receiving end does not exist.') || error.message === 'Timeout') {
                serviceLogger.info('TAB_UPDATED: Sidebar is closed (ping failed), aborting auto-load/extract.');
            } else {
                serviceLogger.warn(`TAB_UPDATED: Error pinging sidebar: ${error.message}`);
            }
            isSidebarOpen = false;
        }

        if (!isSidebarOpen) {
            return; // Stop execution if sidebar is not open
        }

        // Check if this is the active tab to avoid unnecessary operations
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const isActiveTab = activeTab && activeTab.id === tabId;

        if (isActiveTab) {
            serviceLogger.info(`TAB_UPDATED: Active tab - checking for auto-load/extract`);

            try {
                const config = await configManager.getConfig();
                // Support both old and new config formats
                const basicConfig = config.basic || config;
                const defaultMethod = basicConfig.defaultExtractionMethod;

                const cachedContent = await storage.getPageContent(tab.url, defaultMethod);

                if (cachedContent) {
                    serviceLogger.info(`TAB_UPDATED: Found cached content for ${tab.url}`);
                    const chatHistory = await storage.getChatHistory(tab.url);
                    safeSendMessage({
                        type: 'AUTO_LOAD_CONTENT',
                        url: tab.url,
                        tabId: tabId,
                        data: {
                            content: cachedContent,
                            chatHistory: chatHistory,
                            extractionMethod: defaultMethod
                        }
                    });
                } else {
                    serviceLogger.info(`TAB_UPDATED: No cached content - requesting auto-extract with ${defaultMethod}`);
                    safeSendMessage({
                        type: 'AUTO_EXTRACT_CONTENT',
                        url: tab.url,
                        tabId: tabId,
                        extractionMethod: defaultMethod
                    });
                }
            } catch (error) {
                serviceLogger.error('TAB_UPDATED error:', error.message);
                safeSendMessage({
                    type: 'TAB_UPDATED',
                    url: tab.url,
                    tabId: tabId
                });
            }
        }
    }
}