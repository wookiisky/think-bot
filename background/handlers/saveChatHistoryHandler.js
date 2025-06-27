// background/handlers/saveChatHistoryHandler.js

async function handleSaveChatHistory(data, serviceLogger, storage) {
  const { url, chatHistory } = data;
  
  if (!url) {
    serviceLogger.warn('SAVE_CHAT_HISTORY: No URL provided');
    return { success: false, error: 'No URL provided' };
  }
  
  if (!chatHistory || !Array.isArray(chatHistory)) {
    serviceLogger.warn('SAVE_CHAT_HISTORY: Invalid chat history data');
    return { success: false, error: 'Invalid chat history data' };
  }
  
  try {
    serviceLogger.info(`SAVE_CHAT_HISTORY: Saving ${chatHistory.length} messages for ${url}`);
    const success = await storage.saveChatHistory(url, chatHistory);
    
    if (!success) {
      serviceLogger.warn(`SAVE_CHAT_HISTORY: Failed for ${url}`);
      return { success: false, error: 'Failed to save chat history' };
    }
    
    return { success: true };
  } catch (error) {
    serviceLogger.error('SAVE_CHAT_HISTORY error:', error.message);
    return { 
      success: false, 
      error: error.message || 'Failed to save chat history'
    };
  }
} 