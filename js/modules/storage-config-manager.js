// Storage Configuration Manager Module
// Core storage operations for configuration data
// Handles Chrome Storage API operations, compression, and storage optimization

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
      defaultExtractionMethod: 'readability',
      jinaApiKey: '',
      jinaResponseTemplate: '# {title}\n\n**URL:** {url}\n\n**Description:** {description}\n\n## Content\n\n{content}',
      llm: {
        defaultModelId: 'gemini-pro',
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
            enabled: true
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
            enabled: true
          }
        ]
      },
      systemPrompt: 'Output in Chinese',
      quickInputs: [
        { displayText: 'Summarize', sendText: 'Provide a concise summary of the following article:\n\n{CONTENT}' },
        { displayText: 'Extract Key Points', sendText: 'Extract key points from this content:\n{CONTENT}' }
      ],
      contentDisplayHeight: 100,
      theme: 'system'
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
    { displayText: 'Summarize', sendText: 'Provide a concise summary of the following article:\n\n{CONTENT}' },
    { displayText: 'Extract Key Points', sendText: 'Extract key points from this content:\n{CONTENT}' }
  ];
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
    await chrome.storage.sync.set({ [key]: dataToSave });
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
    await chrome.storage.sync.set({ [key]: dataToSave });

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
    const result = await chrome.storage.sync.get(key);
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
    await chrome.storage.sync.remove(key);
    return true;
  } catch (error) {
    storageConfigLogger.error(`Error deleting quick input ${id}:`, error.message);
    return false;
  }
}

// Save quick inputs index
storageConfigManager.saveQuickInputsIndex = async function(quickInputIds) {
  try {
    await chrome.storage.sync.set({ [QUICK_INPUTS_INDEX_KEY]: quickInputIds });
    return true;
  } catch (error) {
    storageConfigLogger.error('Error saving quick inputs index:', error.message);
    throw error;
  }
}

// Load quick inputs index
storageConfigManager.loadQuickInputsIndex = async function() {
  try {
    const result = await chrome.storage.sync.get(QUICK_INPUTS_INDEX_KEY);
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

      // Use appropriate save method based on whether we need to force timestamp update
      if (forceTimestampUpdate) {
        savePromises.push(storageConfigManager.saveQuickInputWithTimestamp(quickInput));
      } else {
        savePromises.push(storageConfigManager.saveQuickInput(quickInput));
      }
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
    const mainResult = await chrome.storage.sync.get(MAIN_CONFIG_KEY);

    if (!mainResult[MAIN_CONFIG_KEY]) {
      storageConfigLogger.info('Initializing default configuration');
      const defaultConfig = await storageConfigManager.getDefaultConfig();
      await storageConfigManager.saveConfig(defaultConfig);
    }
  } catch (error) {
    storageConfigLogger.error('Configuration initialization error:', error.message);
  }
}

