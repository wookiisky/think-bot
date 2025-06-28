// background/handlers/getCachedPageDataHandler.js

async function handleGetCachedPageData(data, serviceLogger, configManager, storage) {
  const { url } = data;
  
  try {
    serviceLogger.info('GET_CACHED_PAGE_DATA: Fetching cached content for URL:', url);
    
    // Get current config to determine default extraction method
    const config = await configManager.getConfig();
    // Support both old and new config formats
    const basicConfig = config.basic || config;
    const defaultMethod = basicConfig.defaultExtractionMethod;
    
    // Try to get cached content for the default method first
    let cachedContent = await storage.getPageContent(url, defaultMethod);
    let usedMethod = defaultMethod;
    
    // If no content found for default method, try other methods
    if (!cachedContent) {
      const methods = ['readability', 'jina', 'default'];
      for (const method of methods) {
        if (method !== defaultMethod) {
          cachedContent = await storage.getPageContent(url, method);
          if (cachedContent) {
            usedMethod = method;
            serviceLogger.info(`GET_CACHED_PAGE_DATA: Found cached content using ${method} method`);
            break;
          }
        }
      }
    }
    
    if (cachedContent) {
      // Get chat history separately
      const chatHistory = await storage.getChatHistory(url);
      
      serviceLogger.info(`GET_CACHED_PAGE_DATA: Found cached content for ${url}, method: ${usedMethod}, length: ${cachedContent.length}`);
      
      return {
        type: 'CACHED_PAGE_DATA_LOADED',
        data: {
          content: cachedContent,
          chatHistory: chatHistory || [],
          extractionMethod: usedMethod
        }
      };
    } else {
      serviceLogger.info(`GET_CACHED_PAGE_DATA: No cached content found for ${url}`);
      return {
        type: 'CACHED_PAGE_DATA_NOT_FOUND',
        error: 'No cached content available'
      };
    }
  } catch (error) {
    serviceLogger.error('GET_CACHED_PAGE_DATA error:', error.message);
    return {
      type: 'CACHED_PAGE_DATA_ERROR',
      error: error.message || 'Failed to fetch cached page data'
    };
  }
}

// Make the handler available globally
// In a service worker environment, this function can be called directly
if (typeof module !== 'undefined' && module.exports) {
  module.exports = handleGetCachedPageData;
}
