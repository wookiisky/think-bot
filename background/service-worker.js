// Think Bot service worker script
// Handles background processes, messaging, and coordinates between UI and functionality

// Import required modules using importScripts instead of dynamic import
importScripts('../js/modules/logger.js');
importScripts('../js/lib/pako.min.js');
importScripts('../js/lib/compression.js');
importScripts('../js/modules/storage-keys.js');
importScripts('../js/modules/storage-config-manager.js');
importScripts('../js/modules/storage.js');
importScripts('../js/modules/loading_state_cache.js');
importScripts('../js/modules/content_extractor.js');
importScripts('../js/modules/blacklist-manager.js');
importScripts('../js/modules/sync/sync_config.js');
// Ensure providers are loaded before llm_service.js

importScripts('../js/modules/llm_provider/base_provider.js');
importScripts('../js/modules/llm_provider/gemini_provider.js');
importScripts('../js/modules/llm_provider/openai_provider.js');
importScripts('../js/modules/llm_provider/azure_openai_provider.js');
importScripts('../js/modules/llm_service.js');
// importScripts('../js/modules/jina_ai_service.js'); // Removed as it does not exist

// Import utility functions
importScripts('utils.js');
importScripts('request-tracker.js');

// Import message handlers
importScripts('handlers/getPageInfoHandler.js');
importScripts('handlers/getCachedPageDataHandler.js');
importScripts('handlers/getAnyCachedContentHandler.js');
importScripts('handlers/switchExtractionMethodHandler.js');
importScripts('handlers/reExtractContentHandler.js');
importScripts('handlers/sendLlmMessageHandler.js');
importScripts('handlers/clearUrlDataHandler.js');
importScripts('handlers/configHandler.js');
importScripts('handlers/saveChatHistoryHandler.js');
importScripts('handlers/getChatHistoryHandler.js');
importScripts('handlers/getBatchChatHistoryHandler.js');
importScripts('handlers/getBatchLoadingStateHandler.js');
importScripts('handlers/getLoadingStateHandler.js');
importScripts('handlers/clearLoadingStateHandler.js');
importScripts('handlers/clearAllLoadingStatesForUrlHandler.js');
importScripts('handlers/cancelLlmRequestHandler.js');
importScripts('handlers/cancelAllLlmRequestsHandler.js');
importScripts('handlers/getAllPageMetadataHandler.js');
importScripts('handlers/savePageStateHandler.js');
importScripts('handlers/blacklistHandler.js');
importScripts('handlers/exportConversationHandler.js');

// Import event listener handlers
importScripts('handlers/tabActivationHandler.js');
importScripts('handlers/tabUpdateHandler.js');

// Initialize logger for service worker
const serviceLogger = logger ? logger.createModuleLogger('ServiceWorker') : console;

// Helper functions (safeSendMessage, safeSendTabMessage, isRestrictedPage, checkSidePanelAllowed)
// are now defined in utils.js and imported via importScripts.
// They are available globally within the service worker scope.

// Set up event listeners when extension is installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  serviceLogger.info('Think Bot extension installed or updated');

  // Create context menu for the action icon
  chrome.contextMenus.create({
    id: "open-conversations",
    title: "Conversations",
    contexts: ["action"]
  });
  
  // Initialize config if needed
  await storageConfigManager.initializeIfNeeded();
  await storageConfigManager.checkStorageUsage();

  // Clean up expired cache data on installation/update
  if (typeof storage !== 'undefined' && storage.cleanupExpiredCache) {
    try {
      const cleanupStats = await storage.cleanupExpiredCache();
      serviceLogger.info('Initial cache cleanup completed', cleanupStats);
    } catch (error) {
      serviceLogger.error('Error during initial cache cleanup:', error);
    }
  }

  serviceLogger.info('Extension setup complete');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-conversations") {
    serviceLogger.info('Context menu item "Open Conversations" clicked');
    chrome.tabs.create({
      url: chrome.runtime.getURL('conversations/conversations.html')
    });
  }
});

