/**
 * Generate unique branch ID
 * @returns {string} Unique branch ID
 */
function generateBranchId() {
  // 优先使用 crypto.randomUUID()，若不支持则回退到时间戳+随机数
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
  // 如果是用户消息，直接返回
  if (message.role === 'user') {
    return message;
  }

  // 如果是助手消息且已经是新格式（包含responses），直接返回
  if (message.role === 'assistant' && message.responses) {
    return message;
  }

  // 如果是助手消息但是旧格式，转换为新格式
  if (message.role === 'assistant') {
    const newMessage = {
      role: 'assistant',
      responses: [
        {
          branchId: generateBranchId(),
          model: message.model || 'unknown',
          content: message.content || '',
          status: 'done', // 历史消息默认为完成状态
          errorMessage: null,
          updatedAt: message.timestamp || Date.now()
        }
      ]
    };

    // 保留其他可能的字段（如timestamp等）
    Object.keys(message).forEach(key => {
      if (!['role', 'content', 'model'].includes(key) && !newMessage.hasOwnProperty(key)) {
        newMessage[key] = message[key];
      }
    });

    return newMessage;
  }

  // 其他类型消息直接返回
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
      // 执行数据迁移（仅在内存中，不修改存储）
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