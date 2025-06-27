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
const RECENT_URLS_KEY = CACHE_KEYS.RECENT_URLS;
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
    
    // Log detailed info for debugging
    storageLogger.info('Saving chat history', { 
      url, 
      normalizedUrl: normalizeUrl(url),
      key, 
      messageCount: historyWithTimestamps?.length,
      compressed: typeof chatHistoryToStore === 'object' && chatHistoryToStore.__compressed__,
      firstMessage: historyWithTimestamps?.length > 0 ? 
        `${historyWithTimestamps[0].role}: ${historyWithTimestamps[0].content.substring(0, 50)}...` : 'none',
      lastMessage: historyWithTimestamps?.length > 0 ? 
        `${historyWithTimestamps[historyWithTimestamps.length-1].role}: ${historyWithTimestamps[historyWithTimestamps.length-1].content.substring(0, 50)}...` : 'none'
    });
    
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

      // Update last accessed time for this URL+method combination
      await updateRecentUrls(url, method);
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

      // Update last accessed time for this URL (use default method for chat history access)
      await updateRecentUrls(url, 'default');
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

// Get list of recent URLs (for LRU)
storage.getRecentUrls = async function() {
  try {
    const result = await chrome.storage.local.get(RECENT_URLS_KEY);
    return result[RECENT_URLS_KEY] || [];
  } catch (error) {
    storageLogger.error('Error getting recent URLs:', error.message);
    return [];
  }
}

// Clear data for a specific URL
storage.clearUrlData = async function(url, clearContent = true, clearChat = true, clearMetadata = true, wildcard = false) {
  if (!url) {
    storageLogger.error('Cannot clear data: URL is empty');
    return false;
  }
  
  try {
    // Get all storage keys
    const result = await chrome.storage.local.get(null);
    const allKeys = Object.keys(result);
    const keysToRemove = [];
    const normalizedBaseUrl = normalizeUrl(url);
    
    // URL wildcard matching mode - used to clear all tabs associated with a URL
    if (wildcard) {
      storageLogger.info(`Using wildcard matching to clear data for base URL: ${normalizedBaseUrl}`);

      if (clearContent) {
        // Clear all unified page data keys that start with the normalized URL
        const pageKeys = allKeys.filter(key =>
          key.startsWith(DB_PAGE_PREFIX) &&
          key.includes(normalizedBaseUrl)
        );
        keysToRemove.push(...pageKeys);
      }

      if (clearChat) {
        // Clear all chat keys that start with the normalized URL
        const chatKeys = allKeys.filter(key =>
          key.startsWith(DB_CHAT_PREFIX) &&
          key.includes(normalizedBaseUrl)
        );
        keysToRemove.push(...chatKeys);
      }

      // Note: pageState is now part of unified page data (DB_PAGE_PREFIX)
      // and will be cleared when clearContent is true

      if (clearMetadata) {
        // Note: Unified page data (DB_PAGE_PREFIX) already includes metadata,
        // so it's cleared above when clearContent is true
      }
      
      storageLogger.info(`Found ${keysToRemove.length} keys to remove with wildcard matching`);
    } else {
      // Standard exact URL matching
      if (clearContent) {
        // Clear unified page data for this URL
        const pageKey = getPageKeyFromUrl(url);
        keysToRemove.push(pageKey);
      }

      if (clearChat) {
        // Clear chat history for this URL
        const chatKey = getChatHistoryKeyFromUrl(url);
        keysToRemove.push(chatKey);
      }

      // Note: pageState is now part of unified page data (DB_PAGE_PREFIX)
      // and will be cleared when clearContent is true

      if (clearMetadata) {
        // Note: Unified page data (DB_PAGE_PREFIX) already includes metadata,
        // so it's cleared above when clearContent is true
      }
    }
    
    // Remove the keys
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    
    // Update recent URLs list if metadata is being cleared
    if (clearMetadata || wildcard) {
      let recentUrls = await storage.getRecentUrls();
      
      if (wildcard) {
        // If wildcard mode, remove all entries that contain the normalized URL
        recentUrls = recentUrls.filter(item => {
          const itemUrl = typeof item === 'string' ? item : item.url;
          return !normalizeUrl(itemUrl).includes(normalizedBaseUrl);
        });
      } else {
        // Otherwise, just remove the exact URL
        recentUrls = recentUrls.filter(item => {
          const itemUrl = typeof item === 'string' ? item : item.url;
          return normalizeUrl(itemUrl) !== normalizeUrl(url);
        });
      }
      
      await chrome.storage.local.set({ [RECENT_URLS_KEY]: recentUrls });
    }
    
    storageLogger.info('URL data cleared successfully', {
      url,
      wildcard,
      clearedContent: clearContent,
      clearedChat: clearChat,
      clearedMetadata: clearMetadata,
      keysRemoved: keysToRemove.length
    });
    return true;
  } catch (error) {
    storageLogger.error('Error clearing URL data:', { url, error: error.message });
    return false;
  }
}

