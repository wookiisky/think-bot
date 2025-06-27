/**
 * quick-inputs.js - Quick input buttons component
 */

import { createLogger } from '../modules/utils.js';

const logger = createLogger('QuickInputs');

/**
 * Initialize quick input buttons
 * @param {HTMLElement} container - Button container element
 * @param {Array} quickInputs - Quick input configuration array
 * @param {Function} onQuickInputClick - Click callback function
 */
const initQuickInputs = (container, quickInputs, onQuickInputClick) => {
  if (!container) {
    logger.error('Quick inputs container not found');
    return;
  }
  
  if (!Array.isArray(quickInputs) || quickInputs.length === 0) {
    logger.warn('No quick inputs defined in config');
    container.innerHTML = '';
    return;
  }
  
  // Clear existing content
  container.innerHTML = '';
  
  // Create button for each quick input
  quickInputs.forEach((quickInput, index) => {
    const button = document.createElement('button');
    button.className = 'btn-base quick-input-btn';
    button.textContent = quickInput.displayText;
    button.dataset.index = index;
    button.dataset.sendText = quickInput.sendText;
    
    // Add click event handler
    button.addEventListener('click', () => {
      if (typeof onQuickInputClick === 'function') {
        onQuickInputClick(quickInput.displayText, quickInput.sendText);
      } else {
        logger.warn('No click handler provided for quick input');
      }
    });
    
    container.appendChild(button);
  });
  
  logger.info(`Initialized ${quickInputs.length} quick input buttons`);
};

/**
 * Load quick input buttons from config
 * @param {HTMLElement} container - Quick inputs container
 * @param {Function} onQuickInputClick - Click handler function
 * @returns {Promise<void>}
 */
const loadQuickInputs = async (container, onQuickInputClick) => {
  try {
    const config = await window.StateManager.getConfig();
    logger.info('Loaded config in loadQuickInputs:', config);
    
    if (config && config.quickInputs && config.quickInputs.length > 0) {
      initQuickInputs(
        container,
        config.quickInputs,
        onQuickInputClick
      );
    }
  } catch (error) {
    logger.error('Error loading quick inputs:', error);
  }
};

/**
 * Handle quick input button click
 * @param {string} displayText - Button display text
 * @param {string} sendTextTemplate - Text template to send
 * @param {string} extractedContent - Extracted page content
 * @param {boolean} includePageContent - Whether to include page content
 * @param {Function} onSendMessage - Send message callback function
 */
const handleQuickInputClick = (displayText, sendTextTemplate, extractedContent, includePageContent, onSendMessage) => {
  if (!sendTextTemplate) {
    logger.warn('No send text template provided for quick input');
    return;
  }
  
  // Replace {CONTENT} placeholder
  let userText = sendTextTemplate;
  if (sendTextTemplate.includes('{CONTENT}')) {
    if (includePageContent && extractedContent) {
      userText = sendTextTemplate.replace('{CONTENT}', extractedContent);
    } else {
      userText = sendTextTemplate.replace('{CONTENT}', '');
      logger.info('No page content included in quick input or extraction not enabled');
    }
  }
  
  // Call send message callback
  if (typeof onSendMessage === 'function') {
    onSendMessage(displayText, userText);
  } else {
    logger.error('No send message callback provided');
  }
  
  logger.info(`Quick input clicked: ${displayText}`);
};

export {
  initQuickInputs,
  loadQuickInputs,
  handleQuickInputClick
}; 