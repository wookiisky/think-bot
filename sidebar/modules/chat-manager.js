/**
 * chat-manager.js - Chat functionality management
 */

import { i18n } from '../../js/modules/i18n.js';
import { createLogger, hasMarkdownElements, showCopyToast } from './utils.js';
import { editMessage, retryMessage } from '../components/chat-message.js';
import { displayChatHistory as displayChatHistoryFromModule, getChatHistoryFromDOM } from './chat-history.js';

const logger = createLogger('ChatManager');

// Track current LLM request for cancellation
let currentRequestTabId = null;

/**
 * Check if there's an active streaming message in the chat container
 * @param {HTMLElement} chatContainer - Chat container element
 * @returns {boolean} Whether there's an active streaming message
 */
const hasActiveStream = (chatContainer) => {
  if (!chatContainer) return false;
  
  const streamingMessage = chatContainer.querySelector('[data-streaming="true"]');
  const hasStream = !!streamingMessage;
  
  if (hasStream) {
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'unknown';
    logger.debug(`Active stream detected in tab ${currentTabId}`);
  }
  
  return hasStream;
};

/**
 * Cancel current LLM request
 * @param {string} tabId - Tab ID to cancel request for
 */
const cancelLlmRequest = async (tabId) => {
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');
    if (currentUrl && tabId) {
      // Send cancel request to background script
      await chrome.runtime.sendMessage({
        type: 'CANCEL_LLM_REQUEST',
        url: currentUrl,
        tabId: tabId
      });
      
      // Clear loading state
      await chrome.runtime.sendMessage({
        type: 'CLEAR_LOADING_STATE',
        url: currentUrl,
        tabId: tabId
      });
      
      logger.info(`LLM request cancelled for tab ${tabId}`);
      return true;
    }
  } catch (error) {
    logger.error('Error cancelling LLM request:', error);
  }
  return false;
};

/**
 * Update tab loading state when message UI changes
 * @param {string} tabId - Tab ID
 * @param {boolean} isLoading - Loading state
 */
const updateTabLoadingState = async (tabId, isLoading) => {
  try {
    if (window.TabManager && window.TabManager.updateTabLoadingState) {
      await window.TabManager.updateTabLoadingState(tabId, isLoading);
      logger.info(`Updated tab ${tabId} loading state to: ${isLoading}`);
    }
  } catch (error) {
    logger.warn('Error updating tab loading state:', error);
  }
};

/**
 * Append message to chat UI
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Message content
 * @param {string|null} imageBase64 - Optional image data
 * @param {boolean} isStreaming - Whether this is a streaming message
 * @param {number|null} customTimestamp - Optional custom timestamp
 * @returns {HTMLElement} Created message element
 */
