// Model Manager
// Handles multiple LLM model configurations with drag-and-drop support

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('ModelManager') : console;

export class ModelManager {
  constructor(domElements, changeCallback = null) {
    this.domElements = domElements;
    this.models = [];
    this.changeCallback = changeCallback;
  }

  // Initialize model configurations
  init(config, changeCallback = null) {
    // Support both old and new config formats
    const llmConfig = config.llm_models || config.llm;
    this.models = llmConfig?.models || [];

    // Store config reference for accessing defaultModelId from basic config
    this.config = config;

    // Ensure all models have lastModified timestamp for sync merging
    this.models.forEach(model => {
      if (!model.lastModified) {
        model.lastModified = Date.now();
        logger.debug(`Added lastModified timestamp to model: ${model.id}`);
      }
    });

    if (changeCallback) {
      this.changeCallback = changeCallback;
    }
    this.renderModels();
    this.updateDefaultModelSelector();
  }

  // Render all model configurations
  renderModels() {
    const container = this.domElements.modelsContainer;
    container.innerHTML = '';

    this.models.forEach((model, index) => {
      const modelElement = this.createModelElement(model, index);
      container.appendChild(modelElement);
    });

    // Setup event listeners for the newly created elements
    this.setupModelEventListeners();
    
    // Setup the inline add button event listener
    this.setupAddButtonListener();
  }

  // Create a single model configuration element
  createModelElement(model, index) {
    const div = document.createElement('div');
    div.className = `model-config-item ${!model.enabled ? 'disabled' : ''}`;
    div.dataset.index = index;

    // Create card layout with header and form content
    div.innerHTML = `
      <div class="model-card-header">
        <div class="drag-handle-column">
          <div class="drag-handle">
            <i class="material-icons">drag_indicator</i>
          </div>
        </div>
        <div class="model-actions-column">
          <label class="toggle-switch">
            <input type="checkbox" ${model.enabled ? 'checked' : ''}
                   data-model-index="${index}" class="model-toggle">
            <span class="slider round"></span>
          </label>
          <button type="button" class="remove-model-btn icon-btn"
                  data-model-index="${index}" data-i18n-title="options_model_remove_button_title" title="Remove Model">
            <i class="material-icons">delete</i>
          </button>
        </div>
      </div>
      <div class="model-details-column">
        <div class="model-form">
          <div class="form-grid">
            <div class="form-group">
              <label data-i18n="options_model_display_name_label">Display Name</label>
              <input type="text" class="model-name-input" value="${model.name || ''}"
                     data-model-index="${index}" data-field="name">
            </div>
            <div class="form-group">
              <label data-i18n="options_model_provider_label">Provider</label>
              <select class="model-provider-select"
                      data-model-index="${index}">
                <option value="openai" ${model.provider === 'openai' ? 'selected' : ''} data-i18n="options_model_provider_openai">OpenAI Compatible</option>
                <option value="gemini" ${model.provider === 'gemini' ? 'selected' : ''} data-i18n="options_model_provider_gemini">Google Gemini</option>
              </select>
            </div>
          </div>
          <div class="form-grid model-specific-fields" id="model-specific-${index}">
            ${this.renderModelSpecificFields(model, index)}
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label data-i18n="options_model_max_tokens_label">Max Tokens</label>
              <input type="number" class="model-max-tokens" value="${model.maxTokens || 2048}"
                     data-model-index="${index}" data-field="maxTokens"
                     data-i18n-placeholder="options_model_max_tokens_placeholder" placeholder="e.g., 2048" min="1" max="100000">
            </div>
            <div class="form-group">
              <label data-i18n="options_model_temperature_label">Temperature</label>
              <input type="number" class="model-temperature" value="${model.temperature || 0.7}"
                     data-model-index="${index}" data-field="temperature"
                     data-i18n-placeholder="options_model_temperature_placeholder" placeholder="0.0 - 1.0" min="0" max="1" step="0.1">
            </div>
          </div>
        </div>
      </div>
    `;
    return div;
  }

