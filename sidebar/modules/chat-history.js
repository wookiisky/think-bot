/**
 * chat-history.js - Chat history management module
 * DOM-based chat history management implementation
 */

import { createLogger, hasMarkdownElements } from './utils.js';
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
    // Skip messages that are currently streaming or are error messages
    // Error messages should not be saved to history - they are UI-only
    if (messageEl.hasAttribute('data-streaming') || messageEl.classList.contains('error-message')) {
      return;
    }

    const role = messageEl.classList.contains('user-message') ? 'user' : 'assistant';
    const timestamp = parseInt(messageEl.id.split('-')[1], 10) || Date.now();
    
    if (role === 'user') {
      // 处理用户消息（保持原有逻辑）
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
      currentAssistantMessage = null; // 重置当前助手消息
      
    } else if (role === 'assistant') {
      // 处理助手消息（分支容器与兼容旧格式）
      const isBranchContainer = messageEl.classList.contains('branch-container');

      if (isBranchContainer) {
        // 分支容器：遍历 .message-branch 子项，收集所有分支
        const branchEls = messageEl.querySelectorAll('.message-branch');
        const responses = [];

        branchEls.forEach(branchEl => {
          const contentEl = branchEl.querySelector('.message-content');
          const branchId = branchEl.getAttribute('data-branch-id');
          const model = branchEl.getAttribute('data-model') || 'unknown';

          let content = '';
          let isError = false;
          if (branchEl.classList.contains('error-message')) {
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

          responses.push({
            branchId: branchId || `br-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            model: model,
            content: content,
            status: branchEl.hasAttribute('data-streaming') ? 'loading' : (isError ? 'error' : 'done'),
            errorMessage: isError ? content : null,
            updatedAt: timestamp
          });
        });

        // 只有当有分支时才推入历史
        if (responses.length > 0) {
          chatHistory.push({
            role: 'assistant',
            timestamp: timestamp,
            responses
          });
        }
        // 分支容器一次性完成，重置当前助手消息聚合
        currentAssistantMessage = null;
      } else {
        // 非分支容器（兼容旧结构或流式单分支）
        const contentEl = messageEl.querySelector('.message-content');
        const branchId = messageEl.getAttribute('data-branch-id');
        const model = messageEl.getAttribute('data-model') || 'unknown';

        let content = '';
        let isError = false;
        if (messageEl.classList.contains('error-message')) {
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

        const branchObj = {
          branchId: branchId || `br-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          model: model,
          content: content,
          status: messageEl.hasAttribute('data-streaming') ? 'loading' : (isError ? 'error' : 'done'),
          errorMessage: isError ? content : null,
          updatedAt: timestamp
        };

        if (currentAssistantMessage && Math.abs(currentAssistantMessage.timestamp - timestamp) < 5000) {
          currentAssistantMessage.responses.push(branchObj);
        } else {
          currentAssistantMessage = {
            role: 'assistant',
            timestamp: timestamp,
            responses: [branchObj]
          };
          chatHistory.push(currentAssistantMessage);
        }
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
        // 处理用户消息（保持原有逻辑）
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
        // 处理助手消息（新的分支逻辑）
        if (!message.responses || !Array.isArray(message.responses) || message.responses.length === 0) {
          // 兼容旧格式：如果没有responses但有content，当作单分支处理
          if (message.content) {
            const messageElement = appendMessageToUIFunc(
              chatContainer,
              message.role,
              message.content,
              null,
              false,
              message.timestamp
            );
            
            // 标记错误消息
            if (message.isError && messageElement) {
              messageElement.classList.add('error-message');
            }
          }
          return;
        }
        
        // 创建多分支容器
        const branchContainer = document.createElement('div');
        branchContainer.className = 'chat-message assistant-message branch-container';
        branchContainer.id = `message-${message.timestamp}`;
        
        const roleDiv = document.createElement('div');
        roleDiv.className = 'message-role';
        branchContainer.appendChild(roleDiv);
        
        // 创建分支列容器
        const branchesDiv = document.createElement('div');
        branchesDiv.className = 'message-branches';
        
        // 渲染每个分支
        message.responses.forEach((response, index) => {
          if (!response) return;
          
          const branchDiv = document.createElement('div');
          branchDiv.className = 'message-branch';
          branchDiv.setAttribute('data-branch-id', response.branchId);
          // Set data-model attribute with display name for consistency
          getModelDisplayName(response.model).then(displayName => {
            branchDiv.setAttribute('data-model', displayName);
          }).catch(() => {
            branchDiv.setAttribute('data-model', response.model || 'unknown');
          });
          
          // 分支内容
          const contentDiv = document.createElement('div');
          contentDiv.className = 'message-content';
          contentDiv.setAttribute('data-raw-content', response.content || '');
          
          // 根据分支状态渲染内容
          if (response.status === 'loading') {
            // 加载状态
            branchDiv.setAttribute('data-streaming', 'true');
            const loadingContainer = document.createElement('div');
            loadingContainer.className = 'loading-container';
            loadingContainer.innerHTML = '<div class="spinner"></div>';
            contentDiv.appendChild(loadingContainer);
          } else if (response.status === 'error') {
            // 错误状态
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
            errorContent.textContent = response.errorMessage || response.content || '';
            
            errorContainer.appendChild(errorContent);
            contentDiv.appendChild(errorContainer);
          } else {
            // 完成状态
            if (hasMarkdownElements(response.content || '')) {
              try {
                contentDiv.innerHTML = window.marked.parse(response.content || '');
              } catch (error) {
                contentDiv.textContent = response.content || '';
                contentDiv.classList.add('no-markdown');
              }
            } else {
              contentDiv.textContent = response.content || '';
              contentDiv.classList.add('no-markdown');
            }
          }
          
          // 添加模型标签到分支顶部
          const modelLabel = document.createElement('div');
          modelLabel.className = 'branch-model-label';
          
          // Use display name instead of raw model ID
          getModelDisplayName(response.model).then(displayName => {
            modelLabel.textContent = displayName;
          }).catch(() => {
            modelLabel.textContent = response.model || 'unknown';
          });
          
          branchDiv.appendChild(modelLabel);

          branchDiv.appendChild(contentDiv);

          // loading状态：仅在右上角显示"停止并删除当前分支"按钮，不加入悬浮按钮组
          if (response.status === 'loading') {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'branch-actions';

            const stopDeleteButton = document.createElement('button');
            stopDeleteButton.className = 'branch-action-btn delete-btn';
            stopDeleteButton.innerHTML = '<i class="material-icons">stop</i>';
            stopDeleteButton.title = i18n.getMessage('branch_stopAndDelete');
            stopDeleteButton.setAttribute('data-action', 'stop-delete');
            stopDeleteButton.setAttribute('data-branch-id', response.branchId);

            actionsDiv.appendChild(stopDeleteButton);
            branchDiv.appendChild(actionsDiv);
          } else {
            // 非loading：添加分支级悬浮按钮组，包含 创建/删除 按钮
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'message-buttons';

            // 跳转顶部
            const scrollTopButton = document.createElement('button');
            scrollTopButton.className = 'btn-base message-action-btn';
            scrollTopButton.innerHTML = '<i class="material-icons">arrow_upward</i>';
            scrollTopButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToTop');
            scrollTopButton.onclick = () => branchDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // 跳转底部
            const scrollBottomButton = document.createElement('button');
            scrollBottomButton.className = 'btn-base message-action-btn';
            scrollBottomButton.innerHTML = '<i class="material-icons">arrow_downward</i>';
            scrollBottomButton.title = i18n.getMessage('sidebar_chatManager_title_scrollToBottom');
            scrollBottomButton.onclick = () => branchDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });

            // 复制文本
            const copyTextButton = document.createElement('button');
            copyTextButton.className = 'btn-base message-action-btn';
            copyTextButton.innerHTML = '<i class="material-icons">content_copy</i>';
            copyTextButton.title = i18n.getMessage('sidebar_chatManager_title_copyText');
            copyTextButton.onclick = () => window.ChatManager.copyMessageText(branchDiv);

            // 复制Markdown
            const copyMarkdownButton = document.createElement('button');
            copyMarkdownButton.className = 'btn-base message-action-btn';
            copyMarkdownButton.innerHTML = '<i class="material-icons">code</i>';
            copyMarkdownButton.title = i18n.getMessage('common_copy_markdown');
            copyMarkdownButton.onclick = () => window.ChatManager.copyMessageMarkdown(branchDiv);

            // 创建分支（加入事件委托识别 + 布局样式）
            const branchButton = document.createElement('button');
            branchButton.className = 'btn-base message-action-btn branch-btn';
            branchButton.innerHTML = '<i class="material-icons">call_split</i>';
            branchButton.title = i18n.getMessage('branch_add');
            branchButton.setAttribute('data-action', 'branch');
            branchButton.setAttribute('data-branch-id', response.branchId);

            // 删除当前分支（加入事件委托识别 + 布局样式）
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn-base message-action-btn delete-btn';
            deleteButton.innerHTML = '<i class="material-icons">delete</i>';
            deleteButton.title = i18n.getMessage('branch_delete');
            deleteButton.setAttribute('data-action', 'delete');
            deleteButton.setAttribute('data-branch-id', response.branchId);

            // 顺序：顶部、底部、复制文本、复制Markdown、创建分支、删除分支
            const buttons = [scrollTopButton, scrollBottomButton, copyTextButton, copyMarkdownButton, branchButton, deleteButton];

            // 使用现有布局工具以适配悬浮/自适应
            if (window.ChatManager && window.ChatManager.layoutMessageButtons) {
              window.ChatManager.layoutMessageButtons(buttonContainer, buttons, branchDiv);
            } else {
              buttons.forEach(btn => buttonContainer.appendChild(btn));
            }
            branchDiv.appendChild(buttonContainer);
          }
          
          branchesDiv.appendChild(branchDiv);
        });
        
        branchContainer.appendChild(branchesDiv);
        chatContainer.appendChild(branchContainer);
      }
    });
    
    // Scroll to last user message if exists, otherwise scroll to bottom
    scrollToLastUserMessage(chatContainer);

    // 添加分支操作事件监听器
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
  // 避免重复绑定导致点击触发两次（会出现创建后立刻被移除的现象）
  if (chatContainer && chatContainer.dataset && chatContainer.dataset.branchEventsAttached === 'true') {
    return;
  }
  if (chatContainer && chatContainer.dataset) {
    chatContainer.dataset.branchEventsAttached = 'true';
  }

  // 使用事件委托处理分支按钮点击
  chatContainer.addEventListener('click', (event) => {
    const target = event.target;
    const button = target.closest('.branch-action-btn, .message-action-btn.delete-btn, .message-action-btn.branch-btn');
    
    if (!button) return;
    
    const action = button.getAttribute('data-action');
    const branchId = button.getAttribute('data-branch-id');
    
    if (!action || !branchId) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // 处理不同的操作
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
        // 兼容旧按钮类名：顶部右侧仅保留停止并删除
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
  
  // 检查是否已经有下拉菜单打开
  const existingDropdown = document.querySelector('.model-dropdown');
  if (existingDropdown) {
    const existingAnchorId = existingDropdown.getAttribute('data-anchor-branch-id');
    if (existingAnchorId === branchId) {
      existingDropdown.remove();
      return;
    }
    existingDropdown.remove();
  }
  
  // 创建模型选择下拉菜单
  createModelDropdown(button, branchId);
};

/**
 * Handle delete branch action
 * @param {string} branchId - Branch ID
 */
const handleDeleteBranch = (branchId) => {
  logger.info(`Deleting branch ${branchId}`);
  
  // 获取分支元素
  const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
  if (!branchElement) {
    logger.warn(`Branch element not found for ${branchId}`);
    return;
  }
  
  // 确认删除
  if (window.confirm(i18n.getMessage('branch_confirmDelete'))) {
    removeBranchFromDOM(branchElement, branchId);
  }
};

/**
 * Handle stop and delete branch action
 * @param {string} branchId - Branch ID
 */
const handleStopAndDeleteBranch = (branchId) => {
  logger.info(`Stopping and deleting branch ${branchId}`);
  
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
    
    // Update Tab loading 状态：从 activeBranches 中移除此分支
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
  
  // 首先尝试取消请求
  if (window.ChatManager && window.ChatManager.cancelBranchRequest) {
    window.ChatManager.cancelBranchRequest(branchId).then(() => {
      // 取消成功后删除分支
      const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
      if (branchElement) {
        removeBranchFromDOM(branchElement, branchId);
      }
      
      handlePostDelete();
    }).catch(error => {
      logger.error('Failed to cancel branch request:', error);
      // 即使取消失败也允许删除
      const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
      if (branchElement) {
        removeBranchFromDOM(branchElement, branchId);
      }
      
      handlePostDelete();
    });
  } else {
    // 没有取消功能，直接删除
    const branchElement = document.querySelector(`[data-branch-id="${branchId}"]`);
    if (branchElement) {
      removeBranchFromDOM(branchElement, branchId);
    }
    
    handlePostDelete();
  }
};

/**
 * Create model dropdown for branch selection
 * @param {HTMLElement} button - Branch button element
 * @param {string} branchId - Branch ID
 */
const createModelDropdown = (button, branchId) => {
  // 创建下拉菜单容器
  const dropdown = document.createElement('div');
  dropdown.className = 'model-dropdown';
  dropdown.setAttribute('data-anchor-branch-id', branchId);
  
  // 获取可用模型列表
  getAvailableModels().then(models => {
    if (!models || models.length === 0) {
      // 没有可用模型
      const emptyItem = document.createElement('div');
      emptyItem.className = 'model-dropdown-empty';
      emptyItem.textContent = i18n.getMessage('branch_noModels');
      dropdown.appendChild(emptyItem);
    } else {
      // 添加模型选项
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
    
    // 追加到 body 并以 fixed 模式定位在按钮正下方
    document.body.appendChild(dropdown);
    
    // 计算并设置位置（按钮下方，避免越界）
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
        // 不够空间则展示在按钮上方
        top = Math.max(
          viewportPadding,
          buttonRect.top - dropdownRect.height - offset
        );
      }

      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${top}px`;
    };

    // 初次定位
    positionDropdown();

    // 点击外部/滚动/窗口变化时关闭
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

    // 避免当前点击立刻触发关闭
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
    // 从StateManager获取配置
    if (window.StateManager && window.StateManager.getConfig) {
      const config = await window.StateManager.getConfig();
      
      // 使用正确的配置结构 (与model-selector.js保持一致)
      const llmConfig = config.llm_models || config.llm;
      
      if (!llmConfig || !llmConfig.models || !Array.isArray(llmConfig.models)) {
        logger.warn('No llm_models.models found in config');
        return [];
      }
      
      // 过滤启用的模型并转换格式（仅显示模型名，不包含 provider）
      const models = llmConfig.models
        .filter(model => model.enabled)
        .map(model => {
          return {
            id: model.id,                         // 直接使用配置中的模型ID
            name: model.name,                     // 使用显示名称作为name属性
            label: model.name,                    // 下拉显示仅展示模型名
            provider: model.provider,
            displayName: model.name,              // 保存原始显示名称
            modelConfig: model // 保存完整的模型配置用于后续使用
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
  
  // 委托给ChatManager处理分支创建
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
  
  // 移除分支元素
  branchElement.remove();
  
  // 如果这是最后一个分支，移除整个消息容器
  const remainingBranches = branchesContainer.querySelectorAll('.message-branch');
  if (remainingBranches.length === 0) {
    // 找到前一个用户消息也一起删除
    let prevElement = branchContainer.previousElementSibling;
    if (prevElement && prevElement.classList.contains('user-message')) {
      prevElement.remove();
    }
    branchContainer.remove();
  }
  
  // 保存更新后的聊天历史
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