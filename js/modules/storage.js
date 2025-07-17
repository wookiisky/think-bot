// Think Bot Storage Module
// Handles page data caching with LRU (Least Recently Used) strategy and compression
// Note: storage-keys.js should be loaded before this module

// Create a global storage object
var storage = {};

// Create module logger
const storageLogger = logger.createModuleLogger('Storage');

// Storage constants
const DB_CHAT_PREFIX = CACHE_KEYS.CHAT_PREFIX;
const DB_PAGE_PREFIX = CACHE_KEYS.PAGE_PREFIX; // Unified page data storage
const MAX_CACHE_AGE_DAYS = CACHE_CONFIG.MAX_CACHE_AGE_DAYS; // Remove items older than 90 days
const MAX_CACHE_AGE_MS = CACHE_CONFIG.MAX_CACHE_AGE_MS;

// Check if cache compression is available
const storageCacheCompressionAvailable = typeof cacheCompression !== 'undefined';
if (!storageCacheCompressionAvailable) {
  storageLogger.warn('Cache compression module not available, data will be stored uncompressed');
}

// Save page content for specific extraction method
storage.savePageContent = async function(url, content, method = 'default') {
  if (!url) {
    storageLogger.error('Cannot save page content: URL is empty');
    return false;
  }

  try {
    // Use the unified storage approach
    const success = await this.savePageData(url, content, method, {}, null);

    if (success) {
      storageLogger.info(`Page content saved successfully for ${method} method`, {
        url,
        contentLength: content?.length
      });
      return true;
    } else {
      return false;
    }
  } catch (error) {
    storageLogger.error('Error saving page content:', { url, method, error: error.message });
    return false;
  }
}

// Save chat history (global for the URL, not method-specific)
storage.saveChatHistory = async function(url, chatHistory) {
  if (!url) {
    storageLogger.error('Cannot save chat history: URL is empty');
    return false;
  }
  
  try {
    // Get normalized URL as key for chat history (no method suffix)
    const key = getChatHistoryKeyFromUrl(url);
    
    // Ensure all messages have a timestamp
    const baseTime = Date.now() - chatHistory.length * 1000;
    const historyWithTimestamps = chatHistory.map((msg, index) => {
      if (!msg.timestamp) {
        storageLogger.info(`Adding timestamp to message ${index} with role ${msg.role}`);
        return {
          ...msg,
          timestamp: baseTime + index * 1000 // Each message is 1 second apart
        };
      }
      return msg;
    });
    
    // Compress chat history if compression is available and beneficial
    let chatHistoryToStore = historyWithTimestamps;
    if (storageCacheCompressionAvailable && cacheCompression.compressChatHistory) {
      chatHistoryToStore = cacheCompression.compressChatHistory(historyWithTimestamps);
      
    }
        
    
    // Save the chat history (compressed or original)
    await chrome.storage.local.set({ [key]: chatHistoryToStore });
    storageLogger.info('Chat history saved successfully', { 
      url, 
      messageCount: historyWithTimestamps?.length,
      compressed: typeof chatHistoryToStore === 'object' && chatHistoryToStore.__compressed__
    });
    
    return true;
  } catch (error) {
    storageLogger.error('Error saving chat history:', { url, error: error.message });
    return false;
  }
}

// Get page content for a URL with specific extraction method
storage.getPageContent = async function(url, method = 'default') {
  if (!url) {
    storageLogger.error('Cannot get page content: URL is empty');
    return null;
  }

  try {
    // Get from unified storage
    const content = await this.getPageContentFromUnified(url, method);
    if (content) {
      storageLogger.info(`Found cached content from unified storage for ${method} method`, {
        url,
        contentLength: content.length
      });

      return content;
    }

    return null;
  } catch (error) {
    storageLogger.error('Error getting page content:', { url, method, error: error.message });
    return null;
  }
}