  // Render model-specific fields
  renderModelSpecificFields(model, index) {
    if (model.provider === 'openai') {
      return `
        <div class="form-group">
          <label data-i18n="options_model_base_url_label">Base URL</label>
          <input type="text" class="model-base-url" value="${model.baseUrl || 'https://api.openai.com'}"
                 data-model-index="${index}" data-field="baseUrl">
        </div>
        <div class="form-group">
          <label data-i18n="options_model_api_key_label">API Key</label>
          <input type="password" class="model-api-key" value="${model.apiKey || ''}"
                 data-model-index="${index}" data-field="apiKey">
        </div>
        <div class="form-group">
          <label data-i18n="options_model_model_label">Model</label>
          <input type="text" class="model-model" value="${model.model || 'gpt-3.5-turbo'}"
                 data-model-index="${index}" data-field="model">
        </div>
      `;
    } else if (model.provider === 'gemini') {
      return `
        <div class="form-group">
          <label data-i18n="options_model_base_url_label">Base URL</label>
          <input type="text" class="model-base-url" value="${model.baseUrl || 'https://generativelanguage.googleapis.com'}"
                 data-model-index="${index}" data-field="baseUrl">
        </div>
        <div class="form-group">
          <label data-i18n="options_model_api_key_label">API Key</label>
          <input type="password" class="model-api-key" value="${model.apiKey || ''}"
                 data-model-index="${index}" data-field="apiKey">
        </div>
        <div class="form-group">
          <label data-i18n="options_model_model_label">Model</label>
          <input type="text" class="model-model" value="${model.model || 'gemini-pro'}"
                 data-model-index="${index}" data-field="model">
        </div>
      `;
    }
    return '';
  }

  // Setup inline add button event listener
  setupAddButtonListener() {
    const addButton = document.getElementById('addModelBtn');
    if (addButton) {
      // Remove any existing event listeners to avoid duplicates
      const newAddButton = addButton.cloneNode(true);
      addButton.parentNode.replaceChild(newAddButton, addButton);
      newAddButton.addEventListener('click', () => this.addNewModel());
    }
  }

  // Add a new model configuration
  addNewModel() {
    // Generate UUID-based model ID with timestamp
    const timestamp = Date.now().toString(36);
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    const newModel = {
      id: `model_${timestamp}_${uuid}`,
      name: i18n.getMessage('options_model_new_name', [this.models.length + 1]),
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-3.5-turbo',
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true,
      lastModified: Date.now() // Add timestamp for sync merging
    };

    this.models.push(newModel);
    this.renderModels();
    this.updateDefaultModelSelector();
    logger.info('Added new model');
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  // Remove a model configuration
  removeModel(index) {
    if (confirm(i18n.getMessage('options_model_remove_confirm'))) {
      this.models.splice(index, 1);
      this.renderModels();
      this.updateDefaultModelSelector();
      logger.info(`Removed model at index ${index}`);
      if (this.changeCallback) {
        this.changeCallback();
      }
    }
  }

  // Toggle model enabled state
  toggleModel(index, enabled) {
    // Only update timestamp if the value actually changed
    if (this.models[index].enabled !== enabled) {
      this.models[index].enabled = enabled;
      this.models[index].lastModified = Date.now(); // Update timestamp for sync merging
      this.renderModels();
      this.updateDefaultModelSelector();
      logger.info(`Toggled model ${index}: ${enabled}`);
      if (this.changeCallback) {
        this.changeCallback();
      }
    }
  }

  // Update a model field
  updateModelField(index, field, value) {
    if (this.models[index]) {
      // Only update timestamp if the value actually changed
      const oldValue = this.models[index][field];
      if (oldValue !== value) {
        this.models[index][field] = value;
        this.models[index].lastModified = Date.now(); // Update timestamp for sync merging

        if (field === 'name') {
          this.updateDefaultModelSelector();
        }
        logger.info(`Updated model ${index} field ${field}: ${value}`);
        if (this.changeCallback) {
          this.changeCallback();
        }
      }
    }
  }

  // Update model provider and re-render specific fields
  updateModelProvider(index, provider) {
    // Only update timestamp if the provider actually changed
    if (this.models[index].provider !== provider) {
      this.models[index].provider = provider;
      this.models[index].lastModified = Date.now(); // Update timestamp for sync merging

      // Set default values for the new provider
      if (provider === 'openai') {
        this.models[index].baseUrl = this.models[index].baseUrl || 'https://api.openai.com';
        this.models[index].model = this.models[index].model || 'gpt-3.5-turbo';
      } else if (provider === 'gemini') {
        this.models[index].baseUrl = this.models[index].baseUrl || 'https://generativelanguage.googleapis.com';
        this.models[index].model = this.models[index].model || 'gemini-pro';
      }

      this.models[index].maxTokens = this.models[index].maxTokens || 2048;
      this.models[index].temperature = this.models[index].temperature !== undefined ? this.models[index].temperature : 0.7;

      this.renderModels();
      logger.info(`Updated model ${index} provider: ${provider}`);
      if (this.changeCallback) {
        this.changeCallback();
      }
    }
  }

  // Check if a model has all required fields filled
  isModelComplete(model) {
    if (!model.name || !model.apiKey || !model.model || !model.baseUrl) {
      return false;
    }
    return true;
  }
  
  // Get all models that are enabled and have complete configurations
  getCompleteModels() {
    return this.models.filter(model => model.enabled && this.isModelComplete(model));
  }

  // Get all models (including incomplete ones) with timestamps preserved
  getAllModels() {
    return this.models.map(model => ({ ...model })); // Return a copy to avoid mutations
  }

  // Update the default model selector
  updateDefaultModelSelector() {
    const select = this.domElements.defaultModelSelect;
    const completeModels = this.getCompleteModels();

    // Get current value from config or DOM to preserve selection
    // Priority: config.basic.defaultModelId > current DOM value
    const configDefaultModelId = this.config?.basic?.defaultModelId ||
                                 this.config?.llm_models?.defaultModelId ||
                                 this.config?.llm?.defaultModelId;
    const currentValue = configDefaultModelId || select.value;

    // Clear existing options
    select.innerHTML = '';

    // Add a placeholder if no models are configured
    if (completeModels.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = i18n.getMessage('options_model_no_models_configured');
      select.appendChild(option);
      return;
    }

    // Add an option for each complete model
    completeModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      select.appendChild(option);
    });

