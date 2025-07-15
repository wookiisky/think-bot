/**
 * Floating Label Management for Input Fields
 * Handles the floating label effect for input and textarea elements
 */

class FloatingLabelManager {
    constructor() {
        this.init();
    }

    init() {
        // Initialize floating labels for existing fields
        this.initFloatingLabels();
        
        // Set up event listeners for dynamic content updates
        this.setupEventListeners();
    }

    /**
     * Initialize floating labels for all floating-label-field elements
     */
    initFloatingLabels() {
        const floatingLabelFields = document.querySelectorAll('.floating-label-field');
        floatingLabelFields.forEach(field => {
            this.processFloatingLabelField(field);
        });
    }

    /**
     * Process a single floating label field
     * @param {HTMLElement} field - The floating label field container
     */
    processFloatingLabelField(field) {
        const input = field.querySelector('input, textarea, select');
        const customMultiSelect = field.querySelector('.custom-multi-select');
        const label = field.querySelector('.floating-label');
        
        if (!label) return;
        
        // Handle standard inputs and custom multi-select
        if (input) {
            // Check if input has value and apply appropriate class
            this.updateFloatingLabelState(field, input);
            // Add event listeners for this specific field
            this.addFieldEventListeners(field, input);
        } else if (customMultiSelect) {
            // Handle custom multi-select component
            this.updateCustomMultiSelectState(field, customMultiSelect);
            this.addCustomMultiSelectEventListeners(field, customMultiSelect);
        }
    }

    /**
     * Update floating label state based on input value
     * @param {HTMLElement} field - The floating label field container
     * @param {HTMLElement} input - The input element
     */
    updateFloatingLabelState(field, input) {
        const hasValue = input.value.trim() !== '';
        
        if (hasValue) {
            field.classList.add('has-value');
        } else {
            field.classList.remove('has-value');
        }
    }

    /**
     * Update floating label state for custom multi-select component
     * @param {HTMLElement} field - The floating label field container
     * @param {HTMLElement} customMultiSelect - The custom multi-select element
     */
    updateCustomMultiSelectState(field, customMultiSelect) {
        const selectedItems = customMultiSelect.querySelector('.selected-items');
        const noToolsSelected = selectedItems && selectedItems.querySelector('.no-tools-selected');
        const hasSelectedTools = selectedItems && !noToolsSelected && selectedItems.children.length > 0;
        
        if (hasSelectedTools) {
            field.classList.add('has-value');
            console.log('FloatingLabel: Added has-value to custom multi-select field');
        } else {
            field.classList.remove('has-value');
            console.log('FloatingLabel: Removed has-value from custom multi-select field');
        }
    }

    /**
     * Add event listeners for a specific field
     * @param {HTMLElement} field - The floating label field container
     * @param {HTMLElement} input - The input element
     */
    addFieldEventListeners(field, input) {
        // Handle input changes
        input.addEventListener('input', () => {
            this.updateFloatingLabelState(field, input);
        });

        // Handle select changes
        if (input.tagName === 'SELECT') {
            input.addEventListener('change', () => {
                this.updateFloatingLabelState(field, input);
            });
        }

        // Handle focus/blur events for better visual feedback
        input.addEventListener('focus', () => {
            field.classList.add('focused');
        });

        input.addEventListener('blur', () => {
            field.classList.remove('focused');
            this.updateFloatingLabelState(field, input);
        });

        // Handle autofill detection (not applicable for select elements)
        if (input.tagName !== 'SELECT') {
            input.addEventListener('animationstart', (e) => {
                if (e.animationName === 'autofill') {
                    this.updateFloatingLabelState(field, input);
                }
            });

            // Additional check for autofill state
            const checkAutofill = () => {
                if (input.matches(':-webkit-autofill') || input.value !== '') {
                    this.updateFloatingLabelState(field, input);
                }
            };

            // Check autofill periodically (for browsers that don't support animationstart)
            setTimeout(checkAutofill, 100);
            setTimeout(checkAutofill, 500);
        }
    }

