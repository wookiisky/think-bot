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
  branchModelSelect: document.getElementById('branchModelSelect'),
  selectedBranchModels: document.getElementById('selected-branch-models'),
  branchModelsToggle: document.getElementById('branch-models-toggle'),
  branchModelsDropdown: document.getElementById('branch-models-dropdown'),
  modelsContainer: document.getElementById('modelsContainer'),
  
  // UI settings
  contentDisplayHeight: document.getElementById('contentDisplayHeight'),
  systemPrompt: document.getElementById('systemPrompt'),
  theme: document.getElementById('theme'),
  languageSelector: document.getElementById('languageSelector'),
  
  // Cache settings elements
  totalCacheDisplay: document.getElementById('totalCacheDisplay'),
  clearAllCacheBtn: document.getElementById('clearAllCacheBtn'),

  // Sync settings elements
  syncEnabled: document.getElementById('syncEnabled'),
  storageType: document.getElementById('storageType'),
  gistToken: document.getElementById('gistToken'),
  gistId: document.getElementById('gistId'),
  webdavUrl: document.getElementById('webdavUrl'),
  webdavUsername: document.getElementById('webdavUsername'),
  webdavPassword: document.getElementById('webdavPassword'),
  syncStatus: document.getElementById('syncStatus'),
  syncStatusDetails: document.getElementById('syncStatusDetails'),
  syncStatusText: document.getElementById('syncStatusText'),
  syncErrorMessage: document.getElementById('syncErrorMessage'),

  // Action buttons
  addQuickInputBtn: document.getElementById('addQuickInputBtn'),
  exportConfigBtn: document.getElementById('exportConfigBtn'),
  importConfigBtn: document.getElementById('importConfigBtn'),
  importConfigFile: document.getElementById('importConfigFile'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn'),
  // New: Save and Sync button exposed for scripting
  saveAndSyncBtn: document.getElementById('saveAndSyncBtn')
};

// DOM element groups for easier management
export const domGroups = {
  jinaApiKeyGroup: document.getElementById('jinaApiKeyGroup'),
  jinaResponseTemplateGroup: document.getElementById('jinaResponseTemplateGroup'),
  syncConfigGroup: document.getElementById('syncConfigGroup'),
  gistConfigGroup: document.getElementById('gistConfigGroup'),
  webdavConfigGroup: document.getElementById('webdavConfigGroup')
};