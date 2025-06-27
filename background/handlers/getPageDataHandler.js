// background/handlers/getPageDataHandler.js

// Ensure modules used here are globally available via importScripts in service-worker.js
// or pass them as arguments if a more modular approach is taken later.

async function handleGetPageData(data, serviceLogger, configManager, storage, contentExtractor, safeSendTabMessage) {
  const { url } = data;
  const config = await configManager.getConfig();
  const defaultMethod = config.defaultExtractionMethod;

  // Get cached content and chat history separately
  const cachedContent = await storage.getPageContent(url, defaultMethod);
  const chatHistory = await storage.getChatHistory(url);

  if (cachedContent) {
    serviceLogger.info(`GET_PAGE_DATA: Found cached content for ${url}`);
    return {
      type: 'PAGE_DATA_LOADED',
      data: {
        content: cachedContent,
        chatHistory: chatHistory,
        extractionMethod: defaultMethod
      }
    };
  } else {
    // Need to extract content
    serviceLogger.info(`GET_PAGE_DATA: Extracting content for ${url} using ${defaultMethod}`);

    try {
      // Request content from content script if needed
      let htmlContent = null;
      if (defaultMethod === 'readability') {
        htmlContent = await new Promise((resolve, reject) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
              serviceLogger.error('GET_PAGE_DATA: Error querying tabs:', chrome.runtime.lastError.message);
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (tabs.length === 0) {
              serviceLogger.warn('GET_PAGE_DATA: No active tab found');
              resolve(null);
              return;
            }

            safeSendTabMessage(
              tabs[0].id,
              { type: 'GET_HTML_CONTENT' },
              (response) => {
                if (chrome.runtime.lastError) {
                  if (chrome.runtime.lastError.message === "Could not establish connection. Receiving end does not exist.") {
                    resolve('CONTENT_SCRIPT_NOT_CONNECTED');
                  } else {
                    resolve(null);
                  }
                } else {
                  resolve(response?.htmlContent || null);
                }
              }
            );
          });
        });
      }

      // Ensure HTML content is available for Readability method
      if (defaultMethod === 'readability' && !htmlContent) {
        serviceLogger.warn('GET_PAGE_DATA: HTML content not available for readability');
        return {
          type: 'PAGE_DATA_ERROR',
          error: 'page_loading_or_script_issue'
        };
      }
      if (defaultMethod === 'readability' && htmlContent === 'CONTENT_SCRIPT_NOT_CONNECTED') {
        serviceLogger.warn('GET_PAGE_DATA: Content script not connected');
        return {
          type: 'PAGE_DATA_ERROR',
          error: 'CONTENT_SCRIPT_NOT_CONNECTED'
        };
      }

      const extractedContent = await contentExtractor.extract(url, htmlContent, defaultMethod, config);

      if (extractedContent) {
        serviceLogger.info(`GET_PAGE_DATA: Content extracted successfully - length: ${extractedContent.length}`);

        // Get page metadata (title and icon) for unified storage
        let metadata = {};
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length > 0) {
            const currentTab = tabs[0];
            metadata = {
              title: currentTab.title || '',
              icon: currentTab.favIconUrl || '',
              timestamp: Date.now()
            };
          }
        } catch (metadataError) {
          serviceLogger.warn('GET_PAGE_DATA: Failed to get page metadata:', metadataError.message);
        }

        // Save content and metadata together using unified storage
        await storage.savePageData(url, extractedContent, defaultMethod, metadata, null);
        serviceLogger.info(`GET_PAGE_DATA: Page data saved for ${url}`, {
          contentLength: extractedContent.length,
          method: defaultMethod,
          metadata
        });

        const freshChatHistory = await storage.getChatHistory(url);
        const newPageData = { content: extractedContent, chatHistory: freshChatHistory, extractionMethod: defaultMethod };
        return { type: 'PAGE_DATA_LOADED', data: newPageData };
      } else {
        serviceLogger.warn('GET_PAGE_DATA: Content extraction failed');
        return { type: 'PAGE_DATA_ERROR', error: 'Failed to extract content' };
      }
    } catch (error) {
      serviceLogger.error('GET_PAGE_DATA error:', error.message);
      return { type: 'PAGE_DATA_ERROR', error: error.message || 'Failed to extract content' };
    }
  }
}

// Make the handler available (e.g. by attaching to a global object if not using ES6 modules directly in SW)
// For now, we'll rely on importScripts and call it directly.
// If this file were a module, you'd export it: export { handleGetPageData }; 