/**
 * chat-message.js - Chat message component
 * 
 * Enhanced Edit Mode Features:
 * - Auto-save on blur (clicking outside the text area)
 * - Auto-resize textarea based on content
 * - Escape key to cancel editing
 * - Ctrl/Cmd+Enter to save manually
 * - Visual feedback with glow effect
 * - No save/cancel buttons needed
 */

import { i18n } from '../../js/modules/i18n.js';
import { createLogger, hasMarkdownElements } from '../modules/utils.js';
import { getChatHistoryFromDOM, editMessageInDOM, deleteMessagesAfter } from '../modules/chat-history.js';

const logger = createLogger('ChatMessage');

/**
 * Get message element
 * @param {string} messageId - Message ID
 * @returns {HTMLElement|null} Message element
 */
const getMessageElement = (messageId) => {
  return document.getElementById(messageId);
};

/**
 * Edit message
 * @param {HTMLElement} messageElement - Message element
 * @param {Function} saveCallback - Save callback function
 */
const editMessage = (messageElement, saveCallback) => {
  logger.info(`Editing message ${messageElement.id}`);
  
  // Find message content element
  const contentElement = messageElement.querySelector('.message-content');
  if (!contentElement) {
    logger.error('Cannot find content element in message div');
    return;
  }
  
  // Ignore if already in edit mode
  if (contentElement.classList.contains('edit-mode')) {
    logger.info('Message already in edit mode');
    return;
  }
  
  // Get original content
  const originalContent = contentElement.getAttribute('data-raw-content') || contentElement.textContent;
  
  // Add edit mode class
  contentElement.classList.add('edit-mode');
  
  // Clear HTML content and create textarea
  contentElement.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.value = originalContent;
  textarea.className = 'edit-textarea';
  textarea.placeholder = i18n.getMessage('sidebar_chatMessage_placeholder_edit');
  textarea.setAttribute('title', i18n.getMessage('sidebar_chatMessage_title_edit'));
  
  // Store original content for restoration during tab switching
  textarea.setAttribute('data-original-content', originalContent);
  
  contentElement.appendChild(textarea);
  
  // Auto-resize textarea function
  const autoResize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
  };
  
  // Auto-save function with enhanced state management
  const autoSave = async () => {
    const newContent = textarea.value.trim();
    if (newContent !== originalContent.trim()) {
      logger.info(`Auto-saving edited message ${messageElement.id}`);
      
      // Save the edited message and ensure history is properly saved
      await saveEditedMessageEnhanced(messageElement.id, newContent, saveCallback);
    } else {
      // If content unchanged, just exit edit mode
      cancelEdit(messageElement.id, originalContent);
    }
  };
  
  // Set up event listeners
  textarea.addEventListener('input', autoResize);
  textarea.addEventListener('blur', autoSave);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Cancel edit on Escape
      cancelEdit(messageElement.id, originalContent);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Save on Ctrl+Enter or Cmd+Enter
      e.preventDefault();
      autoSave();
    }
  });
  
  // Initial resize and focus
  autoResize();
  textarea.focus();
  
  // Select all text for easy editing
  textarea.select();
  
  // Log editing instructions for user reference
  logger.info('Edit mode activated. Auto-saves on blur, ESC to cancel, Ctrl+Enter to save manually');
};

/**
 * Enhanced save edited message with better state management
 * @param {string} messageId - Message ID
 * @param {string} newContent - New content
 * @param {Function} saveCallback - Save callback function
 */
const saveEditedMessageEnhanced = async (messageId, newContent, saveCallback) => {
  logger.info(`Saving edited message ${messageId} with enhanced state management`);
  
  // Update DOM
  editMessageInDOM(messageId, newContent);
  
  // Remove edit mode
  const messageElement = getMessageElement(messageId);
  if (messageElement) {
    const contentElement = messageElement.querySelector('.message-content');
    if (contentElement) {
      contentElement.classList.remove('edit-mode');
    }
  }
  
  // Call callback
  if (typeof saveCallback === 'function') {
    saveCallback(messageId, newContent);
  }
  
  // Save chat history with enhanced error handling
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    const chatHistory = getChatHistoryFromDOM(chatContainer);
    
    // Get current tab ID for proper state management
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    
    try {
      // Save to tab-specific storage first
      if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
        await window.TabManager.saveCurrentTabChatHistory(chatHistory);
        logger.info(`Chat history saved to tab ${currentTabId} after editing message`);
      } else {
        // Fallback to original method
        await chrome.runtime.sendMessage({
          type: 'SAVE_CHAT_HISTORY',
          url: window.StateManager.getStateItem('currentUrl'),
          chatHistory: chatHistory
        });
        logger.info('Chat history saved after editing message');
      }
    } catch (error) {
      logger.error('Failed to save chat history after editing message:', error);
    }
  }
};

