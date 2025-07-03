// Storage Configuration Manager Module
// Core storage operations for configuration data
// Handles Chrome Storage API operations with local storage, compression, and storage optimization

// Note: Compression utilities should be loaded before this module
// The compression utilities are loaded in the appropriate context (service worker, options page, sidebar)
// Note: storage-keys.js should be loaded before this module

// Create a global storageConfigManager object
var storageConfigManager = {};

// Create module logger
const storageConfigLogger = logger.createModuleLogger('StorageConfigManager');

// Storage keys for different config sections to avoid quota limits
const MAIN_CONFIG_KEY = CONFIG_KEYS.MAIN_CONFIG;
const QUICK_INPUTS_INDEX_KEY = CONFIG_KEYS.QUICK_INPUTS_INDEX;
const QUICK_INPUT_PREFIX = CONFIG_KEYS.QUICK_INPUT_PREFIX;
const SYSTEM_PROMPT_KEY = CONFIG_KEYS.SYSTEM_PROMPT;

// Get default configuration
storageConfigManager.getDefaultConfig = async function() {
  try {
    const response = await fetch('/options/default_options.json');
    if (!response.ok) {
      throw new Error(`Unable to load default settings: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    storageConfigLogger.error('Failed to load default settings file:', error.message);
    // Return hardcoded default values as fallback
    return {
      llm_models: {
        models: [
          {
            id: 'gemini-pro',
            name: 'Google Gemini Pro',
            provider: 'gemini',
            apiKey: '',
            baseUrl: 'https://generativelanguage.googleapis.com',
            model: 'gemini-2.5-pro-preview-05-06',
            maxTokens: 8192,
            temperature: 0.7,
            enabled: true,
            lastModified: 1735372800000
          },
          {
            id: 'openai-gpt35',
            name: 'OpenAI GPT-3.5',
            provider: 'openai',
            apiKey: '',
            baseUrl: 'https://api.openai.com',
            model: 'gpt-3.5-turbo',
            maxTokens: 4000,
            temperature: 0.7,
            enabled: true,
            lastModified: 1735372800000
          }
        ]
      },
      quickInputs: [
        {
          id: 'qi_default_summary_fallback',
          displayText: 'Summarize',
          sendText: 'Provide a concise summary of the following article:\n\n{CONTENT}',
          lastModified: 1735372800000
        },
        {
          id: 'qi_default_keypoints_fallback',
          displayText: 'Extract Key Points',
          sendText: 'Extract key points from this content:\n{CONTENT}',
          lastModified: 1735372800000
        }
      ],
      basic: {
        defaultExtractionMethod: 'readability',
        jinaApiKey: '',
        jinaResponseTemplate: '# {title}\n\n**URL:** {url}\n\n**Description:** {description}\n\n## Content\n\n{content}',
        systemPrompt: 'Output in Chinese',
        contentDisplayHeight: 100,
        theme: 'system',
        defaultModelId: 'gemini-pro',
        language: 'en',
        lastModified: 1735372800000
      }
    };
  }
}

// Get default system prompt
storageConfigManager.getDefaultSystemPrompt = function() {
  return 'Output in Chinese';
}

// Get default quick inputs
storageConfigManager.getDefaultQuickInputs = function() {
  return [
    {
      id: 'qi_default_summary_fallback',
      displayText: 'Summarize',
      sendText: 'Provide a concise summary of the following article:\n\n{CONTENT}',
      lastModified: 1735372800000
    },
    {
      id: 'qi_default_keypoints_fallback',
      displayText: 'Extract Key Points',
      sendText: 'Extract key points from this content:\n{CONTENT}',
      lastModified: 1735372800000
    }
  ];
}

// Get blacklist configuration safely (avoid circular dependencies)
storageConfigManager.getBlacklistConfigSafe = async function() {
  try {
    // Try to get blacklist config directly from storage without triggering blacklist manager initialization
    if (typeof blacklistManager !== 'undefined') {
      // First try to get patterns directly from storage
      const BLACKLIST_PATTERNS_KEY = CONFIG_KEYS.BLACKLIST_PATTERNS;
      const result = await chrome.storage.local.get([BLACKLIST_PATTERNS_KEY]);
      const patterns = result[BLACKLIST_PATTERNS_KEY] || [];
      
      // If patterns exist, return them directly
      if (patterns.length > 0) {
        return {
          patterns: patterns.map(pattern => ({
            id: pattern.id,
            pattern: pattern.pattern,
            enabled: pattern.enabled
          }))
        };
      }
    }
    
    // If no patterns found or blacklist manager not available, return empty config
    return { patterns: [] };
  } catch (error) {
    storageConfigLogger.error('Error getting blacklist config safely:', error.message);
    return { patterns: [] };
  }
}

// Generate unique ID for quick input using UUID with timestamp
storageConfigManager.generateQuickInputId = function() {
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

// Save individual quick input
storageConfigManager.saveQuickInput = async function(quickInput) {
  try {
    // Ensure quick input has an ID
    if (!quickInput.id) {
      quickInput.id = storageConfigManager.generateQuickInputId();
    }

    // Add lastModified timestamp for sync merging only if not already present
    // This preserves existing timestamps during sync operations
    if (!quickInput.lastModified) {
      quickInput.lastModified = Date.now();
      storageConfigLogger.debug(`Added lastModified timestamp to quickInput: ${quickInput.id}`);
    }

    // Compress quick input using pako compression only
    let dataToSave = quickInput;
    if (typeof quickInputCompression !== 'undefined') {
      dataToSave = quickInputCompression.compressQuickInput(quickInput);
    } else {
      storageConfigLogger.warn(`Pako compression not available for quick input: ${quickInput.id}, storing uncompressed`);
    }

    const key = KeyHelpers.getQuickInputKey(quickInput.id);
    await chrome.storage.local.set({ [key]: dataToSave });
    return quickInput.id;
  } catch (error) {
    storageConfigLogger.error(`Error saving quick input ${quickInput.id}:`, error.message);
    throw error;
  }
}

// Save individual quick input with forced timestamp update (for user modifications)
storageConfigManager.saveQuickInputWithTimestamp = async function(quickInput) {
  try {
    // Ensure quick input has an ID
    if (!quickInput.id) {
      quickInput.id = storageConfigManager.generateQuickInputId();
    }

    // Always update lastModified timestamp for user modifications
    quickInput.lastModified = Date.now();
    storageConfigLogger.debug(`Updated lastModified timestamp for quickInput: ${quickInput.id}`);

    // Compress quick input using pako compression only
    let dataToSave = quickInput;
    if (typeof quickInputCompression !== 'undefined') {
      dataToSave = quickInputCompression.compressQuickInput(quickInput);
    } else {
      storageConfigLogger.warn(`Pako compression not available for quick input: ${quickInput.id}, storing uncompressed`);
    }

    const key = KeyHelpers.getQuickInputKey(quickInput.id);
    await chrome.storage.local.set({ [key]: dataToSave });

    storageConfigLogger.info(`Quick input saved with updated timestamp: ${quickInput.id}`);
    return quickInput.id;
  } catch (error) {
    storageConfigLogger.error(`Error saving quick input with timestamp ${quickInput.id}:`, error.message);
    throw error;
  }
}

// Load individual quick input
storageConfigManager.loadQuickInput = async function(id) {
  try {
    const key = KeyHelpers.getQuickInputKey(id);
    const result = await chrome.storage.local.get(key);
    let quickInput = result[key] || null;

    // Decompress quick input using pako compression
    if (quickInput && typeof quickInputCompression !== 'undefined') {
      const decompressed = quickInputCompression.decompressQuickInput(quickInput);
      quickInput = decompressed;
    }

    return quickInput;
  } catch (error) {
    storageConfigLogger.error(`Error loading quick input ${id}:`, error.message);
    return null;
  }
}

// Delete individual quick input
storageConfigManager.deleteQuickInput = async function(id) {
  try {
    const key = KeyHelpers.getQuickInputKey(id);
    await chrome.storage.local.remove(key);
    return true;
  } catch (error) {
    storageConfigLogger.error(`Error deleting quick input ${id}:`, error.message);
    return false;
  }
}

// Save quick inputs index
storageConfigManager.saveQuickInputsIndex = async function(quickInputIds) {
  try {
    await chrome.storage.local.set({ [QUICK_INPUTS_INDEX_KEY]: quickInputIds });
    return true;
  } catch (error) {
    storageConfigLogger.error('Error saving quick inputs index:', error.message);
    throw error;
  }
}

// Load quick inputs index
storageConfigManager.loadQuickInputsIndex = async function() {
  try {
    const result = await chrome.storage.local.get(QUICK_INPUTS_INDEX_KEY);
    const index = result[QUICK_INPUTS_INDEX_KEY] || [];
    return index;
  } catch (error) {
    storageConfigLogger.error('Error loading quick inputs index:', error.message);
    return [];
  }
}

// Load all quick inputs
storageConfigManager.loadAllQuickInputs = async function() {
  try {
    const quickInputIds = await storageConfigManager.loadQuickInputsIndex();

    if (quickInputIds.length === 0) {
      return storageConfigManager.getDefaultQuickInputs();
    }

    // Load all quick inputs in parallel
    const quickInputPromises = quickInputIds.map(id => storageConfigManager.loadQuickInput(id));
    const quickInputs = await Promise.all(quickInputPromises);

    // Filter out null values (deleted or corrupted items)
    const validQuickInputs = quickInputs.filter(qi => qi !== null);

    // If some items were filtered out, update the index
    if (validQuickInputs.length !== quickInputIds.length) {
      const validIds = validQuickInputs.map(qi => qi.id);
      await storageConfigManager.saveQuickInputsIndex(validIds);
      storageConfigLogger.info(`Cleaned up quick inputs index, removed ${quickInputIds.length - validQuickInputs.length} invalid items`);
    }

    return validQuickInputs;
  } catch (error) {
    storageConfigLogger.error('Error loading all quick inputs:', error.message);
    return storageConfigManager.getDefaultQuickInputs();
  }
}

// Save all quick inputs (completely replace existing ones)
storageConfigManager.saveAllQuickInputs = async function(quickInputs, forceTimestampUpdate = false) {
  try {
    storageConfigLogger.info(`Saving ${quickInputs.length} quick inputs (forceTimestampUpdate: ${forceTimestampUpdate})`);

    // Get current index to know which items to delete
    const currentIndex = await storageConfigManager.loadQuickInputsIndex();

    // Assign IDs to new quick inputs and save them
    const newIds = [];
    const savePromises = [];

    for (const quickInput of quickInputs) {
      // Assign ID if not present
      if (!quickInput.id) {
        quickInput.id = storageConfigManager.generateQuickInputId();
      }

      newIds.push(quickInput.id);

      // Always use saveQuickInput which preserves existing timestamps
      // Timestamps are already calculated correctly in calculateConfigTimestamps
      savePromises.push(storageConfigManager.saveQuickInput(quickInput));
    }

    // Save all quick inputs in parallel
    await Promise.all(savePromises);

    // Save new index
    await storageConfigManager.saveQuickInputsIndex(newIds);

    // Clean up old quick inputs that are no longer needed
    const idsToDelete = currentIndex.filter(id => !newIds.includes(id));
    if (idsToDelete.length > 0) {
      const deletePromises = idsToDelete.map(id => storageConfigManager.deleteQuickInput(id));
      await Promise.all(deletePromises);
    }

    return true;
  } catch (error) {
    storageConfigLogger.error('Error saving all quick inputs:', error.message);
    throw error;
  }
}

// Initialize configuration if needed
storageConfigManager.initializeIfNeeded = async function() {
  try {
    // Check main config
    const mainResult = await chrome.storage.local.get(MAIN_CONFIG_KEY);

    if (!mainResult[MAIN_CONFIG_KEY]) {
      storageConfigLogger.info('Initializing default configuration');
      const defaultConfig = await storageConfigManager.getDefaultConfig();
      // Use isUserModification = false to avoid triggering getConfig during initialization
      await storageConfigManager.saveConfig(defaultConfig, false);
    }
  } catch (error) {
    storageConfigLogger.error('Configuration initialization error:', error.message);
  }
}

// Get current configuration
storageConfigManager.getConfig = async function() {
  try {
    // Get main config, system prompt, blacklist, and sync config in parallel
    // Use safe blacklist loading to avoid circular dependencies during initialization
    const [mainResult, systemPromptResult, blacklistConfig, syncConfigData] = await Promise.all([
      chrome.storage.local.get(MAIN_CONFIG_KEY),
      chrome.storage.local.get(SYSTEM_PROMPT_KEY),
      storageConfigManager.getBlacklistConfigSafe(),
      typeof syncConfig !== 'undefined' ? syncConfig.getExportableConfig() : Promise.resolve({})
    ]);

    // Get default config for merging
    const defaultConfig = await storageConfigManager.getDefaultConfig();

    if (mainResult[MAIN_CONFIG_KEY]) {
      const storedMainConfig = mainResult[MAIN_CONFIG_KEY];

      // Check if stored config is in old format and convert to new format
      let mergedConfig;
      if (storedMainConfig.llm && !storedMainConfig.llm_models) {
        // Old format - convert to new format
        mergedConfig = {
          llm_models: {
            ...defaultConfig.llm_models,
            ...storedMainConfig.llm
          },
          quickInputs: await storageConfigManager.loadAllQuickInputs(),
          basic: {
            ...defaultConfig.basic,
            defaultExtractionMethod: storedMainConfig.defaultExtractionMethod || defaultConfig.basic.defaultExtractionMethod,
            jinaApiKey: storedMainConfig.jinaApiKey || defaultConfig.basic.jinaApiKey,
            jinaResponseTemplate: storedMainConfig.jinaResponseTemplate || defaultConfig.basic.jinaResponseTemplate,
            contentDisplayHeight: storedMainConfig.contentDisplayHeight || defaultConfig.basic.contentDisplayHeight,
            theme: storedMainConfig.theme || defaultConfig.basic.theme,
            defaultModelId: storedMainConfig.llm?.defaultModelId || defaultConfig.basic.defaultModelId,
            lastModified: Date.now() // Update timestamp for format conversion
          }
        };
        storageConfigLogger.info('Converted old config format to new format');
      } else {
        // New format - merge with defaults
        mergedConfig = {
          llm_models: {
            ...defaultConfig.llm_models,
            ...storedMainConfig.llm_models
          },
          quickInputs: await storageConfigManager.loadAllQuickInputs(),
          basic: {
            ...defaultConfig.basic,
            ...storedMainConfig.basic,
            // Handle migration of defaultModelId from llm_models to basic
            defaultModelId: storedMainConfig.basic?.defaultModelId ||
                           storedMainConfig.llm_models?.defaultModelId ||
                           defaultConfig.basic.defaultModelId
          }
        };

        // Remove defaultModelId from llm_models if it exists there (migration cleanup)
        if (mergedConfig.llm_models.defaultModelId) {
          delete mergedConfig.llm_models.defaultModelId;
        }
      }

      // Add system prompt (from separate storage or basic config)
      let systemPrompt = mergedConfig.basic.systemPrompt || storageConfigManager.getDefaultSystemPrompt();

      // Decompress system prompt if needed
      if (systemPromptResult[SYSTEM_PROMPT_KEY]) {
        if (typeof quickInputCompression !== 'undefined') {
          systemPrompt = quickInputCompression.decompressText(systemPromptResult[SYSTEM_PROMPT_KEY]);
        } else {
          systemPrompt = systemPromptResult[SYSTEM_PROMPT_KEY];
        }
      }

      mergedConfig.basic.systemPrompt = systemPrompt;

      // Add blacklist configuration
      mergedConfig.blacklist = blacklistConfig;

      // Add sync configuration
      mergedConfig.sync = syncConfigData;

      // Ensure existing models have maxTokens, temperature, baseUrl, and lastModified fields
      if (mergedConfig.llm_models?.models) {
        let needsModelUpdate = false;
        mergedConfig.llm_models.models.forEach(model => {
          if (model.maxTokens === undefined) {
            model.maxTokens = model.provider === 'gemini' ? 8192 : 4000;
            needsModelUpdate = true;
          }
          if (model.temperature === undefined) {
            model.temperature = 0.7;
            needsModelUpdate = true;
          }
          if (model.baseUrl === undefined) {
            model.baseUrl = model.provider === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.openai.com';
            needsModelUpdate = true;
          }
          // Add lastModified timestamp if missing (system update, not user modification)
          if (model.lastModified === undefined) {
            model.lastModified = Date.now();
            needsModelUpdate = true;
            storageConfigLogger.debug(`Added lastModified timestamp to existing model: ${model.id}`);
          }
        });

        // Ensure basic config has lastModified timestamp
        if (!mergedConfig.basic.lastModified) {
          mergedConfig.basic.lastModified = Date.now();
          needsModelUpdate = true;
          storageConfigLogger.debug('Added lastModified timestamp to basic config');
        }

        if (needsModelUpdate) {
          // Use isUserModification = false to avoid timestamp recalculation for system updates
          await storageConfigManager.saveConfig(mergedConfig, false);
          storageConfigLogger.info('Updated existing config with missing fields including timestamps');
        }
      }

      return mergedConfig;
    } else {
      // No config found, initialize and return default
      const defaultConfig = await storageConfigManager.getDefaultConfig();

      // Add blacklist and sync configurations to default config
      defaultConfig.blacklist = blacklistConfig;
      defaultConfig.sync = syncConfigData;

      await storageConfigManager.saveConfig(defaultConfig);
      storageConfigLogger.info('Using default configuration');
      return defaultConfig;
    }
  } catch (error) {
    storageConfigLogger.error('Get configuration error:', error.message);
    const defaultConfig = await storageConfigManager.getDefaultConfig();

    // Add empty blacklist and sync configurations for error case
    defaultConfig.blacklist = { patterns: [] };
    defaultConfig.sync = {};

    return defaultConfig;
  }
}

// Save configuration with split storage to avoid quota limits
storageConfigManager.saveConfig = async function(newConfig, isUserModification = true) {
  try {
    // If this is a user modification, compare with existing config to calculate accurate timestamps
    let processedConfig = newConfig;
    if (isUserModification) {
      try {
        const existingConfig = await storageConfigManager.getConfig();
        processedConfig = storageConfigManager.calculateConfigTimestamps(newConfig, existingConfig);
        storageConfigLogger.debug('Calculated timestamps for modified configuration items');
      } catch (error) {
        storageConfigLogger.warn('Could not load existing config for timestamp comparison, using new timestamps:', error.message);
        // Fallback: add timestamps to new items
        processedConfig = storageConfigManager.addTimestampsToNewConfig(newConfig);
      }
    }

    // Extract main config based on new format
    let mainConfig, quickInputs, systemPrompt;

    if (processedConfig.llm_models && processedConfig.basic) {
      // New format
      mainConfig = {
        llm_models: processedConfig.llm_models,
        basic: processedConfig.basic
      };
      quickInputs = processedConfig.quickInputs || storageConfigManager.getDefaultQuickInputs();
      systemPrompt = processedConfig.basic.systemPrompt || storageConfigManager.getDefaultSystemPrompt();
    } else {
      // Old format - convert to new format for storage
      const oldLlmConfig = processedConfig.llm || { models: [] };
      mainConfig = {
        llm_models: {
          models: oldLlmConfig.models || []
        },
        basic: {
          defaultExtractionMethod: processedConfig.defaultExtractionMethod || 'readability',
          jinaApiKey: processedConfig.jinaApiKey || '',
          jinaResponseTemplate: processedConfig.jinaResponseTemplate || '# {title}\n\n**URL:** {url}\n\n**Description:** {description}\n\n## Content\n\n{content}',
          systemPrompt: processedConfig.systemPrompt || storageConfigManager.getDefaultSystemPrompt(),
          contentDisplayHeight: processedConfig.contentDisplayHeight || 100,
          theme: processedConfig.theme || 'system',
          defaultModelId: oldLlmConfig.defaultModelId || 'gemini-pro',
          lastModified: Date.now()
        }
      };
      quickInputs = processedConfig.quickInputs || storageConfigManager.getDefaultQuickInputs();
      systemPrompt = processedConfig.systemPrompt || storageConfigManager.getDefaultSystemPrompt();
    }

    // Compress system prompt using pako compression if available
    let systemPromptToSave = systemPrompt;
    if (typeof quickInputCompression !== 'undefined') {
      // Use quick input compression for system prompt as well since it uses pako
      // Note: Create a simple object to use the compressQuickInputs function
      const systemPromptObj = { text: systemPrompt };
      const compressedResult = quickInputCompression.compressQuickInputs(systemPromptObj);
      const compressedSystemPrompt = (compressedResult !== systemPromptObj) ? compressedResult : systemPrompt;
      if (compressedSystemPrompt !== systemPrompt) {
        systemPromptToSave = compressedSystemPrompt;
      }
    } else {
      storageConfigLogger.warn('Pako compression not available for system prompt, storing uncompressed');
    }

    // Save all parts with error handling
    const savePromises = [
      chrome.storage.local.set({ [MAIN_CONFIG_KEY]: mainConfig }).catch(error => {
        storageConfigLogger.error('Error saving main config:', error.message);
        throw new Error(`Main config save failed: ${error.message}`);
      }),
      storageConfigManager.saveAllQuickInputs(quickInputs, isUserModification).catch(error => {
        storageConfigLogger.error('Error saving quick inputs:', error.message);
        throw new Error(`Quick inputs save failed: ${error.message}`);
      }),
      chrome.storage.local.set({ [SYSTEM_PROMPT_KEY]: systemPromptToSave }).catch(error => {
        storageConfigLogger.error('Error saving system prompt:', error.message);
        throw new Error(`System prompt save failed: ${error.message}`);
      })
    ];

    // Save blacklist configuration if provided
    if (newConfig.blacklist && typeof blacklistManager !== 'undefined') {
      savePromises.push(
        blacklistManager.importConfig(newConfig.blacklist).catch(error => {
          storageConfigLogger.error('Error saving blacklist config:', error.message);
          throw new Error(`Blacklist config save failed: ${error.message}`);
        })
      );
    }

    // Save sync configuration if provided (excluding sensitive data)
    if (newConfig.sync && typeof syncConfig !== 'undefined') {
      savePromises.push(
        (async () => {
          try {
            const currentSyncConfig = await syncConfig.getSyncConfig();
            const updatedSyncConfig = {
              ...currentSyncConfig,
              enabled: newConfig.sync.enabled !== undefined ? newConfig.sync.enabled : currentSyncConfig.enabled,
              autoSync: newConfig.sync.autoSync !== undefined ? newConfig.sync.autoSync : currentSyncConfig.autoSync,
              deviceId: newConfig.sync.deviceId || currentSyncConfig.deviceId
              // Keep existing gistToken and gistId for security
            };
            await syncConfig.saveSyncConfig(updatedSyncConfig);
          } catch (error) {
            storageConfigLogger.error('Error saving sync config:', error.message);
            throw new Error(`Sync config save failed: ${error.message}`);
          }
        })()
      );
    }

    await Promise.all(savePromises);

    return true;
  } catch (error) {
    storageConfigLogger.error('Error saving configuration:', error.message);
    return false;
  }
}

// Reset configuration to defaults
storageConfigManager.resetConfig = async function() {
  try {
    const defaultConfig = await storageConfigManager.getDefaultConfig();
    await storageConfigManager.saveConfig(defaultConfig);
    storageConfigLogger.info('Configuration reset to default values');
    return true;
  } catch (error) {
    storageConfigLogger.error('Reset configuration error:', error.message);
    return false;
  }
}

// Check storage usage and warn if approaching limits
storageConfigManager.checkStorageUsage = async function() {
  try {
    const storageInfo = await chrome.storage.local.getBytesInUse(null);
    const maxBytes = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB default for local storage
    const maxBytesPerItem = chrome.storage.local.QUOTA_BYTES_PER_ITEM || 10485760; // 10MB default for local storage

    storageConfigLogger.info(`Storage usage: ${storageInfo}/${maxBytes} bytes (${Math.round(storageInfo/maxBytes*100)}%)`);

    // Check individual items
    const [mainUsage, quickInputsIndexUsage, systemPromptUsage] = await Promise.all([
      chrome.storage.local.getBytesInUse(MAIN_CONFIG_KEY),
      chrome.storage.local.getBytesInUse(QUICK_INPUTS_INDEX_KEY),
      chrome.storage.local.getBytesInUse(SYSTEM_PROMPT_KEY)
    ]);

    // Calculate quick inputs total usage
    const quickInputIds = await storageConfigManager.loadQuickInputsIndex();
    let quickInputsTotalUsage = quickInputsIndexUsage;

    if (quickInputIds.length > 0) {
      const quickInputKeys = quickInputIds.map(id => KeyHelpers.getQuickInputKey(id));
      const quickInputUsages = await Promise.all(
        quickInputKeys.map(key => chrome.storage.local.getBytesInUse(key))
      );
      quickInputsTotalUsage += quickInputUsages.reduce((sum, usage) => sum + usage, 0);
    }

    storageConfigLogger.info(`Config sizes - Main: ${mainUsage}B, QuickInputs: ${quickInputsTotalUsage}B (${quickInputIds.length} items), SystemPrompt: ${systemPromptUsage}B`);

    // Warn if any item is approaching the per-item limit
    const warnThreshold = maxBytesPerItem * 0.8; // 80% of limit
    if (mainUsage > warnThreshold) {
      storageConfigLogger.warn(`Main config approaching size limit: ${mainUsage}/${maxBytesPerItem} bytes`);
    }
    if (systemPromptUsage > warnThreshold) {
      storageConfigLogger.warn(`System prompt approaching size limit: ${systemPromptUsage}/${maxBytesPerItem} bytes`);
    }

    return {
      total: storageInfo,
      maxTotal: maxBytes,
      main: mainUsage,
      quickInputs: quickInputsTotalUsage,
      quickInputsCount: quickInputIds.length,
      systemPrompt: systemPromptUsage,
      maxPerItem: maxBytesPerItem
    };
  } catch (error) {
    storageConfigLogger.error('Error checking storage usage:', error.message);
    return null;
  }
}

// Calculate accurate modification timestamps by comparing new config with existing config
storageConfigManager.calculateConfigTimestamps = function(newConfig, existingConfig) {
  const processedConfig = JSON.parse(JSON.stringify(newConfig)); // Deep copy
  const currentTime = Date.now();

  // Process Quick Inputs
  if (processedConfig.quickInputs && Array.isArray(processedConfig.quickInputs)) {
    processedConfig.quickInputs.forEach(newItem => {
      const existingItem = existingConfig.quickInputs?.find(item => item.id === newItem.id);

      if (existingItem) {
        // Compare all fields to determine if item was actually modified
        const fieldsChanged = ['displayText', 'sendText', 'autoTrigger'].some(field =>
          existingItem[field] !== newItem[field]
        );

        if (fieldsChanged) {
          newItem.lastModified = currentTime;
          storageConfigLogger.debug(`Updated timestamp for modified quick input: ${newItem.id}`);
        } else {
          // Preserve existing timestamp if no changes
          newItem.lastModified = existingItem.lastModified || currentTime;
        }
      } else {
        // New item
        newItem.lastModified = currentTime;
        storageConfigLogger.debug(`Added timestamp for new quick input: ${newItem.id}`);
      }
    });
  }

  // Process LLM Models (support both old and new format)
  const llmModels = processedConfig.llm_models?.models || processedConfig.llm?.models;
  const existingLlmModels = existingConfig.llm_models?.models || existingConfig.llm?.models;

  if (llmModels && Array.isArray(llmModels)) {
    llmModels.forEach(newModel => {
      const existingModel = existingLlmModels?.find(model => model.id === newModel.id);

      if (existingModel) {
        // Compare all fields to determine if model was actually modified
        const fieldsChanged = ['name', 'provider', 'apiKey', 'baseUrl', 'model', 'maxTokens', 'temperature', 'enabled'].some(field =>
          existingModel[field] !== newModel[field]
        );

        if (fieldsChanged) {
          newModel.lastModified = currentTime;
          storageConfigLogger.debug(`Updated timestamp for modified model: ${newModel.id}`);
        } else {
          // Preserve existing timestamp if no changes
          newModel.lastModified = existingModel.lastModified || currentTime;
        }
      } else {
        // New model
        newModel.lastModified = currentTime;
        storageConfigLogger.debug(`Added timestamp for new model: ${newModel.id}`);
      }
    });
  }

  // Process Basic Configuration
  if (processedConfig.basic) {
    const existingBasic = existingConfig.basic;

    if (existingBasic) {
      // Compare basic config fields to determine if anything was modified
      const basicFields = ['defaultExtractionMethod', 'jinaApiKey', 'jinaResponseTemplate', 'systemPrompt', 'contentDisplayHeight', 'theme', 'defaultModelId', 'language'];
      const fieldsChanged = basicFields.some(field =>
        existingBasic[field] !== processedConfig.basic[field]
      );

      if (fieldsChanged) {
        processedConfig.basic.lastModified = currentTime;
        storageConfigLogger.debug('Updated timestamp for modified basic config');
      } else {
        // Preserve existing timestamp if no changes
        processedConfig.basic.lastModified = existingBasic.lastModified || currentTime;
      }
    } else {
      // New basic config
      processedConfig.basic.lastModified = currentTime;
      storageConfigLogger.debug('Added timestamp for new basic config');
    }
  }

  return processedConfig;
};

// Add timestamps to new configuration items (fallback when existing config is not available)
storageConfigManager.addTimestampsToNewConfig = function(config) {
  const processedConfig = JSON.parse(JSON.stringify(config)); // Deep copy
  const currentTime = Date.now();

  // Add timestamps to Quick Inputs
  if (processedConfig.quickInputs && Array.isArray(processedConfig.quickInputs)) {
    processedConfig.quickInputs.forEach(item => {
      if (!item.lastModified) {
        item.lastModified = currentTime;
      }
    });
  }

  // Add timestamps to LLM Models (support both old and new format)
  const llmModels = processedConfig.llm_models?.models || processedConfig.llm?.models;
  if (llmModels && Array.isArray(llmModels)) {
    llmModels.forEach(model => {
      if (!model.lastModified) {
        model.lastModified = currentTime;
      }
    });
  }

  // Add timestamp to Basic Configuration
  if (processedConfig.basic && !processedConfig.basic.lastModified) {
    processedConfig.basic.lastModified = currentTime;
  }

  return processedConfig;
};

// Maintain backward compatibility by creating an alias
var configManager = storageConfigManager;