// Get chat history for a URL (global, not method-specific)
storage.getChatHistory = async function(url) {
  if (!url) {
    storageLogger.error('Cannot get chat history: URL is empty');
    return [];
  }
  
  try {
    // Get normalized URL as key for chat history (no method suffix)
    const key = getChatHistoryKeyFromUrl(url);
    
    // Get the chat history
    const result = await chrome.storage.local.get(key);
    
    let chatHistory = result[key] || [];
    
    // Decompress chat history if it's compressed
    if (storageCacheCompressionAvailable && cacheCompression.decompressChatHistory) {
      chatHistory = cacheCompression.decompressChatHistory(chatHistory);
      

    }
    
    // Ensure all messages have a timestamp
    const baseTime = Date.now() - chatHistory.length * 1000;
    const historyWithTimestamps = chatHistory.map((msg, index) => {
      if (!msg.timestamp) {
        storageLogger.info(`Adding timestamp to loaded message ${index} with role ${msg.role}`);
        return {
          ...msg,
          timestamp: baseTime + index * 1000 // Each message is 1 second apart
        };
      }
      return msg;
    });
    
    if (historyWithTimestamps.length > 0) {
      storageLogger.info(`Found cached chat history for URL: ${url}`, {
        messageCount: historyWithTimestamps.length,
        wasCompressed: typeof result[key] === 'object' && result[key].__compressed__,
        firstMessageTimestamp: historyWithTimestamps[0].timestamp,
        lastMessageTimestamp: historyWithTimestamps[historyWithTimestamps.length-1].timestamp
      });

    } else {
      storageLogger.info(`No chat history found for URL: ${url}`);
    }

    return historyWithTimestamps;
  } catch (error) {
    storageLogger.error('Error getting chat history:', { url, error: error.message });
    return [];
  }
}

// Update chat history for a URL (global, not method-specific)
storage.updateChatHistory = async function(url, newMessages) {
  if (!url) {
    storageLogger.error('Cannot update chat history: URL is empty');
    return false;
  }
  
  try {
    // Save the chat history directly
    return await storage.saveChatHistory(url, newMessages);
  } catch (error) {
    storageLogger.error('Error updating chat history:', { url, error: error.message });
    return false;
  }
}

// Clear data for a specific URL (now supports soft delete for sync)
storage.clearUrlData = async function(url, clearContent = true, clearChat = true, clearMetadata = true, wildcard = false, softDelete = false) {
  if (!url) {
    storageLogger.error('Cannot clear data: URL is empty');
    return false;
  }

  try {
    // Get all storage keys
    const result = await chrome.storage.local.get(null);
    const allKeys = Object.keys(result);
    const keysToRemove = [];
    const keysToSoftDelete = [];
    const normalizedBaseUrl = normalizeUrl(url);

    // URL wildcard matching mode - used to clear all tabs associated with a URL
    if (wildcard) {
      storageLogger.info(`Using wildcard matching to ${softDelete ? 'soft delete' : 'clear'} data for base URL: ${normalizedBaseUrl}`);

      if (clearContent) {
        // Find all unified page data keys that start with the normalized URL
        const pageKeys = allKeys.filter(key =>
          key.startsWith(DB_PAGE_PREFIX) &&
          key.includes(normalizedBaseUrl)
        );

        if (softDelete) {
          keysToSoftDelete.push(...pageKeys);
        } else {
          keysToRemove.push(...pageKeys);
        }
      }

      if (clearChat) {
        // Find all chat keys that start with the normalized URL
        const chatKeys = allKeys.filter(key =>
          key.startsWith(DB_CHAT_PREFIX) &&
          key.includes(normalizedBaseUrl)
        );

        if (softDelete) {
          keysToSoftDelete.push(...chatKeys);
        } else {
          keysToRemove.push(...chatKeys);
        }
      }

      // Note: pageState is now part of unified page data (DB_PAGE_PREFIX)
      // and will be cleared when clearContent is true

      if (clearMetadata) {
        // Note: Unified page data (DB_PAGE_PREFIX) already includes metadata,
        // so it's cleared above when clearContent is true
      }

      storageLogger.info(`Found ${keysToRemove.length + keysToSoftDelete.length} keys to ${softDelete ? 'soft delete' : 'remove'} with wildcard matching`);
    } else {
      // Standard exact URL matching
      if (clearContent) {
        // Clear unified page data for this URL
        const pageKey = getPageKeyFromUrl(url);
        if (softDelete) {
          keysToSoftDelete.push(pageKey);
        } else {
          keysToRemove.push(pageKey);
        }
      }

      if (clearChat) {
        // Clear chat history for this URL
        const chatKey = getChatHistoryKeyFromUrl(url);
        if (softDelete) {
          keysToSoftDelete.push(chatKey);
        } else {
          keysToRemove.push(chatKey);
        }
      }

      // Note: pageState is now part of unified page data (DB_PAGE_PREFIX)
      // and will be cleared when clearContent is true

      if (clearMetadata) {
        // Note: Unified page data (DB_PAGE_PREFIX) already includes metadata,
        // so it's cleared above when clearContent is true
      }
    }

    // Handle soft delete operations
    if (keysToSoftDelete.length > 0) {
      const softDeleteUpdates = {};

      for (const key of keysToSoftDelete) {
        const existingData = result[key];
        if (existingData) {
          // Create soft delete record: keep id (URL), lastModified timestamp, and add 'del' flag
          const softDeleteRecord = {
            url: existingData.url || url, // Preserve original URL as ID
            lastModified: Date.now(), // Update timestamp for deletion
            del: true // Mark as deleted
            // Clear all other data fields (content, metadata, pageState, etc.)
          };

          softDeleteUpdates[key] = softDeleteRecord;
          storageLogger.debug(`Creating soft delete record for key: ${key}`);
        }
      }

      if (Object.keys(softDeleteUpdates).length > 0) {
        await chrome.storage.local.set(softDeleteUpdates);
        storageLogger.info(`Soft deleted ${Object.keys(softDeleteUpdates).length} items`);
      }
    }

    // Remove the keys (hard delete)
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }


    storageLogger.info(`URL data ${softDelete ? 'soft deleted' : 'cleared'} successfully`, {
      url,
      wildcard,
      softDelete,
      clearedContent: clearContent,
      clearedChat: clearChat,
      clearedMetadata: clearMetadata,
      keysRemoved: keysToRemove.length,
      keysSoftDeleted: keysToSoftDelete.length
    });
    return true;
  } catch (error) {
    storageLogger.error('Error clearing URL data:', { url, error: error.message });
    return false;
  }
}

