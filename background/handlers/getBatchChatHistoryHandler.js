/**
 * Handle GET_BATCH_CHAT_HISTORY message
 * Optimized batch processing for multiple chat history requests
 * @param {Object} data - Message data containing urls array
 * @param {Object} serviceLogger - Service worker logger
 * @param {Object} storage - Storage module
 * @returns {Promise<Object>} Response object with all chat histories
 */
async function handleGetBatchChatHistory(data, serviceLogger, storage) {
  const { urls } = data;
  
  if (!Array.isArray(urls) || urls.length === 0) {
    serviceLogger.warn('GET_BATCH_CHAT_HISTORY: No URLs array provided');
    return { type: 'BATCH_CHAT_HISTORY_ERROR', error: 'No URLs array provided' };
  }
  
  try {
    const startTime = Date.now();
    serviceLogger.info(`GET_BATCH_CHAT_HISTORY: Fetching chat histories for ${urls.length} URLs`);
    
    // Process all URLs in parallel for better performance
    const historyPromises = urls.map(async (url) => {
      try {
        const rawChatHistory = await storage.getChatHistory(url);
        
        if (rawChatHistory && rawChatHistory.length > 0) {
          // Apply migration if needed (inline migration logic for service worker compatibility)
          let migratedChatHistory = rawChatHistory;
          if (Array.isArray(rawChatHistory)) {
            // Simple migration logic - convert legacy assistant messages to new format
            let migrationCount = 0;
            migratedChatHistory = rawChatHistory.map(message => {
              if (message.role === 'assistant' && !message.responses && message.content) {
                migrationCount++;
                return {
                  ...message,
                  responses: [{
                    branchId: `br-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    model: message.model || 'unknown',
                    content: message.content,
                    status: 'done',
                    errorMessage: null,
                    updatedAt: message.timestamp || Date.now()
                  }]
                };
              }
              return message;
            });
            
            if (migrationCount > 0) {
              serviceLogger.debug(`Migrated ${migrationCount} legacy messages for ${url}`);
            }
          }
          
          return {
            url: url,
            chatHistory: migratedChatHistory,
            success: true
          };
        } else {
          return {
            url: url,
            chatHistory: [],
            success: true
          };
        }
      } catch (error) {
        serviceLogger.warn(`GET_BATCH_CHAT_HISTORY: Error fetching history for ${url}:`, error.message);
        return {
          url: url,
          chatHistory: [],
          success: false,
          error: error.message
        };
      }
    });
    
    // Wait for all requests to complete
    const results = await Promise.all(historyPromises);
    const processingTime = Date.now() - startTime;
    
    // Count successful and failed requests
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;
    
    serviceLogger.info(`GET_BATCH_CHAT_HISTORY: Completed ${urls.length} requests in ${processingTime}ms (${successCount} success, ${failedCount} failed)`);
    
    // Return batched results
    return {
      type: 'BATCH_CHAT_HISTORY_LOADED',
      results: results,
      totalRequests: urls.length,
      successfulRequests: successCount,
      failedRequests: failedCount,
      processingTimeMs: processingTime
    };
    
  } catch (error) {
    serviceLogger.error('GET_BATCH_CHAT_HISTORY error:', error.message);
    return {
      type: 'BATCH_CHAT_HISTORY_ERROR',
      error: error.message || 'Failed to get batch chat histories',
      urls: urls
    };
  }
}

// Function is available globally in service worker context
