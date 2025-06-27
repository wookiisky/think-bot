/**
 * image-handler.js - Image handling functionality
 */

import { createLogger } from './utils.js';

const logger = createLogger('ImageHandler');

// Current image data
let currentImageBase64 = null;

/**
 * Initialize image handler
 * @param {HTMLElement} userInput - User input element
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 * @param {HTMLElement} removeImageBtn - Remove image button
 */
const initImageHandler = (userInput, imagePreviewContainer, imagePreview, removeImageBtn) => {
  if (!userInput || !imagePreviewContainer || !imagePreview || !removeImageBtn) {
    logger.error('Missing required elements for image handler');
    return;
  }
  
  // Handle image paste
  userInput.addEventListener('paste', (e) => {
    handleImagePaste(e, imagePreviewContainer, imagePreview);
  });
  
  // Remove image
  removeImageBtn.addEventListener('click', () => {
    removeAttachedImage(imagePreviewContainer, imagePreview);
  });
};

/**
 * Handle image paste
 * @param {ClipboardEvent} e - Paste event
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const handleImagePaste = (e, imagePreviewContainer, imagePreview) => {
  const items = e.clipboardData.items;
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const blob = items[i].getAsFile();
      const reader = new FileReader();
      
      reader.onload = function(event) {
        currentImageBase64 = event.target.result;
        displayAttachedImage(currentImageBase64, imagePreviewContainer, imagePreview);
      };
      
      reader.readAsDataURL(blob);
      
      // Prevent default paste behavior
      e.preventDefault();
      return;
    }
  }
};

/**
 * Display attached image
 * @param {string} dataUrl - Image data URL
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const displayAttachedImage = (dataUrl, imagePreviewContainer, imagePreview) => {
  imagePreview.innerHTML = `<img src="${dataUrl}" alt="Attached image">`;
  imagePreviewContainer.classList.remove('hidden');
};

/**
 * Remove attached image
 * @param {HTMLElement} imagePreviewContainer - Image preview container
 * @param {HTMLElement} imagePreview - Image preview element
 */
const removeAttachedImage = (imagePreviewContainer, imagePreview) => {
  imagePreview.innerHTML = '';
  imagePreviewContainer.classList.add('hidden');
  currentImageBase64 = null;
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
 */
const setCurrentImage = (imageBase64) => {
  currentImageBase64 = imageBase64;
};

export {
  initImageHandler,
  handleImagePaste,
  displayAttachedImage,
  removeAttachedImage,
  getCurrentImage,
  setCurrentImage
}; 