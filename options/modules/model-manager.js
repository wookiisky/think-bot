// Model Manager
// Handles multiple LLM model configurations with drag-and-drop support

// Import confirmation dialog
import { confirmationDialog } from '../../js/modules/ui/confirmation-dialog.js';
import { i18n } from '../../js/modules/i18n.js';

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('ModelManager') : console;

export class ModelManager {
  constructor(domElements, changeCallback = null) {
    this.domElements = domElements;
    this.models = [];
    this.changeCallback = changeCallback;
    this.globalEventListenersAdded = false;
    this.containerEventListenersAdded = false;
    this.expandedStates = new Map();
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
      // Skip rendering deleted models
      if (model.isDeleted) {
        return;
      }
      const modelElement = this.createModelElement(model, index);
      container.appendChild(modelElement);
    });

    // Setup event listeners for the newly created elements
    this.setupModelEventListeners();
    
    // Setup the inline add button event listener
    this.setupAddButtonListener();
    
    // Apply i18n translations to newly created DOM elements
    if (typeof i18n !== 'undefined' && i18n.applyToDOM) {
      i18n.applyToDOM();
    }

    // Refresh floating labels to handle custom multi-select components
    if (window.floatingLabelManager) {
      window.floatingLabelManager.refresh();
    }
  }

  // Create a single model configuration element
  createModelElement(model, index) {
    const div = document.createElement('div');
    const modelId = this.getModelId(model, index);
    const isExpanded = this.ensureExpandedState(model, index);

    div.className = `model-config-item ${!model.enabled ? 'disabled' : ''}`;
    div.dataset.index = index;
    div.dataset.modelId = modelId;

    if (isExpanded) {
      div.classList.add('expanded');
    }

    const displayName = this.escapeHtml(model.name || i18n.getMessage('options_model_unnamed') || 'Model');
    const providerLabel = this.escapeHtml(this.getProviderLabel(model.provider));
    const modelIdentifier = this.escapeHtml(this.getModelIdentifier(model));

    div.innerHTML = `
      <div class="model-item-header">
        <div class="col col-drag">
          <div class="drag-handle">
            <i class="material-icons">drag_indicator</i>
          </div>
        </div>
        <div class="col col-name">
          <span class="model-summary-name">${displayName}</span>
        </div>
        <div class="col col-provider">
          <span class="model-summary-provider">${providerLabel}</span>
        </div>
        <div class="col col-model">
          <span class="model-summary-model">${modelIdentifier}</span>
        </div>
        <div class="col col-enabled">
          <label class="toggle-switch">
            <input type="checkbox" ${model.enabled ? 'checked' : ''}
                   data-model-index="${index}" class="model-toggle">
            <span class="slider round"></span>
          </label>
        </div>
        <div class="col col-actions">
          <button type="button" class="copy-model-btn icon-btn secondary"
                  data-model-index="${index}" data-i18n-title="common_copy" title="Copy Model">
            <i class="material-icons">content_copy</i>
          </button>
          <button type="button" class="remove-model-btn icon-btn danger"
                  data-model-index="${index}" data-i18n-title="common_remove" title="Remove Model">
            <i class="material-icons">delete</i>
          </button>
          
        </div>
      </div>
      <div class="model-details">
        <div class="model-form">
          <!-- Unified into a single grid to avoid multiple rows -->
          <div class="form-grid">
            <div class="floating-label-field">
              <input type="text" class="model-name-input" id="model-name-${index}" value="${model.name || ''}"
                     data-model-index="${index}" data-field="name" placeholder=" ">
              <label for="model-name-${index}" class="floating-label" data-i18n="options_model_display_name_label">Display Name</label>
            </div>
            <div class="floating-label-field">
              <select class="model-provider-select"
                      id="model-provider-${index}"
                      data-model-index="${index}">
                <option value="openai" ${model.provider === 'openai' ? 'selected' : ''} data-i18n="options_model_provider_openai">OpenAI Compatible</option>
                <option value="gemini" ${model.provider === 'gemini' ? 'selected' : ''} data-i18n="options_model_provider_gemini">Google Gemini</option>
                <option value="azure_openai" ${model.provider === 'azure_openai' ? 'selected' : ''} data-i18n="optionsAzureOpenAIProvider">Azure OpenAI</option>
              </select>
              <label for="model-provider-${index}" class="floating-label" data-i18n="options_model_provider_label">Provider</label>
            </div>
            ${this.renderModelSpecificFields(model, index)}
            <div class="floating-label-field">
              <input type="number" class="model-max-tokens" id="model-max-tokens-${index}" value="${model.maxTokens || 2048}"
                     data-model-index="${index}" data-field="maxTokens"
                     placeholder=" " min="1" max="100000">
              <label for="model-max-tokens-${index}" class="floating-label" data-i18n="options_model_max_tokens_label">Max Tokens</label>
            </div>
            <div class="floating-label-field">
              <input type="number" class="model-temperature" id="model-temperature-${index}" value="${model.temperature || 0.7}"
                     data-model-index="${index}" data-field="temperature"
                     placeholder=" " min="0" max="1" step="0.1">
              <label for="model-temperature-${index}" class="floating-label" data-i18n="options_model_temperature_label">Temperature</label>
            </div>
          </div>
        </div>
      </div>
    `;
    try { logger.debug(`Rendered model item ${modelId} with unified form-grid`); } catch (_) {}
    return div;
  }

  getModelId(model, index) {
    if (model && model.id) {
      return model.id;
    }
    return `model-${index}`;
  }

  ensureExpandedState(model, index) {
    const modelId = this.getModelId(model, index);
    if (!this.expandedStates.has(modelId)) {
      // Default collapsed for all models
      this.expandedStates.set(modelId, false);
    }
    return this.expandedStates.get(modelId);
  }

  setModelExpanded(modelId, expanded) {
    if (modelId) {
      this.expandedStates.set(modelId, expanded);
    }
  }

  toggleModelDetails(modelId) {
    if (!modelId) return;
    const container = this.domElements.modelsContainer;
    if (!container) return;
    const modelItem = container.querySelector(`.model-config-item[data-model-id="${modelId}"]`);
    if (!modelItem) return;
    const isExpanded = !modelItem.classList.contains('expanded');
    modelItem.classList.toggle('expanded', isExpanded);
    const button = modelItem.querySelector('.model-expand-btn');
    if (button) {
      button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }
    this.setModelExpanded(modelId, isExpanded);
    try {
      logger.info(`Toggle model details -> id: ${modelId}, state: ${isExpanded ? 'expanded' : 'collapsed'}`);
    } catch (_) {}
  }

  updateModelSummary(index) {
    const model = this.models[index];
    if (!model) return;
    const container = this.domElements.modelsContainer;
    if (!container) return;
    const modelItem = container.querySelector(`.model-config-item[data-index="${index}"]`);
    if (!modelItem) return;

    const nameEl = modelItem.querySelector('.model-summary-name');
    if (nameEl) {
      nameEl.textContent = model.name || i18n.getMessage('options_model_unnamed') || 'Model';
    }

    const providerEl = modelItem.querySelector('.model-summary-provider');
    if (providerEl) {
      providerEl.textContent = this.getProviderLabel(model.provider);
    }

    const modelLabelEl = modelItem.querySelector('.model-summary-model');
    if (modelLabelEl) {
      modelLabelEl.textContent = this.getModelIdentifier(model);
    }
  }

  getProviderLabel(provider) {
    switch (provider) {
      case 'gemini':
        return i18n.getMessage('options_model_provider_gemini') || 'Google Gemini';
      case 'azure_openai':
        return i18n.getMessage('optionsAzureOpenAIProvider') || 'Azure OpenAI';
      case 'openai':
      default:
        return i18n.getMessage('options_model_provider_openai') || 'OpenAI Compatible';
    }
  }

  getModelIdentifier(model) {
    if (!model) return '—';
    if (model.provider === 'azure_openai') {
      return model.deploymentName || '—';
    }
    return model.model || '—';
  }

  escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Render model-specific fields
  renderModelSpecificFields(model, index) {
    if (model.provider === 'openai') {
      return `
        <div class="floating-label-field">
          <input type="text" class="model-base-url" id="model-base-url-${index}" value="${model.baseUrl || 'https://api.openai.com'}"
                 data-model-index="${index}" data-field="baseUrl" placeholder=" ">
          <label for="model-base-url-${index}" class="floating-label" data-i18n="options_model_base_url_label">Base URL</label>
        </div>
        <div class="floating-label-field">
          <input type="password" class="model-api-key" id="model-api-key-${index}" value="${model.apiKey || ''}"
                 data-model-index="${index}" data-field="apiKey" placeholder=" ">
          <label for="model-api-key-${index}" class="floating-label" data-i18n="options_model_api_key_label">API Key</label>
        </div>
        <div class="floating-label-field">
          <input type="text" class="model-model" id="model-model-${index}" value="${model.model || 'gpt-3.5-turbo'}"
                 data-model-index="${index}" data-field="model" placeholder=" ">
          <label for="model-model-${index}" class="floating-label" data-i18n="common_model">Model</label>
        </div>
      `;
    } else if (model.provider === 'gemini') {
      return `
        <div class="floating-label-field">
          <input type="text" class="model-base-url" id="model-base-url-${index}" value="${model.baseUrl || 'https://generativelanguage.googleapis.com'}"
                 data-model-index="${index}" data-field="baseUrl" placeholder=" ">
          <label for="model-base-url-${index}" class="floating-label" data-i18n="options_model_base_url_label">Base URL</label>
        </div>
        <div class="floating-label-field">
          <input type="password" class="model-api-key" id="model-api-key-${index}" value="${model.apiKey || ''}"
                 data-model-index="${index}" data-field="apiKey" placeholder=" ">
          <label for="model-api-key-${index}" class="floating-label" data-i18n="options_model_api_key_label">API Key</label>
        </div>
        <div class="floating-label-field">
          <input type="text" class="model-model" id="model-model-${index}" value="${model.model || 'gemini-pro'}"
                 data-model-index="${index}" data-field="model" placeholder=" ">
          <label for="model-model-${index}" class="floating-label" data-i18n="common_model">Model</label>
        </div>
        <div class="floating-label-field">
          <div class="custom-multi-select" id="model-tools-${index}" data-model-index="${index}" data-field="tools">
            <div class="multi-select-container">
              <div class="selected-items" id="selected-items-${index}">
                ${this.renderSelectedTools(model.tools || [], index)}
              </div>
              <div class="multi-select-dropdown">
                <button type="button" class="dropdown-toggle" data-index="${index}">
                  <i class="material-icons">arrow_drop_down</i>
                </button>
                <div class="dropdown-options" id="dropdown-options-${index}">
                  <div class="option-item" data-value="urlContext" data-index="${index}">
                    <span class="option-text" data-i18n="options_model_tools_url_context">URL Context</span>
                  </div>
                  <div class="option-item" data-value="googleSearch" data-index="${index}">
                    <span class="option-text" data-i18n="options_model_tools_google_search">Google Search</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <label for="model-tools-${index}" class="floating-label" data-i18n="options_model_tools_label">Tools</label>
        </div>
        <div class="floating-label-field">
          <input type="number" class="model-thinking-budget" id="model-thinking-budget-${index}" value="${model.thinkingBudget !== undefined ? model.thinkingBudget : -1}"
                 data-model-index="${index}" data-field="thinkingBudget" placeholder=" " min="-1" max="10000" step="1">
          <label for="model-thinking-budget-${index}" class="floating-label" data-i18n="options_model_thinking_budget_label">Thinking Budget</label>
        </div>
      `;
    } else if (model.provider === 'azure_openai') {
      return `
        <div class="floating-label-field">
          <input type="text" class="model-azure-endpoint" id="model-azure-endpoint-${index}" value="${model.endpoint || ''}"
                 data-model-index="${index}" data-field="endpoint" placeholder=" ">
          <label for="model-azure-endpoint-${index}" class="floating-label" data-i18n="options_model_azure_endpoint_label">Endpoint</label>
        </div>
        <div class="floating-label-field">
          <input type="password" class="model-api-key" id="model-api-key-${index}" value="${model.apiKey || ''}"
                 data-model-index="${index}" data-field="apiKey" placeholder=" ">
          <label for="model-api-key-${index}" class="floating-label" data-i18n="options_model_api_key_label">API Key</label>
        </div>
        <div class="floating-label-field">
          <input type="text" class="model-azure-deployment-name" id="model-azure-deployment-name-${index}" value="${model.deploymentName || ''}"
                 data-model-index="${index}" data-field="deploymentName" placeholder=" ">
          <label for="model-azure-deployment-name-${index}" class="floating-label" data-i18n="options_model_azure_deployment_name_label">Deployment Name</label>
        </div>
        <div class="floating-label-field">
          <input type="text" class="model-azure-api-version" id="model-azure-api-version-${index}" value="${model.apiVersion || '2025-01-01-preview'}"
                 data-model-index="${index}" data-field="apiVersion" placeholder=" ">
          <label for="model-azure-api-version-${index}" class="floating-label" data-i18n="options_model_azure_api_version_label">API Version</label>
        </div>
      `;
    }
    return '';
  }

  // Render selected tools for custom multi-select
  renderSelectedTools(selectedTools, index) {
    if (!selectedTools || selectedTools.length === 0) {
      return `<span class="no-tools-selected"></span>`;
    }
    return selectedTools.map(tool => {
      let toolName = tool;
      if (tool === 'urlContext') {
        toolName = i18n.getMessage('options_model_tools_url_context') || 'URL Context';
      } else if (tool === 'googleSearch') {
        toolName = i18n.getMessage('options_model_tools_google_search') || 'Google Search';
      }
      return `<span class="selected-tool-item">
        <span class="tool-name">${toolName}</span>
        <span class="tool-remove-icon" data-tool="${tool}" data-index="${index}">
          <i class="material-icons">close</i>
        </span>
      </span>`;
    }).join('');
  }

  // Update tool selection for a specific model
  updateToolSelection(index, toolValue, checked) {
    if (index < 0 || index >= this.models.length) {
      logger.warn(`Invalid model index: ${index}`);
      return;
    }

    const model = this.models[index];
    if (!model.tools) {
      model.tools = [];
    }

    if (checked) {
      // Add tool if not already present
      if (!model.tools.includes(toolValue)) {
        model.tools.push(toolValue);
      }
    } else {
      // Remove tool if present
      const toolIndex = model.tools.indexOf(toolValue);
      if (toolIndex > -1) {
        model.tools.splice(toolIndex, 1);
      }
    }

    // Update timestamp for sync merging
    model.lastModified = Date.now();

    // Update the selected items display
    const selectedItemsContainer = document.getElementById(`selected-items-${index}`);
    if (selectedItemsContainer) {
      selectedItemsContainer.innerHTML = this.renderSelectedTools(model.tools, index);
      
      // Update floating label state for the custom multi-select
      const multiSelectField = selectedItemsContainer.closest('.floating-label-field');
      if (multiSelectField && window.floatingLabelManager) {
        const customMultiSelect = multiSelectField.querySelector('.custom-multi-select');
        if (customMultiSelect) {
          window.floatingLabelManager.updateCustomMultiSelectState(multiSelectField, customMultiSelect);
        }
      }
    }

    logger.info(`Updated model ${index} tools: ${model.tools.join(', ')}`);
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  // Toggle dropdown visibility
  toggleDropdown(dropdown) {
    if (!dropdown) return;
    
    // Close all other dropdowns first
    const allDropdowns = document.querySelectorAll('.dropdown-options');
    const allToggleButtons = document.querySelectorAll('.dropdown-toggle');
    const allMultiSelects = document.querySelectorAll('.custom-multi-select');
    allDropdowns.forEach(d => {
      if (d !== dropdown) {
        d.classList.remove('open');
      }
    });
    allToggleButtons.forEach(btn => {
      btn.classList.remove('open');
    });
    allMultiSelects.forEach(ms => {
      ms.classList.remove('dropdown-open');
    });

    // Toggle current dropdown
    dropdown.classList.toggle('open');
    
    // Toggle button state
    const button = dropdown.parentNode.querySelector('.dropdown-toggle');
    if (button) {
      button.classList.toggle('open', dropdown.classList.contains('open'));
    }
    
    // Toggle multi-select state
    const multiSelect = dropdown.closest('.custom-multi-select');
    if (multiSelect) {
      multiSelect.classList.toggle('dropdown-open', dropdown.classList.contains('open'));
    }
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
      name: i18n.getMessage('common_model'),
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-3.5-turbo',
      maxTokens: 2048,
      temperature: 0.7,
      enabled: true,
      tools: [], // Initialize tools array for all providers
      thinkingBudget: -1, // Initialize thinking budget for all providers (default -1 for dynamic thinking)
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

  // Copy an existing model configuration
  copyModel(index) {
    const sourceModel = this.models[index];
    if (!sourceModel) {
      logger.warn(`Cannot copy model at index ${index}: model not found`);
      return;
    }

    // Generate UUID-based model ID with timestamp
    const timestamp = Date.now().toString(36);
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    // Create a deep copy of the source model
    const copiedModel = {
      ...sourceModel,
      id: `model_${timestamp}_${uuid}`,
      name: `${sourceModel.name} - Copy`,
      tools: sourceModel.tools ? [...sourceModel.tools] : [], // Deep copy tools array
      lastModified: Date.now() // Update timestamp for sync merging
    };

    // Insert the copied model right after the source model
    this.models.splice(index + 1, 0, copiedModel);
    this.renderModels();
    this.updateDefaultModelSelector();
    
    const sourceModelName = sourceModel.name || i18n.getMessage('options_model_unnamed') || 'Unnamed Model';
    logger.info(`Copied model "${sourceModelName}" with new ID: ${copiedModel.id}`);
    
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  // Remove a model configuration (soft delete)
  removeModel(index) {
    const model = this.models[index];
    if (!model) return;

    // Find the delete button element for positioning
    const deleteBtn = document.querySelector(`.model-config-item[data-index="${index}"] .remove-model-btn`);
    const modelName = model.name || i18n.getMessage('options_model_unnamed') || 'Unnamed Model';

    confirmationDialog.confirmDelete({
      target: deleteBtn,
      message: i18n.getMessage('common_confirm_delete_message') || 
               'Are you sure you want to delete this item?',
      confirmText: i18n.getMessage('common_delete') || 'Delete',
      cancelText: i18n.getMessage('common_cancel') || 'Cancel',
      onConfirm: () => {
        // Use soft delete: mark as deleted instead of removing from array
        this.models[index].isDeleted = true;
        this.models[index].lastModified = Date.now(); // Update timestamp for sync merging
        this.renderModels();
        this.updateDefaultModelSelector();
        logger.info(`Soft deleted model "${modelName}" at index ${index}`);
        if (this.changeCallback) {
          this.changeCallback();
        }
      }
    });
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
      let originalValue = value;
      
      // Special handling for Azure OpenAI endpoint: extract domain from full URL
      if (field === 'endpoint' && this.models[index].provider === 'azure_openai' && value) {
        // Check if this is a complete Azure OpenAI API URL and parse it
        const parsedUrl = this.parseAzureOpenAIUrl(value);
        if (parsedUrl) {
          // Update all related fields from the parsed URL
          this.updateMultipleAzureFields(index, parsedUrl);
          return; // Exit early as we've handled all updates
        } else {
          // Check if domain matches xxx.openai.azure.com pattern
          if (this.isAzureOpenAIDomain(value)) {
            // If matches Azure OpenAI domain pattern, extract domain
            value = this.extractDomainFromUrl(value);
          }
          // Otherwise, keep URL as is
        }
      }
      
      // Special handling for OpenAI compatible baseUrl: remove /v1 suffix from openrouter.ai URLs
      if (field === 'baseUrl' && this.models[index].provider === 'openai' && value) {
        value = this.normalizeOpenAIBaseUrl(value);
      }
      
      // Only update timestamp if the value actually changed
      const oldValue = this.models[index][field];
      if (oldValue !== value) {
        this.models[index][field] = value;
        this.models[index].lastModified = Date.now(); // Update timestamp for sync merging

        // If the value was modified (e.g., URL domain extraction), update the input field display
        if (originalValue !== value) {
          const inputElement = document.querySelector(`[data-model-index="${index}"][data-field="${field}"]`);
          if (inputElement) {
            inputElement.value = value;
          }
        }

        if (field === 'name') {
          this.updateDefaultModelSelector();
        }
        if (field === 'name' || field === 'model' || field === 'deploymentName') {
          this.updateModelSummary(index);
        }
        logger.info(`Updated model ${index} field ${field}: ${value}`);
        if (this.changeCallback) {
          this.changeCallback();
        }
      }
    }
  }

  // Parse complete Azure OpenAI API URL to extract endpoint, deployment name, and API version
  parseAzureOpenAIUrl(url) {
    try {
      // Remove any leading/trailing whitespace and @ symbol
      url = url.trim().replace(/^@/, '');
      
      // Check if this looks like a complete Azure OpenAI API URL
      const azureOpenAIPattern = /^https:\/\/([^\/]+)\/openai\/deployments\/([^\/]+)\/chat\/completions\?api-version=([^&\s]+)/;
      const match = url.match(azureOpenAIPattern);
      
      if (match) {
        const [, hostname, deploymentName, apiVersion] = match;
        const endpoint = `https://${hostname}`;
        
        logger.info(`Parsed Azure OpenAI URL: ${url}`);
        logger.info(`  -> endpoint: ${endpoint}`);
        logger.info(`  -> deploymentName: ${deploymentName}`);
        logger.info(`  -> apiVersion: ${apiVersion}`);
        
        return {
          endpoint,
          deploymentName,
          apiVersion
        };
      }
      
      return null;
    } catch (error) {
      logger.warn('Failed to parse Azure OpenAI URL:', error);
      return null;
    }
  }

  // Update multiple Azure OpenAI fields from parsed URL
  updateMultipleAzureFields(index, parsedData) {
    if (!this.models[index]) return;
    
    const { endpoint, deploymentName, apiVersion } = parsedData;
    let hasChanges = false;
    
    // Update endpoint
    if (this.models[index].endpoint !== endpoint) {
      this.models[index].endpoint = endpoint;
      hasChanges = true;
    }
    
    // Update deployment name
    if (this.models[index].deploymentName !== deploymentName) {
      this.models[index].deploymentName = deploymentName;
      hasChanges = true;
    }
    
    // Update API version
    if (this.models[index].apiVersion !== apiVersion) {
      this.models[index].apiVersion = apiVersion;
      hasChanges = true;
    }
    
    if (hasChanges) {
      // Update timestamp for sync merging
      this.models[index].lastModified = Date.now();
      
      // Update all input fields in the UI
      const endpointInput = document.querySelector(`[data-model-index="${index}"][data-field="endpoint"]`);
      const deploymentInput = document.querySelector(`[data-model-index="${index}"][data-field="deploymentName"]`);
      const apiVersionInput = document.querySelector(`[data-model-index="${index}"][data-field="apiVersion"]`);
      
      if (endpointInput) endpointInput.value = endpoint;
      if (deploymentInput) deploymentInput.value = deploymentName;
      if (apiVersionInput) apiVersionInput.value = apiVersion;
      
      logger.info(`Updated multiple Azure OpenAI fields for model ${index}`);
      logger.info(`  endpoint: ${endpoint}`);
      logger.info(`  deploymentName: ${deploymentName}`);
      logger.info(`  apiVersion: ${apiVersion}`);
      
      if (this.changeCallback) {
        this.changeCallback();
      }
    }
  }

  // Check if domain matches Azure OpenAI pattern (xxx.openai.azure.com)
  isAzureOpenAIDomain(url) {
    try {
      // Remove any leading/trailing whitespace
      url = url.trim();
      
      // Extract hostname from URL or treat as hostname if no protocol
      let hostname;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        hostname = new URL(url).hostname;
      } else {
        // If no protocol, treat as hostname directly
        hostname = url.split('/')[0];
      }
      
      // Check if hostname matches pattern: xxx.openai.azure.com
      const azurePattern = /^[^.]+\.openai\.azure\.com$/;
      return azurePattern.test(hostname);
    } catch (error) {
      // If parsing fails, assume it doesn't match the pattern
      logger.warn(`Failed to parse URL for Azure domain check: ${url}`, error);
      return false;
    }
  }

  // Extract domain from URL for Azure OpenAI endpoint
  extractDomainFromUrl(url) {
    try {
      // Remove any leading/trailing whitespace
      url = url.trim();
      
      // If it's already just a domain (no path), return as is
      if (!url.includes('/') || url.match(/^https?:\/\/[^\/]+$/)) {
        return url;
      }
      
      // Parse the URL to extract protocol and hostname
      const urlObj = new URL(url);
      const extractedDomain = `${urlObj.protocol}//${urlObj.hostname}`;
      
      // Log the domain extraction for user feedback
      logger.info(`Azure OpenAI endpoint domain extracted: ${url} -> ${extractedDomain}`);
      
      return extractedDomain;
    } catch (error) {
      // If URL parsing fails, try to extract domain manually
      logger.warn('Failed to parse URL, attempting manual extraction:', error);
      
      // Manual extraction for common cases
      const match = url.match(/^(https?:\/\/[^\/]+)/);
      if (match) {
        const extractedDomain = match[1];
        logger.info(`Azure OpenAI endpoint domain extracted (manual): ${url} -> ${extractedDomain}`);
        return extractedDomain;
      }
      
      // If all else fails, return the original value
      logger.warn('Could not extract domain from URL, returning original value:', url);
      return url;
    }
  }

  // Normalize OpenAI compatible base URL: remove /v1 suffix from openrouter.ai URLs
  normalizeOpenAIBaseUrl(url) {
    try {
      // Remove any leading/trailing whitespace and @ symbol
      url = url.trim().replace(/^@/, '');
      
      // Check if URL contains openrouter.ai and ends with /v1
      if (url.includes('openrouter.ai') && url.endsWith('/v1')) {
        const normalizedUrl = url.replace(/\/v1$/, '');
        logger.info(`OpenRouter URL normalized: ${url} -> ${normalizedUrl}`);
        return normalizedUrl;
      }
      
      // For other URLs, return as is
      return url;
    } catch (error) {
      logger.warn('Failed to normalize OpenAI base URL:', error);
      return url;
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
        this.models[index].tools = this.models[index].tools || [];
        this.models[index].thinkingBudget = this.models[index].thinkingBudget !== undefined ? this.models[index].thinkingBudget : -1;
      } else if (provider === 'azure_openai') {
        // For Azure, baseUrl and model are not used in the same way.
        // We use endpoint and deploymentName instead.
        // Clear out fields from other providers to avoid confusion.
        delete this.models[index].baseUrl;
        delete this.models[index].model;
        this.models[index].endpoint = this.models[index].endpoint || '';
        this.models[index].deploymentName = this.models[index].deploymentName || '';
        this.models[index].apiVersion = this.models[index].apiVersion || '2025-01-01-preview';
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
    if (!model.name || !model.apiKey) {
      return false;
    }
    if (model.provider === 'openai' || model.provider === 'gemini') {
      return !!(model.model && model.baseUrl);
    }
    if (model.provider === 'azure_openai') {
      return !!(model.endpoint && model.deploymentName && model.apiVersion);
    }
    return false;
  }
  
  // Get all models that are enabled and have complete configurations (excluding deleted ones)
  getCompleteModels() {
    return this.models.filter(model => !model.isDeleted && model.enabled && this.isModelComplete(model));
  }

  // Get all models (including incomplete and deleted ones) with timestamps preserved for sync
  getAllModels() {
    return this.models.map(model => ({ ...model })); // Return a copy to avoid mutations
  }

  // Get only active (non-deleted) models
  getActiveModels() {
    return this.models.filter(model => !model.isDeleted).map(model => ({ ...model }));
  }

  // Clean up soft-deleted models after successful sync
  cleanupDeletedModels() {
    const originalLength = this.models.length;
    this.models = this.models.filter(model => !model.isDeleted);
    const cleanedCount = originalLength - this.models.length;
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} soft-deleted models`);
      this.renderModels();
      this.updateDefaultModelSelector();
      if (this.changeCallback) {
        this.changeCallback();
      }
    }
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
    if (!container) {
      try { logger.warn('Models container not found; skip binding listeners'); } catch (_) {}
      return;
    }

    // Prevent duplicate bindings across re-renders
    if (this.containerEventListenersAdded) {
      try { logger.debug('Container listeners already added; skip re-binding'); } catch (_) {}
      return;
    }

    container.addEventListener('click', (e) => {
      const target = e.target;
      const modelItem = target.closest('.model-config-item');
      if (!modelItem) return;

      // Header click should toggle expand/collapse (excluding interactive elements)
      const header = target.closest('.model-item-header');
      const isInteractive = !!(
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('label') ||
        target.closest('.toggle-switch') ||
        target.closest('.copy-model-btn') ||
        target.closest('.remove-model-btn') ||
        target.closest('.dropdown-toggle')
      );
      if (header && !isInteractive) {
        e.preventDefault();
        const modelIdFromHeader = modelItem.dataset.modelId;
        this.toggleModelDetails(modelIdFromHeader);
        return;
      }

      const expandButton = target.classList.contains('model-expand-btn')
        ? target
        : target.closest('.model-expand-btn');
      if (expandButton) {
        e.preventDefault();
        const modelId = expandButton.dataset.modelId || modelItem.dataset.modelId;
        this.toggleModelDetails(modelId);
        return;
      }

      // Determine model index from the containing item
      const index = parseInt(modelItem.dataset.index, 10);

      // Copy button handling
      if (target.classList.contains('copy-model-btn') || target.closest('.copy-model-btn')) {
        e.stopPropagation(); // Prevent event bubbling
        this.copyModel(index);
        return;
      }

      // Remove button handling (preserve existing behavior)
      if (target.classList.contains('remove-model-btn') || target.closest('.remove-model-btn')) {
        e.stopPropagation(); // Prevent event bubbling to avoid immediate dialog dismissal
        this.removeModel(index);
        return;
      }

      // Toggle handling: support clicks on the actual checkbox input as well as
      // clicks on the label/slider area. Use closest lookup to find the
      // toggle input reliably.
      const toggleInput = target.classList.contains('model-toggle')
        ? target
        : (target.closest('.toggle-switch') ? target.closest('.toggle-switch').querySelector('.model-toggle') : null);

      if (toggleInput) {
        // Ensure we get the correct index (input may carry its own data-model-index)
        const inputIndex = parseInt(toggleInput.dataset.modelIndex || modelItem.dataset.index, 10);
        this.toggleModel(inputIndex, toggleInput.checked);
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
      // Provider select changes
      if (e.target.classList.contains('model-provider-select')) {
        const modelItem = e.target.closest('.model-config-item');
        if (modelItem) {
          const index = parseInt(modelItem.dataset.index, 10);
          this.updateModelProvider(index, e.target.value);
        }
        return;
      }

      // Toggle checkbox change - use change event to reliably get new checked state
      if (e.target.classList.contains('model-toggle')) {
        const toggle = e.target;
        const modelItem = toggle.closest('.model-config-item');
        if (!modelItem) return;
        const index = parseInt(toggle.dataset.modelIndex || modelItem.dataset.index, 10);
        this.toggleModel(index, toggle.checked);
        return;
      }
    });

    // Add click event for dropdown toggle and tool management
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('dropdown-toggle') || e.target.closest('.dropdown-toggle')) {
        e.preventDefault();
        const button = e.target.closest('.dropdown-toggle');
        const index = button.dataset.index;
        const dropdown = document.getElementById(`dropdown-options-${index}`);
        this.toggleDropdown(dropdown);
      } else if (e.target.closest('.selected-items') && !e.target.closest('.tool-remove-icon')) {
        // Click on selected items area (but not on remove icon) - toggle dropdown
        const multiSelect = e.target.closest('.custom-multi-select');
        if (multiSelect) {
          const index = multiSelect.dataset.modelIndex;
          const dropdown = document.getElementById(`dropdown-options-${index}`);
          this.toggleDropdown(dropdown);
        }
      } else if (e.target.closest('.tool-remove-icon')) {
        // Click on remove icon - remove the tool
        e.preventDefault();
        const removeIcon = e.target.closest('.tool-remove-icon');
        const index = parseInt(removeIcon.dataset.index, 10);
        const tool = removeIcon.dataset.tool;
        this.updateToolSelection(index, tool, false);
      } else if (e.target.closest('.option-item')) {
        // Click on dropdown option - toggle selection
        e.preventDefault();
        const optionItem = e.target.closest('.option-item');
        const index = parseInt(optionItem.dataset.index, 10);
        const toolValue = optionItem.dataset.value;
        
        // Get current tool state
        const model = this.models[index];
        const currentTools = model.tools || [];
        const isSelected = currentTools.includes(toolValue);
        
        // Toggle selection
        this.updateToolSelection(index, toolValue, !isSelected);
      }
    });

    this.containerEventListenersAdded = true;
    try { logger.debug('Bound container event listeners for models container'); } catch (_) {}

    // Add global event listeners only once
    if (!this.globalEventListenersAdded) {
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-multi-select')) {
          const openDropdowns = document.querySelectorAll('.dropdown-options.open');
          const openButtons = document.querySelectorAll('.dropdown-toggle.open');
          const openMultiSelects = document.querySelectorAll('.custom-multi-select.dropdown-open');
          openDropdowns.forEach(dropdown => {
            dropdown.classList.remove('open');
          });
          openButtons.forEach(button => {
            button.classList.remove('open');
          });
          openMultiSelects.forEach(multiSelect => {
            multiSelect.classList.remove('dropdown-open');
          });
        }
      });
      this.globalEventListenersAdded = true;
    }
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