const appendMessageToUI = (chatContainer, role, content, imageBase64 = null, isStreaming = false, messageTimestamp = Date.now(), streamId = null) => {
  
  // Create message element
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}-message`;
  messageDiv.id = `message-${messageTimestamp}`;
  
  // If there's an image, save it to element attributes
  if (imageBase64) {
    messageDiv.setAttribute('data-image', imageBase64);
  }
  
  // Set stream ID for streaming messages
  if (isStreaming) {
    // If no streamId provided, generate one from current state
    if (!streamId) {
      const currentUrl = window.StateManager ? window.StateManager.getStateItem('currentUrl') : window.location.href;
      const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
      streamId = `${currentUrl}#${currentTabId}`;
    }
    messageDiv.setAttribute('data-stream-id', streamId);
    logger.debug(`Set stream ID for message: ${streamId}`);
  }
  
  // Create role element - Remove role text display
  const roleDiv = document.createElement('div');
  roleDiv.className = 'message-role';
  // No longer display role identifier
  // roleDiv.textContent = role === 'user' ? 'You' : 'AI';
  
  // Create content element
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  // Save original content for editing and export
  contentDiv.setAttribute('data-raw-content', content);
  
  if (role === 'assistant' && isStreaming) {
    // 旧的助手消息流程已废弃，统一使用分支消息流程
    // 如果仍有调用到此处的旧式流程，仅显示简单 spinner，不添加按钮
    try {
      const loadingContainer = document.createElement('div');
      loadingContainer.className = 'loading-container';
      loadingContainer.innerHTML = '<div class="spinner"></div>';
      contentDiv.appendChild(loadingContainer);
      contentDiv.setAttribute('data-raw-content', '');
      logger.warn('Legacy assistant streaming message created - should use branch flow instead');
    } catch (error) {
      logger.error(`Error creating simple loading container:`, error);
      contentDiv.innerHTML = content; // Fallback to original content
    }
    messageDiv.dataset.streaming = 'true';
  } else {
    // For user messages, preserve line breaks by using textContent instead of markdown parsing
    if (role === 'user') {
      contentDiv.textContent = content;
    } else {
      // For assistant messages, check if content contains markdown
      const containsMarkdown = hasMarkdownElements(content);
      
      if (containsMarkdown) {
        // Use markdown parsing for content with markdown elements
        try {
          contentDiv.innerHTML = window.marked.parse(content);
        } catch (error) {
          logger.error(`Error parsing markdown for assistant message:`, error);
          contentDiv.textContent = content; // Fallback to plain text
          contentDiv.classList.add('no-markdown'); // Add class for preserving line breaks
        }
      } else {
        // Use plain text with preserved line breaks for content without markdown
        contentDiv.textContent = content;
        contentDiv.classList.add('no-markdown'); // Add class for preserving line breaks
      }
    }
  }
  
  messageDiv.appendChild(roleDiv);
  messageDiv.appendChild(contentDiv);
  
  // Operation buttons for user messages
  if (role === 'user' && !isStreaming) {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'message-buttons';
    
    // Edit button
    const editButton = document.createElement('button');
    editButton.className = 'btn-base message-action-btn';
    editButton.innerHTML = '<i class="material-icons">edit</i>';
    editButton.title = i18n.getMessage('sidebar_chatManager_title_editMessage');
    editButton.onclick = () => editMessage(messageDiv, (messageId, newContent) => {
      // Modify DOM
      const contentDiv = messageDiv.querySelector('.message-content');
      contentDiv.setAttribute('data-raw-content', newContent);
      // For user messages, preserve line breaks by using textContent
      if (role === 'user') {
        contentDiv.textContent = newContent;
      } else {
        try {
          contentDiv.innerHTML = window.marked.parse(newContent);
        } catch (error) {
          contentDiv.textContent = newContent;
        }
      }
    });
    
    // Copy text button
    const copyButton = document.createElement('button');
    copyButton.className = 'btn-base message-action-btn';
    copyButton.innerHTML = '<i class="material-icons">content_copy</i>';
    copyButton.title = i18n.getMessage('sidebar_chatManager_title_copyText');
    copyButton.onclick = () => copyMessageText(content);
    
    // Copy markdown button
    const copyMarkdownButton = document.createElement('button');
    copyMarkdownButton.className = 'btn-base message-action-btn';
    copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
    copyMarkdownButton.title = i18n.getMessage('common_copy_markdown');
    copyMarkdownButton.onclick = () => copyMessageMarkdown(content);
    
    // Retry button
    const retryButton = document.createElement('button');
    retryButton.className = 'btn-base message-action-btn';
    retryButton.innerHTML = '<i class="material-icons">refresh</i>';
    retryButton.title = i18n.getMessage('common_retry');
    retryButton.onclick = () => retryMessage(messageDiv, (messageId, messageContent) => {
      // Simply remove all subsequent messages
      const allMessages = Array.from(chatContainer.querySelectorAll('.chat-message'));
      const messageElementIndex = allMessages.findIndex(el => el.id === messageDiv.id);
      
      if (messageElementIndex !== -1) {
        // Remove subsequent messages
        for (let i = allMessages.length - 1; i > messageElementIndex; i--) {
          allMessages[i].remove();
        }
      }
      
      // 统一交由 retryMessage 内部构建分支样式 UI，这里仅清理后续消息并滚动
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
    
    const buttons = [editButton, retryButton, copyButton, copyMarkdownButton];
    
    // Dynamic button layout
    layoutMessageButtons(buttonContainer, buttons, messageDiv);
    messageDiv.appendChild(buttonContainer);
  }
  // Operation buttons for assistant messages (non-streaming)
  else if (role === 'assistant' && !isStreaming) {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'message-buttons';
    
    // Scroll to top button
    const scrollTopButton = document.createElement('button');
    scrollTopButton.className = 'btn-base message-action-btn';
    scrollTopButton.innerHTML = '<i class="material-icons">arrow_upward</i>';
    scrollTopButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToTop');
    scrollTopButton.onclick = () => {
      messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Wait for smooth scrolling to complete, then offset upward by 5px
      setTimeout(() => {
        const chatContainer = messageDiv.closest('.chat-container');
        if (chatContainer) {
          chatContainer.scrollTop -= 20;
        }
      }, 100);
    };

    // Copy text button
    const copyTextButton = document.createElement('button');
    copyTextButton.className = 'btn-base message-action-btn';
    copyTextButton.innerHTML = '<i class="material-icons">content_copy</i>';
    copyTextButton.title = i18n.getMessage('sidebar_chatManager_title_copyText');
    copyTextButton.onclick = () => copyMessageText(content);
    
    // Copy markdown button
    const copyMarkdownButton = document.createElement('button');
    copyMarkdownButton.className = 'btn-base message-action-btn';
    copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
    copyMarkdownButton.title = i18n.getMessage('common_copy_markdown');
    copyMarkdownButton.onclick = () => copyMessageMarkdown(content);

    // Scroll to bottom button
    const scrollBottomButton = document.createElement('button');
    scrollBottomButton.className = 'btn-base message-action-btn';
    scrollBottomButton.innerHTML = '<i class="material-icons">arrow_downward</i>';
    scrollBottomButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToBottom');
    scrollBottomButton.onclick = () => {
      messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
      // Wait for smooth scrolling to complete, then offset downward by 5px
      setTimeout(() => {
        const chatContainer = messageDiv.closest('.chat-container');
        if (chatContainer) {
          chatContainer.scrollTop += 20;
        }
      }, 100);
    };
    
    const buttons = [scrollTopButton, copyTextButton, copyMarkdownButton, scrollBottomButton];
    const buttonGroups = [
      [scrollTopButton],
      [copyTextButton, copyMarkdownButton],
      [scrollBottomButton]
    ];
    
    // Dynamic button layout
    layoutMessageButtons(buttonContainer, buttons, messageDiv, buttonGroups);
    messageDiv.appendChild(buttonContainer);
  }
  
  // Add to chat container
  chatContainer.appendChild(messageDiv);
  
  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  // Display image (if any)
  if (imageBase64 && !isStreaming) {
    const imageContainer = document.createElement('div');
    imageContainer.className = 'message-image-container';
    const image = document.createElement('img');
    image.src = imageBase64;
    image.className = 'message-image';
    image.alt = 'Attached image';
    imageContainer.appendChild(image);
    
    // Add image after content
    contentDiv.appendChild(imageContainer);
  }
  
  return messageDiv;
};

/**
 * Handle streaming chunk response
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {string} chunk - Received text chunk
 * @param {string} tabId - The tab ID for the stream
 * @param {string} url - The URL for the stream
 * @param {string} branchId - Optional branch ID for branch streaming
 */
const handleStreamChunk = (chatContainer, chunk, tabId, url, branchId = null) => {
  let streamId;
  let streamingMessageContainer;
  
  if (branchId) {
    // For branch streaming, look for the specific branch element
    streamingMessageContainer = chatContainer.querySelector(`[data-branch-id="${branchId}"][data-streaming="true"]`);
    logger.debug(`Looking for branch streaming container with branchId: ${branchId}`);
  } else {
    // For regular streaming, use the existing logic
    streamId = `${url}#${tabId}`;
    streamingMessageContainer = chatContainer.querySelector(`[data-stream-id="${streamId}"][data-streaming="true"]`);
    logger.debug(`Looking for regular streaming container with streamId: ${streamId}`);
  }
  
  if (!streamingMessageContainer) {
    logger.debug(`No streaming message container found for ${branchId ? `branch ${branchId}` : `stream ${streamId}`}`);
    return;
  }

  const streamingMessageContentDiv = streamingMessageContainer.querySelector('.message-content');
  if (!streamingMessageContentDiv) {
    logger.error('No message content div found in streaming container');
    return;
  }

  // Remove loading container (spinner and buttons) if it exists
  const loadingContainer = streamingMessageContentDiv.querySelector('.loading-container');
  if (loadingContainer) {
    loadingContainer.remove();
  }
  
  // Append new chunk to buffer
  let currentBuffer = streamingMessageContainer.dataset.markdownBuffer || '';
  currentBuffer += chunk;
  streamingMessageContainer.dataset.markdownBuffer = currentBuffer;
  
  // Save original content
  streamingMessageContentDiv.setAttribute('data-raw-content', currentBuffer);
  
  // Detect if content contains markdown elements to decide how to display
  const containsMarkdown = hasMarkdownElements(currentBuffer);
  
  try {
    if (containsMarkdown) {
      // For markdown content, render it
      streamingMessageContentDiv.innerHTML = marked.parse(currentBuffer);
      streamingMessageContentDiv.classList.remove('no-markdown');
    } else {
      // For plain text, preserve formatting
      streamingMessageContentDiv.innerHTML = currentBuffer.replace(/\n/g, '<br>');
      streamingMessageContentDiv.classList.add('no-markdown');
    }
    
    // Log successful chunk processing
    logger.debug(`Stream chunk processed successfully for ${streamId}, buffer length: ${currentBuffer.length}`);
  } catch (error) {
    logger.error('Error rendering stream chunk:', error);
    // Fallback to plain text display
    streamingMessageContentDiv.innerHTML = currentBuffer.replace(/\n/g, '<br>');
    streamingMessageContentDiv.classList.add('no-markdown');
  }
};

/**
 * Handle streaming transmission end
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {string} fullResponse - Full response text
 * @param {Function} onComplete - Callback function after completion
 * @param {string} finishReason - Optional finish reason from LLM provider
 * @param {boolean} isAbnormalFinish - Whether the finish was abnormal
 * @param {string} tabId - Optional tab ID
 * @param {string} url - Optional URL
 * @param {string} branchId - Optional branch ID for branch streaming
 */
const handleStreamEnd = (chatContainer, fullResponse, onComplete, finishReason = null, isAbnormalFinish = false, tabId = null, url = null, branchId = null) => {
  // Find the streaming message container
  let streamingMessageContainer;
  
  if (branchId) {
    // For branch streaming, look for the specific branch element
    streamingMessageContainer = chatContainer.querySelector(`[data-branch-id="${branchId}"][data-streaming="true"]`);
    logger.debug(`Looking for branch streaming container to end with branchId: ${branchId}`);
  } else if (tabId && url) {
    // For regular streaming, use the existing logic
    const streamId = `${url}#${tabId}`;
    streamingMessageContainer = chatContainer.querySelector(`[data-stream-id="${streamId}"][data-streaming="true"]`);
    logger.debug(`Looking for regular streaming container to end with streamId: ${streamId}`);
  }
  
  // Fallback for cases where streamId is not available or the element is not found by streamId
  if (!streamingMessageContainer) {
    streamingMessageContainer = chatContainer.querySelector('[data-streaming="true"]');
    logger.debug('Using fallback to find any streaming container');
  }
  
  if (!streamingMessageContainer) {
    return;
  }
  
  const contentDiv = streamingMessageContainer.querySelector('.message-content');
  if (!contentDiv) {
    logger.error('No content div found in streaming message container');
    return;
  }

  // Compare fullResponse with buffer to detect potential truncation
  const currentBuffer = streamingMessageContainer.dataset.markdownBuffer || '';
  const bufferLength = currentBuffer.length;
  const responseLength = fullResponse?.length || 0;
  
  if (responseLength !== bufferLength) {
    // Use the longer of the two as the final content
    const finalContent = responseLength > bufferLength ? fullResponse : currentBuffer;
    fullResponse = finalContent;
  }
  
  const containsMarkdown = hasMarkdownElements(fullResponse);
    
    try {
    // Save original content
    contentDiv.setAttribute('data-raw-content', fullResponse);
    
    if (containsMarkdown) {
      contentDiv.classList.remove('no-markdown');
      const parsedContent = window.marked.parse(fullResponse);
      contentDiv.innerHTML = parsedContent;
    } else {
      // Use plain text with preserved line breaks for content without markdown
      contentDiv.classList.add('no-markdown');
      // Use innerHTML with <br> replacement to maintain consistency with streaming chunks
      contentDiv.innerHTML = fullResponse.replace(/\n/g, '<br>');
    }
  } catch (markdownError) {
    logger.error('Error parsing Markdown in stream end:', markdownError);
    contentDiv.classList.add('no-markdown');
    // Use innerHTML with <br> replacement for consistency
    contentDiv.innerHTML = fullResponse.replace(/\n/g, '<br>');
  }

  // Add finish reason warning if it's an abnormal finish
  if (isAbnormalFinish && finishReason) {
    logger.warn(`Abnormal finish detected: ${finishReason}`);
    
    try {
      const warningDiv = document.createElement('div');
      warningDiv.className = 'finish-reason-warning';
      warningDiv.style.cssText = `
        margin-top: 8px;
        padding: 8px 12px;
        background-color: var(--warning-bg, #fff3cd);
        border: 1px solid var(--warning-border, #ffeaa7);
        border-radius: 4px;
        color: var(--warning-text, #856404);
        font-size: 0.9em;
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = '⚠️';
      iconSpan.style.fontSize = '14px';
      
      const textSpan = document.createElement('span');
      let warningText = '';
      
      switch (finishReason) {
        case 'MAX_TOKENS':
        case 'length':
          warningText = i18n.getMessage('sidebar_chatManager_finishReason_maxTokens');
          break;
        case 'SAFETY':
        case 'content_filter':
          warningText = i18n.getMessage('sidebar_chatManager_finishReason_safety');
          break;
        case 'RECITATION':
          warningText = i18n.getMessage('sidebar_chatManager_finishReason_recitation');
          break;
        case 'OTHER':
          warningText = i18n.getMessage('sidebar_chatManager_finishReason_other');
          break;
        default:
          warningText = i18n.getMessage('sidebar_chatManager_finishReason_default', { reason: finishReason });
      }
      
      textSpan.textContent = warningText;
      
      warningDiv.appendChild(iconSpan);
      warningDiv.appendChild(textSpan);
      
      // Insert warning after content but before buttons
      contentDiv.appendChild(warningDiv);
    } catch (warningError) {
      logger.error('Error adding finish reason warning:', warningError);
    }
  }
  // Clean up streaming state using the utility function
  cleanupStreamingState(streamingMessageContainer);
  
  // Update tab loading state when streaming ends
  const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
  currentRequestTabId = null; // Clear current request tracking
  updateTabLoadingState(currentTabId, false).catch(error => 
    logger.warn('Error updating tab loading state:', error)
  );
  
  // Add operation buttons
  try {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'message-buttons';

    // Determine if this is a branch element
    const isBranch = streamingMessageContainer.classList.contains('message-branch');

    // Scroll to top button
    const scrollTopButton = document.createElement('button');
    scrollTopButton.className = 'btn-base message-action-btn';
    scrollTopButton.innerHTML = '<i class="material-icons">arrow_upward</i>';
    scrollTopButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToTop');
    scrollTopButton.onclick = () => {
      streamingMessageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Wait for smooth scrolling to complete, then offset upward by 5px
      setTimeout(() => {
        const chatContainer = streamingMessageContainer.closest('.chat-container');
        if (chatContainer) {
          chatContainer.scrollTop -= 5;
        }
      }, 300);
    };

    // Scroll to bottom button
    const scrollBottomButton = document.createElement('button');
    scrollBottomButton.className = 'btn-base message-action-btn';
    scrollBottomButton.innerHTML = '<i class="material-icons">arrow_downward</i>';
    scrollBottomButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToBottom');
    scrollBottomButton.onclick = () => {
      streamingMessageContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
      // Wait for smooth scrolling to complete, then offset downward by 5px
      setTimeout(() => {
        const chatContainer = streamingMessageContainer.closest('.chat-container');
        if (chatContainer) {
          chatContainer.scrollTop += 5;
        }
      }, 300);
    };

    // Copy text button
    const copyTextButton = document.createElement('button');
    copyTextButton.className = 'btn-base message-action-btn';
    copyTextButton.innerHTML = '<i class="material-icons">content_copy</i>';
    copyTextButton.title = i18n.getMessage('sidebar_chatManager_title_copyText');
    copyTextButton.onclick = () => copyMessageText(streamingMessageContainer);

    // Copy markdown button
    const copyMarkdownButton = document.createElement('button');
    copyMarkdownButton.className = 'btn-base message-action-btn';
    copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
    copyMarkdownButton.title = i18n.getMessage('sidebar_chatManager_title_copyAsMarkdown');
    copyMarkdownButton.onclick = () => copyMessageMarkdown(streamingMessageContainer);

    if (isBranch) {
      // Remove any top-right actions from loading phase
      const existingActions = streamingMessageContainer.querySelector('.branch-actions');
      if (existingActions) existingActions.remove();

      // Create branch and delete buttons using delegated handlers
      const branchButton = document.createElement('button');
      branchButton.className = 'btn-base message-action-btn branch-btn';
      branchButton.innerHTML = '<i class="material-icons">call_split</i>';
      branchButton.title = i18n.getMessage('branch_add');
      branchButton.setAttribute('data-action', 'branch');
      branchButton.setAttribute('data-branch-id', streamingMessageContainer.getAttribute('data-branch-id'));

      const deleteButton = document.createElement('button');
      deleteButton.className = 'btn-base message-action-btn delete-btn';
      deleteButton.innerHTML = '<i class="material-icons">delete</i>';
      deleteButton.title = i18n.getMessage('branch_delete');
      deleteButton.setAttribute('data-action', 'delete');
      deleteButton.setAttribute('data-branch-id', streamingMessageContainer.getAttribute('data-branch-id'));

      // Order: top, bottom, copy text, copy MD, create branch, delete branch
      const buttons = [scrollTopButton, scrollBottomButton, copyTextButton, copyMarkdownButton, branchButton, deleteButton];
      layoutMessageButtons(buttonContainer, buttons, streamingMessageContainer);
      streamingMessageContainer.appendChild(buttonContainer);
    } else {
      // Assistant message (non-branch) default set
      const buttons = [scrollTopButton, copyTextButton, copyMarkdownButton, scrollBottomButton];
      const buttonGroups = [
        [scrollTopButton],
        [copyTextButton, copyMarkdownButton],
        [scrollBottomButton]
      ];
      layoutMessageButtons(buttonContainer, buttons, streamingMessageContainer, buttonGroups);
      streamingMessageContainer.appendChild(buttonContainer);
    }

    // Apply dynamic layout
    fixExistingMessageLayouts(chatContainer);
  } catch (buttonError) {
    logger.error('Error adding copy/branch buttons:', buttonError);
  }

  // Call completion callback
  if (typeof onComplete === 'function') {
    try {
      onComplete(fullResponse);
    } catch (callbackError) {
      logger.error('Error in completion callback:', callbackError);
    }
  }
};

/**
 * Clean up streaming message state
 * @param {HTMLElement} messageElement - Message element to clean up
 */
const cleanupStreamingState = (messageElement) => {
  if (!messageElement) return;
  
  // Remove streaming attributes
  messageElement.removeAttribute('data-streaming');
  messageElement.removeAttribute('data-markdown-buffer');
  
  // Clean up content element
  const contentDiv = messageElement.querySelector('.message-content');
  if (contentDiv) {
    contentDiv.classList.remove('no-markdown');
    // Don't remove data-raw-content as it's needed for editing
  }
};

/**
 * Handle LLM error
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {string|Error|Object} error - Error information
 * @param {HTMLElement} streamingMessageElement - Optional streaming message element
 * @param {Function} onComplete - Callback function after completion
 * @param {Object} errorDetails - Optional detailed error information
 */
const handleLlmError = (chatContainer, error, streamingMessageElement = null, onComplete = null, errorDetails = null, tabId = null, url = null) => {
  // Update tab loading state when error occurs
  const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
  updateTabLoadingState(currentTabId, false).catch(error => 
    logger.warn('Error updating tab loading state:', error)
  );
  
  let specificStreamingElement = streamingMessageElement;
  if (!specificStreamingElement && tabId && url) {
    const streamId = `${url}#${tabId}`;
    specificStreamingElement = chatContainer.querySelector(`[data-stream-id="${streamId}"][data-streaming="true"]`);
  }

  // Import error handler and process error
  import('./error-handler.js').then(({ default: errorHandler, ERROR_TYPES }) => {
    // Create enhanced error object with rawResponse from errorDetails
    let enhancedError = error;
    if (errorDetails) {
      // Always preserve raw response and error details if available
      enhancedError = {
        message: errorDetails.message || (typeof error === 'string' ? error : error.message || 'Unknown error'),
        name: 'EnhancedError',
        rawResponse: errorDetails.rawResponse,
        errorData: errorDetails.errorData,
        status: errorDetails.status,
        timestamp: errorDetails.timestamp || Date.now(),
        // Include original error data if it was an object
        ...(typeof error === 'object' && error !== null ? error : {})
      };
      console.log('[ChatManager] Created enhanced error with errorDetails:', enhancedError);
    } else {
      console.log('[ChatManager] No errorDetails, using original error:', error);
    }
    
    // Handle error using unified error handler
    errorHandler.handleError(enhancedError, ERROR_TYPES.LLM_ERROR, {
      chatContainer,
      streamingMessageElement: specificStreamingElement,
      onComplete
    });
  }).catch(importError => {
    logger.error('Failed to import error handler, using fallback:', importError);
    logger.error('Import error details:', {
      name: importError.name,
      message: importError.message,
      stack: importError.stack
    });
    // Fallback to basic error display
    fallbackErrorDisplay(chatContainer, error, specificStreamingElement, onComplete);
  });
};

/**
 * Copy message text
 * @param {string|HTMLElement} content - Message content or message element
 */
const copyMessageText = (content) => {
  let textToCopy = '';

  if (typeof content === 'string') {
    // If content is a string, parse markdown and extract text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = window.marked.parse(content);
    textToCopy = tempDiv.textContent || tempDiv.innerText || '';
  } else if (content && content.nodeType === Node.ELEMENT_NODE) {
    // If content is a DOM element, extract text from it
    const contentDiv = content.querySelector('.message-content');
    if (contentDiv) {
      // Try to get raw content first
      const rawContent = contentDiv.getAttribute('data-raw-content');
      if (rawContent) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = window.marked.parse(rawContent);
        textToCopy = tempDiv.textContent || tempDiv.innerText || '';
      } else {
        // Fallback to element text content
        textToCopy = contentDiv.textContent || contentDiv.innerText || '';
      }
    } else {
      textToCopy = content.textContent || content.innerText || '';
    }
  } else {
    logger.error('Invalid content type for copying:', typeof content);
    return;
  }
 
  navigator.clipboard.writeText(textToCopy)
    .then(() => showCopyToast(i18n.getMessage('sidebar_chatManager_toast_textCopied')))
    .catch(err => logger.error(i18n.getMessage('sidebar_chatManager_log_failedToCopyText'), err));
};

/**
 * Copy message Markdown
 * @param {string|HTMLElement} content - Message content or message element
 */
const copyMessageMarkdown = (content) => {
  let markdownToCopy = '';

  if (typeof content === 'string') {
    // If content is a string, use it directly
    markdownToCopy = content;
  } else if (content && content.nodeType === Node.ELEMENT_NODE) {
    // If content is a DOM element, extract raw content from it
    const contentDiv = content.querySelector('.message-content');
    if (contentDiv) {
      markdownToCopy = contentDiv.getAttribute('data-raw-content') || contentDiv.textContent || contentDiv.innerText || '';
    } else {
      markdownToCopy = content.textContent || content.innerText || '';
    }
  } else {
    logger.error('Invalid content type for copying:', typeof content);
    return;
  }
 
  navigator.clipboard.writeText(markdownToCopy)
    .then(() => showCopyToast(i18n.getMessage('sidebar_chatManager_toast_markdownCopied')))
    .catch(err => {
      logger.error('Error copying markdown to clipboard:', err);
      showCopyToast(i18n.getMessage('sidebar_chatManager_toast_errorCopyingMarkdown'));
    });
};

/**
 * Display chat history in chat UI
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {Array} history - Chat history array
 */
const displayChatHistory = (chatContainer, history) => {
  displayChatHistoryFromModule(chatContainer, history, appendMessageToUI);
};

/**
 * Export conversation as Markdown
 * @param {string} currentUrl - Current page URL
 * @param {string} extractedContent - Extracted content
 * @param {Array} chatHistory - Chat history
 */
const exportConversation = async (urlWithPossibleFragment, extractedContent, chatHistory) => {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
    logger.warn('Invalid or empty chat history provided for export');
    return;
  }

  let quickInputTabName = 'chat';
  if (window.TabManager) {
    const activeTab = window.TabManager.getActiveTab();
    if (activeTab && activeTab.displayText) {
      quickInputTabName = activeTab.displayText;
    }
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_CONVERSATION',
      urlWithPossibleFragment,
      chatHistory,
      quickInputTabName
    });

    if (response && response.success) {
      const { filename, markdownContent } = response;
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(downloadUrl);
      logger.info(`Successfully exported conversation to ${filename}`);
    } else {
      throw new Error(response?.error || 'Unknown error during export');
    }
  } catch (error) {
    logger.error('Failed to export conversation:', error);
  }
};

