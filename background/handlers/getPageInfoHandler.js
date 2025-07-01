// background/handlers/getPageInfoHandler.js

/**
 * Handles the GET_PAGE_INFO message to retrieve all relevant data for a given URL in a single request.
 * This includes page state, content, chat history, and extraction method.
 *
 * @param {object} data - The message data, containing the URL.
 * @param {object} serviceLogger - The logger instance.
 * @param {object} configManager - The storage configuration manager.
 * @param {object} storage - The storage module.
 * @param {object} contentExtractor - The content extractor module.
 * @param {function} safeSendTabMessage - A function to safely send messages to content scripts.
 * @returns {Promise<object>} A promise that resolves to the response message.
 */
async function handleGetPageInfo(data, serviceLogger, configManager, storage, contentExtractor, safeSendTabMessage) {
  const { url } = data;
  if (!url) {
    serviceLogger.error('GET_PAGE_INFO: URL is required');
    return { type: 'PAGE_INFO_ERROR', error: 'URL is required' };
  }

  serviceLogger.info(`GET_PAGE_INFO: Getting all page info for ${url}`);

  try {
    // 1. Get config and default extraction method
    const config = await configManager.getConfig();
    const basicConfig = config.basic || config;
    const defaultMethod = basicConfig.defaultExtractionMethod;

    // 2. Get all data from storage in parallel
    const [pageState, cachedContent, chatHistory] = await Promise.all([
      storage.getPageState(url),
      storage.getPageContent(url, defaultMethod),
      storage.getChatHistory(url)
    ]);

    let extractedContent = cachedContent;

    // 3. If content is not cached, extract it
    if (!extractedContent) {
      serviceLogger.info(`GET_PAGE_INFO: No cached content for ${url}. Extracting with ${defaultMethod}.`);
      // This block is similar to the logic in the old getPageDataHandler
      let htmlContent = null;
      if (defaultMethod === 'readability') {
        htmlContent = await new Promise((resolve, reject) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
              serviceLogger.error('GET_PAGE_INFO: Error querying tabs:', chrome.runtime.lastError.message);
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (tabs.length === 0) {
              serviceLogger.warn('GET_PAGE_INFO: No active tab found');
              resolve(null);
              return;
            }
            safeSendTabMessage(tabs[0].id, { type: 'GET_HTML_CONTENT' }, (response) => {
              if (chrome.runtime.lastError) {
                if (chrome.runtime.lastError.message === "Could not establish connection. Receiving end does not exist.") {
                  resolve('CONTENT_SCRIPT_NOT_CONNECTED');
                } else {
                  resolve(null);
                }
              } else {
                resolve(response?.htmlContent || null);
              }
            });
          });
        });
      }

      if (defaultMethod === 'readability' && htmlContent === 'CONTENT_SCRIPT_NOT_CONNECTED') {
        serviceLogger.warn('GET_PAGE_INFO: Content script not connected.');
        return { type: 'PAGE_INFO_ERROR', error: 'CONTENT_SCRIPT_NOT_CONNECTED' };
      }
      
      if (defaultMethod === 'readability' && !htmlContent) {
        serviceLogger.warn('GET_PAGE_INFO: HTML content not available for readability.');
        // Still return other data, but content will be null
      } else {
        const newlyExtractedContent = await contentExtractor.extract(url, htmlContent, defaultMethod, config);
        if (newlyExtractedContent) {
          serviceLogger.info(`GET_PAGE_INFO: Content extracted successfully - length: ${newlyExtractedContent.length}`);
          extractedContent = newlyExtractedContent;

          // Save the newly extracted content
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
            serviceLogger.warn('GET_PAGE_INFO: Failed to get page metadata:', metadataError.message);
          }
          await storage.savePageData(url, extractedContent, defaultMethod, metadata, null);
          serviceLogger.info(`GET_PAGE_INFO: Page data saved for ${url}`);
        } else {
          serviceLogger.warn('GET_PAGE_INFO: Content extraction failed.');
        }
      }
    }

    // 4. Construct and return the unified response
    const pageInfo = {
      pageState: pageState || {}, // Return empty object if no state found
      content: extractedContent,
      chatHistory: chatHistory,
      extractionMethod: defaultMethod
    };

    serviceLogger.info('GET_PAGE_INFO: Successfully retrieved all page info.', { url });
    return {
      type: 'PAGE_INFO_LOADED',
      data: pageInfo
    };

  } catch (error) {
    serviceLogger.error('GET_PAGE_INFO error:', error.message);
    return { type: 'PAGE_INFO_ERROR', error: error.message || 'Failed to get page info' };
  }
}