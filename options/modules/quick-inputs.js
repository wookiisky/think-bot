// Quick Inputs Manager
// Handles quick input buttons management with drag-and-drop support

// Import confirmation dialog
import { confirmationDialog } from '../../js/modules/ui/confirmation-dialog.js';
import { i18n } from '../../js/modules/i18n.js';

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

    // Populate branch models for the newly added item
    const newItem = domElements.quickInputsContainer.querySelector('.quick-input-item:last-child');
    const modelManager = window.optionsPage?.modelManager;
    if (newItem && modelManager) {
      const allModels = modelManager.getAllModels();
      this.populateQuickInputBranchModels(newItem, allModels, []);
    }
    
    // Apply i18n translations to the newly added elements
    if (typeof i18n !== 'undefined' && i18n.applyToDOM) {
      i18n.applyToDOM();
    }
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
      const branchModelIds = this.getQuickInputBranchModelIds(item);
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
          branchModelIds: branchModelIds || [],
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
  static renderQuickInputs(quickInputs, domElements, modelManager = null) {
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

      // Set branch model selection
      if (input.branchModelIds && input.branchModelIds.length > 0 && modelManager) {
        const item = domElements.quickInputsContainer.querySelector(`.quick-input-item:last-child`);
        if (item) {
          const allModels = modelManager.getAllModels();
          this.populateQuickInputBranchModels(item, allModels, input.branchModelIds);
        }
      }
    });

    // Add an empty one if no active inputs exist
    if (activeInputsCount === 0) {
      this.addQuickInput(domElements);
    }

    // Populate branch models for all items after rendering
    if (modelManager) {
      const allModels = modelManager.getAllModels();
      const items = domElements.quickInputsContainer.querySelectorAll('.quick-input-item');
      items.forEach(item => {
        const currentIds = this.getQuickInputBranchModelIds(item);
        this.populateQuickInputBranchModels(item, allModels, currentIds);
      });
    }

    // Apply i18n translations to newly created DOM elements
    if (typeof i18n !== 'undefined' && i18n.applyToDOM) {
      i18n.applyToDOM();
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

  // Get branch model IDs from a quick input item
  static getQuickInputBranchModelIds(item) {
    const selectedItems = item.querySelector('.quick-input-selected-branch-models');
    if (!selectedItems) return [];
    
    const modelItems = selectedItems.querySelectorAll('.selected-model-item');
    return Array.from(modelItems).map(item => item.dataset.modelId).filter(Boolean);
  }

  // Populate branch model selector for a quick input item
  static populateQuickInputBranchModels(item, allModels, selectedIds = []) {
    const dropdown = item.querySelector('.quick-input-branch-models-dropdown');
    const selectedContainer = item.querySelector('.quick-input-selected-branch-models');
    
    if (!dropdown || !selectedContainer) return;

    // Clear existing options
    dropdown.innerHTML = '';
    
    // Add options for each model - filter out deleted and disabled models
    allModels.forEach(model => {
      if (!model.isDeleted && model.enabled) {
        const optionItem = document.createElement('div');
        optionItem.className = 'option-item';
        optionItem.dataset.value = model.id;
        optionItem.innerHTML = `<span class="option-text">${model.name || model.id}</span>`;
        dropdown.appendChild(optionItem);
      }
    });

    // Update selected items display
    this.updateQuickInputBranchModelSelection(item, allModels, selectedIds);
  }

  // Update the selected branch models display for a quick input item
  static updateQuickInputBranchModelSelection(item, allModels, selectedIds) {
    const selectedContainer = item.querySelector('.quick-input-selected-branch-models');
    if (!selectedContainer || !Array.isArray(selectedIds)) return;

    if (selectedIds.length === 0) {
      selectedContainer.innerHTML = '<span class="no-models-selected"></span>';
      return;
    }

    // Find the model objects for selected IDs and filter out deleted models
    const selectedModels = selectedIds.map(id => 
      allModels.find(model => model.id === id)
    ).filter(model => model && !model.isDeleted);

    // Render selected models
    const selectedItemsHtml = selectedModels.map(model => `
      <span class="selected-model-item" data-model-id="${model.id}">
        <span class="model-name">${model.name || model.id}</span>
        <span class="model-remove-icon" data-model-id="${model.id}">
          <i class="material-icons">close</i>
        </span>
      </span>
    `).join('');

    selectedContainer.innerHTML = selectedItemsHtml;

    // Update floating label state
    const multiSelectField = selectedContainer.closest('.floating-label-field');
    if (multiSelectField && window.floatingLabelManager) {
      const customMultiSelect = multiSelectField.querySelector('.custom-multi-select');
      if (customMultiSelect) {
        window.floatingLabelManager.updateCustomMultiSelectState(multiSelectField, customMultiSelect);
      }
    }
  }

  // Toggle branch model selection for a quick input item
  static toggleQuickInputBranchModelSelection(item, modelId) {
    const currentIds = this.getQuickInputBranchModelIds(item);
    const isSelected = currentIds.includes(modelId);
    
    let newIds;
    if (isSelected) {
      newIds = currentIds.filter(id => id !== modelId);
    } else {
      newIds = [...currentIds, modelId];
    }
    
    // Get all models for display update
    const modelManager = window.optionsPage?.modelManager;
    if (modelManager) {
      const allModels = modelManager.getAllModels();
      this.updateQuickInputBranchModelSelection(item, allModels, newIds);
    }
    
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  // Toggle dropdown visibility for a quick input item
  static toggleQuickInputBranchModelDropdown(item) {
    const dropdown = item.querySelector('.quick-input-branch-models-dropdown');
    const toggle = item.querySelector('.quick-input-branch-models-toggle');
    const multiSelect = item.querySelector('.quick-input-branch-models');

    if (!dropdown || !toggle || !multiSelect) return;

    const isOpen = dropdown.classList.contains('open');
    
    // Close all other quick input dropdowns first
    const allDropdowns = document.querySelectorAll('.quick-input-branch-models-dropdown');
    const allToggles = document.querySelectorAll('.quick-input-branch-models-toggle');
    const allMultiSelects = document.querySelectorAll('.quick-input-branch-models');
    
    allDropdowns.forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
    allToggles.forEach(t => {
      if (t !== toggle) t.classList.remove('open');
    });
    allMultiSelects.forEach(ms => {
      if (ms !== multiSelect) ms.classList.remove('dropdown-open');
    });
    
    if (isOpen) {
      dropdown.classList.remove('open');
      toggle.classList.remove('open');
      multiSelect.classList.remove('dropdown-open');
    } else {
      dropdown.classList.add('open');
      toggle.classList.add('open');
      multiSelect.classList.add('dropdown-open');
    }
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
        e.stopPropagation(); // Prevent event bubbling to avoid immediate dialog dismissal
        const removeBtn = e.target.closest('.remove-quick-input-btn');
        const item = e.target.closest('.quick-input-item');
        if (item) {
          // Get the display text for the confirmation message
          const displayText = item.querySelector('.quick-input-display').value.trim() || i18n.getMessage('options_quick_input_default_name');
          
          confirmationDialog.confirmDelete({
            target: removeBtn,
            message: i18n.getMessage('common_confirm_delete_message') || 
                     'Are you sure you want to delete this item?',
            confirmText: i18n.getMessage('common_delete'),
            cancelText: i18n.getMessage('common_cancel'),
            onConfirm: () => {
              console.log(`Removing quick input: ${displayText}`);
              this.removeQuickInput(item);
              if (this.changeCallback) {
                this.changeCallback();
              }
            }
          });
        }
      }
    });

    // Branch model dropdown events
    domElements.quickInputsContainer.addEventListener('click', e => {
      const item = e.target.closest('.quick-input-item');
      if (!item) return;

      // Toggle dropdown
      if (e.target.closest('.quick-input-branch-models-toggle')) {
        e.preventDefault();
        this.toggleQuickInputBranchModelDropdown(item);
      }
      // Click on selected items area to toggle dropdown
      else if (e.target.closest('.quick-input-selected-branch-models') && !e.target.closest('.model-remove-icon')) {
        e.preventDefault();
        this.toggleQuickInputBranchModelDropdown(item);
      }
      // Handle option selection
      else if (e.target.closest('.quick-input-branch-models-dropdown .option-item')) {
        e.preventDefault();
        const optionItem = e.target.closest('.option-item');
        const modelId = optionItem.dataset.value;
        this.toggleQuickInputBranchModelSelection(item, modelId);
      }
      // Handle selected model removal
      else if (e.target.closest('.quick-input-selected-branch-models .model-remove-icon')) {
        e.preventDefault();
        const removeIcon = e.target.closest('.model-remove-icon');
        const modelId = removeIcon.dataset.modelId;
        this.toggleQuickInputBranchModelSelection(item, modelId);
      }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.quick-input-branch-models')) {
        const openDropdowns = document.querySelectorAll('.quick-input-branch-models-dropdown.open');
        const openToggles = document.querySelectorAll('.quick-input-branch-models-toggle.open');
        const openMultiSelects = document.querySelectorAll('.quick-input-branch-models.dropdown-open');
        
        openDropdowns.forEach(dropdown => dropdown.classList.remove('open'));
        openToggles.forEach(toggle => toggle.classList.remove('open'));
        openMultiSelects.forEach(multiSelect => multiSelect.classList.remove('dropdown-open'));
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