// background/handlers/tabUpdateHandler.js

async function handleTabUpdated(tabId, changeInfo, tab, serviceLogger, configManager, storage, safeSendMessage) {
    if (changeInfo.status === 'complete' && tab && tab.url) {
        serviceLogger.info(`TAB_UPDATED: Page loaded - ${tab.url}`);

        // Check if this is the active tab to avoid unnecessary operations
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const isActiveTab = activeTab && activeTab.id === tabId;

        if (isActiveTab) {
            serviceLogger.info(`TAB_UPDATED: Active tab - checking for auto-load/extract`);

            try {
                const config = await configManager.getConfig();
                const defaultMethod = config.defaultExtractionMethod;

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