    /**
     * Add event listeners for custom multi-select component
     * @param {HTMLElement} field - The floating label field container
     * @param {HTMLElement} customMultiSelect - The custom multi-select element
     */
    addCustomMultiSelectEventListeners(field, customMultiSelect) {
        // Monitor changes to the selected items container
        const selectedItems = customMultiSelect.querySelector('.selected-items');
        if (selectedItems) {
            // Use MutationObserver to watch for changes in selected items
            const observer = new MutationObserver(() => {
                this.updateCustomMultiSelectState(field, customMultiSelect);
            });

            observer.observe(selectedItems, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // Store the observer so we can disconnect it later if needed
            if (!customMultiSelect._floatingLabelObserver) {
                customMultiSelect._floatingLabelObserver = observer;
            }
        }

        // Handle focus/blur events for better visual feedback
        customMultiSelect.addEventListener('focusin', () => {
            field.classList.add('focused');
        });

        customMultiSelect.addEventListener('focusout', () => {
            field.classList.remove('focused');
            this.updateCustomMultiSelectState(field, customMultiSelect);
        });

        // Handle click events that might change selection state
        customMultiSelect.addEventListener('click', () => {
            // Delay the state update to ensure DOM changes have been applied
            setTimeout(() => {
                this.updateCustomMultiSelectState(field, customMultiSelect);
            }, 10);
        });
    }

    /**
     * Set up global event listeners for dynamic content updates
     */
    setupEventListeners() {
        // Listen for dynamically added elements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        // Check if the added node is a floating label field
                        if (node.classList && node.classList.contains('floating-label-field')) {
                            this.processFloatingLabelField(node);
                        }
                        // Check if the added node contains floating label fields
                        const floatingLabelFields = node.querySelectorAll && node.querySelectorAll('.floating-label-field');
                        if (floatingLabelFields) {
                            floatingLabelFields.forEach(field => {
                                this.processFloatingLabelField(field);
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Refresh all floating labels (useful after external form updates)
     */
    refresh() {
        this.initFloatingLabels();
    }

    /**
     * Get all floating label fields
     * @returns {NodeList} All floating label field elements
     */
    getFloatingLabelFields() {
        return document.querySelectorAll('.floating-label-field');
    }

    /**
     * Validate floating label field structure
     * @param {HTMLElement} field - The floating label field container
     * @returns {boolean} True if field structure is valid
     */
    validateFieldStructure(field) {
        const input = field.querySelector('input, textarea, select');
        const customMultiSelect = field.querySelector('.custom-multi-select');
        const label = field.querySelector('.floating-label');
        
        if ((!input && !customMultiSelect) || !label) {
            console.warn('Floating label field is missing input/custom-multi-select or label:', field);
            return false;
        }

        // Floating labels work without placeholder attributes

        return true;
    }

    /**
     * Convert standard form-group to floating label field
     * @param {HTMLElement} formGroup - The form group element to convert
     * @returns {boolean} True if conversion was successful
     */
    convertFormGroupToFloatingLabel(formGroup) {
        const label = formGroup.querySelector('label');
        const input = formGroup.querySelector('input, textarea, select');
        
        if (!label || !input) return false;

        // Change container class
        formGroup.classList.remove('form-group');
        formGroup.classList.add('floating-label-field');

        // Update label
        label.classList.add('floating-label');

        // Floating labels work without placeholder attributes

        // Move label after input (required for CSS sibling selectors)
        if (input.nextSibling !== label) {
            input.parentNode.insertBefore(label, input.nextSibling);
        }

        // Process the converted field
        this.processFloatingLabelField(formGroup);

        return true;
    }
}

// Initialize floating label manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.floatingLabelManager = new FloatingLabelManager();
});

// Export for use in other modules
export default FloatingLabelManager; 