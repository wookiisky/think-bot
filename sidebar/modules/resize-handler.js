/**
 * resize-handler.js - Handle UI resizing
 */

import { createLogger } from './utils.js';

const logger = createLogger('ResizeHandler');

// Resize state variables
let isResizing = false;
let startY = 0;
let startHeight = 0;
let isInputResizing = false;
let inputStartY = 0;
let inputStartHeight = 0;

/**
 * Initialize content area resize handler
 * @param {HTMLElement} contentSection - Content area element
 * @param {HTMLElement} resizeHandle - Resize handle element
 * @param {Function} saveCallback - Callback to save height
 */
const initContentResize = (contentSection, resizeHandle, saveCallback) => {
  if (!contentSection || !resizeHandle) {
    logger.error('Missing required elements for content resize');
    return;
  }
  
  // Start resizing
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = contentSection.offsetHeight;
    e.preventDefault();
    
    // Add visual feedback
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    

  });
  
  // Listen for global mousemove and mouseup events
  document.addEventListener('mousemove', (e) => {
    if (isResizing) {
      doResize(e, contentSection, null, saveCallback);
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (isResizing) {
      stopResize(e, contentSection, null, saveCallback);
    }
  });
  
  
};

/**
 * Initialize input box resize handler
 * @param {HTMLElement} userInput - Input box element
 * @param {HTMLElement} inputResizeHandle - Input resize handle element
 * @param {Function} layoutCallback - Callback to update layout
 */
const initInputResize = (userInput, inputResizeHandle, layoutCallback) => {
  if (!userInput || !inputResizeHandle) {
    logger.error('Missing required elements for input resize');
    return;
  }
  
  // Start resizing input box
  inputResizeHandle.addEventListener('mousedown', (e) => {
    isInputResizing = true;
    inputStartY = e.clientY;
    inputStartHeight = userInput.offsetHeight;
    e.preventDefault();
    
    // Add visual feedback
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    

  });
  
  // Add event listeners specific for input resizing
  document.addEventListener('mousemove', (e) => {
    if (isInputResizing) {
      doResize(e, null, userInput, layoutCallback);
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (isInputResizing) {
      stopResize(e, null, userInput, null);
    }
  });
  
  
};

/**
 * Perform resizing
 * @param {MouseEvent} e - Mouse event
 * @param {HTMLElement} contentSection - Content area element
 * @param {HTMLElement} userInput - Input box element
 * @param {Function} layoutCallback - Callback to update layout
 */
const doResize = (e, contentSection, userInput, layoutCallback) => {
  // Content area resize logic
  if (isResizing && contentSection) {
    const deltaY = e.clientY - startY;
    const newHeight = startHeight + deltaY;
    
    // Set min and max height - Allow 0 to completely hide content area
    const minHeight = 0;
    const maxHeight = window.innerHeight * 0.7; // Max 70% of window height
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      contentSection.style.height = `${newHeight}px`;
      contentSection.style.maxHeight = `${newHeight}px`;

    }
  }
  
  // Input box resize logic
  if (isInputResizing && userInput && typeof layoutCallback === 'function') {
    const deltaY = e.clientY - inputStartY;
    // Adjust growth factor for more natural dragging
    const newHeight = Math.round(inputStartHeight - (deltaY * 1.2));
    
    // Set min and max height
    const minHeight = 30;
    const maxHeight = 200;
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      // Use integer value to avoid layout issues
      const roundedHeight = Math.floor(newHeight);
      userInput.style.height = `${roundedHeight}px`;
      // Real-time input height update
      userInput.style.transition = 'none';
      
      // Debounce to avoid frequent layout updates
      if (!window.layoutUpdateTimer) {
        // Update icon layout based on input height
        layoutCallback(roundedHeight);
        
        // Debounce: do not update within 50ms
        window.layoutUpdateTimer = setTimeout(() => {
          window.layoutUpdateTimer = null;
        }, 50);
      }
    }
  }
};

/**
 * Stop resizing
 * @param {MouseEvent} e - Mouse event
 * @param {HTMLElement} contentSection - Content area element
 * @param {HTMLElement} userInput - Input box element
 * @param {Function} saveCallback - Callback to save height
 */