/**
 * Cancel edit
 * @param {string} messageId - Message ID
 * @param {string} originalContent - Original content
 */
const cancelEdit = (messageId, originalContent) => {
  logger.info(`Cancelling edit for message ${messageId}`);
  
  const messageElement = getMessageElement(messageId);
  if (!messageElement) return;
  
  const contentElement = messageElement.querySelector('.message-content');
  if (!contentElement) return;
  
  // Restore original content
  // Check if it's a user message to decide how to render content
  const isUserMessage = messageElement.classList.contains('user-message');
  
  if (isUserMessage) {
    // User messages use textContent to preserve line breaks
    contentElement.textContent = originalContent;
  } else {
    // Check if assistant message contains markdown
    const containsMarkdown = hasMarkdownElements(originalContent);
    
    // First remove any existing no-markdown class
    contentElement.classList.remove('no-markdown');
    
    if (containsMarkdown) {
      // Contains markdown, use markdown rendering
      try {
        contentElement.innerHTML = window.marked.parse(originalContent);
      } catch (error) {
        contentElement.textContent = originalContent;
        contentElement.classList.add('no-markdown');
      }
    } else {
      // No markdown, use plain text and preserve line breaks
      contentElement.textContent = originalContent;
      contentElement.classList.add('no-markdown');
    }
  }
  
  // Remove edit mode
  contentElement.classList.remove('edit-mode');
};

/**
 * Retry message
 * @param {HTMLElement} messageElement - Message element
 * @param {Function} retryCallback - Retry callback function
 */