/**
 * Dynamic button layout, choose best layout based on message height and button count
 * @param {HTMLElement} container - Button container
 * @param {HTMLElement[]} buttons - Button array
 * @param {HTMLElement} messageElement - Message element, used to get height
 */
const layoutMessageButtons = (container, buttons, messageElement = null, buttonGroups = null) => {
  const buttonCount = buttons.length;
  
  function applyLayout() {
    // Clear container
    container.innerHTML = '';
    
    let messageHeight = 0;
    let layoutType = '';
    
    if (messageElement) {
      messageHeight = messageElement.offsetHeight;
    }
    
    // Decide layout based on message height and button count
    if (buttonGroups && messageElement && messageHeight > 100) {
      container.className = 'message-buttons layout-vertical-2-groups';
      layoutType = 'vertical-2-groups';
      buttonGroups.forEach(group => {
        const groupContainer = document.createElement('div');
        groupContainer.className = 'button-group';
        group.forEach(button => groupContainer.appendChild(button));
        container.appendChild(groupContainer);
      });
    } else if (messageElement && messageHeight > 75) {
      // Use single column layout if message height is sufficient
      container.className = 'message-buttons layout-column';
      layoutType = 'column';
      buttons.forEach(button => container.appendChild(button));
    } else if (messageElement && messageHeight > 35) {
      if (buttonCount <= 2) {
        container.className = 'message-buttons layout-column';
      layoutType = 'column';
      buttons.forEach(button => container.appendChild(button));
    }else{
      container.className = 'message-buttons layout-2rows';
      layoutType = '2rows';
      
      const buttonsPerRow = Math.ceil(buttonCount / 2);
      for (let i = 0; i < buttonCount; i += buttonsPerRow) {
        const row = document.createElement('div');
        row.className = 'button-row';
        
        for (let j = i; j < Math.min(i + buttonsPerRow, buttonCount); j++) {
          row.appendChild(buttons[j]);
        }
        
        container.appendChild(row);
      }
    }

    } else if (buttonCount <= 4) {
      // Single row layout
      container.className = 'message-buttons layout-row';
      layoutType = 'row';
      buttons.forEach(button => container.appendChild(button));
    } else {
      // 5 or more buttons: Single column layout
      container.className = 'message-buttons layout-column';
      layoutType = 'column';
      buttons.forEach(button => container.appendChild(button));
    }
    
    // Add corresponding layout class name to message container for CSS adjustment message content width
    if (messageElement && layoutType) {
      // Remove previous layout class name
      messageElement.classList.remove('buttons-layout-row', 'buttons-layout-2rows', 'buttons-layout-column');
      // Add new layout class name
      messageElement.classList.add(`buttons-layout-${layoutType}`);
      logger.debug(`Applied layout class: buttons-layout-${layoutType} to message ${messageElement.id}`);
    }
  }
  
  // First apply default layout based on button count
  applyLayout();
  
  // If message element is passed, re-check height and adjust layout after DOM rendering is complete
  if (messageElement) {
    // Use requestAnimationFrame to ensure DOM has finished rendering
    requestAnimationFrame(() => {
      applyLayout();
    });
  }
};

