// Storage Usage Display Manager
// Handles individual storage usage display for different config components

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('StorageUsage') : console;

export class StorageUsageDisplay {
  
  // Calculate size of a string in bytes
  static calculateSize(str) {
    if (!str) return 0;
    return new Blob([str]).size;
  }
  
  // Calculate size of a quick input object (with compression support)
  static calculateQuickInputSize(quickInput) {
    if (!quickInput) return 0;
    
    let size = this.calculateSize(JSON.stringify(quickInput));
    
    // Apply pako compression if available
    if (typeof quickInputCompression !== 'undefined') {
      try {
        const compressed = quickInputCompression.compressQuickInputs(quickInput);
        if (compressed !== quickInput) {
          size = this.calculateSize(JSON.stringify(compressed));
        }
      } catch (error) {
        // Compression failed, use original size
      }
    }
    
    return size;
  }
  
  // Get storage quota limits
  static getStorageLimits() {
    return {
      maxPerItem: chrome.storage.local.QUOTA_BYTES_PER_ITEM || 10485760, // 10MB per item for local storage
      maxTotal: chrome.storage.local.QUOTA_BYTES || 10485760 // 10MB total for local storage
    };
  }
  
  // Calculate usage percentage
  static calculateUsagePercent(current, max) {
    if (!max) return 0;
    return Math.round((current / max) * 100);
  }
  
  // Format size with appropriate units
  static formatSize(bytes) {
    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
  }
  
  // Create a compact storage usage badge
  static createUsageBadge(current, max, type = 'item') {
    const percent = this.calculateUsagePercent(current, max);
    const isWarning = percent > 80;
    const isError = percent > 95;
    
    const badge = document.createElement('span');
    badge.className = `storage-badge ${isError ? 'error' : isWarning ? 'warning' : 'normal'}`;
    badge.textContent = `${percent}%`;
    badge.title = `Storage usage: ${current}B / ${max}B (${percent}%)`;
    
    return badge;
  }
  
