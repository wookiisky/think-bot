// Model Selector Manager
// Handles the model selection dropdown in the sidebar

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('ModelSelector') : console;

export class ModelSelector {
  constructor() {
    this.selector = document.getElementById('modelSelector');
    this.models = [];
    this.currentModelId = null;
    this.init();
  }

  // Initialize the model selector
  async init() {
    // Load available models from configuration
    await this.loadModels();
    
    // Set up event listeners
    this.setupEventListeners();
  }

  // Load available models from configuration
  async loadModels() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CONFIG'
      });
      
      if (response && response.type === 'CONFIG_LOADED') {
        const config = response.config;
        // Support both old and new config formats
        const llmConfig = config.llm_models || config.llm;
        this.models = llmConfig?.models?.filter(model => model.enabled) || [];
        this.currentModelId = llmConfig?.defaultModelId || (this.models[0]?.id);
        
        this.renderModelOptions();
        logger.info(`Loaded ${this.models.length} available models`);
      } else {
        logger.error('Failed to load configuration');
        this.showError('Failed to load model configuration');
      }
    } catch (error) {
      logger.error('Error loading models:', error);
      this.showError('Error loading models');
    }
  }

  // Render model options in the selector
  renderModelOptions() {
    if (!this.selector) {
      logger.warn('Model selector element not found');
      return;
    }

    // Clear existing options
    this.selector.innerHTML = '';

    if (this.models.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No models configured';
      option.disabled = true;
      this.selector.appendChild(option);
      this.selector.disabled = true;
      return;
    }

    // Add model options
    this.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name || `${model.provider} - ${model.model}`;
      this.selector.appendChild(option);
    });

    // Set current selection
    if (this.currentModelId) {
      this.selector.value = this.currentModelId;
    }

    this.selector.disabled = false;
  }

  // Set up event listeners
  setupEventListeners() {
    if (!this.selector) return;

    this.selector.addEventListener('change', (e) => {
      this.currentModelId = e.target.value;
      logger.info(`Model selection changed to: ${this.currentModelId}`);
      
      // Notify other components about model change
      this.notifyModelChange();
    });
  }

  // Notify other components about model change
  notifyModelChange() {
    const event = new CustomEvent('modelChanged', {
      detail: {
        modelId: this.currentModelId,
        model: this.getSelectedModel()
      }
    });
    
    document.dispatchEvent(event);
  }

  // Get the currently selected model
  getSelectedModel() {
    return this.models.find(model => model.id === this.currentModelId) || null;
  }

  // Get the current model ID
  getCurrentModelId() {
    return this.currentModelId;
  }

  // Set the current model
  setCurrentModel(modelId) {
    if (this.models.some(model => model.id === modelId)) {
      this.currentModelId = modelId;
      if (this.selector) {
        this.selector.value = modelId;
      }
      this.notifyModelChange();
    } else {
      logger.warn(`Model not found: ${modelId}`);
    }
  }

  // Refresh models (called when configuration changes)
  async refresh() {
    await this.loadModels();
  }

  // Show error message
  showError(message) {
    if (!this.selector) return;
    
    this.selector.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = message;
    option.disabled = true;
    this.selector.appendChild(option);
    this.selector.disabled = true;
    
    logger.error(`Model selector error: ${message}`);
  }

  // Get all available models
  getAvailableModels() {
    return this.models;
  }

  // Check if a model is available
  isModelAvailable(modelId) {
    return this.models.some(model => model.id === modelId);
  }
} 