/**
 * Check and fix existing message layout class names
 * @param {HTMLElement} chatContainer - Chat container
 */
const fixExistingMessageLayouts = (chatContainer) => {
  if (!chatContainer) return;
  
  const messages = chatContainer.querySelectorAll('.chat-message');
  messages.forEach(messageElement => {
    const buttonContainer = messageElement.querySelector('.message-buttons');
    if (buttonContainer) {
      const buttons = Array.from(buttonContainer.querySelectorAll('.message-action-btn'));
      if (buttons.length > 0) {
        // Re-apply layout
        layoutMessageButtons(buttonContainer, buttons, messageElement);
        logger.debug(`Fixed layout for message ${messageElement.id}`);
      }
    }
  });
};

/**
 * Convert branch history format to standard format for LLM processing
 * @param {Array} branchHistory - History with branch format
 * @returns {Array} Standard history format
 */
const convertBranchHistoryToStandard = (branchHistory) => {
  const standardHistory = [];
  
  branchHistory.forEach(message => {
    if (message.role === 'user') {
      // User messages remain unchanged
      standardHistory.push(message);
    } else if (message.role === 'assistant') {
      // For assistant messages, use the first branch as the main conversation flow
      if (message.responses && Array.isArray(message.responses) && message.responses.length > 0) {
        // Find the first completed branch
        const completedBranch = message.responses.find(branch => 
          branch.status === 'done' && branch.content
        );
        
        if (completedBranch) {
          // Convert to standard assistant message format
          const standardMessage = {
            role: 'assistant',
            content: completedBranch.content,
            timestamp: message.timestamp || completedBranch.updatedAt,
            model: completedBranch.model
          };
          
          standardHistory.push(standardMessage);
        }
        // If no completed branch found, skip this assistant message
      } else {
        // Legacy format - already in standard format
        standardHistory.push(message);
      }
    }
  });
  
  logger.info(`Converted ${branchHistory.length} messages to ${standardHistory.length} standard messages for LLM`);
  return standardHistory;
};

/**
 * Send user message to LLM
 * @param {string} userText - User input text
 * @param {string} imageBase64 - Optional image data
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {HTMLElement} userInput - User input element
 * @param {HTMLElement} sendBtn - Send button element
 * @param {Object} modelSelector - Model selector instance
 * @param {Function} onMessageSaved - Callback after message is saved
 * @returns {Promise<void>}
 */