// Update recent URLs list with time-based cleanup
async function updateRecentUrls(url, method) {
  try {
    // Get normalized URL
    const normalizedUrl = normalizeUrl(url);
    const currentTime = Date.now();

    // Get current list of recent URLs
    let recentUrls = await storage.getRecentUrls();

    // Convert old format to new format if needed and add timestamps
    recentUrls = recentUrls.map(item => {
      if (typeof item === 'string') {
        return { url: item, method: 'default', lastAccessed: currentTime };
      }
      // Add lastAccessed timestamp if missing
      if (!item.lastAccessed) {
        item.lastAccessed = currentTime;
      }
      return item;
    });

    // Remove the URL+method combination if it already exists
    recentUrls = recentUrls.filter(item =>
      !(normalizeUrl(item.url) === normalizedUrl && item.method === method)
    );

    // Add the URL+method to the front of the list (most recent)
    recentUrls.unshift({ url, method, lastAccessed: currentTime });

    // Clean up items older than MAX_CACHE_AGE_DAYS
    const cutoffTime = currentTime - MAX_CACHE_AGE_MS;
    const itemsToRemove = recentUrls.filter(item => item.lastAccessed < cutoffTime);

    if (itemsToRemove.length > 0) {
      storageLogger.info(`Removing ${itemsToRemove.length} items older than ${MAX_CACHE_AGE_DAYS} days`, {
        cutoffDate: new Date(cutoffTime).toISOString(),
        itemsToRemove: itemsToRemove.map(item => ({ url: item.url, method: item.method, lastAccessed: new Date(item.lastAccessed).toISOString() }))
      });

      // Remove old data from unified storage
      for (const oldItem of itemsToRemove) {
        // Remove unified page storage
        const oldPageKey = getPageKeyFromUrl(oldItem.url);
        await chrome.storage.local.remove(oldPageKey);

        // Remove chat history for this URL (only if no other methods exist for this URL)
        const remainingItemsForUrl = recentUrls.filter(item =>
          normalizeUrl(item.url) === normalizeUrl(oldItem.url) &&
          item.lastAccessed >= cutoffTime
        );

        if (remainingItemsForUrl.length === 0) {
          const chatKey = getChatHistoryKeyFromUrl(oldItem.url);
          await chrome.storage.local.remove(chatKey);
          storageLogger.info(`Removed chat history for expired URL: ${oldItem.url}`);
        }
      }

      // Filter out expired items
      recentUrls = recentUrls.filter(item => item.lastAccessed >= cutoffTime);
    }

    // Save updated list
    await chrome.storage.local.set({ [RECENT_URLS_KEY]: recentUrls });

    storageLogger.info(`Updated recent URLs list`, {
      totalItems: recentUrls.length,
      removedExpiredItems: itemsToRemove.length,
      maxAgeHours: MAX_CACHE_AGE_DAYS * 24
    });
  } catch (error) {
    storageLogger.error('Error updating recent URLs:', error.message);
  }
}

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
      key.startsWith(DB_PAGE_PREFIX) ||
      key === RECENT_URLS_KEY
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

    // Update LRU list
    await updateRecentUrls(url, method);

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