  // Display quick input storage usage
  static displayQuickInputUsage(quickInputItem, quickInput) {
    // Remove existing badge from old location
    const existingBadge = quickInputItem.querySelector('.storage-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
    
    // Calculate size with compression details
    const originalSize = this.calculateSize(JSON.stringify(quickInput));
    let compressedSize = originalSize;
    let isCompressed = false;
    
    // Check if pako compression is available and apply it
    if (typeof quickInputCompression !== 'undefined') {
      try {
        const compressed = quickInputCompression.compressQuickInputs(quickInput);
        if (compressed !== quickInput) {
          compressedSize = this.calculateSize(JSON.stringify(compressed));
          isCompressed = true;
        }
      } catch (error) {
        // Compression failed, use original size
      }
    }
    
    const limits = this.getStorageLimits();
    
    // Update storage status in header
    const storageStatus = quickInputItem.querySelector('.storage-status');
    if (storageStatus) {
      // Format size with appropriate units
      const sizeText = this.formatSize(compressedSize);
      const percent = this.calculateUsagePercent(compressedSize, limits.maxPerItem);
      storageStatus.textContent = `${percent}%`;
      
      // Update custom tooltip to show compression info (faster than native title)
      if (isCompressed) {
        const savings = Math.round((1 - compressedSize/originalSize) * 100);
        storageStatus.setAttribute('data-tooltip', `Storage usage: ${sizeText} / ${this.formatSize(limits.maxPerItem)} (${percent}%)\nCompressed from ${this.formatSize(originalSize)} (${savings}% saved)`);
      } else {
        storageStatus.setAttribute('data-tooltip', `Storage usage: ${sizeText} / ${this.formatSize(limits.maxPerItem)} (${percent}%)`);
      }
      
      // Remove native title to avoid conflict with custom tooltip
      storageStatus.removeAttribute('title');
      
      // Update style based on usage
      storageStatus.className = 'storage-status';
      if (percent >= 90) {
        storageStatus.classList.add('storage-high');
      } else if (percent >= 70) {
        storageStatus.classList.add('storage-medium');
      } else {
        storageStatus.classList.add('storage-low');
      }
    }
  }
  
  // Display system prompt storage usage
  static displaySystemPromptUsage(systemPromptSection, systemPromptText) {
    // Remove existing badge
    const existingBadge = systemPromptSection.querySelector('.storage-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
    
    // Calculate size (including compression if available)
    let size = this.calculateSize(systemPromptText);
    
    // Check if pako compression is available and apply it
    if (typeof quickInputCompression !== 'undefined' && systemPromptText) {
      try {
        // Use the compressQuickInputs function by wrapping the text in an object
        const textObj = { text: systemPromptText };
        const compressed = quickInputCompression.compressQuickInputs(textObj);
        if (compressed !== textObj) {
          size = this.calculateSize(JSON.stringify(compressed));
        }
      } catch (error) {
        // Compression failed, use original size
      }
    }
    
    const limits = this.getStorageLimits();
    
    // Create badge
    const badge = this.createUsageBadge(size, limits.maxPerItem);
    
    // Find the system prompt label and add badge next to it
    const label = systemPromptSection.querySelector('label[for="systemPrompt"]');
    
    if (label) {
      label.appendChild(badge);
    }
  }
  
  // Update all storage usage displays
  static updateAllUsageDisplays(domElements) {
    // Update quick inputs
    const quickInputItems = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    quickInputItems.forEach(item => {
      const displayText = item.querySelector('.quick-input-display')?.value || '';
      const sendText = item.querySelector('.quick-input-send')?.value || '';
      const idInput = item.querySelector('.quick-input-id');
      
      if (displayText.trim() && sendText.trim()) {
        const quickInput = {
          id: idInput ? idInput.value : 'temp_' + Date.now(),
          displayText: displayText.trim(),
          sendText: sendText.trim()
        };
        
        this.displayQuickInputUsage(item, quickInput);
      }
    });
    
    // Update system prompt
    if (domElements.systemPrompt) {
      // Find the system prompt section using multiple strategies
      let systemPromptSection = document.querySelector('.settings-section:has(#systemPrompt)');
      if (!systemPromptSection) {
        // Fallback: find by looking for the label
        const systemPromptLabel = document.querySelector('label[for="systemPrompt"]');
        if (systemPromptLabel) {
          systemPromptSection = systemPromptLabel.closest('.settings-section');
        }
      }
      
      if (systemPromptSection) {
        this.displaySystemPromptUsage(systemPromptSection, domElements.systemPrompt.value);
      }
    }
  }
  
  // Validate configuration size before saving
  static validateConfigurationSize(config) {
    const limits = this.getStorageLimits();
    const errors = [];
    
    // Check system prompt size
    if (config.systemPrompt) {
      let systemPromptSize = this.calculateSize(config.systemPrompt);
      
      // Apply pako compression if available
      if (typeof quickInputCompression !== 'undefined') {
        try {
          const compressed = quickInputCompression.compressText(config.systemPrompt);
          if (compressed !== config.systemPrompt) {
            systemPromptSize = this.calculateSize(JSON.stringify(compressed));
          }
        } catch (error) {
          // Compression failed, use original size
        }
      }
      
      if (systemPromptSize > limits.maxPerItem) {
        errors.push(`System Prompt is too large: ${systemPromptSize}B / ${limits.maxPerItem}B (${this.calculateUsagePercent(systemPromptSize, limits.maxPerItem)}%)`);
      }
    }
    
    // Check individual quick inputs
    if (config.quickInputs && config.quickInputs.length > 0) {
      config.quickInputs.forEach((quickInput, index) => {
        const quickInputSize = this.calculateQuickInputSize(quickInput);
        
        if (quickInputSize > limits.maxPerItem) {
          errors.push(`Quick Input "${quickInput.displayText}" is too large: ${quickInputSize}B / ${limits.maxPerItem}B (${this.calculateUsagePercent(quickInputSize, limits.maxPerItem)}%)`);
        }
      });
    }
    
    return errors;
  }
  
  // Setup event listeners for real-time usage updates
  static setupEventListeners(domElements) {
    // Listen for quick input changes
    if (domElements.quickInputsContainer) {
      domElements.quickInputsContainer.addEventListener('input', () => {
        // Debounce the update to avoid excessive calculations
        clearTimeout(this._quickInputUpdateTimeout);
        this._quickInputUpdateTimeout = setTimeout(() => {
          this.updateAllUsageDisplays(domElements);
        }, 500);
      });
    }
    
    // Listen for system prompt changes
    if (domElements.systemPrompt) {
      domElements.systemPrompt.addEventListener('input', () => {
        // Debounce the update
        clearTimeout(this._systemPromptUpdateTimeout);
        this._systemPromptUpdateTimeout = setTimeout(() => {
          this.updateAllUsageDisplays(domElements);
        }, 500);
      });
    }
  }
  
  // Add CSS styles for storage badges
  static addStyles() {
    if (document.getElementById('storageUsageStyles')) {
      return; // Already added
    }
    
    const style = document.createElement('style');
    style.id = 'storageUsageStyles';
    style.textContent = `
      .storage-badge {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.75em;
        font-weight: bold;
        min-width: 30px;
        text-align: center;
      }
      
      .storage-badge.normal {
        background-color: #e8f5e8;
        color: #2e7d32;
        border: 1px solid #c8e6c9;
      }
      
      .storage-badge.warning {
        background-color: #fff3e0;
        color: #ef6c00;
        border: 1px solid #ffcc02;
      }
      
      .storage-badge.error {
        background-color: #ffebee;
        color: #c62828;
        border: 1px solid #ef5350;
      }
      
      .form-group label {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .display-text-group label {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .storage-error-display {
        margin-top: 10px;
        padding: 10px;
        background-color: #ffebee;
        border: 1px solid #ef5350;
        border-radius: 4px;
        color: #c62828;
      }
      
      .storage-error-display h4 {
        margin: 0 0 10px 0;
        color: #c62828;
      }
      
      .storage-error-display ul {
        margin: 0;
        padding-left: 20px;
      }
      
      .storage-error-display li {
        margin: 5px 0;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Initialize storage usage display
  static init(domElements) {
    this.addStyles();
    this.setupEventListeners(domElements);
    this.updateAllUsageDisplays(domElements);
  }
}

// Make StorageUsageDisplay globally available
window.StorageUsageDisplay = StorageUsageDisplay; 