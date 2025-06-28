/**
 * chat-manager.js - Chat functionality management
 */

import { createLogger, hasMarkdownElements } from './utils.js';
import { editMessage, retryMessage } from '../components/chat-message.js';
import { displayChatHistory as displayChatHistoryFromModule } from './chat-history.js';

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
  
  if (streamId) {
    messageDiv.dataset.streamId = streamId;
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
    try {
      // Create container for spinner and stop button
      const loadingContainer = document.createElement('div');
      loadingContainer.className = 'loading-container';
      loadingContainer.style.display = 'flex';
      loadingContainer.style.alignItems = 'center';
      loadingContainer.style.gap = '8px';
      
      // Add spinner
      const spinnerDiv = document.createElement('div');
      spinnerDiv.innerHTML = '<div class="spinner"></div>'; // Use fixed spinner html
      loadingContainer.appendChild(spinnerDiv);
      
      // Add stop button
      const stopButton = document.createElement('button');
      stopButton.className = 'stop-request-btn';
      stopButton.innerHTML = '<i class="material-icons">close</i>';
      stopButton.title = 'Stop generating response';
      stopButton.addEventListener('click', async () => {
        const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
        const success = await cancelLlmRequest(currentTabId);
        
        if (success) {
          // Update UI to show cancellation
          contentDiv.innerHTML = '<span style="color: var(--text-color); font-style: italic;">Response generation stopped by user.</span>';
          messageDiv.removeAttribute('data-streaming');
          
          // Update tab loading state
          updateTabLoadingState(currentTabId, false).catch(error => 
            logger.warn('Error updating tab loading state after cancellation:', error)
          );
          
          // Re-enable send button
          const sendBtn = document.getElementById('sendBtn');
          if (sendBtn) sendBtn.disabled = false;
        }
      });
      
      // Add stop and clear button
      const stopClearButton = document.createElement('button');
      stopClearButton.className = 'stop-clear-btn';
      stopClearButton.innerHTML = '<i class="material-icons">delete_forever</i>';
      stopClearButton.title = 'Stop generating and clear conversation';
      stopClearButton.addEventListener('click', async () => {
        const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
        
        // First cancel the current request
        const success = await cancelLlmRequest(currentTabId);
        
        if (success) {
          logger.info('LLM request cancelled, now clearing conversation');
        } else {
          logger.warn('Failed to cancel LLM request, but proceeding with clearing conversation');
        }
        
        // Clear conversation regardless of cancellation success
        // This ensures consistent behavior equivalent to clicking the clear button in bottom right
        await clearConversationAndContext(chatContainer);
        
        // Update tab loading state
        updateTabLoadingState(currentTabId, false).catch(error => 
          logger.warn('Error updating tab loading state after stop and clear:', error)
        );
        
        // Re-enable send button
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = false;
        
        logger.info('Successfully stopped generation and cleared conversation');
      });
      
      loadingContainer.appendChild(stopButton);
      loadingContainer.appendChild(stopClearButton);
      contentDiv.appendChild(loadingContainer);
      
      // Explicitly set raw-content to empty for streaming messages to avoid saving spinner HTML
      contentDiv.setAttribute('data-raw-content', '');
    } catch (error) {
      logger.error(`Error creating loading container:`, error);
      contentDiv.innerHTML = content; // Fallback to original content
    }
    messageDiv.dataset.streaming = 'true';
    
    // Update tab loading state when loading spinner is added
    if (content.includes('<div class="spinner"></div>')) {
      const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
      currentRequestTabId = currentTabId; // Track current request
      updateTabLoadingState(currentTabId, true).catch(error => 
        logger.warn('Error updating tab loading state:', error)
      );
    }
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
    editButton.title = 'Edit Message';
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
    copyButton.title = 'Copy Text';
    copyButton.onclick = () => copyMessageText(content);
    
    // Copy markdown button
    const copyMarkdownButton = document.createElement('button');
    copyMarkdownButton.className = 'btn-base message-action-btn';
    copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
    copyMarkdownButton.title = 'Copy Markdown';
    copyMarkdownButton.onclick = () => copyMessageMarkdown(content);
    
    // Retry button
    const retryButton = document.createElement('button');
    retryButton.className = 'btn-base message-action-btn';
    retryButton.innerHTML = '<i class="material-icons">refresh</i>';
    retryButton.title = 'Retry';
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
      
      // Add new assistant placeholder message
      appendMessageToUI(
        chatContainer,
        'assistant',
        '<div class="spinner"></div>',
        null,
        true
      );
      
      // Scroll to bottom
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
    scrollTopButton.title = 'Scroll to Top';
    scrollTopButton.onclick = () => messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Copy text button
    const copyTextButton = document.createElement('button');
    copyTextButton.className = 'btn-base message-action-btn';
    copyTextButton.innerHTML = '<i class="material-icons">content_copy</i>';
    copyTextButton.title = 'Copy Text';
    copyTextButton.onclick = () => copyMessageText(content);
    
    // Copy markdown button
    const copyMarkdownButton = document.createElement('button');
    copyMarkdownButton.className = 'btn-base message-action-btn';
    copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
    copyMarkdownButton.title = 'Copy Markdown';
    copyMarkdownButton.onclick = () => copyMessageMarkdown(content);

    // Scroll to bottom button
    const scrollBottomButton = document.createElement('button');
    scrollBottomButton.className = 'btn-base message-action-btn';
    scrollBottomButton.innerHTML = '<i class="material-icons">arrow_downward</i>';
    scrollBottomButton.title = 'Scroll to Bottom';
    scrollBottomButton.onclick = () => messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
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
 */
const handleStreamChunk = (chatContainer, chunk, tabId, url) => {
  const streamId = `${url}#${tabId}`;
  // Find currently streaming message by its stream ID
  const streamingMessageContainer = chatContainer.querySelector(`[data-stream-id="${streamId}"][data-streaming="true"]`);
  
  if (!streamingMessageContainer) {
    return;
  }

  const streamingMessageContentDiv = streamingMessageContainer.querySelector('.message-content');
  if (!streamingMessageContentDiv) {
    logger.error('No message content div found in streaming container');
    return;
  }

  // Remove spinner (if exists, should only be on first chunk)
  const spinner = streamingMessageContentDiv.querySelector('.spinner');
  if (spinner) {
    spinner.remove();
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
      // If contains markdown, try to parse it
      streamingMessageContentDiv.classList.remove('no-markdown');
      const parsedContent = window.marked.parse(currentBuffer);
      streamingMessageContentDiv.innerHTML = parsedContent;
    } else {
      // If no markdown, display text and preserve line breaks
      streamingMessageContentDiv.classList.add('no-markdown');
      streamingMessageContentDiv.textContent = currentBuffer;
    }
  } catch (error) {
    logger.error('Error parsing markdown during stream:', error);
    // Fallback: display text
    streamingMessageContentDiv.classList.add('no-markdown');
    streamingMessageContentDiv.textContent = currentBuffer;
  }
  
  // Scroll to bottom
  try {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (scrollError) {
    logger.warn('Error scrolling to bottom:', scrollError);
  }
};

/**
 * Handle streaming transmission end
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {string} fullResponse - Full response text
 * @param {Function} onComplete - Callback function after completion
 * @param {string} finishReason - Optional finish reason from LLM provider
 * @param {boolean} isAbnormalFinish - Whether the finish was abnormal
 */
const handleStreamEnd = (chatContainer, fullResponse, onComplete, finishReason = null, isAbnormalFinish = false, tabId = null, url = null) => {
  // Find the streaming message container
  let streamingMessageContainer;
  if (tabId && url) {
    const streamId = `${url}#${tabId}`;
    streamingMessageContainer = chatContainer.querySelector(`[data-stream-id="${streamId}"][data-streaming="true"]`);
  }
  
  // Fallback for cases where streamId is not available or the element is not found by streamId
  if (!streamingMessageContainer) {
    streamingMessageContainer = chatContainer.querySelector('[data-streaming="true"]');
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
      contentDiv.textContent = fullResponse;
    }
  } catch (markdownError) {
    logger.error('Error parsing Markdown in stream end:', markdownError);
    contentDiv.classList.add('no-markdown');
    contentDiv.textContent = fullResponse; // Fallback to plain text
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
          warningText = 'Response was truncated due to maximum token limit. The response may be incomplete.';
          break;
        case 'SAFETY':
        case 'content_filter':
          warningText = 'Response was stopped due to content policy restrictions.';
          break;
        case 'RECITATION':
          warningText = 'Response was stopped due to potential copyright content.';
          break;
        case 'OTHER':
          warningText = 'Response ended for an unknown reason.';
          break;
        default:
          warningText = `Response ended with reason: ${finishReason}`;
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
  
  // Add operation buttons for assistant messages
  try {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'message-buttons';
    
    // Scroll to top button
    const scrollTopButton = document.createElement('button');
    scrollTopButton.className = 'btn-base message-action-btn';
    scrollTopButton.innerHTML = '<i class="material-icons">arrow_upward</i>';
    scrollTopButton.title = 'Scroll to Top';
    scrollTopButton.onclick = () => streamingMessageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Copy text button
    const copyTextButton = document.createElement('button');
    copyTextButton.className = 'btn-base message-action-btn';
    copyTextButton.innerHTML = '<i class="material-icons">content_copy</i>';
    copyTextButton.title = 'Copy text';
    copyTextButton.onclick = () => copyMessageText(streamingMessageContainer);

    // Copy markdown button
    const copyMarkdownButton = document.createElement('button');
    copyMarkdownButton.className = 'btn-base message-action-btn';
    copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
    copyMarkdownButton.title = 'Copy as Markdown';
    copyMarkdownButton.onclick = () => copyMessageMarkdown(streamingMessageContainer);

    // Scroll to bottom button

    // Scroll to bottom button
    const scrollBottomButton = document.createElement('button');
    scrollBottomButton.className = 'btn-base message-action-btn';
    scrollBottomButton.innerHTML = '<i class="material-icons">arrow_downward</i>';
    scrollBottomButton.title = 'Scroll to Bottom';
    scrollBottomButton.onclick = () => streamingMessageContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });

    const buttons = [scrollTopButton, copyTextButton, copyMarkdownButton, scrollBottomButton];
    const buttonGroups = [
      [scrollTopButton],
      [copyTextButton, copyMarkdownButton],
      [scrollBottomButton]
    ];
    // Dynamic button layout
    layoutMessageButtons(buttonContainer, buttons, streamingMessageContainer, buttonGroups);
    streamingMessageContainer.appendChild(buttonContainer);

    // Apply dynamic layout
    fixExistingMessageLayouts(chatContainer);
  } catch (buttonError) {
    logger.error('Error adding copy buttons:', buttonError);
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
 * @param {string} content - Message content
 */
const copyMessageText = (content) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = window.marked.parse(content);
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  navigator.clipboard.writeText(textContent)
    .then(() => window.showCopyToast('Text copied to clipboard'))
    .catch(err => logger.error('Failed to copy text:', err));
};

