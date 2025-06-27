// background/handlers/reExtractContentHandler.js

async function handleReExtractContent(data, serviceLogger, configManager, storage, contentExtractor, safeSendTabMessage) {
    const { url, method } = data;
    serviceLogger.info(`RE_EXTRACT: Starting for ${url} with method ${method}`);

    const config = await configManager.getConfig();

    let htmlContent = null;
    if (method === 'readability') {
        htmlContent = await new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError) {
                    serviceLogger.error('RE_EXTRACT: Error querying tabs:', chrome.runtime.lastError.message);
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (tabs.length === 0) {
                    serviceLogger.warn('RE_EXTRACT: No active tab found');
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
            serviceLogger.warn('RE_EXTRACT: HTML content not available for readability');
            return {
                type: 'CONTENT_UPDATE_ERROR',
                error: 'page_loading_or_script_issue'
            };
        }
        if (method === 'readability' && htmlContent === 'CONTENT_SCRIPT_NOT_CONNECTED') {
            serviceLogger.warn('RE_EXTRACT: Content script not connected');
            return {
                type: 'CONTENT_UPDATE_ERROR',
                error: 'CONTENT_SCRIPT_NOT_CONNECTED'
            };
        }

        const extractedContent = await contentExtractor.extract(url, htmlContent, method, config, true);

        if (extractedContent) {
            serviceLogger.info(`RE_EXTRACT: Success - content length: ${extractedContent.length}`);
            await storage.savePageContent(url, extractedContent, method);
            return { type: 'CONTENT_UPDATED', content: extractedContent, extractionMethod: method };
        } else {
            serviceLogger.warn('RE_EXTRACT: Failed - no content extracted');
            return { type: 'CONTENT_UPDATE_ERROR', error: 'Failed to re-extract content' };
        }
    } catch (error) {
        serviceLogger.error('RE_EXTRACT error:', error.message);
        return { 
            type: 'CONTENT_UPDATE_ERROR', 
            error: `Re-extraction failed: ${error.message || 'Failed to re-extract content'}` 
        };
    }
} 