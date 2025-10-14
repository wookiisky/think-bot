/**
 * chat-history.js - Chat history management module
 * DOM-based chat history management implementation
 */

import { createLogger, hasMarkdownElements } from './utils.js';
import { createBranchHeader, ensureBranchPreviewTrigger, openBranchPreview } from './branch-preview.js';
import { i18n } from '../../js/modules/i18n.js';

const logger = createLogger('ChatHistory');

/**
 * Get complete chat history from DOM
 * @param {HTMLElement} chatContainer - Chat container element
 * @returns {Array} Chat history array
 */
const getChatHistoryFromDOM = (chatContainer) => {
  const messageElements = chatContainer.querySelectorAll('.chat-message');
  const chatHistory = [];
  let currentAssistantMessage = null;

  messageElements.forEach(messageEl => {
    // Skip legacy streaming messages (not branch-container) or standalone error messages
    // Branch-container messages are handled separately and can contain streaming branches
    if ((messageEl.hasAttribute('data-streaming') && !messageEl.classList.contains('branch-container')) || 
        (messageEl.classList.contains('error-message') && !messageEl.classList.contains('branch-container'))) {
      return;
    }

    const role = messageEl.classList.contains('user-message') ? 'user' : 'assistant';
    const timestamp = parseInt(messageEl.id.split('-')[1], 10) || Date.now();
    
    if (role === 'user') {
      // Handle user messages (maintain original logic)
      const contentEl = messageEl.querySelector('.message-content');
      const content = contentEl ? contentEl.getAttribute('data-raw-content') || contentEl.textContent : '';
      const imageBase64 = messageEl.getAttribute('data-image');
      
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
      
      chatHistory.push(messageObj);
      currentAssistantMessage = null; // Reset current assistant message
      
    } else if (role === 'assistant') {
      // Handle assistant messages (branch container and compatible with old format)
      const isBranchContainer = messageEl.classList.contains('branch-container');

      if (isBranchContainer) {
        // Branch container: iterate through .message-branch children, collect all branches
        const branchEls = messageEl.querySelectorAll('.message-branch');
        const responses = [];

        branchEls.forEach(branchEl => {
          const contentEl = branchEl.querySelector('.message-content');
          const branchId = branchEl.getAttribute('data-branch-id');
          const model = branchEl.getAttribute('data-model') || 'unknown';

          let content = '';
          let isError = false;
          let isStreaming = false;
          
          // Check if this branch is currently streaming
          if (branchEl.hasAttribute('data-streaming')) {
            isStreaming = true;
            // For streaming branches, save the current buffer content
            content = branchEl.getAttribute('data-markdown-buffer') || 
                     (contentEl ? contentEl.getAttribute('data-raw-content') || '' : '');
          } else if (branchEl.classList.contains('error-message')) {
            const errorDisplay = contentEl?.querySelector('.error-display pre');
            if (errorDisplay) {
              content = errorDisplay.textContent || '';
            } else {
              content = contentEl?.textContent || '';
            }
            isError = true;
          } else {
            content = contentEl ? contentEl.getAttribute('data-raw-content') || contentEl.textContent : '';
          }
          
          // Filter out [object Object] from content before saving
          if (typeof content === 'string' && content.includes('[object Object]')) {
            logger.warn('Found [object Object] in DOM content, filtering before saving');
            content = content.replace(/\[object Object\]/g, '');
          }

          responses.push({
            branchId: branchId || `br-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            model: model,
            content: content,
            status: isStreaming ? 'loading' : (isError ? 'error' : 'done'),
            errorMessage: isError ? content : null,
            updatedAt: timestamp
          });
        });

        // Only push to history when there are branches
        if (responses.length > 0) {
          chatHistory.push({
            role: 'assistant',
            timestamp: timestamp,
            responses
          });
        }
        // Branch container completed at once, reset current assistant message aggregation
        currentAssistantMessage = null;
      } else {
        // All assistant messages must now use branch-container format - skip legacy single messages
        logger.warn('Skipping legacy non-branch assistant message - all assistant messages must use branch-container format now');
        // Reset current assistant message aggregation since this is not a valid branch format
        currentAssistantMessage = null;
      }
    }
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
 * Helper function to get model display name from model ID
 * @param {string} modelId - Model ID or name
 * @returns {Promise<string>} Display name
 */
const getModelDisplayName = async (modelId) => {
  try {
    // Get current configuration
    if (window.StateManager && window.StateManager.getConfig) {
      const config = await window.StateManager.getConfig();
      const llmConfig = config.llm_models || config.llm;
      
      if (llmConfig && llmConfig.models && Array.isArray(llmConfig.models)) {
        // Find matching model by ID, name, or model field
        const model = llmConfig.models.find(m => 
          m.enabled && (m.id === modelId || m.name === modelId || m.model === modelId)
        );
        
        if (model && model.name) {
          return model.name; // Return user-friendly display name
        }
      }
    }
  } catch (error) {
    logger.debug('Error getting model display name:', error);
  }
  
  // Fallback to original model ID if not found
  return modelId || 'unknown';
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
      if (!message || !message.role) {
        return;
      }
      
      if (message.role === 'user') {
        // Handle user messages (maintain original logic)
        if (!message.content) {
          return;
        }
        
        // For quick input messages, show display text but preserve send text for editing
        let contentToShow = message.content;
        if (message.isQuickInput && message.displayText) {
          contentToShow = message.displayText;
        }
        
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
        
      } else if (message.role === 'assistant') {
        // Handle assistant messages (new branch logic)
        if (!message.responses || !Array.isArray(message.responses) || message.responses.length === 0) {
          // All assistant messages must now use branch format - skip legacy messages
          logger.warn('Skipping assistant message without branch format - all messages must use branches now');
          return;
        }
        
        // Create multi-branch container
        const branchContainer = document.createElement('div');
        branchContainer.className = 'chat-message assistant-message branch-container';
        branchContainer.id = `message-${message.timestamp}`;
        
        const roleDiv = document.createElement('div');
        roleDiv.className = 'message-role';
        branchContainer.appendChild(roleDiv);
        
        // Create branch column container
        const branchesDiv = document.createElement('div');
        branchesDiv.className = 'message-branches';
        
        // Render each branch
        message.responses.forEach((response, index) => {
          if (!response) return;
          
          // Filter response content to remove [object Object] from stored history
          let cleanContent = response.content || '';
          if (typeof cleanContent !== 'string') {
            logger.warn('Non-string content in stored response, converting', { type: typeof cleanContent });
            cleanContent = String(cleanContent);
          }
          if (cleanContent.includes('[object Object]')) {
            logger.warn('Found [object Object] in stored response content, filtering');
            cleanContent = cleanContent.replace(/\[object Object\]/g, '');
          }
          
          const branchDiv = document.createElement('div');
          branchDiv.className = 'message-branch';
          branchDiv.setAttribute('data-branch-id', response.branchId);
          // Set data-model attribute with display name for consistency
          getModelDisplayName(response.model).then(displayName => {
            branchDiv.setAttribute('data-model', displayName);
          }).catch(() => {
            branchDiv.setAttribute('data-model', response.model || 'unknown');
          });
          
          // Branch content
          const contentDiv = document.createElement('div');
          contentDiv.className = 'message-content';
          contentDiv.setAttribute('data-raw-content', cleanContent);
          
          // Render content based on branch status
          if (response.status === 'loading') {
            // Loading state
            branchDiv.setAttribute('data-streaming', 'true');
            const loadingContainer = document.createElement('div');
            loadingContainer.className = 'loading-container';
            // No inner spinner; border loader is handled by CSS on the branch
            contentDiv.appendChild(loadingContainer);
            logger.debug(`History restore uses border loader (no spinner) for branch ${response.branchId}`);
          } else if (response.status === 'error') {
            // Error state
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
              padding: 12px;
              background-color: var(--error-bg, #fff5f5);
              border-left: 4px solid var(--error-color);
              border-radius: 4px;
            `;
            errorContent.textContent = response.errorMessage || cleanContent;
            
            errorContainer.appendChild(errorContent);
            contentDiv.appendChild(errorContainer);
          } else {
            // Completed state - use cleaned content
            const displayContent = cleanContent;
            
            if (hasMarkdownElements(displayContent)) {
              try {
                contentDiv.innerHTML = window.marked.parse(displayContent);
              } catch (error) {
                contentDiv.textContent = displayContent;
                contentDiv.classList.add('no-markdown');
              }
            } else {
              contentDiv.textContent = displayContent;
              contentDiv.classList.add('no-markdown');
            }
          }
          
          // Add branch header and populate model label asynchronously
          const { header: branchHeader, label: modelLabel } = createBranchHeader(response.model || 'unknown');

          // Use display name instead of raw model ID
          getModelDisplayName(response.model).then(displayName => {
            modelLabel.textContent = displayName;
          }).catch(() => {
            modelLabel.textContent = response.model || 'unknown';
          });

          branchDiv.appendChild(branchHeader);

          branchDiv.appendChild(contentDiv);

          // Loading state: show both branch and "stop and delete" buttons in top right, not in floating button group
          if (response.status === 'loading') {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'branch-actions';

            // Add branch button
            const branchButton = document.createElement('button');
            branchButton.className = 'branch-action-btn branch-btn';
            branchButton.innerHTML = '<i class="material-icons">call_split</i>';
            branchButton.title = i18n.getMessage('branch_add');
            branchButton.setAttribute('data-action', 'branch');
            branchButton.setAttribute('data-branch-id', response.branchId);
            actionsDiv.appendChild(branchButton);

            // Add stop and delete button
            const stopDeleteButton = document.createElement('button');
            stopDeleteButton.className = 'branch-action-btn delete-btn';
            stopDeleteButton.innerHTML = '<i class="material-icons">stop</i>';
            stopDeleteButton.title = i18n.getMessage('branch_stopAndDelete');
            stopDeleteButton.setAttribute('data-action', 'stop-delete');
            stopDeleteButton.setAttribute('data-branch-id', response.branchId);
            actionsDiv.appendChild(stopDeleteButton);

            branchDiv.appendChild(actionsDiv);
          } else {
            // Non-loading: add branch-level floating button group, including preview/create/delete buttons
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'message-buttons';

            // Preview button (first in group)
            const previewButton = document.createElement('button');
            previewButton.className = 'btn-base message-action-btn';
            previewButton.innerHTML = '<i class="material-icons">visibility</i>';
            previewButton.title = i18n.getMessage('sidebar_chatManager_title_preview') || 'Preview';
            const handlePreviewClick = () => openBranchPreview(branchDiv);
            previewButton.onclick = handlePreviewClick;
            ensureBranchPreviewTrigger(branchDiv, handlePreviewClick);

            // Scroll to top
            const scrollTopButton = document.createElement('button');
            scrollTopButton.className = 'btn-base message-action-btn';
            scrollTopButton.innerHTML = '<i class="material-icons">arrow_upward</i>';
            scrollTopButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToTop');
            scrollTopButton.onclick = () => {
              branchDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
              // Wait for smooth scrolling to complete, then offset upward by 5px
              setTimeout(() => {
                const chatContainer = branchDiv.closest('.chat-container');
                if (chatContainer) {
                  chatContainer.scrollTop -= 20;
                }
              }, 100);
            };

            // Scroll to bottom
            const scrollBottomButton = document.createElement('button');
            scrollBottomButton.className = 'btn-base message-action-btn';
            scrollBottomButton.innerHTML = '<i class="material-icons">arrow_downward</i>';
            scrollBottomButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToBottom');
            scrollBottomButton.onclick = () => {
              branchDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
              // Wait for smooth scrolling to complete, then offset downward by 5px
              setTimeout(() => {
                const chatContainer = branchDiv.closest('.chat-container');
                if (chatContainer) {
                  chatContainer.scrollTop += 20;
                }
              }, 100);
            };

            // Copy text
            const copyTextButton = document.createElement('button');
            copyTextButton.className = 'btn-base message-action-btn';
            copyTextButton.innerHTML = '<i class="material-icons">content_copy</i>';
            copyTextButton.title = i18n.getMessage('sidebar_chatManager_title_copyText');
            copyTextButton.onclick = () => window.ChatManager.copyMessageText(branchDiv);

            // Copy Markdown
            const copyMarkdownButton = document.createElement('button');
            copyMarkdownButton.className = 'btn-base message-action-btn';
            copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
            copyMarkdownButton.title = i18n.getMessage('common_copy_markdown');
            copyMarkdownButton.onclick = () => window.ChatManager.copyMessageMarkdown(branchDiv);

            // Create branch (add event delegation recognition + layout styles)
            const branchButton = document.createElement('button');
            branchButton.className = 'btn-base message-action-btn branch-btn';
            branchButton.innerHTML = '<i class="material-icons">call_split</i>';
            branchButton.title = i18n.getMessage('branch_add');
            branchButton.setAttribute('data-action', 'branch');
            branchButton.setAttribute('data-branch-id', response.branchId);

            // Delete current branch (add event delegation recognition + layout styles)
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn-base message-action-btn delete-btn';
            deleteButton.innerHTML = '<i class="material-icons">delete</i>';
            deleteButton.title = i18n.getMessage('branch_delete');
            deleteButton.setAttribute('data-action', 'delete');
            deleteButton.setAttribute('data-branch-id', response.branchId);

            // New order: preview (topmost), branch (second), scroll buttons, delete, then copy buttons at the very bottom
            const buttons = [previewButton, branchButton, scrollTopButton, scrollBottomButton, deleteButton, copyTextButton, copyMarkdownButton];
            const buttonGroups = [
              [previewButton, branchButton],
              [scrollTopButton, scrollBottomButton, deleteButton],
              [copyTextButton, copyMarkdownButton]
            ];

            // Use existing layout tools to adapt to floating/responsive
            if (window.ChatManager && window.ChatManager.layoutMessageButtons) {
              window.ChatManager.layoutMessageButtons(buttonContainer, buttons, branchDiv, buttonGroups);
              logger.debug('Applied history branch hover button order for conversations and sidebar replay');
            } else {
              buttons.forEach(btn => buttonContainer.appendChild(btn));
            }
            branchDiv.appendChild(buttonContainer);
          }
          
          branchesDiv.appendChild(branchDiv);
        });
        
        // Update branch container style based on number of branches
        if (window.ChatManager && window.ChatManager.updateBranchContainerStyle) {
          // Use a setTimeout to ensure DOM is ready
          setTimeout(() => {
            window.ChatManager.updateBranchContainerStyle(branchesDiv);
          }, 0);
        }
        
        branchContainer.appendChild(branchesDiv);
        chatContainer.appendChild(branchContainer);
      }
    });
    
    // Scroll to last user message if exists, otherwise scroll to bottom
    scrollToLastUserMessage(chatContainer);

    // Add branch operation event listeners
    addBranchEventListeners(chatContainer);

  } catch (error) {
    logger.error('Error displaying chat history:', error);
  }
};

/**
 * Add event listeners for branch operations
 * @param {HTMLElement} chatContainer - Chat container element
 */
const addBranchEventListeners = (chatContainer) => {
  // Avoid duplicate binding causing double click triggers (would cause creation then immediate removal)
  if (chatContainer && chatContainer.dataset && chatContainer.dataset.branchEventsAttached === 'true') {
    return;
  }
  if (chatContainer && chatContainer.dataset) {
    chatContainer.dataset.branchEventsAttached = 'true';
  }

  // Use event delegation to handle branch button clicks
  chatContainer.addEventListener('click', (event) => {
    const target = event.target;
    const button = target.closest('.branch-action-btn, .message-action-btn.delete-btn, .message-action-btn.branch-btn');
    
    if (!button) return;
    
    const action = button.getAttribute('data-action');
    const branchId = button.getAttribute('data-branch-id');
    
    if (!action || !branchId) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // Handle different operations
    switch (action) {
      case 'branch':
        handleBranchAction(button, branchId);
        break;
      case 'delete':
        handleDeleteBranch(branchId);
        break;
      case 'stop-delete':
        handleStopAndDeleteBranch(branchId);
        break;
      default:
        // Compatible with old button class names: only keep stop and delete in top right
        if (button.classList.contains('delete-btn') && branchId) {
          handleStopAndDeleteBranch(branchId);
        }
    }
  });
};

/**
 * Handle branch action (show model dropdown)
 * @param {HTMLElement} button - Branch button element
 * @param {string} branchId - Branch ID
 */
const handleBranchAction = (button, branchId) => {
  logger.info(`Creating branch from ${branchId}`);
  
  // Check if dropdown menu is already open
  const existingDropdown = document.querySelector('.model-dropdown');
  if (existingDropdown) {
    const existingAnchorId = existingDropdown.getAttribute('data-anchor-branch-id');
    if (existingAnchorId === branchId) {
      existingDropdown.remove();
      return;
    }
    existingDropdown.remove();
  }
  
  // Create model selection dropdown menu
  createModelDropdown(button, branchId);
};

/**
 * Handle delete branch action
 * @param {string} branchId - Branch ID
 */
const handleDeleteBranch = (branchId) => {
  logger.info(`Deleting branch ${branchId}`);
  
  // Get branch element
  const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
  if (!branchElement) {
    logger.warn(`Branch element not found for ${branchId}`);
    return;
  }
  
  // Find the delete button for this branch
  const deleteBtn = branchElement.querySelector('.delete-btn');
  if (!deleteBtn) {
    logger.warn(`Delete button not found for branch ${branchId}`);
    return;
  }
  
  // Use mini confirmation dialog instead of window.confirm
  if (window.confirmationDialog) {
    window.confirmationDialog.show({
      target: deleteBtn,
      message: i18n.getMessage('branch_confirmDelete'),
      confirmText: i18n.getMessage('common_delete'),
      cancelText: i18n.getMessage('common_cancel'),
      type: 'danger',
      onConfirm: () => {
        logger.info(`User confirmed deleting branch ${branchId}`);
        removeBranchFromDOM(branchElement, branchId);
      },
      onCancel: () => {
        logger.info(`User cancelled deleting branch ${branchId}`);
      }
    });
  } else {
    // Fallback to window.confirm if confirmationDialog is not available
    logger.warn('confirmationDialog not available, using fallback');
    if (window.confirm(i18n.getMessage('branch_confirmDelete'))) {
      removeBranchFromDOM(branchElement, branchId);
    }
  }
};

/**
 * Handle stop and delete branch action
 * @param {string} branchId - Branch ID
 */
const handleStopAndDeleteBranch = (branchId) => {
  logger.info(`Stopping and deleting branch ${branchId}`);
  
  // Get branch element
  const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
  if (!branchElement) {
    logger.warn(`Branch element not found for ${branchId}`);
    return;
  }
  
  // Find the stop-delete button for this branch
  const stopDeleteBtn = branchElement.querySelector('.delete-btn[data-action="stop-delete"]');
  if (!stopDeleteBtn) {
    logger.warn(`Stop-delete button not found for branch ${branchId}`);
    return;
  }
  
  // Helper function to handle post-delete operations
  const handlePostDelete = () => {
    // Check if this tab has any remaining content after deletion
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      const chatHistory = getChatHistoryFromDOM(chatContainer);
      const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
      
      // If the tab has no content after deletion, reset its initialization state
      // This allows quick input tabs to trigger auto-send again
      // Only do this for quick input tabs (non-default tabs with quickInputId)
      if (chatHistory.length === 0 && window.TabManager) {
        const currentTab = window.TabManager.getActiveTab();
        if (currentTab && !currentTab.isDefault && currentTab.quickInputId) {
          logger.info(`Resetting initialization state for empty quick input tab ${currentTabId} after stop-delete`);
          if (window.TabManager.resetTabInitializationState) {
            window.TabManager.resetTabInitializationState(currentTabId);
          }
          // Also reset runtime state to ensure clean state
          if (window.TabManager.resetTabRuntime) {
            window.TabManager.resetTabRuntime(currentTabId);
          }
        } else {
          logger.debug(`Tab ${currentTabId} is not a quick input tab, skipping initialization state reset`);
        }
      } else if (chatHistory.length > 0) {
        logger.debug(`Tab ${currentTabId} still has content after branch deletion, keeping initialization state`);
      }
    }
    
    // Update Tab loading state: remove this branch from activeBranches
    try {
      const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
      if (window.TabManager && window.TabManager.registerBranchError) {
        window.TabManager.registerBranchError(currentTabId, branchId);
      } else if (window.TabManager && window.TabManager.updateTabLoadingState) {
        window.TabManager.updateTabLoadingState(currentTabId, false);
      }
    } catch (stateErr) {
      logger.warn('Failed to update tab loading state after stop-delete:', stateErr);
    }
  };
  
  // Execute stop and delete operation
  const executeStopDelete = () => {
    // First try to cancel request
    if (window.ChatManager && window.ChatManager.cancelBranchRequest) {
      window.ChatManager.cancelBranchRequest(branchId).then(() => {
      // Delete branch after successful cancellation
      const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
      if (branchElement) {
        removeBranchFromDOM(branchElement, branchId);
      }
      
      handlePostDelete();
    }).catch(error => {
      logger.error('Failed to cancel branch request:', error);
      // Allow deletion even if cancellation fails
      const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
      if (branchElement) {
        removeBranchFromDOM(branchElement, branchId);
      }
      
      handlePostDelete();
    });
  } else {
    // No cancellation function, delete directly
    const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
    if (branchElement) {
      removeBranchFromDOM(branchElement, branchId);
    }
    
    handlePostDelete();
  }
  };
  
  // Use mini confirmation dialog instead of direct execution
  if (window.confirmationDialog) {
    window.confirmationDialog.show({
      target: stopDeleteBtn,
      message: i18n.getMessage('branch_confirmDelete'),
      confirmText: i18n.getMessage('common_delete'),
      cancelText: i18n.getMessage('common_cancel'),
      type: 'danger',
      onConfirm: () => {
        logger.info(`User confirmed stopping and deleting branch ${branchId}`);
        executeStopDelete();
      },
      onCancel: () => {
        logger.info(`User cancelled stopping and deleting branch ${branchId}`);
      }
    });
  } else {
    // Fallback to direct execution if confirmationDialog is not available
    logger.warn('confirmationDialog not available, executing stop-delete directly');
    executeStopDelete();
  }
};

