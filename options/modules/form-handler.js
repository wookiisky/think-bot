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

    // Sync settings - Load from sync config (will be called separately in loadSettings)
  }

  // Populate sync settings from sync configuration
  static async populateSyncSettings(domElements) {
    try {
      if (typeof syncConfig !== 'undefined') {
        const syncSettings = await syncConfig.getSyncConfig();

        // 基本同步设置
        const syncEnabledValue = syncSettings.enabled || false;
        domElements.syncEnabled.checked = syncEnabledValue;
        domElements.storageType.value = syncSettings.storageType || 'gist';
        
        logger.info('设置syncEnabled状态:', {
          从配置读取的enabled值: syncSettings.enabled,
          实际设置的值: syncEnabledValue,
          DOM元素当前checked状态: domElements.syncEnabled.checked
        });
        
        // Gist配置
        domElements.gistToken.value = syncSettings.gistToken || '';
        domElements.gistId.value = syncSettings.gistId || '';
        
        // WebDAV配置
        domElements.webdavUrl.value = syncSettings.webdavUrl || '';
        domElements.webdavUsername.value = syncSettings.webdavUsername || '';
        domElements.webdavPassword.value = syncSettings.webdavPassword || '';
        
        logger.info('同步设置已加载:', {
          storageType: syncSettings.storageType,
          enabled: syncSettings.enabled,
          hasGistToken: !!syncSettings.gistToken,
          hasGistId: !!syncSettings.gistId,
          hasWebdavUrl: !!syncSettings.webdavUrl,
          hasWebdavUsername: !!syncSettings.webdavUsername,
          hasWebdavPassword: !!syncSettings.webdavPassword
        });

        // 返回storageType以便调用者更新UI状态
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