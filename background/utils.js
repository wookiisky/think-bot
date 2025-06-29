// background/utils.js

// This file can house utility functions used across the background scripts.
// Ensure serviceLogger is available or passed if needed by any functions here.

// Helper function to safely send messages to the runtime (e.g., sidebar)
function safeSendMessage(message, serviceLogger) {
    if (chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage(
            message,
            () => {
                if (chrome.runtime.lastError && serviceLogger && typeof serviceLogger.info === 'function') {
                    serviceLogger.info('safeSendMessage: Destination unavailable');
                }
            }
        );
    } else {
        if (serviceLogger && typeof serviceLogger.error === 'function') {
            serviceLogger.error('safeSendMessage: chrome.runtime.sendMessage not available');
        }
    }
}

// Helper function to safely send messages to tabs
function safeSendTabMessage(tabId, message, serviceLogger, callback) {
    if (chrome.tabs && typeof chrome.tabs.sendMessage === 'function') {
        chrome.tabs.sendMessage(
            tabId,
            message,
            (response) => {
                if (chrome.runtime.lastError) {
                    if (callback) callback(null, chrome.runtime.lastError);
                    return;
                }
                if (callback) callback(response, null);
            }
        );
    } else {
        const errorMsg = 'safeSendTabMessage: chrome.tabs.sendMessage not available';
        if (serviceLogger && typeof serviceLogger.error === 'function') {
            serviceLogger.error(errorMsg);
        }
        if (callback) callback(null, new Error(errorMsg));
    }
}

// Helper function to check if URL is a restricted Chrome internal page
function isRestrictedPage(url) {
    if (!url) return true;

    const restrictedPrefixes = [
        'chrome://',
        'chrome-extension://',
        'edge://',
        'about:',
        'moz-extension://',
        'chrome-search://',
        'chrome-devtools://',
        'devtools://'
    ];

    return restrictedPrefixes.some(prefix => url.startsWith(prefix));
}

// Helper function to check if current page allows side panel
// Note: This function might need serviceLogger if we want to log from here.
// For now, keeping it self-contained.
async function checkSidePanelAllowed(serviceLogger, forUrl = null) {
    try {
        let urlToTest = forUrl;

        if (!urlToTest) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                if (serviceLogger) serviceLogger.warn('checkSidePanelAllowed: No active tab found');
                return false;
            }
            if (!tab.url) {
                if (serviceLogger) serviceLogger.warn('checkSidePanelAllowed: Active tab URL is undefined');
                return isRestrictedPage(tab.url);
            }
            urlToTest = tab.url;
        }

        const allowed = !isRestrictedPage(urlToTest);
        if (serviceLogger) {
            serviceLogger.info(`Side panel ${allowed ? 'allowed' : 'not allowed'} for page: ${urlToTest}`);
        }
        return allowed;
    } catch (error) {
        if (serviceLogger) {
            serviceLogger.error('checkSidePanelAllowed error:', error.message);
        }
        return false;
    }
}

// If these functions are to be used by other files imported via importScripts,
// they need to be available in the global scope of the service worker.
// This happens automatically if this script is imported.

/**
 * Get metadata for a specific page URL from storage
 * @param {string} url - The URL of the page to get metadata for
 * @returns {Promise<Object|null>} - The page metadata or null if not found
 */
async function getPageMetadata(url) {
  try {
    // First try the new unified storage format
    if (typeof storage !== 'undefined' && storage.getPageMetadata) {
      const metadata = await storage.getPageMetadata(url);
      if (metadata) {
        return metadata;
      }
    }

    // Fallback to old storage format
    const key = `pageMetadata_${url}`;
    const data = await chrome.storage.local.get(key);
    return data[key] || null;
  } catch (error) {
    console.error('Error getting page metadata:', error);
    return null;
  }
}