// Extension startup
serviceLogger.info('Think Bot service worker started');

// Initialize cache compression module on startup
(async () => {
  try {
    // Run initial cache cleanup on startup
    if (typeof storage !== 'undefined' && storage.cleanupExpiredCache) {
      try {
        const cleanupStats = await storage.cleanupExpiredCache();
        serviceLogger.info('Startup cache cleanup completed', cleanupStats);
      } catch (error) {
        serviceLogger.error('Error during startup cache cleanup:', error);
      }
    }
  } catch (error) {
    serviceLogger.error('Error initializing cache compression on startup:', error);
  }
})();

// Periodic cache cleanup (every 6 hours)
const CACHE_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
setInterval(async () => {
  try {
    if (typeof storage !== 'undefined' && storage.cleanupExpiredCache) {
      const cleanupStats = await storage.cleanupExpiredCache();
      serviceLogger.info('Periodic cache cleanup completed', cleanupStats);
    }
  } catch (error) {
    serviceLogger.error('Error during periodic cache cleanup:', error);
  }
}, CACHE_CLEANUP_INTERVAL_MS);

// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  serviceLogger.info('Extension icon clicked, tab URL:', tab?.url);

  if (tab && tab.url && isRestrictedPage(tab.url)) {
    serviceLogger.info('Clicked on restricted page, opening conversations page');
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('conversations/conversations.html')
      });
      serviceLogger.info('Successfully opened conversations page');
    } catch (error) {
      serviceLogger.error('Error opening conversations page:', error);
      // Fallback to notification if conversations page fails to open
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: 'Think Bot',
          message: 'Think Bot cannot work on Chrome internal pages. Please navigate to a regular webpage to use the extension.'
        });
      } catch (fallbackError) {
        serviceLogger.error('Error creating fallback notification:', fallbackError);
      }
    }
  } else {
    serviceLogger.info('Clicked on normal page, trying to open side panel');

    // Open side panel immediately to preserve user gesture context
    try {
      if (tab && tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        serviceLogger.info('Successfully opened side panel');

        // Send tab info to sidebar for blacklist checking
        // The sidebar will handle blacklist checking and display confirmation if needed
        // Increase delay to ensure sidebar is fully loaded
        setTimeout(() => {
          serviceLogger.info('Sending SIDEBAR_OPENED message to sidebar');
          safeSendMessage({
            type: 'SIDEBAR_OPENED',
            url: tab.url,
            tabId: tab.id
          }, serviceLogger);
        }, 500);
      }
    } catch (error) {
      serviceLogger.error('Error opening side panel:', error);
      try {
        // const behavior = await chrome.sidePanel.getPanelBehavior(); // Logging behavior might be too verbose or error-prone
      } catch (behaviorError) {
        serviceLogger.error('Error getting panel behavior:', behaviorError);
      }
    }
  }
});

// Tab activation listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Pass serviceLogger to handler, and isRestrictedPage & safeSendMessage are now global
  await handleTabActivated(activeInfo, serviceLogger, isRestrictedPage, (msg) => safeSendMessage(msg, serviceLogger));
});

// Tab URL change listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Pass serviceLogger to handler, other dependencies are global or passed within handler
  await handleTabUpdated(tabId, changeInfo, tab, serviceLogger, storageConfigManager, storage, (msg) => safeSendMessage(msg, serviceLogger));
});