/**
 * Copy message Markdown
 * @param {string} content - Message content
 */
const copyMessageMarkdown = (content) => {
  navigator.clipboard.writeText(content)
    .then(() => window.showCopyToast('Markdown copied to clipboard'))
    .catch(err => {
      logger.error('Error copying markdown to clipboard:', err);
      window.showCopyToast('Error copying markdown');
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
const exportConversation = async (currentUrl, extractedContent, chatHistory) => {
  // Validate parameters with proper error handling
  if (!chatHistory || !Array.isArray(chatHistory)) {
    logger.warn('Invalid chat history provided for export');
    return;
  }
  
  if (chatHistory.length === 0) {
    return;
  }
  
  // Get page title
  let pageTitle = 'Unknown';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].title) {
      // Sanitize filename and limit length
      pageTitle = tabs[0].title
        .replace(/[<>:"/\\|?*'，。！？；：""''（）【】《》]/g, '_') // Remove invalid filename characters and Chinese punctuation
        .replace(/_{2,}/g, '_') // Replace multiple consecutive underscores with single underscore
        .replace(/^_+|_+$/g, '') // Remove leading and trailing underscores
        .substring(0, 100); // Limit to 100 characters
    }
  } catch (error) {
    logger.warn('Failed to get page title:', error);
  }

  // Generate markdown content
  let markdownContent = `# ${pageTitle}\n\n`;
  markdownContent += `URL: ${currentUrl || 'Unknown'}\n\n`;
  markdownContent += `## Conversation\n\n`;
  
  chatHistory.forEach((message, index) => {
    if (message && typeof message === 'object') {
      const role = message.role || 'Unknown';
      const content = message.content || '';
      markdownContent += `## ------${role}------\n\n`;
      markdownContent += `${content}\n\n`;
    } else {
      logger.warn(`Invalid message format at index ${index}:`, message);
    }
  });
  
  // Create blob and download
  try {
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    // Generate filename with timestamp and page title
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${year}${month}${day}_${hour}${minute}`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${timestamp}_${pageTitle}.md`;
    a.click();
    
    URL.revokeObjectURL(url);
    logger.info(`Successfully exported conversation with ${chatHistory.length} messages`);
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
  const chatHistory = window.ChatHistory.getChatHistoryFromDOM(chatContainer);
  
  // Immediately save current dialog history to storage for current tab
  try {
    if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
      await window.TabManager.saveCurrentTabChatHistory(chatHistory);
    } else {
      // Fallback to original method
      await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT_HISTORY',
        url: window.StateManager.getStateItem('currentUrl'),
        chatHistory: chatHistory
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
  
  // Show loading indicator in chat
  // Ensure this method is called before sending message to ensure UI is updated in time
  const loadingMsgId = appendMessageToUI(chatContainer, 'assistant', '<div class="spinner"></div>', null, true, undefined, streamId);
  
  // If image was attached, send and remove
  if (imageBase64) {
    const imageHandler = window.ImageHandler;
    if (imageHandler && imageHandler.removeAttachedImage) {
      const imagePreviewContainer = document.getElementById('imagePreviewContainer');
      const imagePreview = document.getElementById('imagePreview');
      imageHandler.removeAttachedImage(imagePreviewContainer, imagePreview);
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
    
    // Send message to background script for LLM processing
    await window.MessageHandler.sendLlmMessage({
      messages: chatHistory,
      systemPromptTemplate: systemPromptTemplateForPayload,
      extractedPageContent: pageContentForPayload,
      imageBase64: imageBase64,
      currentUrl: window.StateManager.getStateItem('currentUrl'),
      extractionMethod: window.StateManager.getStateItem('currentExtractionMethod'),
      selectedModel: selectedModel,
      tabId: currentTabId
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
      'Failed to send message to the AI. Check service worker logs.',
      loadingMsgId,
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
  
  // Show assistant response loading indicator
  const assistantLoadingMessage = appendMessageToUI(
    chatContainer,
    'assistant',
    '<div class="spinner"></div>',
    null,
    true,
    undefined,
    streamId
  );
  
  // Get dialog history from DOM
  const chatHistory = window.ChatHistory.getChatHistoryFromDOM(chatContainer);
  
  // Immediately save current dialog history to storage for current tab
  try {
    if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
      await window.TabManager.saveCurrentTabChatHistory(chatHistory);
      logger.info('Tab chat history saved after adding quick input message');
    } else {
      // Fallback to original method
      await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT_HISTORY',
        url: window.StateManager.getStateItem('currentUrl'),
        chatHistory: chatHistory
      });
      logger.info('Chat history saved after adding quick input message');
    }
    if (onMessageSaved) onMessageSaved();
  } catch (error) {
    logger.error('Failed to save chat history after adding quick input message:', error);
  }
  
  // Prepare data
  const state = currentState;
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
    
    // Send message to background script for LLM processing
    await window.MessageHandler.sendLlmMessage({
      messages: chatHistory,
      systemPromptTemplate: systemPromptTemplateForPayload,
      extractedPageContent: pageContentForPayload,
      currentUrl: state.currentUrl,
      extractionMethod: state.currentExtractionMethod,
      selectedModel: selectedModel,
      tabId: currentTabId
    });
  } catch (error) {
    logger.error('Error sending quick message:', error);
    // Pass loading message element to handleLlmError for updating it in case of failure
    handleLlmError(
      chatContainer,
      'Failed to send message to LLM',
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
  updateInputAreaState
};