    // Restore previous selection if possible
    if (completeModels.some(m => m.id === currentValue)) {
      select.value = currentValue;
    } else if (currentValue && completeModels.length > 0) {
      // If the previously selected model is no longer available,
      // select the first available model and mark as changed
      select.value = completeModels[0].id;
      if (this.changeCallback) {
        this.changeCallback();
      }
    }
  }

  // Setup all event listeners for model configurations
  setupModelEventListeners() {
    const container = this.domElements.modelsContainer;

    container.addEventListener('click', (e) => {
      const target = e.target;
      const modelItem = target.closest('.model-config-item');
      if (!modelItem) return;

      const index = parseInt(modelItem.dataset.index, 10);

      if (target.classList.contains('remove-model-btn') || target.closest('.remove-model-btn')) {
        this.removeModel(index);
      } else if (target.classList.contains('model-toggle')) {
        this.toggleModel(index, target.checked);
      }
    });

    container.addEventListener('input', (e) => {
      const target = e.target;
      const modelItem = target.closest('.model-config-item');
      if (!modelItem) return;
      
      const index = parseInt(modelItem.dataset.index, 10);
      const field = target.dataset.field;
      let value = target.value;
      
      if (target.type === 'number') {
        value = parseFloat(value);
      }
      
      if (field) {
        this.updateModelField(index, field, value);
      }
    });

    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('model-provider-select')) {
        const modelItem = e.target.closest('.model-config-item');
        if (modelItem) {
          const index = parseInt(modelItem.dataset.index, 10);
          this.updateModelProvider(index, e.target.value);
        }
      }
    });
  }

  // Initialize SortableJS for drag and drop
  initializeSortable() {
    const container = this.domElements.modelsContainer;
    if (!container) return;

    new Sortable(container, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: (evt) => {
        // Reorder the internal models array
        const movedItem = this.models.splice(evt.oldIndex, 1)[0];
        this.models.splice(evt.newIndex, 0, movedItem);

        // Re-render to update data attributes and event listeners
        this.renderModels();

        // Notify that changes have been made
        if (this.changeCallback) {
          this.changeCallback();
        }
      },
    });
  }
  
  // Get all model configurations
  getModels() {
    return this.models;
  }
  
  // Get the ID of the default model
  getDefaultModelId() {
    return this.domElements.defaultModelSelect.value;
  }

  // Set the default model by ID
  setDefaultModel(modelId) {
    if (!this.domElements.defaultModelSelect) {
      logger.warn('Default model selector not available');
      return false;
    }

    // Check if the model exists in the current options
    const options = Array.from(this.domElements.defaultModelSelect.options);
    const modelExists = options.some(option => option.value === modelId);

    if (modelExists) {
      this.domElements.defaultModelSelect.value = modelId;
      logger.info(`Default model set to: ${modelId}`);

      // Trigger change event to notify other components
      const changeEvent = new Event('change', { bubbles: true });
      this.domElements.defaultModelSelect.dispatchEvent(changeEvent);

      return true;
    } else {
      logger.warn(`Model ${modelId} not found in available options`);
      return false;
    }
  }

  // Get the current default model object
  getDefaultModel() {
    const defaultModelId = this.getDefaultModelId();
    return this.models.find(model => model.id === defaultModelId) || null;
  }

  // Check if a model ID is valid and complete
  isValidDefaultModel(modelId) {
    const model = this.models.find(m => m.id === modelId);
    return model && model.enabled && this.isModelComplete(model);
  }

  // Get all valid default model options (enabled and complete)
  getValidDefaultModelOptions() {
    return this.getCompleteModels();
  }
}

// Note: Removed global window.modelManager to comply with CSP 