const sendUserMessage = async (userText, imageBase64, chatContainer, userInput, sendBtn, modelSelector, onMessageSaved, streamId = null) => {
  if (!userText && !imageBase64) {
    return;
  }

  // Clear input and disable send button
  userInput.value = '';
  sendBtn.disabled = true;
  
  // Create message timestamp for DOM and message object
  const messageTimestamp = Date.now();
  
  // Optimistically add user message to UI, using same timestamp
  appendMessageToUI(chatContainer, 'user', userText, imageBase64, false, messageTimestamp);
  
  // Get dialog history from DOM
  const rawChatHistory = window.ChatHistory.getChatHistoryFromDOM(chatContainer);
  
  // Convert branch format to standard format for LLM processing
  const chatHistory = convertBranchHistoryToStandard(rawChatHistory);
  
  // Immediately save current dialog history to storage for current tab
  // Save the raw branch format to preserve all branch data
  try {
    if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
      await window.TabManager.saveCurrentTabChatHistory(rawChatHistory);
    } else {
      // Fallback to original method
      await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT_HISTORY',
        url: window.StateManager.getStateItem('currentUrl'),
        chatHistory: rawChatHistory
      });
    }
    if (onMessageSaved) onMessageSaved();
  } catch (error) {
    logger.error('Failed to save chat history after adding user message:', error);
  }
  
  // Prepare payload for service worker
  let systemPromptTemplateForPayload = '';
  let pageContentForPayload = window.StateManager.getStateItem('extractedContent'); // Always pass extractedContent
  const config = await window.StateManager.getConfig();

  // Default system prompt from config (usually contains {CONTENT})
  // Support both old and new config formats
  const basicConfig = config.basic || config;
  systemPromptTemplateForPayload = basicConfig.systemPrompt;

  if (window.StateManager.getStateItem('includePageContent')) {
    systemPromptTemplateForPayload = systemPromptTemplateForPayload + '\n\nPage Content:\n' + pageContentForPayload; 
  }
  
  // 统一使用分支消息样式：创建分支容器并显示 loading
  // 本地生成分支ID（与 generateBranchId 一致的策略，避免提升函数声明顺序）
  const localBranchId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? `br-${crypto.randomUUID()}`
    : `br-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let assistantBranchElement = null;
  try {
    // 选取当前模型用于标签展示
    const selectedModelForLabel = modelSelector ? modelSelector.getSelectedModel() : null;

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
    branchDiv.setAttribute('data-branch-id', localBranchId);
    branchDiv.setAttribute('data-streaming', 'true');
    if (selectedModelForLabel && selectedModelForLabel.name) {
      branchDiv.setAttribute('data-model', selectedModelForLabel.name);
    } else {
      branchDiv.setAttribute('data-model', 'unknown');
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.setAttribute('data-raw-content', '');

    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'loading-container';
    loadingContainer.innerHTML = '<div class="spinner"></div>';
    contentDiv.appendChild(loadingContainer);

    // 模型标签添加到分支顶部（仅显示模型名）
    const modelLabel = document.createElement('div');
    modelLabel.className = 'branch-model-label';
    modelLabel.textContent = (selectedModelForLabel && selectedModelForLabel.name) || 'unknown';
    branchDiv.appendChild(modelLabel);

    branchDiv.appendChild(contentDiv);

    // 顶部右侧仅保留"停止并删除"按钮
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'branch-actions';
    const stopDeleteButton = document.createElement('button');
    stopDeleteButton.className = 'btn-base message-action-btn delete-btn';
    stopDeleteButton.innerHTML = '<i class="material-icons">stop</i>';
    stopDeleteButton.title = i18n.getMessage('branch_stopAndDelete');
    stopDeleteButton.setAttribute('data-action', 'stop-delete');
    stopDeleteButton.setAttribute('data-branch-id', localBranchId);
    actionsDiv.appendChild(stopDeleteButton);
    branchDiv.appendChild(actionsDiv);

    branchesDiv.appendChild(branchDiv);
    branchContainer.appendChild(branchesDiv);
    chatContainer.appendChild(branchContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    assistantBranchElement = branchDiv;
  } catch (uiError) {
    logger.error('Error creating branch-style loading UI for user message, falling back:', uiError);
    // 最小回退：创建简单的加载消息，不使用遗留的流式消息
    assistantBranchElement = appendMessageToUI(
      chatContainer,
      'assistant',
      '<div class="loading-container"><div class="spinner"></div></div>',
      null,
      false, // Use false to avoid legacy warning
      Date.now()
    );
    // Manually add streaming attribute to maintain compatibility
    if (assistantBranchElement) {
      assistantBranchElement.setAttribute('data-streaming', 'true');
    }
  }
  
  // If image was attached, send and remove
  if (imageBase64) {
    const imageHandler = window.ImageHandler;
    if (imageHandler && imageHandler.removeAttachedImage) {
      const imagePreviewContainer = document.getElementById('imagePreviewContainer');
      const imagePreview = document.getElementById('imagePreview');
      imageHandler.removeAttachedImage(imagePreviewContainer, imagePreview);
      logger.info('Image cleared after sending message');
    } else {
      logger.warn('ImageHandler not available for image cleanup');
    }
  }

  try {
    // Get selected model
    const selectedModel = modelSelector ? modelSelector.getSelectedModel() : null;
    
    // Get current tab ID for loading state tracking
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    
    // Start stream monitoring session if available
    if (typeof window.startStreamingSession === 'function') {
      const streamInfo = {
        tabId: currentTabId,
        url: window.StateManager.getStateItem('currentUrl'),
        model: selectedModel?.name || 'default',
        messageCount: chatHistory.length,
        hasImage: !!imageBase64
      };
      
      const streamId = window.startStreamingSession(streamInfo);
    }
    
    // Set current request tracking
    if (typeof window.setCurrentRequestTabId === 'function') {
      window.setCurrentRequestTabId(currentTabId);
    } else {
      // Fallback for older versions
      currentRequestTabId = currentTabId;
    }
    
    // Register branch start (event-driven) to avoid polling
    try {
      if (window.TabManager && window.TabManager.registerBranchStart) {
        await window.TabManager.registerBranchStart(currentTabId, localBranchId);
      }
    } catch (e) {
      logger.debug('registerBranchStart failed (non-blocking):', e.message);
    }

    // Send message to background script for LLM processing
    await window.MessageHandler.sendLlmMessage({
      messages: chatHistory,
      systemPromptTemplate: systemPromptTemplateForPayload,
      extractedPageContent: pageContentForPayload,
      imageBase64: imageBase64,
      currentUrl: window.StateManager.getStateItem('currentUrl'),
      extractionMethod: window.StateManager.getStateItem('currentExtractionMethod'),
      selectedModel: selectedModel,
      tabId: currentTabId,
      branchId: localBranchId,
      model: selectedModel || undefined
    });
    
  } catch (error) {
    logger.error('Error sending message to LLM:', error);
    
    // If we started a stream session, mark it as failed
    if (typeof window.getCurrentStreamStats === 'function') {
      const streamStats = window.getCurrentStreamStats();
      if (streamStats && typeof streamMonitor !== 'undefined') {
        streamMonitor.failStream(streamStats.id, error);
      }
    }
    
    handleLlmError(
      chatContainer,
      i18n.getMessage('sidebar_chatManager_error_failedToSend'),
      assistantBranchElement,
      () => {
        // If error occurs, re-enable send button
        sendBtn.disabled = false;
      }
    );
  }
};

/**
 * Handle quick input click
 * @param {string} displayText - Display text
 * @param {string} sendTextTemplate - Send text template
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {HTMLElement} sendBtn - Send button element
 * @param {Object} modelSelector - Model selector instance
 * @param {Function} onMessageSaved - Callback after message is saved
 * @returns {Promise<void>}
 */
const handleQuickInputClick = async (displayText, sendTextTemplate, chatContainer, sendBtn, modelSelector, onMessageSaved, streamId = null) => {
  // Show loading status
  sendBtn.disabled = true;
  
  // Create message timestamp for DOM and message object
  const messageTimestamp = Date.now();
  
  // Process sendTextTemplate to get actual content to send
  let actualMessageContent = sendTextTemplate;
  const currentState = window.StateManager.getState();
  
  // Replace {CONTENT} placeholder if present
  if (sendTextTemplate.includes('{CONTENT}')) {
    if (currentState.includePageContent && currentState.extractedContent) {
      actualMessageContent = sendTextTemplate.replace('{CONTENT}', currentState.extractedContent);
    } else {
      actualMessageContent = sendTextTemplate.replace('{CONTENT}', '');
    }
  }
  
  // Add user message to UI - show displayText but store actualMessageContent as raw content
  const messageElement = appendMessageToUI(chatContainer, 'user', displayText, null, false, messageTimestamp);
  
  // Store the actual send content in data-raw-content for editing purposes
  const contentElement = messageElement.querySelector('.message-content');
  if (contentElement) {
    contentElement.setAttribute('data-raw-content', actualMessageContent);
    // Mark this as a quick input message and store display text
    contentElement.setAttribute('data-quick-input', 'true');
    contentElement.setAttribute('data-display-text', displayText);
  }
  
  // Show assistant response loading indicator as BRANCH-STYLE container
  // Generate streamId if not provided
  if (!streamId) {
    const currentUrl = window.StateManager ? window.StateManager.getStateItem('currentUrl') : window.location.href;
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    streamId = `${currentUrl}#${currentTabId}`;
  }

  // Build branch-style assistant container immediately以统一分支行为
  let assistantLoadingMessage;
  let quickBranchId = null;
  try {
    // Determine selected model for label (safe to call early)
    const selectedModelForLabel = modelSelector ? modelSelector.getSelectedModel() : null;

    // Create branch container message (unified branch UI)
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
    branchDiv.setAttribute('data-streaming', 'true');
    // 生成分支ID
    quickBranchId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? `br-${crypto.randomUUID()}`
      : `br-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    branchDiv.setAttribute('data-branch-id', quickBranchId);
    if (selectedModelForLabel && selectedModelForLabel.name) {
      branchDiv.setAttribute('data-model', selectedModelForLabel.name);
    } else {
      branchDiv.setAttribute('data-model', 'unknown');
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.setAttribute('data-raw-content', '');

    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'loading-container';
    loadingContainer.innerHTML = '<div class="spinner"></div>';
    contentDiv.appendChild(loadingContainer);

    // Model label at the top of branch (name only)
    const modelLabel = document.createElement('div');
    modelLabel.className = 'branch-model-label';
    modelLabel.textContent = (selectedModelForLabel && selectedModelForLabel.name) || 'unknown';
    branchDiv.appendChild(modelLabel);

    branchDiv.appendChild(contentDiv);

    // Top-right actions: only stop-and-delete for loading
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'branch-actions';
    const stopDeleteButton = document.createElement('button');
    stopDeleteButton.className = 'branch-action-btn delete-btn';
    stopDeleteButton.innerHTML = '<i class="material-icons">stop</i>';
    stopDeleteButton.title = i18n.getMessage('branch_stopAndDelete');
    stopDeleteButton.setAttribute('data-action', 'stop-delete');
    stopDeleteButton.setAttribute('data-branch-id', quickBranchId);
    // 点击逻辑改为委托到 chat-history.js 的分支事件，避免重复绑定与双触发
    actionsDiv.appendChild(stopDeleteButton);
    branchDiv.appendChild(actionsDiv);

    branchesDiv.appendChild(branchDiv);
    branchContainer.appendChild(branchesDiv);
    chatContainer.appendChild(branchContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    assistantLoadingMessage = branchDiv; // Streaming element reference

    // Ensure tab enters loading state immediately for quick input branch
    try {
      const currentTabIdForLoading = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
      await updateTabLoadingState(currentTabIdForLoading, true);
      logger.info(`Tab ${currentTabIdForLoading} set to loading after quick input UI creation`);
    } catch (e) {
      logger.warn('Failed to set loading state after quick input UI creation:', e);
    }
  } catch (uiError) {
    logger.error('Error creating branch-style loading UI for quick input, falling back:', uiError);
    assistantLoadingMessage = appendMessageToUI(
      chatContainer,
      'assistant',
      '<div class="loading-container"><div class="spinner"></div></div>',
      null,
      false, // Use false to avoid legacy warning
      Date.now()
    );
    // Manually add streaming attribute to maintain compatibility
    if (assistantLoadingMessage) {
      assistantLoadingMessage.setAttribute('data-streaming', 'true');
    }
  }
  
  // Get dialog history from DOM (raw with branches)
  const rawChatHistory = window.ChatHistory.getChatHistoryFromDOM(chatContainer);
  
  // Immediately save current dialog history to storage for current tab
  try {
    if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
      await window.TabManager.saveCurrentTabChatHistory(rawChatHistory);
      logger.info('Tab chat history saved after adding quick input message');
    } else {
      // Fallback to original method
      await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT_HISTORY',
        url: window.StateManager.getStateItem('currentUrl'),
        chatHistory: rawChatHistory
      });
      logger.info('Chat history saved after adding quick input message');
    }
    if (onMessageSaved) onMessageSaved();
  } catch (error) {
    logger.error('Failed to save chat history after adding quick input message:', error);
  }
  
  // Prepare data
  const state = currentState;
  // Convert to standard format for LLM (exclude streaming/loading branches)
  const messagesForPayload = convertBranchHistoryToStandard(rawChatHistory);
  let systemPromptTemplateForPayload = '';
  let pageContentForPayload = state.extractedContent;
  const config = await window.StateManager.getConfig();

  // Get system prompt
  // Support both old and new config formats
  const basicConfig = config.basic || config;
  systemPromptTemplateForPayload = basicConfig.systemPrompt;

  if (state.includePageContent) {
    logger.info('Including page content in quick input message');
    systemPromptTemplateForPayload = systemPromptTemplateForPayload + '\n\nPage Content:\n' + pageContentForPayload;
  } else {
    logger.info('Not including page content in quick input message');
  }

  try {
    // Get selected model
    const selectedModel = modelSelector ? modelSelector.getSelectedModel() : null;
    
    // Get current tab ID for loading state tracking
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    
    // Register branch start (event-driven) to avoid polling
    try {
      if (window.TabManager && window.TabManager.registerBranchStart) {
        await window.TabManager.registerBranchStart(currentTabId, quickBranchId);
      }
    } catch (e) {
      logger.debug('registerBranchStart failed (non-blocking):', e.message);
    }

    // Send message to background script for LLM processing (default model)
    await window.MessageHandler.sendLlmMessage({
      messages: messagesForPayload,
      systemPromptTemplate: systemPromptTemplateForPayload,
      extractedPageContent: pageContentForPayload,
      currentUrl: state.currentUrl,
      extractionMethod: state.currentExtractionMethod,
      selectedModel: selectedModel,
      tabId: currentTabId,
      branchId: quickBranchId || undefined,
      model: selectedModel || undefined
    });

    // Get tab-specific branch models and merge with general branch models
    const tabSpecificBranchModelIds = await getTabSpecificBranchModels(currentTabId, config);
    
    // Auto-create branch models for quick input (reuse branch functionality)
    const branchModelIds = basicConfig.branchModelIds || [];
    const allBranchModelIds = [...new Set([...branchModelIds, ...tabSpecificBranchModelIds])]; // Merge and deduplicate
    
    if (allBranchModelIds.length > 0) {
      logger.info(`Creating auto-branches for quick input with models: ${allBranchModelIds.join(', ')} (general: ${branchModelIds.join(', ')}, tab-specific: ${tabSpecificBranchModelIds.join(', ')})`);
      
      // Find the current assistant message container (branch container)
      const branchContainer = assistantLoadingMessage.closest('.branch-container');
      const branchesContainer = branchContainer.querySelector('.message-branches');
      
      // Build context for branch creation (same as buildBranchContext but inline)
      const context = buildBranchContext(branchContainer);
      
      // Get all available models configuration
      const llmConfig = config.llm_models || config.llm;
      const availableModels = llmConfig?.models || [];
      
      // Create branches for each configured branch model
      for (const modelId of allBranchModelIds) {
        try {
          // Find model configuration
          const branchModel = availableModels.find(m => m.id === modelId && m.enabled);
          if (!branchModel) {
            logger.warn(`Branch model ${modelId} not found or disabled, skipping`);
            continue;
          }
          
          // Generate branch ID
          const branchBranchId = generateBranchId();
          
          // Create UI element for branch
          const branchElement = createBranchElement(branchBranchId, branchModel, 'loading');
          branchesContainer.appendChild(branchElement);
          
          // Update branch container style after adding branch
          updateBranchContainerStyle(branchesContainer);
          
          // Register branch start for loading state tracking
          try {
            if (window.TabManager && window.TabManager.registerBranchStart) {
              await window.TabManager.registerBranchStart(currentTabId, branchBranchId);
            }
          } catch (e) {
            logger.debug('registerBranchStart failed for branch model (non-blocking):', e.message);
          }
          
          // Send LLM request for branch model
          await sendBranchLlmRequest(context, branchModel, branchBranchId);
          
          logger.info(`Auto-created branch for model ${branchModel.name} (${branchModel.id})`);
        } catch (branchError) {
          logger.error(`Error creating auto-branch for model ${modelId}:`, branchError);
        }
      }
      
      // Update chat history after creating all branches
      try {
        const updatedChatHistory = getChatHistoryFromDOM(chatContainer);
        if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
          await window.TabManager.saveCurrentTabChatHistory(updatedChatHistory);
        }
        logger.info('Updated chat history after creating auto-branches');
      } catch (historyError) {
        logger.warn('Failed to update chat history after creating auto-branches:', historyError);
      }
    }
  } catch (error) {
    logger.error('Error sending quick message:', error);
    // Pass loading message element to handleLlmError for updating it in case of failure
    handleLlmError(
      chatContainer,
      i18n.getMessage('sidebar_chatManager_error_failedToSendLlm'),
      assistantLoadingMessage,
      () => {
        sendBtn.disabled = false;
      }
    ); 
  }
};

/**
 * Clear conversation and context
 * @param {HTMLElement} chatContainer - Chat container element
 * @returns {Promise<void>}
 */
const clearConversationAndContext = async (chatContainer) => {
  // Clear UI
  window.ChatHistory.clearChatHistory(chatContainer);

  // Get current tab ID before clearing
  const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';

  // Clear from storage for current tab
  if (window.TabManager && window.TabManager.clearTabChatHistory) {
    await window.TabManager.clearTabChatHistory();
  } else {
    // Fallback to original method if TabManager not available
    await window.StateManager.clearUrlData(false, true);
  }

  // Reset initialization state only for current tab to allow it to trigger quick input again
  if (window.TabManager && window.TabManager.resetTabInitializationState) {
    window.TabManager.resetTabInitializationState(currentTabId);
    logger.info(`Reset initialization state for current tab: ${currentTabId}`);
  }

  // Clear loading state cache for current tab
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');

    if (currentUrl && currentTabId) {
      await chrome.runtime.sendMessage({
        type: 'CLEAR_LOADING_STATE',
        url: currentUrl,
        tabId: currentTabId
      });
      logger.info('Loading state cleared for current tab');
    }
  } catch (error) {
    logger.error('Error clearing loading state:', error);
  }

  // Force reset TabManager loading state for current tab
  try {
    if (window.TabManager && window.TabManager.updateTabLoadingState) {
      await window.TabManager.updateTabLoadingState(currentTabId, false);
      logger.info('TabManager loading state reset for current tab');
    }
  } catch (error) {
    logger.error('Error resetting TabManager loading state:', error);
  }

  logger.info('Conversation cleared for current tab');
};

/**
 * Fallback error display for when error handler import fails
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {*} error - Error information
 * @param {HTMLElement} streamingMessageElement - Optional streaming message element
 * @param {Function} onComplete - Callback function after completion
 */
const fallbackErrorDisplay = (chatContainer, error, streamingMessageElement = null, onComplete = null) => {
  logger.warn('Using fallback error display', {
    errorType: typeof error,
    errorKeys: typeof error === 'object' ? Object.keys(error || {}) : [],
    hasMessage: !!(error?.message),
    errorPreview: typeof error === 'string' ? error.substring(0, 100) : (error?.message || 'No message').substring(0, 100)
  });
  
  // For fallback, try to show detailed error if it's JSON
  let errorMessage = 'An error occurred. Please try again.';
  
  if (typeof error === 'string') {
    // Try to parse JSON string
    try {
      const parsed = JSON.parse(error);
      errorMessage = JSON.stringify(parsed, null, 2);
      logger.info('Fallback: Successfully parsed error as JSON for display');
    } catch (parseError) {
      errorMessage = error;
      logger.info('Fallback: Using error string as-is');
    }
  } else if (typeof error === 'object' && error !== null) {
    try {
      errorMessage = JSON.stringify(error, null, 2);
      logger.info('Fallback: Showing error object as JSON');
    } catch (stringifyError) {
      errorMessage = error?.message || 'An error occurred. Please try again.';
      logger.warn('Fallback: Could not stringify error object');
    }
  }
  
  const messageElement = streamingMessageElement || chatContainer.querySelector('[data-streaming="true"]');
  
  if (messageElement) {
    const contentDiv = messageElement.querySelector('.message-content');
    if (contentDiv) {
      // Use pre element for better formatting
      const errorPre = document.createElement('pre');
      errorPre.style.cssText = `
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
      errorPre.textContent = errorMessage;
      
      contentDiv.innerHTML = '';
      contentDiv.appendChild(errorPre);
    }
    messageElement.classList.add('error-message');
    cleanupStreamingState(messageElement);
  } else {
    // Create simple error message
    const messageTimestamp = Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message assistant-message error-message';
    messageDiv.id = `message-${messageTimestamp}`;
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const errorPre = document.createElement('pre');
    errorPre.style.cssText = `
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
    errorPre.textContent = errorMessage;
    
    contentDiv.appendChild(errorPre);
    messageDiv.appendChild(roleDiv);
    messageDiv.appendChild(contentDiv);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  
  if (typeof onComplete === 'function') {
    onComplete(error);
  }
};

/**
 * Update the state of the input area (send button, text area) based on loading status.
 * @param {boolean} isLoading - Whether the current tab is in a loading state.
 */
const updateInputAreaState = (isLoading) => {
  const sendBtn = document.getElementById('sendBtn');
  const userInput = document.getElementById('userInput');

  if (!sendBtn || !userInput) {
    logger.warn('Could not find send button or user input to update state.');
    return;
  }

  if (isLoading) {
    sendBtn.disabled = true;
    userInput.disabled = true;
    logger.info('Input area disabled due to loading state.');
  } else {
    // Only enable if there is no active stream in the chat container
    if (!hasActiveStream(document.getElementById('chatContainer'))) {
      sendBtn.disabled = false;
      userInput.disabled = false;
      logger.info('Input area enabled.');
    } else {
      logger.info('Input area remains disabled due to an active stream.');
    }
  }
};

/**
 * Clear all error messages from chat container
 * @param {HTMLElement} chatContainer - Chat container element
 */
const clearAllErrorMessages = (chatContainer) => {
  // Try to use the error handler's clear function
  import('./error-handler.js').then(({ default: errorHandler }) => {
    errorHandler.clearAllErrors({ chatContainer });
  }).catch(() => {
    // Fallback to manual clearing
    const errorSelectors = [
      '.error-message',
      '.message-content pre[style*="background-color: #f8f9fa"]',
      '.message-content .error-display',
      '.message-content span[style*="error-color"]'
    ];
    
    errorSelectors.forEach(selector => {
      const errorElements = chatContainer.querySelectorAll(selector);
      errorElements.forEach(element => {
        const messageDiv = element.closest('.chat-message');
        if (messageDiv) {
          messageDiv.remove();
          logger.info('Removed error message element');
        }
      });
    });
  });
};

// =============================
// 分支功能 (Branching Features)
// =============================

/**
 * Generate unique branch ID
 * @returns {string} Unique branch ID
 */
const generateBranchId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `br-${crypto.randomUUID()}`;
  }
  return `br-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

/**
 * Create new branch from existing branch
 * @param {string} originalBranchId - Original branch ID to create from
 * @param {Object} model - Selected model for new branch
 */
const createBranch = async (originalBranchId, model) => {
  logger.info(`Creating new branch from ${originalBranchId} using model ${model.label}`);
  
  // 在try块外声明newBranchId，避免在catch块中访问未定义变量
  let newBranchId = null;
  
  try {
    // 获取当前聊天容器
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) {
      throw new Error('Chat container not found');
    }
    
    // 查找原始分支所在的助手消息
    const originalBranch = chatContainer.querySelector(`[data-branch-id="${originalBranchId}"]`);
    if (!originalBranch) {
      throw new Error(`Original branch ${originalBranchId} not found`);
    }
    
    const branchContainer = originalBranch.closest('.branch-container');
    const branchesContainer = originalBranch.closest('.message-branches');
    
    // 构建上下文：从对话开始到当前助手消息之前
    const context = buildBranchContext(branchContainer);
    
    // 生成新的分支ID
    newBranchId = generateBranchId();
    
    // 在UI中创建新的分支列
    const newBranchDiv = createBranchElement(newBranchId, model, 'loading');
    branchesContainer.appendChild(newBranchDiv);
    
    // Check if there are 3 or more branches and update CSS class
    updateBranchContainerStyle(branchesContainer);
    
    // 滚动到新分支
    newBranchDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 更新聊天历史
    const chatHistory = getChatHistoryFromDOM(chatContainer);
    saveChatHistory(chatHistory);
    
    // 发送LLM请求
    await sendBranchLlmRequest(context, model, newBranchId);
    
    logger.info(`Branch ${newBranchId} created successfully`);
    
  } catch (error) {
    logger.error('Error creating branch:', error);
    
    // 如果创建失败，移除可能已创建的UI元素（只有当newBranchId被定义时）
    if (newBranchId) {
      const failedBranch = document.querySelector(`[data-branch-id="${newBranchId}"]`);
      if (failedBranch) {
        failedBranch.remove();
      }
    }
    
    // 显示错误提示
    alert(`${i18n.getMessage('branch_createFailed')}: ${error.message}`);
  }
};

