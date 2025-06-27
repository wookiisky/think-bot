// background/handlers/configHandler.js

async function handleGetConfig(configManager, serviceLogger) {
    serviceLogger.info('GET_CONFIG: Loading configuration');
    try {
        const config = await configManager.getConfig();
        return { 
            type: 'CONFIG_LOADED', 
            config: config 
        };
    } catch (error) {
        serviceLogger.error('GET_CONFIG error:', error.message);
        return { type: 'CONFIG_ERROR', error: error.message || 'Failed to get config' };
    }
}

async function handleSaveConfig(data, configManager, serviceLogger) {
    serviceLogger.info('SAVE_CONFIG: Saving configuration');
    try {
        await configManager.saveConfig(data.config);
        return { type: 'CONFIG_SAVED' };
    } catch (error) {
        serviceLogger.error('SAVE_CONFIG error:', error.message);
        return { type: 'CONFIG_ERROR', error: error.message || 'Failed to save config' };
    }
}

async function handleResetConfig(configManager, serviceLogger) {
    serviceLogger.info('RESET_CONFIG: Resetting to defaults');
    try {
        await configManager.resetConfig();
        return { type: 'CONFIG_RESET' };
    } catch (error) {
        serviceLogger.error('RESET_CONFIG error:', error.message);
        return { type: 'CONFIG_ERROR', error: error.message || 'Failed to reset config' };
    }
}

async function handleCheckConfigHealth(configManager, serviceLogger) {
    serviceLogger.info('CHECK_CONFIG_HEALTH: Checking storage usage');
    try {
        const healthInfo = await configManager.checkStorageUsage();
        return { 
            type: 'CONFIG_HEALTH_CHECKED', 
            healthInfo: healthInfo 
        };
    } catch (error) {
        serviceLogger.error('CHECK_CONFIG_HEALTH error:', error.message);
        return { type: 'CONFIG_ERROR', error: error.message || 'Failed to check config health' };
    }
} 