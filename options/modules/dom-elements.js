// DOM Elements Manager
// Centralized management of all DOM element references

export const domElements = {
  // Form and main containers
  form: document.getElementById('settingsForm'),
  quickInputsContainer: document.getElementById('quickInputsContainer'),
  quickInputTemplate: document.getElementById('quickInputTemplate'),
  
  // Content extraction elements
  defaultExtractionMethod: document.getElementById('defaultExtractionMethod'),
  jinaApiKey: document.getElementById('jinaApiKey'),
  jinaResponseTemplate: document.getElementById('jinaResponseTemplate'),
  
  // LLM model elements
  defaultModelSelect: document.getElementById('defaultModelSelect'),
  modelsContainer: document.getElementById('modelsContainer'),
  
  // UI settings
  contentDisplayHeight: document.getElementById('contentDisplayHeight'),
  systemPrompt: document.getElementById('systemPrompt'),
  theme: document.getElementById('theme'),
  
  // Cache settings elements
  totalCacheDisplay: document.getElementById('totalCacheDisplay'),
  clearAllCacheBtn: document.getElementById('clearAllCacheBtn'),

  // Sync settings elements
  syncEnabled: document.getElementById('syncEnabled'),
  gistToken: document.getElementById('gistToken'),
  gistId: document.getElementById('gistId'),
  syncStatus: document.getElementById('syncStatus'),
  syncStatusIndicator: document.getElementById('syncStatusIndicator'),
  syncStatusDetails: document.getElementById('syncStatusDetails'),
  syncLastTime: document.getElementById('syncLastTime'),
  syncErrorMessage: document.getElementById('syncErrorMessage'),

  // Action buttons
  addQuickInputBtn: document.getElementById('addQuickInputBtn'),
  exportConfigBtn: document.getElementById('exportConfigBtn'),
  importConfigBtn: document.getElementById('importConfigBtn'),
  importConfigFile: document.getElementById('importConfigFile'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn')
};

// DOM element groups for easier management
export const domGroups = {
  jinaApiKeyGroup: document.getElementById('jinaApiKeyGroup'),
  jinaResponseTemplateGroup: document.getElementById('jinaResponseTemplateGroup'),
  syncConfigGroup: document.getElementById('syncConfigGroup')
};