// Soft delete data for a specific URL (for sync purposes)
storage.softDeleteUrlData = async function(url, clearContent = true, clearChat = true, wildcard = false) {
  return await this.clearUrlData(url, clearContent, clearChat, true, wildcard, true);
};

// Check if a data item is soft deleted
storage.isDataSoftDeleted = function(data) {
  return data && data.del === true;
};

// Get the last modified timestamp from data (including soft deleted items)
storage.getDataTimestamp = function(data) {
  if (!data) return 0;

  // For soft deleted items, use lastModified
  if (data.del === true) {
    return data.lastModified || 0;
  }

  // For regular page data, use lastUpdated or metadata timestamp
  if (data.lastUpdated) {
    return data.lastUpdated;
  }

  if (data.metadata && data.metadata.timestamp) {
    return data.metadata.timestamp;
  }

  return 0;
};


// Normalize URL for consistency
function normalizeUrl(url) {
  try {
    if (!url) return '';
    
    // Prepend protocol if missing, for URL constructor
    const fullUrl = (url.startsWith('http://') || url.startsWith('https://')) ? url : `https://${url}`;
    const urlObj = new URL(fullUrl);

    // 1. Lowercase protocol and hostname
    urlObj.protocol = urlObj.protocol.toLowerCase();
    urlObj.hostname = urlObj.hostname.toLowerCase();

    // 2. Remove 'www.' prefix
    if (urlObj.hostname.startsWith('www.')) {
      urlObj.hostname = urlObj.hostname.substring(4);
    }

    // 3. Remove trailing slash from pathname
    if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }

    // 4. Remove hash fragment
    urlObj.hash = '';

    // 5. Remove common tracking parameters
    const params = urlObj.searchParams;
    const paramsToDelete = [];
    for (const p of params.keys()) {
      if (p.startsWith('utm_') || p === 'fbclid' || p === 'gclid') {
        paramsToDelete.push(p);
      }
    }
    paramsToDelete.forEach(p => params.delete(p));

    return urlObj.toString();
  } catch (error) {
    storageLogger.warn(`Could not parse URL for robust normalization: "${url}". Using basic normalization. Error: ${error.message}`);
    // Fallback to original basic normalization to avoid breaking things for weird URLs
    return url.trim().toLowerCase();
  }
}



// Get storage key for chat history from URL
function getChatHistoryKeyFromUrl(url) {
  // Create a consistent key for chat history storage (no method suffix)
  return KeyHelpers.getChatKey(normalizeUrl(url));
}

// Save page UI state for a URL (now uses unified storage)
storage.savePageState = async function(url, pageState) {
  if (!url) {
    storageLogger.error('Cannot save page state: URL is empty');
    return false;
  }

  try {
    // Use unified storage approach
    const success = await this.savePageData(url, null, 'default', {}, pageState);

    if (success) {
      storageLogger.info('Page state saved successfully', { url, pageState });
      return true;
    } else {
      storageLogger.error('Failed to save page state to unified storage', { url, pageState });
      return false;
    }
  } catch (error) {
    storageLogger.error('Error saving page state:', { url, error: error.message });
    return false;
  }
};