// Message handling from sidebar.js and content_script.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    serviceLogger.info('Service worker received message:', message.type);
    
    try {
      const { type, ...data } = message;
      
      switch (type) {
        case 'GET_PAGE_INFO': {
            return await handleGetPageInfo(data, serviceLogger, storageConfigManager, storage, contentExtractor,
                (tabId, msg, callback) => safeSendTabMessage(tabId, msg, serviceLogger, callback));
        }
        case 'GET_CACHED_PAGE_DATA': {
          return await handleGetCachedPageData(data, serviceLogger, storageConfigManager, storage);
        }
        case 'GET_ANY_CACHED_CONTENT': {
          return await handleGetAnyCachedContent(data, serviceLogger, storage);
        }
        case 'SWITCH_EXTRACTION_METHOD': {
          return await handleSwitchExtractionMethod(data, serviceLogger, storageConfigManager, storage, contentExtractor,
            (tabId, msg, callback) => safeSendTabMessage(tabId, msg, serviceLogger, callback));
        }
        case 'RE_EXTRACT_CONTENT': {
          return await handleReExtractContent(data, serviceLogger, storageConfigManager, storage, contentExtractor,
            (tabId, msg, callback) => safeSendTabMessage(tabId, msg, serviceLogger, callback));
        }
        case 'SEND_LLM_MESSAGE': {
          return await handleSendLlmMessage(data, serviceLogger, storageConfigManager, storage, llmService, loadingStateCache,
            (msg) => safeSendMessage(msg, serviceLogger));
        }
        case 'CANCEL_LLM_REQUEST': {
          return await handleCancelLlmRequest(data, serviceLogger, loadingStateCache);
        }
        case 'CANCEL_ALL_LLM_REQUESTS': {
          return await handleCancelAllLlmRequests(serviceLogger, loadingStateCache);
        }
        case 'CLEAR_URL_DATA': {
          return await handleClearUrlData(data, serviceLogger, storage);
        }
        case 'SOFT_DELETE_URL_DATA': {
          return await handleSoftDeleteUrlData(data, serviceLogger, storage);
        }
        case 'GET_CONFIG':
          return await handleGetConfig(storageConfigManager, serviceLogger);
        case 'SAVE_CONFIG':
          return await handleSaveConfig(data, storageConfigManager, serviceLogger);
        case 'RESET_CONFIG':
          return await handleResetConfig(storageConfigManager, serviceLogger);
        case 'CHECK_CONFIG_HEALTH':
          return await handleCheckConfigHealth(storageConfigManager, serviceLogger);
        case 'SAVE_CHAT_HISTORY':
          return await handleSaveChatHistory(data, serviceLogger, storage);
        case 'GET_CHAT_HISTORY':
          return await handleGetChatHistory(data, serviceLogger, storage);
        case 'GET_BATCH_CHAT_HISTORY':
          return await handleGetBatchChatHistory(data, serviceLogger, storage);
        case 'GET_BATCH_LOADING_STATE':
          return await handleGetBatchLoadingState(data, serviceLogger, loadingStateCache);
        case 'GET_LOADING_STATE':
          return await handleGetLoadingState(data, serviceLogger, loadingStateCache);
        case 'CLEAR_LOADING_STATE':
          return await handleClearLoadingState(data, serviceLogger, loadingStateCache);
        case 'CLEAR_ALL_LOADING_STATES_FOR_URL':
          return await handleClearAllLoadingStatesForUrl(data, serviceLogger, loadingStateCache);
        case 'SAVE_PAGE_STATE':
          return await handleSavePageState(data, serviceLogger, storage);
        case 'GET_ALL_PAGE_METADATA':
          return await handleGetAllPageMetadata(data, serviceLogger, storage);
        case 'TEST_SYNC_CONNECTION':
          return await handleTestSyncConnection(data, serviceLogger);
        case 'GET_BLACKLIST_PATTERNS':
          return await handleGetBlacklistPatterns(data, serviceLogger);
        case 'ADD_BLACKLIST_PATTERN':
          return await handleAddBlacklistPattern(data, serviceLogger);
        case 'UPDATE_BLACKLIST_PATTERN':
          return await handleUpdateBlacklistPattern(data, serviceLogger);
        case 'DELETE_BLACKLIST_PATTERN':
          return await handleDeleteBlacklistPattern(data, serviceLogger);
        case 'CHECK_BLACKLIST_URL':
          return await handleCheckBlacklistUrl(data, serviceLogger);
        case 'TEST_BLACKLIST_PATTERN':
          return await handleTestBlacklistPattern(data, serviceLogger);
        case 'RESET_BLACKLIST_TO_DEFAULTS':
          return await handleResetBlacklistToDefaults(data, serviceLogger);
        case 'GET_SYNC_CONFIG':
          return await handleGetSyncConfig(data, serviceLogger);
        case 'EXPORT_CONVERSATION': {
          return await handleExportConversation(data, serviceLogger, storage);
        }
        case 'SIDEBAR_READY': {
          // Sidebar is ready to receive messages
          serviceLogger.info('Sidebar confirmed ready to receive messages');
          return { type: 'SIDEBAR_READY_CONFIRMED' };
        }
        default: {
          serviceLogger.warn('Unknown message type:', type);
          return { type: 'UNKNOWN_MESSAGE_TYPE', originalType: type };
        }
      }
    } catch (error) {
      serviceLogger.error('Error handling message:', error);
      return { type: 'MESSAGE_HANDLING_ERROR', error: error.message };
    }
  };
  
  // Execute the message handler and send response
  handleMessage().then(result => {
    if (result && typeof sendResponse === 'function') {
      sendResponse(result);
    }
  }).catch(error => {
    serviceLogger.error('Unhandled error in handleMessage promise:', error);
    sendResponse({ type: 'ERROR', error: error.message || 'Critical unhandled error in service worker' });
  });
  
  return true; // Keep the message channel open for asynchronous response
});

