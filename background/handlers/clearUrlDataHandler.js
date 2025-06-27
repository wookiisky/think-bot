// background/handlers/clearUrlDataHandler.js

async function handleClearUrlData(data, serviceLogger, storage) {
    const { url, clearContent = true, clearChat = true, clearMetadata = true, wildcard = false } = data;
    if (!url) {
        serviceLogger.warn('CLEAR_URL_DATA: No URL provided');
        return { success: false, error: 'No URL provided' };
    }

    try {
        serviceLogger.info(`CLEAR_URL_DATA: Clearing data for ${url}${wildcard ? ' (with wildcard matching)' : ''}`);

        // Use wildcard mode if specified - useful for clearing all tabs associated with a URL
        const success = await storage.clearUrlData(
            url,
            clearContent,
            clearChat,
            clearMetadata,
            wildcard
        );
        
        if (!success) {
            serviceLogger.warn(`CLEAR_URL_DATA: Failed for ${url}`);
        }
        return { success, error: success ? null : 'Failed to clear data from storage' };
    } catch (error) {
        serviceLogger.error('CLEAR_URL_DATA error:', error.message);
        return { success: false, error: error.message || 'Failed to clear data' };
    }
} 