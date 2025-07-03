// background/handlers/clearUrlDataHandler.js

async function handleClearUrlData(data, serviceLogger, storage) {
    const { url, clearContent = true, clearChat = true, clearMetadata = true, wildcard = false, softDelete = false } = data;
    if (!url) {
        const errorMsg = chrome.i18n.getMessage('global_error_no_url');
        serviceLogger.warn(`CLEAR_URL_DATA: ${errorMsg}`);
        return { success: false, error: errorMsg };
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
        const errorMsg = success ? null : (softDelete ? chrome.i18n.getMessage('global_error_failed_to_soft_delete') : chrome.i18n.getMessage('global_error_failed_to_clear_storage'));
        return { success, error: errorMsg };
    } catch (error) {
        serviceLogger.error('CLEAR_URL_DATA error:', error.message);
        const errorMsg = error.message || (softDelete ? chrome.i18n.getMessage('global_error_failed_to_soft_delete') : chrome.i18n.getMessage('global_error_failed_to_clear_storage'));
        return { success: false, error: errorMsg };
    }
}

// Handle soft delete for sync purposes
async function handleSoftDeleteUrlData(data, serviceLogger, storage) {
    const { url, clearContent = true, clearChat = true, wildcard = false } = data;
    if (!url) {
        const errorMsg = chrome.i18n.getMessage('global_error_no_url');
        serviceLogger.warn(`SOFT_DELETE_URL_DATA: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    try {
        serviceLogger.info(`SOFT_DELETE_URL_DATA: Soft deleting data for ${url}${wildcard ? ' (with wildcard matching)' : ''}`);

        // Use soft delete mode
        const success = await storage.softDeleteUrlData(url, clearContent, clearChat, wildcard);

        if (!success) {
            serviceLogger.warn(`SOFT_DELETE_URL_DATA: Failed for ${url}`);
        }
        const errorMsg = success ? null : chrome.i18n.getMessage('global_error_failed_to_soft_delete');
        return { success, error: errorMsg };
    } catch (error) {
        serviceLogger.error('SOFT_DELETE_URL_DATA error:', error.message);
        const errorMsg = error.message || chrome.i18n.getMessage('global_error_failed_to_soft_delete');
        return { success: false, error: errorMsg };
    }
}