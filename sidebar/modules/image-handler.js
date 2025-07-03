/**
 * image-handler.js - Enhanced image handling functionality
 * Provides robust image paste, preview, and management capabilities
 */

import { createLogger } from './utils.js';

const logger = createLogger('ImageHandler');

// Current image data and state
let currentImageBase64 = null;
let currentImageSize = 0;
let isInitialized = false;
let eventListenersAdded = false;

// Configuration constants
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB limit
const SUPPORTED_FORMATS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const RETRY_DELAY = 100;
const MAX_RETRIES = 3;

/**
 * Initialize image handler with enhanced error handling and retry mechanism
 * @param {Object} elements - DOM elements object containing required elements
 * @param {number} retryCount - Current retry attempt count
 */
const initImageHandler = (elements, retryCount = 0) => {
  logger.info('Starting image handler initialization', { retryCount });
  
  // If already initialized, just verify elements and return
  if (isInitialized && eventListenersAdded) {
    logger.info('Image handler already initialized');
    return true;
  }
  
  // Get elements with fallback DOM queries
  const targetElements = getTargetElements(elements);
  
  // Validate all required elements exist
  const validation = validateElements(targetElements);
  if (!validation.isValid) {
    logger.warn('Element validation failed', validation.missing);
    
    // Retry with exponential backoff if under max retries
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY * Math.pow(2, retryCount);
      logger.info(`Retrying image handler initialization in ${delay}ms`, { 
        attempt: retryCount + 1, 
        maxRetries: MAX_RETRIES 
      });
      
      setTimeout(() => {
        initImageHandler(elements, retryCount + 1);
      }, delay);
      return false;
    } else {
      logger.error('Max retries exceeded for image handler initialization');
      return false;
    }
  }
  
  // Setup event listeners if not already done
  if (!eventListenersAdded) {
    setupEventListeners(targetElements);
    eventListenersAdded = true;
  }
  
  isInitialized = true;
  logger.info('Image handler initialized successfully');
  return true;
};

/**
 * Get target elements with fallback DOM queries and lazy initialization
 * @param {Object} elements - Provided elements object
 * @returns {Object} Target elements object
 */
const getTargetElements = (elements) => {
  // If elements provided, use them with fallback queries
  if (elements) {
    // Use ensureImageElements for lazy initialization if available
    let imageElements = {};
    if (elements.ensureImageElements && typeof elements.ensureImageElements === 'function') {
      imageElements = elements.ensureImageElements();
    }
    
    return {
      userInput: elements.userInput || document.getElementById('userInput'),
      imagePreviewContainer: imageElements.imagePreviewContainer || elements.imagePreviewContainer || document.getElementById('imagePreviewContainer'),
      imagePreview: imageElements.imagePreview || elements.imagePreview || document.getElementById('imagePreview'),
      removeImageBtn: imageElements.removeImageBtn || elements.removeImageBtn || document.getElementById('removeImageBtn')
    };
  }
  
  // Fallback to direct DOM queries
  return {
    userInput: document.getElementById('userInput'),
    imagePreviewContainer: document.getElementById('imagePreviewContainer'),
    imagePreview: document.getElementById('imagePreview'),
    removeImageBtn: document.getElementById('removeImageBtn')
  };
};

/**
 * Validate that all required elements exist
 * @param {Object} elements - Elements to validate
 * @returns {Object} Validation result
 */
const validateElements = (elements) => {
  // Only userInput is strictly required; others are optional but recommended
  const required = ['userInput'];
  const missing = required.filter(key => !elements[key]);
  
  return {
    isValid: missing.length === 0,
    missing: missing,
    found: Object.keys(elements).filter(key => elements[key])
  };
};

/**
 * Setup event listeners for image handling
 * @param {Object} elements - DOM elements
 */
const setupEventListeners = (elements) => {
  const { userInput, imagePreviewContainer, imagePreview } = elements;
  
  // Remove existing listeners to prevent duplicates
  removeEventListeners(elements);
  
  // Image paste handler
  const pasteHandler = (e) => handleImagePaste(e, imagePreviewContainer, imagePreview);
  userInput.addEventListener('paste', pasteHandler);
  
  // Store handlers for cleanup
  userInput._imageHandlers = { pasteHandler };
  
  logger.info('Event listeners set up successfully (remove button will be handled when image is displayed)');
};

/**
 * Remove existing event listeners to prevent duplicates
 * @param {Object} elements - DOM elements
 */
