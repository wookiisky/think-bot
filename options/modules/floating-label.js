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
        const input = field.querySelector('input, textarea');
        const label = field.querySelector('.floating-label');
        
        if (!input || !label) return;

        // Check if input has value and apply appropriate class
        this.updateFloatingLabelState(field, input);

        // Add event listeners for this specific field
        this.addFieldEventListeners(field, input);
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
     * Add event listeners for a specific field
     * @param {HTMLElement} field - The floating label field container
     * @param {HTMLElement} input - The input element
     */
    addFieldEventListeners(field, input) {
        // Handle input changes
        input.addEventListener('input', () => {
            this.updateFloatingLabelState(field, input);
        });

        // Handle focus/blur events for better visual feedback
        input.addEventListener('focus', () => {
            field.classList.add('focused');
        });

        input.addEventListener('blur', () => {
            field.classList.remove('focused');
            this.updateFloatingLabelState(field, input);
        });

        // Handle autofill detection
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
        const input = field.querySelector('input, textarea');
        const label = field.querySelector('.floating-label');
        
        if (!input || !label) {
            console.warn('Floating label field is missing input or label:', field);
            return false;
        }

        // Check if input has proper placeholder
        if (!input.hasAttribute('placeholder')) {
            input.setAttribute('placeholder', ' ');
        }

        return true;
    }

    /**
     * Convert standard form-group to floating label field
     * @param {HTMLElement} formGroup - The form group element to convert
     * @returns {boolean} True if conversion was successful
     */
    convertFormGroupToFloatingLabel(formGroup) {
        const label = formGroup.querySelector('label');
        const input = formGroup.querySelector('input, textarea');
        
        if (!label || !input) return false;

        // Change container class
        formGroup.classList.remove('form-group');
        formGroup.classList.add('floating-label-field');

        // Update label
        label.classList.add('floating-label');

        // Update input
        input.setAttribute('placeholder', ' ');

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