// Get current configuration
storageConfigManager.getConfig = async function() {
  try {
    // Get main config, system prompt, blacklist, and sync config in parallel
    const [mainResult, systemPromptResult, blacklistConfig, syncConfigData] = await Promise.all([
      chrome.storage.sync.get(MAIN_CONFIG_KEY),
      chrome.storage.sync.get(SYSTEM_PROMPT_KEY),
      typeof blacklistManager !== 'undefined' ? blacklistManager.getExportableConfig() : Promise.resolve({ patterns: [] }),
      typeof syncConfig !== 'undefined' ? syncConfig.getExportableConfig() : Promise.resolve({})
    ]);

    // Get default config for merging
    const defaultConfig = await storageConfigManager.getDefaultConfig();

    if (mainResult[MAIN_CONFIG_KEY]) {
      const storedMainConfig = mainResult[MAIN_CONFIG_KEY];

      // Start with main config merged with defaults
      const mergedConfig = {
        ...defaultConfig,
        ...storedMainConfig,
        llm: {
          ...defaultConfig.llm,
          ...storedMainConfig.llm
        }
      };

      // Add quick inputs (loaded separately)
      mergedConfig.quickInputs = await storageConfigManager.loadAllQuickInputs();

      // Add system prompt (from separate storage or default)
      let systemPrompt = mergedConfig.systemPrompt || storageConfigManager.getDefaultSystemPrompt();

      // Decompress system prompt if needed
      if (systemPromptResult[SYSTEM_PROMPT_KEY]) {
        if (typeof quickInputCompression !== 'undefined') {
          systemPrompt = quickInputCompression.decompressText(systemPromptResult[SYSTEM_PROMPT_KEY]);
        } else {
          systemPrompt = systemPromptResult[SYSTEM_PROMPT_KEY];
        }
      }

      mergedConfig.systemPrompt = systemPrompt;

      // Add blacklist configuration
      mergedConfig.blacklist = blacklistConfig;

      // Add sync configuration
      mergedConfig.sync = syncConfigData;

      // Ensure existing models have maxTokens, temperature, and baseUrl fields
      if (mergedConfig.llm?.models) {
        let needsModelUpdate = false;
        mergedConfig.llm.models.forEach(model => {
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
        });

        if (needsModelUpdate) {
          await storageConfigManager.saveConfig(mergedConfig);
          storageConfigLogger.info('Updated existing models with maxTokens, temperature, and baseUrl fields');
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
    // Extract main config (without quick inputs and system prompt)
    const mainConfig = {
      defaultExtractionMethod: newConfig.defaultExtractionMethod,
      jinaApiKey: newConfig.jinaApiKey,
      jinaResponseTemplate: newConfig.jinaResponseTemplate,
      llm: newConfig.llm,
      contentDisplayHeight: newConfig.contentDisplayHeight
    };
    if (newConfig.theme) {
      mainConfig.theme = newConfig.theme;
    }

    // Extract quick inputs
    const quickInputs = newConfig.quickInputs || storageConfigManager.getDefaultQuickInputs();

    // Extract system prompt
    const systemPrompt = newConfig.systemPrompt || storageConfigManager.getDefaultSystemPrompt();

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
      chrome.storage.sync.set({ [MAIN_CONFIG_KEY]: mainConfig }).catch(error => {
        storageConfigLogger.error('Error saving main config:', error.message);
        throw new Error(`Main config save failed: ${error.message}`);
      }),
      storageConfigManager.saveAllQuickInputs(quickInputs, isUserModification).catch(error => {
        storageConfigLogger.error('Error saving quick inputs:', error.message);
        throw new Error(`Quick inputs save failed: ${error.message}`);
      }),
      chrome.storage.sync.set({ [SYSTEM_PROMPT_KEY]: systemPromptToSave }).catch(error => {
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
    const storageInfo = await chrome.storage.sync.getBytesInUse(null);
    const maxBytes = chrome.storage.sync.QUOTA_BYTES || 102400; // 100KB default
    const maxBytesPerItem = chrome.storage.sync.QUOTA_BYTES_PER_ITEM || 8192; // 8KB default

    storageConfigLogger.info(`Storage usage: ${storageInfo}/${maxBytes} bytes (${Math.round(storageInfo/maxBytes*100)}%)`);

    // Check individual items
    const [mainUsage, quickInputsIndexUsage, systemPromptUsage] = await Promise.all([
      chrome.storage.sync.getBytesInUse(MAIN_CONFIG_KEY),
      chrome.storage.sync.getBytesInUse(QUICK_INPUTS_INDEX_KEY),
      chrome.storage.sync.getBytesInUse(SYSTEM_PROMPT_KEY)
    ]);

    // Calculate quick inputs total usage
    const quickInputIds = await storageConfigManager.loadQuickInputsIndex();
    let quickInputsTotalUsage = quickInputsIndexUsage;

    if (quickInputIds.length > 0) {
      const quickInputKeys = quickInputIds.map(id => KeyHelpers.getQuickInputKey(id));
      const quickInputUsages = await Promise.all(
        quickInputKeys.map(key => chrome.storage.sync.getBytesInUse(key))
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

// Maintain backward compatibility by creating an alias
var configManager = storageConfigManager;