const retryMessage = (messageElement, retryCallback) => {
  logger.info(`Retrying message ${messageElement.id}`);
  
  // Get message content
  const contentElement = messageElement.querySelector('.message-content');
  if (!contentElement) {
    logger.error('Cannot find content element in message div');
    return;
  }

  const messageContent = contentElement.getAttribute('data-raw-content') || contentElement.textContent;
  
  // Call callback function
  if (typeof retryCallback === 'function') {
    retryCallback(messageElement.id, messageContent);
  }
  
  // Get chat history from DOM
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    // Save updated chat history immediately and wait for completion
    const chatHistory = getChatHistoryFromDOM(chatContainer);
    
    // Get current tab ID for proper state management
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    
    // Save chat history for current tab first
    const saveHistoryPromise = window.TabManager && window.TabManager.saveCurrentTabChatHistory 
      ? window.TabManager.saveCurrentTabChatHistory(chatHistory)
      : chrome.runtime.sendMessage({
          type: 'SAVE_CHAT_HISTORY',
          url: window.StateManager.getStateItem('currentUrl'),
          chatHistory: chatHistory
        });
    
    saveHistoryPromise.then(async () => {
      logger.info('Chat history saved after retrying message');
      
      // Prepare LLM request
      const config = await window.StateManager.getConfig();
      // Support both old and new config formats
      const basicConfig = config.basic || config;
      const systemPrompt = basicConfig.systemPrompt || '';
      const extractedContent = window.StateManager.getStateItem('extractedContent') || '';
      const currentUrl = window.StateManager.getStateItem('currentUrl') || '';
      const extractionMethod = window.StateManager.getStateItem('currentExtractionMethod') || 'readability';
      const includePageContent = window.StateManager.getStateItem('includePageContent');
      
      // Build system prompt
      let systemPromptWithContent = systemPrompt;
      if (includePageContent) {
        systemPromptWithContent += '\n\nPage Content:\n' + extractedContent;
      }
      // Branch style retry: create new branch loading and pass branchId
      const chatEl = chatContainer;
      let retryBranchId = null;
      try {
        retryBranchId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? `br-${crypto.randomUUID()}`
          : `br-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const selectedModelForLabel = (window.modelSelector && typeof window.modelSelector.getSelectedModel === 'function')
          ? window.modelSelector.getSelectedModel()
          : null;

        const assistantTimestamp = Date.now();
        const branchContainer = document.createElement('div');
        branchContainer.className = 'chat-message assistant-message branch-container';
        branchContainer.id = `message-${assistantTimestamp}`;
        const roleDiv = document.createElement('div');
        roleDiv.className = 'message-role';
        branchContainer.appendChild(roleDiv);
        const branchesDiv = document.createElement('div');
        branchesDiv.className = 'message-branches';
        const branchDiv = document.createElement('div');
        branchDiv.className = 'message-branch';
        branchDiv.setAttribute('data-branch-id', retryBranchId);
        branchDiv.setAttribute('data-streaming', 'true');
        branchDiv.setAttribute('data-model', (selectedModelForLabel && selectedModelForLabel.name) || 'unknown');
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.setAttribute('data-raw-content', '');
        const loadingContainer = document.createElement('div');
        loadingContainer.className = 'loading-container';
        loadingContainer.innerHTML = '<div class="spinner"></div>';
        contentDiv.appendChild(loadingContainer);
        
        // Add model label to top of branch
        const modelLabel = document.createElement('div');
        modelLabel.className = 'branch-model-label';
        modelLabel.textContent = (selectedModelForLabel && selectedModelForLabel.name) || 'unknown';
        branchDiv.appendChild(modelLabel);
        
        branchDiv.appendChild(contentDiv);
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'branch-actions';
        const stopDeleteButton = document.createElement('button');
        stopDeleteButton.className = 'branch-action-btn delete-btn';
        stopDeleteButton.innerHTML = '<i class="material-icons">stop</i>';
        stopDeleteButton.title = i18n.getMessage('branch_stopAndDelete');
        stopDeleteButton.setAttribute('data-action', 'stop-delete');
        stopDeleteButton.setAttribute('data-branch-id', retryBranchId);
        actionsDiv.appendChild(stopDeleteButton);
        branchDiv.appendChild(actionsDiv);
        branchesDiv.appendChild(branchDiv);
        branchContainer.appendChild(branchesDiv);
        chatEl.appendChild(branchContainer);
        chatEl.scrollTop = chatEl.scrollHeight;
      } catch (retryUiError) {
        logger.warn('Retry branch UI creation failed, proceeding without branch UI:', retryUiError);
      }

      // Send request with branchId
      try {
        const selectedModel = (window.modelSelector && typeof window.modelSelector.getSelectedModel === 'function')
          ? window.modelSelector.getSelectedModel()
          : null;
        await window.MessageHandler.sendLlmMessage({
          messages: chatHistory,
          systemPromptTemplate: systemPromptWithContent,
          extractedPageContent: extractedContent,
          currentUrl: currentUrl,
          extractionMethod: extractionMethod,
          tabId: currentTabId,
          branchId: retryBranchId || undefined,
          model: selectedModel || undefined
        });
        
        logger.info(`Retry message sent successfully for tab ${currentTabId}`);
      } catch (error) {
        logger.error('Error retrying message:', error);
        
        // Update tab loading state to not loading on error
        if (window.TabManager && window.TabManager.updateTabLoadingState) {
          await window.TabManager.updateTabLoadingState(currentTabId, false);
        }
        
        // Get send button and re-enable
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = false;
      }
    }).catch(error => {
      logger.error('Failed to save chat history after retrying message:', error);
      
      // Re-enable send button on error
      const sendBtn = document.getElementById('sendBtn');
      if (sendBtn) sendBtn.disabled = false;
    });
  }
};

// Keep original function name for backward compatibility
const saveEditedMessage = saveEditedMessageEnhanced;

export {
  getMessageElement,
  editMessage,
  saveEditedMessage,
  saveEditedMessageEnhanced,
  cancelEdit,
  retryMessage
}; 