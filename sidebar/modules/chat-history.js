/**
 * chat-history.js - Chat history management module
 * DOM-based chat history management implementation
 */

import { createLogger, hasMarkdownElements } from './utils.js';

const logger = createLogger('ChatHistory');

/**
 * Get complete chat history from DOM
 * @param {HTMLElement} chatContainer - Chat container element
 * @returns {Array} Chat history array
 */
const getChatHistoryFromDOM = (chatContainer) => {
  const messageElements = chatContainer.querySelectorAll('.chat-message');
  const chatHistory = [];

  messageElements.forEach(messageEl => {
    // Skip messages that are currently streaming, but NOT error messages
    // Error messages might have data-streaming but should still be included in history
    if (messageEl.hasAttribute('data-streaming') && !messageEl.classList.contains('error-message')) {
      
      return;
    }

    const role = messageEl.classList.contains('user-message') ? 'user' : 'assistant';
    const contentEl = messageEl.querySelector('.message-content');
    
    // For error messages, get content from error display or fallback to textContent
    let content = '';
    if (messageEl.classList.contains('error-message')) {
      // For errors, content is the visible error message.
      // We prioritize the text from the <pre> tag inside .error-display.
      const errorDisplay = contentEl?.querySelector('.error-display pre');
      if (errorDisplay) {
        content = errorDisplay.textContent || '';
      } else {
        // Fallback for cases where the structure is different
        content = contentEl?.textContent || '';
      }

    } else {
      // For normal messages, prioritize raw content for data integrity (e.g., for edits).
      content = contentEl ? contentEl.getAttribute('data-raw-content') || contentEl.textContent : '';
    }
    
    const timestamp = parseInt(messageEl.id.split('-')[1], 10) || Date.now();
    
    // Get image data if it exists
    const imageBase64 = messageEl.getAttribute('data-image');
    
    // Create base message object
    const messageObj = {
      role,
      content,
      timestamp,
      ...(imageBase64 ? { imageBase64 } : {})
    };
    
    // Check if this is a quick input message and store display text
    if (contentEl && contentEl.getAttribute('data-quick-input') === 'true') {
      const displayText = contentEl.getAttribute('data-display-text');
      if (displayText) {
        messageObj.displayText = displayText;
        messageObj.isQuickInput = true;
      }
    }
    
    // Mark error messages for proper restoration
    if (messageEl.classList.contains('error-message')) {
      messageObj.isError = true;
    }
    
    chatHistory.push(messageObj);
  });

  return chatHistory;
};

/**
 * Delete all messages after a specified message from DOM
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {string} messageId - Message ID
 * @returns {boolean} Whether deletion was successful
 */
const deleteMessagesAfter = (chatContainer, messageId) => {
  const messageEl = document.getElementById(messageId);
  if (!messageEl) {
    return false;
  }

  const allMessages = Array.from(chatContainer.querySelectorAll('.chat-message'));
  const messageIndex = allMessages.findIndex(el => el.id === messageId);
  
  if (messageIndex === -1) {
    return false;
  }

  // Delete all messages after this message
  for (let i = allMessages.length - 1; i > messageIndex; i--) {
    allMessages[i].remove();
  }


  return true;
};

/**
 * Clear all chat history
 * @param {HTMLElement} chatContainer - Chat container element
 */
const clearChatHistory = (chatContainer) => {
  chatContainer.innerHTML = '';

};

/**
 * Edit message content in DOM
 * @param {string} messageId - Message ID
 * @param {string} newContent - New message content
 * @returns {boolean} Whether edit was successful
 */
const editMessageInDOM = (messageId, newContent) => {
  const messageEl = document.getElementById(messageId);
  if (!messageEl) {
    return false;
  }

  const contentEl = messageEl.querySelector('.message-content');
  if (!contentEl) {
    return false;
  }

  try {
    // Save original content for export
    contentEl.setAttribute('data-raw-content', newContent);
    
    // Check if it's a user message
    const isUserMessage = messageEl.classList.contains('user-message');
    
    if (isUserMessage) {
      // User messages use textContent to preserve line breaks
      contentEl.textContent = newContent;
    } else {
      // Check if assistant message contains markdown
      const containsMarkdown = hasMarkdownElements(newContent);
      
      // First remove any existing no-markdown class
      contentEl.classList.remove('no-markdown');
      
      if (containsMarkdown) {
        // Contains markdown, use markdown rendering
        contentEl.innerHTML = window.marked.parse(newContent);
      } else {
        // No markdown, use plain text and preserve line breaks
        contentEl.textContent = newContent;
        contentEl.classList.add('no-markdown');
      }
    }
    return true;
  } catch (error) {
    logger.error(`Error updating message ${messageId} content:`, error);
    // Fallback to plain text
    contentEl.textContent = newContent;
    contentEl.setAttribute('data-raw-content', newContent);
    return true;
  }
};

