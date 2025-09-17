/**
 * Generate unique branch ID
 * @returns {string} Unique branch ID
 */
function generateBranchId() {
  // Prefer crypto.randomUUID(), fallback to timestamp + random number if not supported
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `br-${crypto.randomUUID()}`;
  }
  return `br-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Migrate legacy chat message to new branching format
 * @param {Object} message - Legacy message object
 * @returns {Object} Migrated message object
 */
function migrateLegacyMessage(message) {
  // If user message, return directly
  if (message.role === 'user') {
    return message;
  }

  // If assistant message and already new format (contains responses), return directly
  if (message.role === 'assistant' && message.responses) {
    return message;
  }

  // If assistant message but old format, convert to new format
  if (message.role === 'assistant') {
    const newMessage = {
      role: 'assistant',
      responses: [
        {
          branchId: generateBranchId(),
          model: message.model || 'unknown',
          content: message.content || '',
          status: 'done', // Historical messages default to completed state
          errorMessage: null,
          updatedAt: message.timestamp || Date.now()
        }
      ]
    };

    // Preserve other possible fields (such as timestamp, etc.)
    Object.keys(message).forEach(key => {
      if (!['role', 'content', 'model'].includes(key) && !newMessage.hasOwnProperty(key)) {
        newMessage[key] = message[key];
      }
    });

    return newMessage;
  }

  // Other message types return directly
  return message;
}

/**
 * Migrate entire chat history to new branching format
 * @param {Array} chatHistory - Original chat history
 * @param {Object} serviceLogger - Service worker logger
 * @returns {Array} Migrated chat history
 */
function migrateChatHistory(chatHistory, serviceLogger) {
  if (!Array.isArray(chatHistory)) {
    return chatHistory;
  }

  let migrationCount = 0;
  const migratedHistory = chatHistory.map(message => {
    const originalFormat = message.role === 'assistant' && !message.responses;
    const migratedMessage = migrateLegacyMessage(message);
    
    if (originalFormat) {
      migrationCount++;
    }
    
    return migratedMessage;
  });

  if (migrationCount > 0) {
    serviceLogger.info(`GET_CHAT_HISTORY: Migrated ${migrationCount} legacy assistant messages to new branching format`);
  }

  return migratedHistory;
}

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
    const rawChatHistory = await storage.getChatHistory(url);
    
    if (rawChatHistory && rawChatHistory.length > 0) {
      // Execute data migration (only in memory, do not modify storage)
      const migratedChatHistory = migrateChatHistory(rawChatHistory, serviceLogger);
      
      serviceLogger.info(`GET_CHAT_HISTORY: Retrieved ${migratedChatHistory.length} messages for ${url}`);
      return { 
        type: 'CHAT_HISTORY_LOADED', 
        chatHistory: migratedChatHistory,
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