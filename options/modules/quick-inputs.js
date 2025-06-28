// Quick Inputs Manager
// Handles quick input buttons management with drag-and-drop support

export class QuickInputsManager {
  
  static changeCallback = null;
  static _storageUpdateTimeout = null;
  
  /**
   * Generate a UUID-based unique ID with timestamp for quick input tabs
   * Combines timestamp with UUID v4 format for better uniqueness and traceability
   * @returns {string} UUID-based ID string with timestamp prefix
   */
  static generateRandomId() {
    // Generate timestamp component
    const timestamp = Date.now().toString(36);

    // Generate UUID v4 format
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    // Combine timestamp with UUID for better traceability
    return `qi_${timestamp}_${uuid}`;
  }
  
  // Add a new quick input
  static addQuickInput(domElements, displayText = '', sendText = '', id = null) {
    // Clone the template
    const template = domElements.quickInputTemplate.content.cloneNode(true);
    
    // Set values if provided
    if (displayText) {
      template.querySelector('.quick-input-display').value = displayText;
    }
    
    if (sendText) {
      template.querySelector('.quick-input-send').value = sendText;
    }
    
    // Store ID in a hidden input for persistence
    const hiddenIdInput = document.createElement('input');
    hiddenIdInput.type = 'hidden';
    hiddenIdInput.className = 'quick-input-id';
    hiddenIdInput.value = id || this.generateRandomId();
    template.querySelector('.quick-input-item').appendChild(hiddenIdInput);
    
    // Initialize storage status for empty items
    const storageStatus = template.querySelector('.storage-status');
    if (storageStatus && !displayText && !sendText) {
      storageStatus.textContent = '0%';
      storageStatus.setAttribute('data-tooltip', 'Storage usage: 0B / 8KB (0%)');
      storageStatus.removeAttribute('title');
      storageStatus.className = 'storage-status storage-low';
    }
    
    // Add to container
    domElements.quickInputsContainer.appendChild(template);
    
    // Update storage usage display for the new item
    if (typeof StorageUsageDisplay !== 'undefined') {
      setTimeout(() => StorageUsageDisplay.updateAllUsageDisplays(domElements), 100);
    }
  }
  
  // Remove a quick input
  static removeQuickInput(item) {
    item.remove();
  }
  
  // Get all quick inputs as an array (ensuring IDs are preserved)
  static getQuickInputs(domElements) {
    const items = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    const quickInputs = [];
    
    items.forEach(item => {
      const displayText = item.querySelector('.quick-input-display').value.trim();
      const sendText = item.querySelector('.quick-input-send').value.trim();
      const idInput = item.querySelector('.quick-input-id');
      const autoTriggerCheckbox = item.querySelector('.auto-trigger-checkbox');
      
      if (displayText && sendText) {
        const id = idInput ? idInput.value : this.generateRandomId();

        // Get auto-trigger setting directly from the checkbox in this item
        const autoTriggerEnabled = autoTriggerCheckbox ? autoTriggerCheckbox.checked : false;

        quickInputs.push({
          id,
          displayText,
          sendText,
          autoTrigger: autoTriggerEnabled
          // Note: lastModified timestamp will be calculated during save by comparing with old config
        });
      }
    });
    
    return quickInputs;
  }
  
  // Get auto-trigger state from the quick input item directly
  static getAutoTriggerState(quickInputId, domElements) {
    const items = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    for (const item of items) {
      const idInput = item.querySelector('.quick-input-id');
      const currentId = idInput ? idInput.value : null;
      if (currentId === quickInputId) {
        const checkbox = item.querySelector('.auto-trigger-checkbox');
        return checkbox ? checkbox.checked : false;
      }
    }
    return false;
  }
  
  // Set auto-trigger state in the quick input item directly
  static setAutoTriggerState(quickInputId, state, domElements) {
    const items = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    for (const item of items) {
      const idInput = item.querySelector('.quick-input-id');
      const currentId = idInput ? idInput.value : null;
      if (currentId === quickInputId) {
        const checkbox = item.querySelector('.auto-trigger-checkbox');
        if (checkbox) {
          checkbox.checked = state;
        }
        break;
      }
    }
  }
  
  // Get quick inputs data for switches (simpler version without validation)
  static getQuickInputsForSwitches(domElements) {
    const items = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    const quickInputs = [];
    
    items.forEach(item => {
      const displayText = item.querySelector('.quick-input-display').value.trim();
      const idInput = item.querySelector('.quick-input-id');
      const autoTriggerCheckbox = item.querySelector('.auto-trigger-checkbox');
      
      if (displayText) {
        const id = idInput ? idInput.value : this.generateRandomId();
        
        quickInputs.push({
          id,
          displayText,
          autoTrigger: autoTriggerCheckbox ? autoTriggerCheckbox.checked : false
        });
      }
    });
    
    return quickInputs;
  }
  
  // Render quick inputs from config (preserving existing IDs)
  static renderQuickInputs(quickInputs, domElements) {
    // Clear existing quick inputs
    domElements.quickInputsContainer.innerHTML = '';
    
    // Add each quick input (they should already have IDs from storage)
    quickInputs.forEach(input => {
      // Ensure ID exists for backward compatibility
      const id = input.id || this.generateRandomId();
      this.addQuickInput(domElements, input.displayText, input.sendText, id);
      
      // Set auto-trigger state immediately after adding the input
      this.setAutoTriggerState(id, input.autoTrigger || false, domElements);
    });
    
    // Add an empty one if none exist
    if (quickInputs.length === 0) {
      this.addQuickInput(domElements);
    }
    
    // Update storage usage display for all items
    if (typeof StorageUsageDisplay !== 'undefined') {
      setTimeout(() => StorageUsageDisplay.updateAllUsageDisplays(domElements), 100);
    }
  }
  
  // Set up drag-and-drop functionality using SortableJS
  static initializeSortable(domElements) {
    const container = domElements.quickInputsContainer;
    if (!container) return;

    new Sortable(container, {
      animation: 150, // ms, animation speed moving items when sorting
      handle: '.drag-handle', // Drag handle selector within list items
      onEnd: () => {
        // Trigger change callback to mark as unsaved
        if (this.changeCallback) {
          this.changeCallback();
        }
      }
    });
  }

  // Set up all event listeners for the quick inputs section
  static setupEventListeners(domElements, changeCallback = null) {
    // Store the change callback for use in other methods
    this.changeCallback = changeCallback;
    
    // Add quick input button
    domElements.addQuickInputBtn.addEventListener('click', () => {
      this.addQuickInput(domElements);
      if (this.changeCallback) {
        this.changeCallback();
      }
    });
    
    // Quick input remove button delegation
    domElements.quickInputsContainer.addEventListener('click', e => {
      if (e.target.closest('.remove-quick-input-btn')) {
        const item = e.target.closest('.quick-input-item');
        if (item) {
          this.removeQuickInput(item);
          if (this.changeCallback) {
            this.changeCallback();
          }
        }
      }
    });
    
    // Add event listeners for input fields to trigger change callback
    domElements.quickInputsContainer.addEventListener('input', e => {
      if (
        e.target.classList.contains('quick-input-display') ||
        e.target.classList.contains('quick-input-send') ||
        e.target.classList.contains('auto-trigger-checkbox')
      ) {
        if (this.changeCallback) {
          this.changeCallback();
        }
      }
    });
  }
} 