/**
 * Display chat history
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {Array} history - Chat history array
 * @param {Function} appendMessageToUIFunc - Function to append message to UI
 */
const displayChatHistory = (chatContainer, history, appendMessageToUIFunc) => {
  if (!chatContainer) {
    logger.error('Chat container is not defined.');
    return;
  }
  
  // Clear container
  chatContainer.innerHTML = '';
  
  if (!history || history.length === 0) {
    return;
  }
  
  try {
    // Ensure all messages have timestamp and sort by timestamp
    const baseTime = Date.now() - history.length * 1000;
    const sortedHistory = history
      .map((msg, index) => ({
        ...msg,
        timestamp: msg.timestamp || (baseTime + index * 1000)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Display messages
    sortedHistory.forEach(message => {
      if (!message || !message.role || !message.content) {
        return;
      }
      
      // For quick input messages, show display text but preserve send text for editing
      let contentToShow = message.content;
      if (message.isQuickInput && message.displayText) {
        contentToShow = message.displayText;
      }
      
      // Handle error messages specially
      if (message.isError) {
        
        // Create error message element directly instead of using normal appendMessageToUI
        const messageTimestamp = message.timestamp;
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant-message error-message';
        messageDiv.id = `message-${messageTimestamp}`;
        
        const roleDiv = document.createElement('div');
        roleDiv.className = 'message-role';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Create error display element
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-display';
        
        const errorContent = document.createElement('pre');
        errorContent.style.cssText = `
          color: var(--error-color);
          white-space: pre-wrap;
          font-family: monospace;
          font-size: 0.9em;
          margin: 0;
          padding: 12px;
          background-color: var(--error-bg, #fff5f5);
          border-left: 4px solid var(--error-color);
          border-radius: 4px;
        `;
        errorContent.textContent = message.content;
        
        errorContainer.appendChild(errorContent);
        contentDiv.appendChild(errorContainer);
        contentDiv.setAttribute('data-raw-content', message.content);
        
        messageDiv.appendChild(roleDiv);
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        

      } else {
        // Normal message processing
        const messageElement = appendMessageToUIFunc(
          chatContainer,
          message.role,
          contentToShow,
          message.imageBase64 || null,
          false,
          message.timestamp
        );
        
        // If this is a quick input message, restore the data attributes
        if (message.isQuickInput && messageElement) {
          const contentEl = messageElement.querySelector('.message-content');
          if (contentEl) {
            contentEl.setAttribute('data-quick-input', 'true');
            contentEl.setAttribute('data-display-text', message.displayText || message.content);
            contentEl.setAttribute('data-raw-content', message.content);
          }
        }
      }
    });
    
    // Scroll to last user message if exists, otherwise scroll to bottom
    scrollToLastUserMessage(chatContainer);

  } catch (error) {
    logger.error('Error displaying chat history:', error);
  }
};

/**
 * Scroll to the last user message in the chat container
 * If no user messages exist, scroll to bottom
 * @param {HTMLElement} chatContainer - Chat container element
 */
const scrollToLastUserMessage = (chatContainer) => {
  if (!chatContainer) {
    return;
  }

  try {
    // Find all user messages
    const userMessages = chatContainer.querySelectorAll('.chat-message.user-message');

    if (userMessages.length > 0) {
      // Get the last user message
      const lastUserMessage = userMessages[userMessages.length - 1];

      // Use immediate scrolling for faster response
      // Calculate the position to scroll to - position the message near the top of the container
      const containerRect = chatContainer.getBoundingClientRect();
      const messageRect = lastUserMessage.getBoundingClientRect();
      const containerScrollTop = chatContainer.scrollTop;

      // Calculate target scroll position - position message about 10% from top of container
      const targetScrollTop = containerScrollTop + messageRect.top - containerRect.top - (containerRect.height * 0.1);

      // Ensure we don't scroll beyond the container bounds
      const maxScrollTop = chatContainer.scrollHeight - chatContainer.clientHeight;
      const finalScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

      // Use immediate scrolling for faster response
      chatContainer.scrollTop = finalScrollTop;

      logger.info('Scrolled to last user message at position:', finalScrollTop);
    } else {
      // No user messages found, scroll to bottom as fallback
      chatContainer.scrollTop = chatContainer.scrollHeight;
      logger.info('No user messages found, scrolled to bottom');
    }
  } catch (error) {
    logger.warn('Error scrolling to last user message, falling back to scroll to bottom:', error);
    // Fallback to original behavior
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
};

export {
  getChatHistoryFromDOM,
  deleteMessagesAfter,
  clearChatHistory,
  editMessageInDOM,
  displayChatHistory,
  scrollToLastUserMessage
};