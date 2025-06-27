// background/handlers/switchExtractionMethodHandler.js

async function handleSwitchExtractionMethod(data, serviceLogger, configManager, storage, contentExtractor, safeSendTabMessage) {
    const { url, method } = data;
    serviceLogger.info(`SWITCH_METHOD: Starting for ${url} with method ${method}`);

    // Check if we have cached content for this method
    const cachedContent = await storage.getPageContent(url, method);

    if (cachedContent) {
        serviceLogger.info(`SWITCH_METHOD: Found cached content for ${method}, length: ${cachedContent.length}`);
        return {
            type: 'CONTENT_UPDATED',
            content: cachedContent,
            extractionMethod: method
        };
    }

    // No cache, need to extract content
    serviceLogger.info(`SWITCH_METHOD: No cached content for ${method}, extracting...`);
    const config = await configManager.getConfig();

    let htmlContent = null;
    if (method === 'readability') {
        htmlContent = await new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError) {
                    serviceLogger.error('SWITCH_METHOD: Error querying tabs:', chrome.runtime.lastError.message);
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (tabs.length === 0) {
                    serviceLogger.warn('SWITCH_METHOD: No active tab found');
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

    try {
        if (method === 'readability' && !htmlContent) {
            serviceLogger.warn('SWITCH_METHOD: HTML content not available for readability');
            return {
                type: 'CONTENT_UPDATE_ERROR',
                error: 'page_loading_or_script_issue'
            };
        }
        if (method === 'readability' && htmlContent === 'CONTENT_SCRIPT_NOT_CONNECTED') {
            serviceLogger.warn('SWITCH_METHOD: Content script not connected');
            return {
                type: 'CONTENT_UPDATE_ERROR',
                error: 'CONTENT_SCRIPT_NOT_CONNECTED'
            };
        }

        const extractedContent = await contentExtractor.extract(url, htmlContent, method, config);

        if (extractedContent) {
            serviceLogger.info(`SWITCH_METHOD: Success - content length: ${extractedContent.length}`);
            await storage.savePageContent(url, extractedContent, method);
            return { type: 'CONTENT_UPDATED', content: extractedContent, extractionMethod: method };
        } else {
            serviceLogger.warn('SWITCH_METHOD: Failed - no content extracted');
            return { type: 'CONTENT_UPDATE_ERROR', error: 'Failed to extract content' };
        }
    } catch (error) {
        serviceLogger.error('SWITCH_METHOD error:', error.message);
        return { 
            type: 'CONTENT_UPDATE_ERROR', 
            error: `Extraction failed: ${error.message || 'Content extraction failed'}` 
        };
    }
} 