/**
 * Build context for branch creation
 * @param {HTMLElement} branchContainer - Branch container element
 * @returns {Array} Context messages
 */
const buildBranchContext = (branchContainer) => {
  const chatContainer = branchContainer.closest('.chat-container');
  const allMessages = Array.from(chatContainer.children);
  const branchIndex = allMessages.indexOf(branchContainer);
  
  // 获取从开始到当前分支容器之前的所有消息
  const contextElements = allMessages.slice(0, branchIndex + 1);
  const context = [];
  
  contextElements.forEach(element => {
    if (element.classList.contains('user-message')) {
      // 用户消息
      const contentEl = element.querySelector('.message-content');
      const content = contentEl ? contentEl.getAttribute('data-raw-content') || contentEl.textContent : '';
      const imageBase64 = element.getAttribute('data-image');
      
      const messageObj = {
        role: 'user',
        content: content,
        ...(imageBase64 ? { imageBase64 } : {})
      };
      
      context.push(messageObj);
      
    } else if (element.classList.contains('branch-container')) {
      // 分支容器 - 取第一个分支作为上下文
      const firstBranch = element.querySelector('.message-branch[data-branch-id]');
      if (firstBranch) {
        const contentEl = firstBranch.querySelector('.message-content');
        const content = contentEl ? contentEl.getAttribute('data-raw-content') || contentEl.textContent : '';
        const model = firstBranch.getAttribute('data-model') || 'unknown';
        
        // 只有状态为done的分支才作为上下文
        if (!firstBranch.hasAttribute('data-streaming') && !firstBranch.classList.contains('error-message')) {
          context.push({
            role: 'assistant',
            content: content,
            model: model
          });
        }
      }
    }
  });
  
  return context;
};

