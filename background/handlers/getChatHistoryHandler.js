/**
 * Handle GET_CHAT_HISTORY message
 * @param {Object} data - Message data containing url
 * @param {Object} serviceLogger - Service worker logger
 * @param {Object} storage - Storage module
 * @returns {Promise<Object>} Response object
 */
async function handleGetChatHistory(data, serviceLogger, storage) {
  const { url } = data;
  
  if (!url) {
    serviceLogger.warn('GET_CHAT_HISTORY: No URL provided');
    return { type: 'CHAT_HISTORY_ERROR', error: 'No URL provided' };
  }
  
  try {
    const chatHistory = await storage.getChatHistory(url);
    
    if (chatHistory && chatHistory.length > 0) {
      serviceLogger.info(`GET_CHAT_HISTORY: Retrieved ${chatHistory.length} messages for ${url}`);
      return { 
        type: 'CHAT_HISTORY_LOADED', 
        chatHistory: chatHistory,
        url: url
      };
    } else {
      return { 
        type: 'CHAT_HISTORY_LOADED', 
        chatHistory: [],
        url: url
      };
    }
  } catch (error) {
    serviceLogger.error('GET_CHAT_HISTORY error:', error.message);
    return { 
      type: 'CHAT_HISTORY_ERROR', 
      error: error.message || 'Failed to get chat history',
      url: url
    };
  }
} 