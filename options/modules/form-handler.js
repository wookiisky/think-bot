// Form Handler
// Handles form population and UI state management

// Import logger module
const logger = window.logger ? window.logger.createModuleLogger('FormHandler') : console;

export class FormHandler {
  
  // Populate form with configuration data
  static populateForm(config, domElements) {
    if (!config) return;
    
    // Support both old and new config formats
    const basicConfig = config.basic || config;
    const llmConfig = config.llm_models || config.llm;

    // Content extraction settings
    domElements.defaultExtractionMethod.value = basicConfig.defaultExtractionMethod || 'readability';
    domElements.jinaApiKey.value = basicConfig.jinaApiKey || '';
    domElements.jinaResponseTemplate.value = basicConfig.jinaResponseTemplate ||
      '# {title}\n\n**URL:** {url}\n\n**Description:** {description}\n\n## Content\n\n{content}';

    // LLM settings - handled by ModelManager
    // Get defaultModelId from basic config (new location) or fallback to llm config (old location)
    const defaultModelId = basicConfig.defaultModelId || llmConfig?.defaultModelId;
    if (defaultModelId && domElements.defaultModelSelect) {
      // Check if the default model ID exists in the current options
      const options = Array.from(domElements.defaultModelSelect.options);
      const modelExists = options.some(option => option.value === defaultModelId);

      if (modelExists) {
        domElements.defaultModelSelect.value = defaultModelId;
      } else if (options.length > 0 && options[0].value !== '') {
        // If the saved default model doesn't exist, select the first available model
        domElements.defaultModelSelect.value = options[0].value;
        logger.warn(`Default model ${defaultModelId} not found, using first available: ${options[0].value}`);
      }
    }

    // UI settings - Ensure contentDisplayHeight is within valid range (0-600)
    const heightValue = basicConfig.contentDisplayHeight || 10;
    domElements.contentDisplayHeight.value = Math.min(Math.max(heightValue, 0), 600);
    domElements.systemPrompt.value = basicConfig.systemPrompt || '';
    domElements.theme.value = basicConfig.theme || 'system';
    domElements.languageSelector.value = basicConfig.language || 'en';
    
    // COT filtering setting
    if (domElements.filterCOT) {
      domElements.filterCOT.checked = basicConfig.filterCOT || false;
    }

    // Sync settings - Load from sync config (will be called separately in loadSettings)
  }

  // Populate sync settings from sync configuration
  static async populateSyncSettings(domElements) {
    try {
      if (typeof syncConfig !== 'undefined') {
        const syncSettings = await syncConfig.getSyncConfig();

        // Basic sync settings
        const syncEnabledValue = syncSettings.enabled || false;
        domElements.syncEnabled.checked = syncEnabledValue;
        domElements.storageType.value = syncSettings.storageType || 'gist';
        
        logger.info('Setting syncEnabled state:', {
          enabledValueFromConfig: syncSettings.enabled,
          actualSetValue: syncEnabledValue,
          currentCheckedStateOfDOMElement: domElements.syncEnabled.checked
        });
        
        // Gist configuration
        domElements.gistToken.value = syncSettings.gistToken || '';
        domElements.gistId.value = syncSettings.gistId || '';
        
        // WebDAV configuration
        domElements.webdavUrl.value = syncSettings.webdavUrl || '';
        domElements.webdavUsername.value = syncSettings.webdavUsername || '';
        domElements.webdavPassword.value = syncSettings.webdavPassword || '';
        
        logger.info('Sync settings loaded:', {
          storageType: syncSettings.storageType,
          enabled: syncSettings.enabled,
          hasGistToken: !!syncSettings.gistToken,
          hasGistId: !!syncSettings.gistId,
          hasWebdavUrl: !!syncSettings.webdavUrl,
          hasWebdavUsername: !!syncSettings.webdavUsername,
          hasWebdavPassword: !!syncSettings.webdavPassword
        });

        // Return storageType for caller to update UI state
        return syncSettings.storageType || 'gist';
      }
    } catch (error) {
      logger.error('Error loading sync settings:', error.message);
    }
    return 'gist';
  }
  
  // Toggle visibility of extraction method specific settings
  static toggleExtractionMethodSettings(domElements, domGroups) {
    const method = domElements.defaultExtractionMethod.value;
    
    // Jina API Key group
    domGroups.jinaApiKeyGroup.style.display = method === 'jina' ? 'block' : 'none';
    
    // Jina Response Template group
    domGroups.jinaResponseTemplateGroup.style.display = method === 'jina' ? 'block' : 'none';
  }
} 