/**
 * Create branch element in DOM
 * @param {string} branchId - Branch ID
 * @param {Object} model - Model information
 * @param {string} status - Branch status ('loading', 'done', 'error')
 * @param {string} content - Branch content
 * @returns {HTMLElement} Branch element
 */
const createBranchElement = (branchId, model, status = 'done', content = '') => {
  const branchDiv = document.createElement('div');
  branchDiv.className = 'message-branch';
  branchDiv.setAttribute('data-branch-id', branchId);
  branchDiv.setAttribute('data-model', model.name || 'unknown');
  
  // 分支内容
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.setAttribute('data-raw-content', content);
  
  if (status === 'loading') {
    branchDiv.setAttribute('data-streaming', 'true');
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'loading-container';
    loadingContainer.innerHTML = '<div class="spinner"></div>';
    contentDiv.appendChild(loadingContainer);
  } else if (status === 'error') {
    branchDiv.classList.add('error-message');
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-display';
    const errorContent = document.createElement('pre');
    errorContent.style.cssText = `
      color: var(--error-color);
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 0.9em;
      margin: 0;
      padding: 8px;
      background-color: var(--error-bg, #fff5f5);
      border-left: 4px solid var(--error-color);
      border-radius: 4px;
    `;
    errorContent.textContent = content;
    errorContainer.appendChild(errorContent);
    contentDiv.appendChild(errorContainer);
  } else {
    // done状态
    if (hasMarkdownElements(content)) {
      try {
        contentDiv.innerHTML = window.marked.parse(content);
      } catch (error) {
        contentDiv.textContent = content;
        contentDiv.classList.add('no-markdown');
      }
    } else {
      contentDiv.textContent = content;
      contentDiv.classList.add('no-markdown');
    }
  }
  
  // 添加模型标签到分支顶部（仅显示模型名）
  const modelLabel = document.createElement('div');
  modelLabel.className = 'branch-model-label';
  modelLabel.textContent = model.name || 'unknown';
  branchDiv.appendChild(modelLabel);
  
  branchDiv.appendChild(contentDiv);
  
  // 添加操作按钮
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'branch-actions';
  
  const branchButton = document.createElement('button');
  branchButton.className = 'btn-base message-action-btn branch-btn';
  branchButton.innerHTML = '<i class="material-icons">call_split</i>';
  branchButton.title = i18n.getMessage('branch_add');
  branchButton.setAttribute('data-action', 'branch');
  branchButton.setAttribute('data-branch-id', branchId);
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'btn-base message-action-btn delete-btn';
  if (status === 'loading') {
    deleteButton.innerHTML = '<i class="material-icons">stop</i>';
    deleteButton.title = i18n.getMessage('branch_stopAndDelete');
    deleteButton.setAttribute('data-action', 'stop-delete');
  } else {
    deleteButton.innerHTML = '<i class="material-icons">delete</i>';
    deleteButton.title = i18n.getMessage('branch_delete');
    deleteButton.setAttribute('data-action', 'delete');
  }
  deleteButton.setAttribute('data-branch-id', branchId);
  
  // loading 状态下仅保留"停止并删除"按钮
  if (status === 'loading') {
    actionsDiv.appendChild(deleteButton);
  } else {
    actionsDiv.appendChild(branchButton);
    actionsDiv.appendChild(deleteButton);
  }
  branchDiv.appendChild(actionsDiv);
  
  return branchDiv;
};

/**
 * Update branch container style based on number of branches
 * @param {HTMLElement} branchesContainer - The branches container element
 */
const updateBranchContainerStyle = (branchesContainer) => {
  if (!branchesContainer) return;
  
  const branchCount = branchesContainer.querySelectorAll('.message-branch').length;
  
  if (branchCount >= 3) {
    branchesContainer.classList.add('many-branches');
    // Create or update dual scrollbar
    createDualScrollbar(branchesContainer);
  } else {
    branchesContainer.classList.remove('many-branches');
    // Remove dual scrollbar wrapper if exists
    removeDualScrollbar(branchesContainer);
  }
};

/**
 * Create dual scrollbar for branch container
 * @param {HTMLElement} branchesContainer - The branches container element
 */
const createDualScrollbar = (branchesContainer) => {
  // Check if wrapper already exists
  let wrapper = branchesContainer.closest('.branches-scroll-wrapper');
  if (wrapper) {
    // Update existing scrollbar content width
    updateScrollbarContent(branchesContainer);
    return;
  }
  
  // Create wrapper
  wrapper = document.createElement('div');
  wrapper.className = 'branches-scroll-wrapper';
  
  // Insert wrapper before branches container
  branchesContainer.parentNode.insertBefore(wrapper, branchesContainer);
  
  // Create top scrollbar container
  const topScrollContainer = document.createElement('div');
  topScrollContainer.className = 'top-scrollbar-container';
  
  // Create top scrollbar content
  const topScrollContent = document.createElement('div');
  topScrollContent.className = 'top-scrollbar-content';
  topScrollContainer.appendChild(topScrollContent);
  
  // Move branches container into wrapper
  wrapper.appendChild(topScrollContainer);
  wrapper.appendChild(branchesContainer);
  
  // Setup scrollbar synchronization
  setupScrollbarSync(topScrollContainer, branchesContainer);
  
  // Update scrollbar content width
  updateScrollbarContent(branchesContainer);
};