/**
 * Create model dropdown for branch selection
 * @param {HTMLElement} button - Branch button element
 * @param {string} branchId - Branch ID
 */
const createModelDropdown = (button, branchId) => {
  // Create dropdown menu container
  const dropdown = document.createElement('div');
  dropdown.className = 'model-dropdown';
  dropdown.setAttribute('data-anchor-branch-id', branchId);
  
  // Get available model list
  getAvailableModels().then(models => {
    if (!models || models.length === 0) {
      // No available models
      const emptyItem = document.createElement('div');
      emptyItem.className = 'model-dropdown-empty';
      emptyItem.textContent = i18n.getMessage('branch_noModels');
      dropdown.appendChild(emptyItem);
    } else {
      // Add model options
      models.forEach(model => {
        const item = document.createElement('button');
        item.className = 'model-dropdown-item';
        item.textContent = model.label || model.name;
        item.setAttribute('data-model-id', model.id);
        
        item.addEventListener('click', () => {
          dropdown.remove();
          createNewBranch(branchId, model);
        });
        
        dropdown.appendChild(item);
      });
    }
    
    // Append to body and position in fixed mode below button
    document.body.appendChild(dropdown);
    
    // Calculate and set position (below button, avoid overflow)
    const positionDropdown = () => {
      const buttonRect = button.getBoundingClientRect();
      const dropdownRect = dropdown.getBoundingClientRect();
      const viewportPadding = 8;
      const offset = 4;

      let left = Math.min(
        Math.max(viewportPadding, buttonRect.left),
        window.innerWidth - dropdownRect.width - viewportPadding
      );

      let top = buttonRect.bottom + offset;
      if (top + dropdownRect.height + viewportPadding > window.innerHeight) {
        // If not enough space, show above button
        top = Math.max(
          viewportPadding,
          buttonRect.top - dropdownRect.height - offset
        );
      }

      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${top}px`;
    };

    // Initial positioning
    positionDropdown();

    // Close when clicking outside/scrolling/window changes
    const cleanup = () => {
      try { document.removeEventListener('click', outsideClickHandler, { capture: true }); } catch (_) {}
      try { window.removeEventListener('scroll', cleanup, { passive: true }); } catch (_) {}
      try { window.removeEventListener('resize', cleanup); } catch (_) {}
      if (dropdown && dropdown.parentNode) {
        dropdown.remove();
      }
    };

    const outsideClickHandler = (event) => {
      if (!dropdown.contains(event.target) && event.target !== button) {
        cleanup();
      }
    };

    // Avoid current click immediately triggering close
    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler, { capture: true });
      window.addEventListener('scroll', cleanup, { once: true, passive: true });
      window.addEventListener('resize', cleanup, { once: true });
    }, 50);
  });
};

/**
 * Get available models for branching
 * @returns {Promise<Array>} Array of available models
 */
const getAvailableModels = async () => {
  try {
    // Get configuration from StateManager
    if (window.StateManager && window.StateManager.getConfig) {
      const config = await window.StateManager.getConfig();
      
      // Use correct configuration structure (consistent with model-selector.js)
      const llmConfig = config.llm_models || config.llm;
      
      if (!llmConfig || !llmConfig.models || !Array.isArray(llmConfig.models)) {
        logger.warn('No llm_models.models found in config');
        return [];
      }
      
      // Filter enabled and non-deleted models and convert format (only show model name, not including provider)
      const models = llmConfig.models
        .filter(model => model.enabled && !model.deleted && !model.isDeleted)
        .map(model => {
          return {
            id: model.id,                         // Use model ID directly from config
            name: model.name,                     // Use display name as name attribute
            label: model.name,                    // Dropdown display only shows model name
            provider: model.provider,
            displayName: model.name,              // Save original display name
            modelConfig: model // Save complete model config for later use
          };
        });
      
      logger.info(`Found ${models.length} available models for branching`);
      return models;
    }
    
    return [];
  } catch (error) {
    logger.error('Error getting available models:', error);
    return [];
  }
};

/**
 * Create new branch with selected model
 * @param {string} originalBranchId - Original branch ID
 * @param {Object} model - Selected model
 */
const createNewBranch = (originalBranchId, model) => {
  logger.info(`Creating new branch from ${originalBranchId} using ${model.label}`);
  
  // Delegate to ChatManager to handle branch creation
  if (window.ChatManager && window.ChatManager.createBranch) {
    window.ChatManager.createBranch(originalBranchId, model);
  } else {
    logger.error('ChatManager.createBranch not available');
  }
};

/**
 * Remove branch from DOM and update chat history
 * @param {HTMLElement} branchElement - Branch element
 * @param {string} branchId - Branch ID
 */
const removeBranchFromDOM = (branchElement, branchId) => {
  const branchContainer = branchElement.closest('.branch-container');
  const branchesContainer = branchElement.closest('.message-branches');
  
  // Remove branch element
  branchElement.remove();
  
  // If this is the last branch, remove the entire message container
  const remainingBranches = branchesContainer.querySelectorAll('.message-branch');
  if (remainingBranches.length === 0) {
    // Find previous user message and delete together
    let prevElement = branchContainer.previousElementSibling;
    if (prevElement && prevElement.classList.contains('user-message')) {
      prevElement.remove();
    }
    branchContainer.remove();
  } else {
    // Update branch container style after deletion
    if (window.ChatManager && window.ChatManager.updateBranchContainerStyle) {
      window.ChatManager.updateBranchContainerStyle(branchesContainer);
    }
  }
  
  // Save updated chat history
  saveChatHistoryAfterBranchOperation();
};

/**
 * Save chat history after branch operation
 */
const saveChatHistoryAfterBranchOperation = () => {
  try {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer && window.ChatManager && window.ChatManager.saveChatHistory) {
      const chatHistory = getChatHistoryFromDOM(chatContainer);
      window.ChatManager.saveChatHistory(chatHistory);
    }
  } catch (error) {
    logger.error('Error saving chat history after branch operation:', error);
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
  scrollToLastUserMessage,
  addBranchEventListeners,
  handleBranchAction,
  handleDeleteBranch,
  handleStopAndDeleteBranch,
  createModelDropdown,
  getAvailableModels,
  createNewBranch,
  removeBranchFromDOM,
  saveChatHistoryAfterBranchOperation
};