const removeEventListeners = (elements) => {
  const { userInput } = elements;
  
  // Remove existing handlers if they exist
  if (userInput._imageHandlers) {
    userInput.removeEventListener('paste', userInput._imageHandlers.pasteHandler);
    delete userInput._imageHandlers;
  }
  
  // Remove button handlers are managed separately when buttons are created/destroyed
};

/**
 * Enhanced image paste handler with validation and error handling
 * @param {ClipboardEvent} e - Paste event
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const handleImagePaste = (e, imagePreviewContainer, imagePreview) => {
  logger.info('Image paste event detected');
  
  try {
    const items = e.clipboardData?.items;
    if (!items) {
      logger.warn('No clipboard items found');
      return;
    }
    
    // Find image items
    const imageItems = Array.from(items).filter(item => 
      item.type.startsWith('image/') && SUPPORTED_FORMATS.includes(item.type)
    );
    
    if (imageItems.length === 0) {
      logger.info('No supported image formats found in clipboard');
      return;
    }
    
    // Use the first image item
    const imageItem = imageItems[0];
    logger.info('Processing image paste', { type: imageItem.type });
    
    const blob = imageItem.getAsFile();
    if (!blob) {
      logger.error('Failed to get image blob from clipboard');
      return;
    }
    
    // Validate image size
    if (blob.size > MAX_IMAGE_SIZE) {
      logger.error('Image size exceeds maximum limit', { 
        size: blob.size, 
        maxSize: MAX_IMAGE_SIZE 
      });
      showImageError('Image size exceeds 10MB limit');
      return;
    }
    
    // Process the image
    processImageBlob(blob, imagePreviewContainer, imagePreview);
    
    // Prevent default paste behavior
    e.preventDefault();
    
  } catch (error) {
    logger.error('Error handling image paste:', error);
    showImageError('Failed to process pasted image');
  }
};

/**
 * Process image blob and convert to base64
 * @param {Blob} blob - Image blob
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const processImageBlob = (blob, imagePreviewContainer, imagePreview) => {
  const reader = new FileReader();
  
  reader.onload = function(event) {
    try {
      const dataUrl = event.target.result;
      if (!dataUrl) {
        logger.error('Failed to read image data');
        showImageError('Failed to read image data');
        return;
      }
      
      // Clear previous image to free memory
      if (currentImageBase64) {
        currentImageBase64 = null;
        currentImageSize = 0;
      }
      
      // Store new image data
      currentImageBase64 = dataUrl;
      currentImageSize = blob.size;
      
      // Display the image
      displayAttachedImage(dataUrl, imagePreviewContainer, imagePreview);
      
      logger.info('Image processed successfully', { 
        size: blob.size, 
        format: blob.type 
      });
      
    } catch (error) {
      logger.error('Error processing image blob:', error);
      showImageError('Failed to process image');
    }
  };
  
  reader.onerror = function() {
    logger.error('FileReader error occurred');
    showImageError('Failed to read image file');
  };
  
  reader.readAsDataURL(blob);
};

/**
 * Display attached image with enhanced preview
 * @param {string} dataUrl - Image data URL
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const displayAttachedImage = (dataUrl, imagePreviewContainer, imagePreview) => {
  try {
    // Create image element with error handling
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Attached image';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    
    // Add load error handler
    img.onerror = () => {
      logger.error('Failed to load image for preview');
      showImageError('Failed to display image preview');
    };
    
    // Clear previous content and add new image
    imagePreview.innerHTML = '';
    imagePreview.appendChild(img);
    
    // Show container
    imagePreviewContainer.classList.remove('hidden');
    
    // Ensure remove button is available and functional
    ensureRemoveButton(imagePreviewContainer, imagePreview);
    
    logger.info('Image preview displayed successfully');
    
  } catch (error) {
    logger.error('Error displaying attached image:', error);
    showImageError('Failed to display image preview');
  }
};

/**
 * Ensure remove button exists and is functional
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const ensureRemoveButton = (imagePreviewContainer, imagePreview) => {
  try {
    if (!imagePreviewContainer) {
      logger.warn('Image preview container not found for remove button setup');
      return;
    }
    
    // First try to find existing remove button
    let removeBtn = imagePreviewContainer.querySelector('#removeImageBtn');
    if (!removeBtn) {
      // Try alternative selectors
      removeBtn = imagePreviewContainer.querySelector('.remove-image-btn');
    }
    
    if (!removeBtn) {
      logger.info('Remove button not found, creating one');
      // Create remove button if it doesn't exist
      const header = imagePreviewContainer.querySelector('.image-preview-header');
      if (header) {
        removeBtn = document.createElement('button');
        removeBtn.id = 'removeImageBtn';
        removeBtn.className = 'remove-image-btn';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', 'Remove image');
        removeBtn.setAttribute('title', 'Remove image');
        header.appendChild(removeBtn);
        logger.info('Remove button created successfully');
      } else {
        logger.error('Image preview header not found, cannot create remove button');
        return;
      }
    }
    
    // Ensure event listener is attached
    if (removeBtn && !removeBtn._imageHandlerAttached) {
      const removeHandler = () => {
        logger.info('Remove button clicked');
        removeAttachedImage(imagePreviewContainer, imagePreview);
      };
      
      removeBtn.addEventListener('click', removeHandler);
      removeBtn._imageHandlerAttached = true;
      logger.info('Remove button event listener attached');
    }
    
  } catch (error) {
    logger.error('Error ensuring remove button:', error);
  }
};

/**
 * Enhanced image removal with proper cleanup
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const removeAttachedImage = (imagePreviewContainer, imagePreview) => {
  try {
    logger.info('Removing attached image');
    
    // Clear image data and free memory
    if (currentImageBase64) {
      currentImageBase64 = null;
      currentImageSize = 0;
    }
    
    // Clear preview content
    if (imagePreview) {
      imagePreview.innerHTML = '';
    }
    
    // Hide container
    if (imagePreviewContainer) {
      imagePreviewContainer.classList.add('hidden');
    }
    
    // Force garbage collection hint
    if (window.gc) {
      window.gc();
    }
    
    logger.info('Image removed successfully');
    
  } catch (error) {
    logger.error('Error removing attached image:', error);
  }
};

/**
 * Show image error message
 * @param {string} message - Error message
 */