/**
 * Handle sync connection test request
 */
async function handleTestSyncConnection(data, logger) {
  try {
    const { storageType = 'gist' } = data;
    
    if (storageType === 'gist') {
      return await handleTestGistConnection(data, logger);
    } else if (storageType === 'webdav') {
      return await handleTestWebdavConnection(data, logger);
    } else {
      return {
        type: 'TEST_SYNC_CONNECTION_RESULT',
        success: false,
        error: `Unsupported storage type: ${storageType}`
      };
    }
  } catch (error) {
    logger.error('Sync connection test failed:', error);
    return {
      type: 'TEST_SYNC_CONNECTION_RESULT',
      success: false,
      error: `Test failed: ${error.message}`
    };
  }
}

/**
 * Test GitHub Gist connection
 */
async function handleTestGistConnection(data, logger) {
  try {
    const { token, gistId } = data;

    if (!token || !gistId) {
      return {
        type: 'TEST_SYNC_CONNECTION_RESULT',
        success: false,
        error: 'Token and Gist ID are required'
      };
    }

    logger.info('Testing sync connection to GitHub Gist');

    // First test basic connectivity
    try {
      const connectivityResponse = await fetch('https://api.github.com', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });

      if (!connectivityResponse.ok) {
        throw new Error(`GitHub API not accessible: ${connectivityResponse.status}`);
      }
    } catch (connectivityError) {
      logger.error('GitHub connectivity test failed:', connectivityError);
      return {
        type: 'TEST_SYNC_CONNECTION_RESULT',
        success: false,
        error: `Network connectivity failed: ${connectivityError.message}`
      };
    }

    // Test Gist access
    try {
      const gistResponse = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ThinkBot-Extension'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!gistResponse.ok) {
        const errorData = await gistResponse.json().catch(() => ({}));
        const errorMessage = errorData.message || `HTTP ${gistResponse.status}: ${gistResponse.statusText}`;

        logger.error('Gist access test failed:', {
          status: gistResponse.status,
          statusText: gistResponse.statusText,
          error: errorMessage
        });

        return {
          type: 'TEST_SYNC_CONNECTION_RESULT',
          success: false,
          error: `Gist access failed: ${errorMessage}`
        };
      }

      const gist = await gistResponse.json();

      logger.info('Sync connection test successful');

      return {
        type: 'TEST_SYNC_CONNECTION_RESULT',
        success: true,
        message: 'Connection successful',
        gistInfo: {
          id: gist.id,
          description: gist.description,
          isPublic: gist.public,
          filesCount: Object.keys(gist.files).length,
          updatedAt: gist.updated_at,
          owner: gist.owner ? gist.owner.login : 'Unknown'
        }
      };

    } catch (gistError) {
      logger.error('Gist access error:', gistError);
      return {
        type: 'TEST_SYNC_CONNECTION_RESULT',
        success: false,
        error: `Gist access error: ${gistError.message}`
      };
    }

  } catch (error) {
    logger.error('Gist connection test failed:', error);
    return {
      type: 'TEST_SYNC_CONNECTION_RESULT',
      success: false,
      error: `Gist test failed: ${error.message}`
    };
  }
}