// Get page UI state for a URL (now uses unified storage)
storage.getPageState = async function(url) {
  if (!url) {
    storageLogger.error('Cannot get page state: URL is empty');
    return null;
  }

  try {
    // Get page data from unified storage
    const pageData = await this.getPageData(url);

    if (pageData && pageData.pageState) {
      storageLogger.info('Found cached page state from unified storage', { url, pageState: pageData.pageState });
      return pageData.pageState;
    }



    return null;
  } catch (error) {
    storageLogger.error('Error getting page state:', { url, error: error.message });
    return null;
  }
};



// Save page metadata (title, icon, timestamp)
storage.savePageMetadata = async function(url, metadata) {
  if (!url) {
    storageLogger.error('Cannot save page metadata: URL is empty');
    return false;
  }

  try {
    // Add timestamp if not provided
    const metadataToStore = {
      ...metadata,
      url: url, // Store original URL
      timestamp: metadata.timestamp || Date.now()
    };

    // Use the unified storage approach
    const success = await this.savePageData(url, null, 'default', metadataToStore, null);

    if (success) {
      storageLogger.info('Page metadata saved successfully', { url, metadata: metadataToStore });
      return true;
    } else {
      return false;
    }
  } catch (error) {
    storageLogger.error('Error saving page metadata:', { url, error: error.message });
    return false;
  }
};

// Get page metadata for a URL
storage.getPageMetadata = async function(url) {
  if (!url) {
    storageLogger.error('Cannot get page metadata: URL is empty');
    return null;
  }

  try {
    // Get from unified storage
    const metadata = await this.getPageMetadataFromUnified(url);
    if (metadata) {
      storageLogger.info('Found cached page metadata from unified storage', { url, metadata });
      return metadata;
    }

    return null;
  } catch (error) {
    storageLogger.error('Error getting page metadata:', { url, error: error.message });
    return null;
  }
};

// Get all page metadata
storage.getAllPageMetadata = async function() {
  try {
    // Get all keys from storage
    const result = await chrome.storage.local.get(null);

    const allMetadata = [];
    const seenUrls = new Set();

    // Get metadata from unified storage
    const unifiedPageKeys = Object.keys(result).filter(key =>
      key.startsWith(DB_PAGE_PREFIX)
    );

    for (const key of unifiedPageKeys) {
      const pageData = result[key];
      if (pageData && pageData.metadata && pageData.url) {
        const normalized = normalizeUrl(pageData.url);
        if (!seenUrls.has(normalized)) {
          seenUrls.add(normalized);
          allMetadata.push({
            ...pageData.metadata,
            url: pageData.url,
            lastUpdated: pageData.lastUpdated
          });
        }
      }
    }

    // Sort by timestamp descending to keep the most recent entry first
    allMetadata.sort((a, b) => {
      const timestampA = a.lastUpdated || a.timestamp || 0;
      const timestampB = b.lastUpdated || b.timestamp || 0;
      return timestampB - timestampA;
    });

    storageLogger.info(`Found ${allMetadata.length} unique page metadata entries`);
    return allMetadata;
  } catch (error) {
    storageLogger.error('Error getting all page metadata:', error.message);
    return [];
  }
};



// Get storage key for unified page data from URL
function getPageKeyFromUrl(url) {
  // Create a consistent key for unified page data storage
  return KeyHelpers.getPageKey(normalizeUrl(url));
}

// Clear all cached data
storage.clearAllCachedData = async function() {
  try {
    // Get all keys with our prefixes
    const result = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(result).filter(key =>
      key.startsWith(DB_CHAT_PREFIX) ||
      key.startsWith(DB_PAGE_PREFIX)
    );

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }

    return true;
  } catch (error) {
    storageLogger.error('Error clearing cached data:', error.message);
    return false;
  }
}

// ===== UNIFIED PAGE DATA MANAGEMENT =====

/**
 * Save unified page data (content + metadata + pageState)
 * @param {string} url - Page URL
 * @param {string} content - Extracted content
 * @param {string} method - Extraction method
 * @param {Object} metadata - Page metadata (title, icon, etc.)
 * @param {Object} pageState - Page UI state (includePageContent, etc.)
 * @returns {Promise<boolean>} Success status
 */
