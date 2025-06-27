// background/handlers/getAnyCachedContentHandler.js

async function handleGetAnyCachedContent(data, serviceLogger, storage) {
  const { url } = data;
  
  try {
    serviceLogger.info('GET_ANY_CACHED_CONTENT: Searching for any cached content for URL:', url);
    
    // Try all available extraction methods to find any cached content
    const methods = ['readability', 'jina', 'default'];
    let foundContent = null;
    let foundMethod = null;
    
    for (const method of methods) {
      const cachedContent = await storage.getPageContent(url, method);

      if (cachedContent) {
        foundContent = cachedContent;
        foundMethod = method;
        serviceLogger.info(`GET_ANY_CACHED_CONTENT: Found content using ${method} method, length: ${cachedContent.length}`);
        break;
      }
    }
    
    if (foundContent) {
      // Get chat history separately
      const chatHistory = await storage.getChatHistory(url);
      
      serviceLogger.info(`GET_ANY_CACHED_CONTENT: Returning cached content for ${url}, method: ${foundMethod}`);
      
      return {
        type: 'ANY_CACHED_CONTENT_LOADED',
        data: {
          content: foundContent,
          chatHistory: chatHistory || [],
          extractionMethod: foundMethod
        }
      };
    } else {
      serviceLogger.info(`GET_ANY_CACHED_CONTENT: No cached content found for ${url} with any method`);
      return {
        type: 'ANY_CACHED_CONTENT_NOT_FOUND',
        error: 'No cached content available with any extraction method'
      };
    }
  } catch (error) {
    serviceLogger.error('GET_ANY_CACHED_CONTENT error:', error.message);
    return {
      type: 'ANY_CACHED_CONTENT_ERROR',
      error: error.message || 'Failed to fetch any cached content'
    };
  }
}

// Make the handler available globally
// In a service worker environment, this function can be called directly
if (typeof module !== 'undefined' && module.exports) {
  module.exports = handleGetAnyCachedContent;
}