const stopResize = (e, contentSection, userInput, saveCallback) => {
  if (isResizing && contentSection && typeof saveCallback === 'function') {
    isResizing = false;
    
    // Remove visual feedback
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // Save new height
    const currentHeight = contentSection.offsetHeight;
    saveCallback(currentHeight);
    
    
  }
  
  if (isInputResizing && userInput) {
    isInputResizing = false;
    
    // Remove visual feedback
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // Restore input transition effect
    userInput.style.transition = '';
    
    // Clear layout update timer
    if (window.layoutUpdateTimer) {
      clearTimeout(window.layoutUpdateTimer);
      window.layoutUpdateTimer = null;
    }
    
    
  }
};

/**
 * Reset content section height to config default
 * @param {HTMLElement} contentSection - Content area element
 * @param {Object} config - Config object
 */
const resetContentSectionHeight = (contentSection, config) => {
  if (!contentSection) {
    logger.error('Content section element not found');
    return;
  }
  
  try {
    if (config && typeof config.contentDisplayHeight === 'number') {
      const height = Math.max(config.contentDisplayHeight, 0); // Allow 0 to completely hide content area
      contentSection.style.height = `${height}px`;
      contentSection.style.maxHeight = `${height}px`;
    } else {
      // Fallback to default value
      const defaultHeight = 100;
      contentSection.style.height = `${defaultHeight}px`;
      contentSection.style.maxHeight = `${defaultHeight}px`;
    }
  } catch (error) {
    logger.error('Error resetting content section height:', error);
    // Fallback to default value
    const defaultHeight = 100;
    contentSection.style.height = `${defaultHeight}px`;
    contentSection.style.maxHeight = `${defaultHeight}px`;
  }
};

/**
 * Apply panel size
 * @param {Object} config - Config object
 */
const applyPanelSize = (config) => {
  try {
    const panelWidth = config.panelWidth || 400; // Use default width if not configured
    
    // Side panel width is usually controlled by Chrome, but we can set min width
    document.documentElement.style.setProperty('--panel-width', `${panelWidth}px`);
    
    // Height is usually controlled by browser window
    document.documentElement.style.height = '100%';
    

  } catch (error) {
    logger.error('Error applying panel size:', error);
  }
};

/**
 * Save content section height to local storage
 * @param {number} height - Height to save
 * @returns {Promise<boolean>} Whether the save was successful
 */
const saveContentSectionHeight = async (height) => {
  try {
    await chrome.storage.local.set({ [UI_KEYS.CONTENT_SECTION_HEIGHT]: height });

    return true;
  } catch (error) {
    logger.error('Error saving content section height:', error);
    return false;
  }
};

/**
 * Load saved content section height
 * @param {HTMLElement} contentSection - Content area element
 * @param {Object} config - Config object
 * @returns {Promise<number>} Loaded height value
 */
const loadContentSectionHeight = async (contentSection, config) => {
  try {
    // First, try to get saved height from local storage
    const result = await chrome.storage.local.get([UI_KEYS.CONTENT_SECTION_HEIGHT]);

    if (result[UI_KEYS.CONTENT_SECTION_HEIGHT]) {
      const height = result[UI_KEYS.CONTENT_SECTION_HEIGHT];
      contentSection.style.height = `${height}px`;
      contentSection.style.maxHeight = `${height}px`;
      return height;
    }
    
    // If no saved height, use config default value
    if (config && typeof config.contentDisplayHeight === 'number') {
      const height = Math.max(config.contentDisplayHeight, 0); // Allow 0 to completely hide content area
      contentSection.style.height = `${height}px`;
      contentSection.style.maxHeight = `${height}px`;
      return height;
    } else {
      // Fallback to default value
      const defaultHeight = 100;
      contentSection.style.height = `${defaultHeight}px`;
      contentSection.style.maxHeight = `${defaultHeight}px`;
      return defaultHeight;
    }
  } catch (error) {
    logger.error('Error loading content section height:', error);
    // Fallback to default value
    const defaultHeight = 100;
    contentSection.style.height = `${defaultHeight}px`;
    contentSection.style.maxHeight = `${defaultHeight}px`;
    return defaultHeight;
  }
};

export {
  initContentResize,
  initInputResize,
  resetContentSectionHeight,
  applyPanelSize,
  saveContentSectionHeight,
  loadContentSectionHeight
}; 