/**
 * Clean up expired cache data based on last access time
 * This function can be called periodically or on startup
 * @returns {Promise<Object>} Cleanup statistics
 */
storage.cleanupExpiredCache = async function() {
  try {
    const currentTime = Date.now();
    const cutoffTime = currentTime - MAX_CACHE_AGE_MS;

    storageLogger.info(`Starting cache cleanup for items older than ${MAX_CACHE_AGE_DAYS} days`, {
      cutoffDate: new Date(cutoffTime).toISOString()
    });

    // Get all storage data
    const result = await chrome.storage.local.get(null);
    const keysToRemove = [];
    let expiredPageCount = 0;
    let expiredChatCount = 0;

    // Check recent URLs list and identify expired items
    const recentUrls = result[RECENT_URLS_KEY] || [];
    const validUrls = [];
    const expiredUrls = [];

    for (const item of recentUrls) {
      const lastAccessed = item.lastAccessed || 0;
      if (lastAccessed < cutoffTime) {
        expiredUrls.push(item);
      } else {
        validUrls.push(item);
      }
    }

    // Remove expired page data
    for (const expiredItem of expiredUrls) {
      const pageKey = getPageKeyFromUrl(expiredItem.url);
      if (result[pageKey]) {
        keysToRemove.push(pageKey);
        expiredPageCount++;
      }

      // Check if we should remove chat history (only if no valid items exist for this URL)
      const hasValidItemsForUrl = validUrls.some(validItem =>
        normalizeUrl(validItem.url) === normalizeUrl(expiredItem.url)
      );

      if (!hasValidItemsForUrl) {
        const chatKey = getChatHistoryKeyFromUrl(expiredItem.url);
        if (result[chatKey]) {
          keysToRemove.push(chatKey);
          expiredChatCount++;
        }
      }
    }

    // Also check for orphaned page data (not in recent URLs but older than cutoff)
    for (const key in result) {
      if (key.startsWith(DB_PAGE_PREFIX)) {
        const pageData = result[key];
        if (pageData && pageData.lastUpdated && pageData.lastUpdated < cutoffTime) {
          // Check if this page is in the valid URLs list
          const isInValidUrls = validUrls.some(item =>
            getPageKeyFromUrl(item.url) === key
          );

          if (!isInValidUrls && !keysToRemove.includes(key)) {
            keysToRemove.push(key);
            expiredPageCount++;

            // Also remove associated chat if no other valid items exist
            const chatKey = getChatHistoryKeyFromUrl(pageData.url);
            if (result[chatKey] && !keysToRemove.includes(chatKey)) {
              const hasOtherValidItems = validUrls.some(item =>
                normalizeUrl(item.url) === normalizeUrl(pageData.url)
              );
              if (!hasOtherValidItems) {
                keysToRemove.push(chatKey);
                expiredChatCount++;
              }
            }
          }
        }
      }
    }

    // Remove expired keys
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }

    // Update recent URLs list to remove expired items
    if (expiredUrls.length > 0) {
      await chrome.storage.local.set({ [RECENT_URLS_KEY]: validUrls });
    }

    const stats = {
      totalExpiredItems: expiredUrls.length,
      expiredPageCount,
      expiredChatCount,
      keysRemoved: keysToRemove.length,
      remainingValidUrls: validUrls.length,
      cutoffDate: new Date(cutoffTime).toISOString()
    };

    storageLogger.info('Cache cleanup completed', stats);
    return stats;
  } catch (error) {
    storageLogger.error('Error during cache cleanup:', error.message);
    return {
      error: error.message,
      totalExpiredItems: 0,
      expiredPageCount: 0,
      expiredChatCount: 0,
      keysRemoved: 0
    };
  }
};