storage.savePageData = async function(url, content, method = 'default', metadata = {}, pageState = null) {
  if (!url) {
    storageLogger.error('Cannot save page data: URL is empty');
    return false;
  }

  try {
    const key = getPageKeyFromUrl(url);

    // Get existing page data or create new
    let pageData = await this.getPageData(url) || {
      url: url,
      metadata: {},
      content: {},
      pageState: {},
      lastUpdated: Date.now(),
      created: Date.now()
    };

    // Update metadata if provided
    if (metadata && Object.keys(metadata).length > 0) {
      pageData.metadata = {
        ...pageData.metadata,
        ...metadata,
        timestamp: Date.now()
      };
    }

    // Update pageState if provided
    if (pageState !== null) {
      pageData.pageState = {
        ...pageState,
        lastUpdated: Date.now()
      };
    }

    // Update content for the specific method
    if (content) {
      // Compress content if compression is available and beneficial
      let contentToStore = content;
      if (storageCacheCompressionAvailable && cacheCompression.compressPageContent) {
        contentToStore = cacheCompression.compressPageContent(content);
      }

      pageData.content[method] = {
        data: contentToStore,
        timestamp: Date.now(),
        compressed: typeof contentToStore === 'object' && contentToStore.__compressed__
      };
    }

    pageData.lastUpdated = Date.now();

    // Save the unified page data
    await chrome.storage.local.set({ [key]: pageData });

    storageLogger.info('Unified page data saved successfully', {
      url,
      method,
      contentLength: content?.length,
      hasMetadata: !!metadata && Object.keys(metadata).length > 0,
      compressed: typeof contentToStore === 'object' && contentToStore.__compressed__
    });

    return true;
  } catch (error) {
    storageLogger.error('Error saving unified page data:', { url, method, error: error.message });
    return false;
  }
};

/**
 * Get unified page data
 * @param {string} url - Page URL
 * @returns {Promise<Object|null>} Page data or null
 */
storage.getPageData = async function(url) {
  if (!url) {
    storageLogger.error('Cannot get page data: URL is empty');
    return null;
  }

  try {
    const key = getPageKeyFromUrl(url);
    const result = await chrome.storage.local.get(key);

    if (result[key]) {
      const pageData = result[key];

      // Decompress content if needed
      if (pageData.content) {
        for (const method in pageData.content) {
          const contentEntry = pageData.content[method];
          if (contentEntry && contentEntry.data) {
            if (storageCacheCompressionAvailable && cacheCompression.decompressPageContent) {
              contentEntry.data = cacheCompression.decompressPageContent(contentEntry.data);
            }
          }
        }
      }

      storageLogger.info('Found unified page data', {
        url,
        methods: Object.keys(pageData.content || {}),
        hasMetadata: !!pageData.metadata
      });

      return pageData;
    }

    return null;
  } catch (error) {
    storageLogger.error('Error getting unified page data:', { url, error: error.message });
    return null;
  }
};

/**
 * Get page content for specific method from unified data
 * @param {string} url - Page URL
 * @param {string} method - Extraction method
 * @returns {Promise<string|null>} Content or null
 */
storage.getPageContentFromUnified = async function(url, method = 'default') {
  const pageData = await this.getPageData(url);
  if (pageData && pageData.content && pageData.content[method]) {
    return pageData.content[method].data;
  }
  return null;
};

/**
 * Get page metadata from unified data
 * @param {string} url - Page URL
 * @returns {Promise<Object|null>} Metadata or null
 */
storage.getPageMetadataFromUnified = async function(url) {
  const pageData = await this.getPageData(url);
  if (pageData && pageData.metadata) {
    return pageData.metadata;
  }
  return null;
};

/**
 * Get all pages with unified data
 * @returns {Promise<Array>} Array of page data
 */
storage.getAllPagesUnified = async function() {
  try {
    const result = await chrome.storage.local.get(null);
    const pageEntries = [];

    // Get all unified page data
    for (const key in result) {
      if (key.startsWith(DB_PAGE_PREFIX)) {
        const pageData = result[key];
        if (pageData && pageData.url) {
          pageEntries.push(pageData);
        }
      }
    }

    // Sort by last updated timestamp (most recent first)
    pageEntries.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

    storageLogger.info(`Found ${pageEntries.length} unified page entries`);
    return pageEntries;
  } catch (error) {
    storageLogger.error('Error getting all unified pages:', error.message);
    return [];
  }
};