const showImageError = (message) => {
  // Create or update error element
  let errorElement = document.getElementById('imageError');
  if (!errorElement) {
    errorElement = document.createElement('div');
    errorElement.id = 'imageError';
    errorElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #f44336;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(errorElement);
  }
  
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  }, 3000);
};

/**
 * Get current image data
 * @returns {string|null} Base64 data of the image
 */
const getCurrentImage = () => {
  return currentImageBase64;
};

/**
 * Set current image data
 * @param {string|null} imageBase64 - Base64 data of the image
 * @param {number} size - Image size in bytes
 */
const setCurrentImage = (imageBase64, size = 0) => {
  // Clear previous image
  if (currentImageBase64) {
    currentImageBase64 = null;
    currentImageSize = 0;
  }
  
  // Set new image
  currentImageBase64 = imageBase64;
  currentImageSize = size;
  
  logger.info('Current image set', { hasImage: !!imageBase64, size });
};

/**
 * Get current image size
 * @returns {number} Size in bytes
 */
const getCurrentImageSize = () => {
  return currentImageSize;
};

/**
 * Clear all image data and cleanup
 */
const clearImageData = () => {
  if (currentImageBase64) {
    currentImageBase64 = null;
    currentImageSize = 0;
    logger.info('Image data cleared');
  }
};

/**
 * Check if image handler is initialized
 * @returns {boolean} Initialization status
 */
const isImageHandlerInitialized = () => {
  return isInitialized;
};

/**
 * Force re-initialization of image handler
 * @param {Object} elements - DOM elements
 */
const reinitializeImageHandler = (elements) => {
  logger.info('Force re-initializing image handler');
  isInitialized = false;
  eventListenersAdded = false;
  return initImageHandler(elements);
};

/**
 * Get image handler status for debugging
 * @returns {Object} Status information
 */
const getImageHandlerStatus = () => {
  return {
    isInitialized,
    eventListenersAdded,
    hasCurrentImage: !!currentImageBase64,
    currentImageSize,
    maxImageSize: MAX_IMAGE_SIZE,
    supportedFormats: SUPPORTED_FORMATS
  };
};

export {
  initImageHandler,
  handleImagePaste,
  displayAttachedImage,
  removeAttachedImage,
  getCurrentImage,
  setCurrentImage,
  getCurrentImageSize,
  clearImageData,
  isImageHandlerInitialized,
  reinitializeImageHandler,
  getImageHandlerStatus
}; 