/**
 * Test WebDAV connection
 */
async function handleTestWebdavConnection(data, logger) {
  try {
    const { webdavUrl, webdavUsername, webdavPassword } = data;

    if (!webdavUrl || !webdavUsername || !webdavPassword) {
      return {
        type: 'TEST_SYNC_CONNECTION_RESULT',
        success: false,
        error: 'WebDAV URL, Username, and Password are required'
      };
    }

    logger.info('Testing sync connection to WebDAV server', {
      url: webdavUrl.replace(/\/\/[^@]+@/, '//***@'), // Hide credentials in URL if any
      username: webdavUsername
    });

    // Normalize base URL
    const baseUrl = webdavUrl.endsWith('/') ? webdavUrl : webdavUrl + '/';
    const thinkbotUrl = baseUrl + 'thinkbot/';

    // Prepare authentication
    const credentials = btoa(`${webdavUsername}:${webdavPassword}`);

    try {
      // Step 1: Test basic WebDAV connectivity with base URL
      logger.info('Step 1: Testing base WebDAV URL', { url: baseUrl.replace(/\/\/[^@]+@/, '//***@') });
      
      const baseResponse = await fetch(baseUrl, {
        method: 'PROPFIND',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Depth': '0',
          'Content-Type': 'application/xml'
        },
        body: '<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>',
        signal: AbortSignal.timeout(10000)
      });

      logger.info('Base URL test response:', {
        status: baseResponse.status,
        statusText: baseResponse.statusText,
        headers: Object.fromEntries(baseResponse.headers.entries())
      });

      const baseIsSuccess = baseResponse.ok || baseResponse.status === 207; // 207 Multi-Status is also OK for WebDAV
      
      if (!baseIsSuccess) {
        let responseText = '';
        try {
          responseText = await baseResponse.text();
        } catch (e) {
          logger.warn('Could not read response text:', e.message);
        }

        logger.error('Base WebDAV URL test failed:', {
          status: baseResponse.status,
          statusText: baseResponse.statusText,
          responseText: responseText.substring(0, 500), // Log first 500 chars
          url: baseUrl.replace(/\/\/[^@]+@/, '//***@')
        });

        return {
          type: 'TEST_SYNC_CONNECTION_RESULT',
          success: false,
          error: `WebDAV base URL access failed: HTTP ${baseResponse.status} ${baseResponse.statusText}. Please check your WebDAV URL and credentials.`
        };
      }

      logger.info('Base WebDAV URL test successful, proceeding to test thinkbot directory');

      // Step 2: Test thinkbot directory
      logger.info('Step 2: Testing thinkbot directory', { url: thinkbotUrl.replace(/\/\/[^@]+@/, '//***@') });
      
      const thinkbotResponse = await fetch(thinkbotUrl, {
        method: 'PROPFIND',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Depth': '0',
          'Content-Type': 'application/xml'
        },
        body: '<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>',
        signal: AbortSignal.timeout(10000)
      });

      logger.info('Thinkbot directory test response:', {
        status: thinkbotResponse.status,
        statusText: thinkbotResponse.statusText
      });

      const thinkbotIsSuccess = thinkbotResponse.ok || thinkbotResponse.status === 207;
      
      if (thinkbotIsSuccess) {
        logger.info('Thinkbot directory exists and is accessible');
        
        return {
          type: 'TEST_SYNC_CONNECTION_RESULT',
          success: true,
          message: 'WebDAV connection successful, thinkbot directory is ready',
          serverInfo: {
            status: thinkbotResponse.status,
            server: thinkbotResponse.headers.get('Server') || 'Unknown',
            baseUrl: baseUrl.replace(/\/\/[^@]+@/, '//***@'),
            thinkbotDirectory: 'exists'
          }
        };
      } else if (thinkbotResponse.status === 404) {
        // Step 3: Try to create thinkbot directory
        logger.info('Step 3: Thinkbot directory not found, attempting to create it');
        
        const createResponse = await fetch(thinkbotUrl, {
          method: 'MKCOL',
          headers: {
            'Authorization': `Basic ${credentials}`
          },
          signal: AbortSignal.timeout(10000)
        });

        logger.info('Directory creation response:', {
          status: createResponse.status,
          statusText: createResponse.statusText
        });

        if (createResponse.ok || createResponse.status === 201) {
          logger.info('Thinkbot directory created successfully');
          
          return {
            type: 'TEST_SYNC_CONNECTION_RESULT',
            success: true,
            message: 'WebDAV connection successful, thinkbot directory created',
            serverInfo: {
              status: createResponse.status,
              server: createResponse.headers.get('Server') || 'Unknown',
              baseUrl: baseUrl.replace(/\/\/[^@]+@/, '//***@'),
              thinkbotDirectory: 'created'
            }
          };
        } else {
          let createResponseText = '';
          try {
            createResponseText = await createResponse.text();
          } catch (e) {
            logger.warn('Could not read create response text:', e.message);
          }

          logger.error('Failed to create thinkbot directory:', {
            status: createResponse.status,
            statusText: createResponse.statusText,
            responseText: createResponseText.substring(0, 500)
          });

          return {
            type: 'TEST_SYNC_CONNECTION_RESULT',
            success: false,
            error: `Failed to create thinkbot directory: HTTP ${createResponse.status} ${createResponse.statusText}. Please ensure you have write permissions on the WebDAV server.`
          };
        }
      } else {
        let thinkbotResponseText = '';
        try {
          thinkbotResponseText = await thinkbotResponse.text();
        } catch (e) {
          logger.warn('Could not read thinkbot response text:', e.message);
        }

        logger.error('Thinkbot directory test failed with unexpected status:', {
          status: thinkbotResponse.status,
          statusText: thinkbotResponse.statusText,
          responseText: thinkbotResponseText.substring(0, 500)
        });

        return {
          type: 'TEST_SYNC_CONNECTION_RESULT',
          success: false,
          error: `Thinkbot directory access failed: HTTP ${thinkbotResponse.status} ${thinkbotResponse.statusText}`
        };
      }

    } catch (webdavError) {
      logger.error('WebDAV access error:', {
        message: webdavError.message,
        name: webdavError.name,
        stack: webdavError.stack
      });
      
      return {
        type: 'TEST_SYNC_CONNECTION_RESULT',
        success: false,
        error: `WebDAV access error: ${webdavError.message}`
      };
    }

  } catch (error) {
    logger.error('WebDAV connection test failed:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    return {
      type: 'TEST_SYNC_CONNECTION_RESULT',
      success: false,
      error: `WebDAV test failed: ${error.message}`
    };
  }
}

/**
 * Handle getting sync configuration for export
 * @param {Object} data - Request data
 * @param {Object} serviceLogger - Logger instance
 * @returns {Promise<Object>} Response object
 */
async function handleGetSyncConfig(data, serviceLogger) {
  try {
    serviceLogger.info('Getting sync configuration for export');

    if (typeof syncConfig === 'undefined') {
      return {
        type: 'SYNC_CONFIG_ERROR',
        error: 'Sync configuration module not available'
      };
    }

    const config = await syncConfig.getExportableConfig();

    return {
      type: 'SYNC_CONFIG_LOADED',
      config: config
    };
  } catch (error) {
    serviceLogger.error('Error getting sync configuration:', error);
    return {
      type: 'SYNC_CONFIG_ERROR',
      error: error.message
    };
  }
}
