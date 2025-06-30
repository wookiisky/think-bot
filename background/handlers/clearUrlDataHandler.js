// background/handlers/clearUrlDataHandler.js

async function handleClearUrlData(data, serviceLogger, storage) {
    const { url, clearContent = true, clearChat = true, clearMetadata = true, wildcard = false, softDelete = false } = data;
    if (!url) {
        serviceLogger.warn('CLEAR_URL_DATA: No URL provided');
        return { success: false, error: 'No URL provided' };
    }

    try {
        const action = softDelete ? 'soft deleting' : 'clearing';
        serviceLogger.info(`CLEAR_URL_DATA: ${action} data for ${url}${wildcard ? ' (with wildcard matching)' : ''}`);

        // Use wildcard mode if specified - useful for clearing all tabs associated with a URL
        const success = await storage.clearUrlData(
            url,
            clearContent,
            clearChat,
            clearMetadata,
            wildcard,
            softDelete
        );

        if (!success) {
            serviceLogger.warn(`CLEAR_URL_DATA: Failed ${action} for ${url}`);
        }
        return { success, error: success ? null : `Failed to ${action.replace('ing', '')} data from storage` };
    } catch (error) {
        serviceLogger.error('CLEAR_URL_DATA error:', error.message);
        return { success: false, error: error.message || 'Failed to clear data' };
    }
}

// Handle soft delete for sync purposes
async function handleSoftDeleteUrlData(data, serviceLogger, storage) {
    const { url, clearContent = true, clearChat = true, wildcard = false } = data;
    if (!url) {
        serviceLogger.warn('SOFT_DELETE_URL_DATA: No URL provided');
        return { success: false, error: 'No URL provided' };
    }

    try {
        serviceLogger.info(`SOFT_DELETE_URL_DATA: Soft deleting data for ${url}${wildcard ? ' (with wildcard matching)' : ''}`);

        // Use soft delete mode
        const success = await storage.softDeleteUrlData(url, clearContent, clearChat, wildcard);

        if (!success) {
            serviceLogger.warn(`SOFT_DELETE_URL_DATA: Failed for ${url}`);
        }
        return { success, error: success ? null : 'Failed to soft delete data from storage' };
    } catch (error) {
        serviceLogger.error('SOFT_DELETE_URL_DATA error:', error.message);
        return { success: false, error: error.message || 'Failed to soft delete data' };
    }
}