/**
 * Remove dual scrollbar wrapper
 * @param {HTMLElement} branchesContainer - The branches container element
 */
const removeDualScrollbar = (branchesContainer) => {
  const wrapper = branchesContainer.closest('.branches-scroll-wrapper');
  if (wrapper) {
    // Move branches container back to its parent
    wrapper.parentNode.insertBefore(branchesContainer, wrapper);
    wrapper.remove();
  }
};

/**
 * Update scrollbar content width
 * @param {HTMLElement} branchesContainer - The branches container element
 */
const updateScrollbarContent = (branchesContainer) => {
  const wrapper = branchesContainer.closest('.branches-scroll-wrapper');
  if (!wrapper) return;
  
  const topScrollContent = wrapper.querySelector('.top-scrollbar-content');
  if (!topScrollContent) return;
  
  // Calculate total content width
  const branchCount = branchesContainer.querySelectorAll('.message-branch').length;
  const branchWidth = 380; // Fixed width per branch - updated to match CSS
  const gap = 6; // Gap between branches
  const padding = 8; // Left and right padding (4px each side)
  const totalWidth = branchCount * branchWidth + (branchCount - 1) * gap + padding;
  
  topScrollContent.style.width = `${totalWidth}px`;
};

/**
 * Setup scrollbar synchronization
 * @param {HTMLElement} topScrollContainer - Top scrollbar container
 * @param {HTMLElement} branchesContainer - Branches container
 */
const setupScrollbarSync = (topScrollContainer, branchesContainer) => {
  let isTopScrolling = false;
  let isBottomScrolling = false;
  
  // Sync top scrollbar to bottom
  topScrollContainer.addEventListener('scroll', () => {
    if (isBottomScrolling) return;
    isTopScrolling = true;
    branchesContainer.scrollLeft = topScrollContainer.scrollLeft;
    setTimeout(() => { isTopScrolling = false; }, 10);
  });
  
  // Sync bottom scrollbar to top
  branchesContainer.addEventListener('scroll', () => {
    if (isTopScrolling) return;
    isBottomScrolling = true;
    topScrollContainer.scrollLeft = branchesContainer.scrollLeft;
    setTimeout(() => { isBottomScrolling = false; }, 10);
  });
};

/**
 * Send LLM request for branch
 * @param {Array} context - Context messages
 * @param {Object} model - Selected model
 * @param {string} branchId - Branch ID
 */
const sendBranchLlmRequest = async (context, model, branchId) => {
  try {
    // 获取当前配置
    const config = await window.StateManager.getConfig();
    const basicConfig = config.basic || config;
    const systemPrompt = basicConfig.systemPrompt || '';
    const extractedContent = window.StateManager.getStateItem('extractedContent') || '';
    const currentUrl = window.StateManager.getStateItem('currentUrl') || '';
    const extractionMethod = window.StateManager.getStateItem('currentExtractionMethod') || 'readability';
    const includePageContent = window.StateManager.getStateItem('includePageContent');
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    
    // 构建系统提示
    let systemPromptWithContent = systemPrompt;
    if (includePageContent) {
      systemPromptWithContent += '\n\nPage Content:\n' + extractedContent;
    }
    
    // 使用MessageHandler发送消息，确保正确的payload格式
    await window.MessageHandler.sendLlmMessage({
      messages: context,
      systemPromptTemplate: systemPromptWithContent,
      extractedPageContent: extractedContent,
      currentUrl: currentUrl,
      extractionMethod: extractionMethod,
      tabId: currentTabId,
      branchId: branchId, // 添加branchId
      model: model // 指定模型
    });
    
    logger.info(`Branch LLM request sent successfully for ${branchId}`);
    
  } catch (error) {
    logger.error(`Error sending branch LLM request for ${branchId}:`, error);
    
    // 更新分支为错误状态
    const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
    if (branchElement) {
      updateBranchToError(branchElement, error.message || '请求失败');
    }
    
    throw error;
  }
};

/**
 * Get tab-specific branch models, excluding general config models
 * @param {string} currentTabId - Current tab ID
 * @param {Object} config - Configuration object
 * @returns {Promise<string[]>} Array of tab-specific branch model IDs
 */
const getTabSpecificBranchModels = async (currentTabId, config) => {
  try {
    // If it's the default chat tab, return empty array
    if (currentTabId === 'chat') {
      return [];
    }
    
    // Get the quick input configuration for this tab
    const quickInputs = config.quickInputs || [];
    const currentQuickInput = quickInputs.find(qi => qi.id === currentTabId);
    
    if (!currentQuickInput || !currentQuickInput.branchModelIds) {
      logger.debug(`No branch models found for tab ${currentTabId}`);
      return [];
    }
    
    // Get general configuration models to exclude
    const basicConfig = config.basic || config;
    const generalDefaultModel = basicConfig.defaultModelId;
    const generalBranchModels = basicConfig.branchModelIds || [];
    const modelsToExclude = [...new Set([generalDefaultModel, ...generalBranchModels].filter(Boolean))];
    
    // Filter out models that are already in general configuration
    const tabSpecificModels = currentQuickInput.branchModelIds.filter(modelId => 
      !modelsToExclude.includes(modelId)
    );
    
    logger.info(`Tab ${currentTabId} branch models: ${currentQuickInput.branchModelIds.join(', ')}, excluding general models: ${modelsToExclude.join(', ')}, resulting in: ${tabSpecificModels.join(', ')}`);
    
    return tabSpecificModels;
  } catch (error) {
    logger.error(`Error getting tab-specific branch models for tab ${currentTabId}:`, error);
    return [];
  }
};

/**
 * Update branch to error state
 * @param {HTMLElement} branchElement - Branch element
 * @param {string} errorMessage - Error message
 */
const updateBranchToError = (branchElement, errorMessage) => {
  branchElement.removeAttribute('data-streaming');
  branchElement.classList.add('error-message');
  
  const contentDiv = branchElement.querySelector('.message-content');
  if (contentDiv) {
    contentDiv.innerHTML = '';
    contentDiv.setAttribute('data-raw-content', errorMessage);
    
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-display';
    const errorContent = document.createElement('pre');
    errorContent.style.cssText = `
      color: var(--error-color);
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 0.9em;
      margin: 0;
      padding: 8px;
      background-color: var(--error-bg, #fff5f5);
      border-left: 4px solid var(--error-color);
      border-radius: 4px;
    `;
    errorContent.textContent = errorMessage;
    
    errorContainer.appendChild(errorContent);
    contentDiv.appendChild(errorContainer);
  }
  
  // 更新删除按钮
  const deleteButton = branchElement.querySelector('.delete-btn');
  if (deleteButton) {
    deleteButton.innerHTML = '<i class="material-icons">delete</i>';
    deleteButton.title = i18n.getMessage('branch_delete');
    deleteButton.setAttribute('data-action', 'delete');
  }
};

/**
 * Cancel branch request
 * @param {string} branchId - Branch ID to cancel
 * @returns {Promise<boolean>} Success status
 */
const cancelBranchRequest = async (branchId) => {
  try {
    logger.info(`Cancelling branch request for ${branchId}`);
    
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    const currentUrl = window.StateManager ? window.StateManager.getStateItem('currentUrl') : window.location.href;
    
    // 发送取消请求
    const response = await chrome.runtime.sendMessage({
      type: 'CANCEL_LLM_REQUEST',
      url: currentUrl,
      tabId: currentTabId,
      branchId: branchId
    });
    
    if (response && response.success) {
      logger.info(`Branch request ${branchId} cancelled successfully`);
      return true;
    } else {
      logger.warn(`Failed to cancel branch request ${branchId}:`, response?.error);
      return false;
    }
    
  } catch (error) {
    logger.error(`Error cancelling branch request ${branchId}:`, error);
    return false;
  }
};

/**
 * Save chat history
 * @param {Array} chatHistory - Chat history to save
 */
const saveChatHistory = async (chatHistory) => {
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');
    if (!currentUrl) {
      logger.warn('No current URL available for saving chat history');
      return;
    }
    
    // 使用TabManager保存（如果可用）
    if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
      await window.TabManager.saveCurrentTabChatHistory(chatHistory);
      logger.info('Chat history saved via TabManager');
    } else {
      // 回退到原始方法
      await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT_HISTORY',
        url: currentUrl,
        chatHistory: chatHistory
      });
      logger.info('Chat history saved via direct message');
    }
  } catch (error) {
    logger.error('Error saving chat history:', error);
    throw error;
  }
};

export {
  appendMessageToUI,
  handleStreamChunk,
  handleStreamEnd,
  handleLlmError,
  cleanupStreamingState,
  copyMessageText,
  copyMessageMarkdown,
  displayChatHistory,
  exportConversation,
  layoutMessageButtons,
  fixExistingMessageLayouts,
  sendUserMessage,
  handleQuickInputClick,
  clearConversationAndContext,
  cancelLlmRequest,
  clearAllErrorMessages,
  hasActiveStream,
  updateInputAreaState,
  updateBranchContainerStyle,
  // 分支功能
  generateBranchId,
  createBranch,
  buildBranchContext,
  createBranchElement,
  // 双滚动条功能
  createDualScrollbar,
  removeDualScrollbar,
  updateScrollbarContent,
  sendBranchLlmRequest,
  updateBranchToError,
  cancelBranchRequest,
  saveChatHistory,
  convertBranchHistoryToStandard
};