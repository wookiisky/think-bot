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
    
    
    // Add to container
    domElements.quickInputsContainer.appendChild(template);
    
  }
  
  // Remove a quick input (soft delete)
  static removeQuickInput(item) {
    // Mark as deleted for data collection and hide from view
    item.dataset.deleted = 'true';
    item.style.display = 'none';
  }
  
  // Get all quick inputs as an array (ensuring IDs are preserved and soft deletes are handled)
  static getQuickInputs(domElements) {
    const items = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
    const quickInputs = [];

    items.forEach(item => {
      const displayText = item.querySelector('.quick-input-display').value.trim();
      const sendText = item.querySelector('.quick-input-send').value.trim();
      const idInput = item.querySelector('.quick-input-id');
      const autoTriggerCheckbox = item.querySelector('.auto-trigger-checkbox');
      const isDeleted = item.dataset.deleted === 'true';
      const id = idInput ? idInput.value : this.generateRandomId();

      // For deleted items, we only need the ID and the deleted flag.
      // For active items, they must have display and send text.
      if (isDeleted) {
        quickInputs.push({
          id,
          isDeleted: true
          // other fields are irrelevant
        });
      } else if (displayText && sendText) {
        const autoTriggerEnabled = autoTriggerCheckbox ? autoTriggerCheckbox.checked : false;
        quickInputs.push({
          id,
          displayText,
          sendText,
          autoTrigger: autoTriggerEnabled,
          isDeleted: false
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
  
  // Render quick inputs from config (preserving existing IDs and handling soft deletes)
  static renderQuickInputs(quickInputs, domElements) {
    // Clear existing quick inputs
    domElements.quickInputsContainer.innerHTML = '';

    let activeInputsCount = 0;
    // Add each quick input (they should already have IDs from storage)
    quickInputs.forEach(input => {
      // Skip rendering for items marked as deleted
      if (input.isDeleted) {
        return;
      }
      
      activeInputsCount++;
      // Ensure ID exists for backward compatibility
      const id = input.id || this.generateRandomId();
      this.addQuickInput(domElements, input.displayText, input.sendText, id);

      // Set auto-trigger state immediately after adding the input
      this.setAutoTriggerState(id, input.autoTrigger || false, domElements);
    });

    // Add an empty one if no active inputs exist
    if (activeInputsCount === 0) {
      this.addQuickInput(domElements);
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