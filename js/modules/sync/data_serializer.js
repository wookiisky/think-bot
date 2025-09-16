// Think Bot Data Serializer Module
// Handles data compression, serialization and version control for sync
// Note: storage-keys.js should be loaded before this module

// Create a global dataSerializer object
var dataSerializer = {};

// Create module logger
const serializerLogger = logger.createModuleLogger('DataSerializer');

// Data version for compatibility
const SYNC_DATA_VERSION = '1.0.0';
const SYNC_FILE_PREFIX = 'thinkbot-sync-data';

// Check if compression module is available
const compressionAvailable = typeof compressionModule !== 'undefined';
if (!compressionAvailable) {
  serializerLogger.warn('Compression module not available, sync data will be processed uncompressed');
}

/**
 * Safe JSON stringify that handles circular references and deep objects
 */
function safeJSONStringify(obj, space = null) {
  const seen = new WeakSet();
  const maxDepth = 50; // Prevent extremely deep nesting

  function replacer(_, value, depth = 0) {
    if (depth > maxDepth) {
      return '[Max Depth Exceeded]';
    }

    if (value != null && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);

      // Handle arrays and objects
      if (Array.isArray(value)) {
        return value.map((item, index) => replacer(index, item, depth + 1));
      } else {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = replacer(k, v, depth + 1);
        }
        return result;
      }
    }

    return value;
  }

  try {
    const processedObj = replacer('', obj);
    return JSON.stringify(processedObj, null, space);
  } catch (error) {
    serializerLogger.error('Safe JSON stringify failed:', error.message);
    return JSON.stringify({ error: 'Serialization failed', message: error.message });
  }
}

/**
 * Collect all local data for sync
 */
dataSerializer.collectLocalData = async function() {
  try {
    serializerLogger.info('Collecting local data for sync');
    
    // Get configuration data
    const config = await configManager.getConfig();
    
    // Get all cached page data
    const pageCache = await this.collectPageCache();
    
    // Get all chat history
    const chatHistory = await this.collectChatHistory();
    
    // Get sync configuration (excluding sensitive data for metadata)
    const syncSettings = await syncConfig.getExportableConfig();

    const syncData = {
      metadata: {
        version: SYNC_DATA_VERSION,
        timestamp: Date.now(),
        deviceId: syncSettings.deviceId,
        syncId: this.generateSyncId(),
        dataTypes: ['config', 'pageCache', 'chatHistory'],
        totalSize: 0 // Will be calculated after serialization
      },
      config: {
        // Support both old and new config formats
        llm_models: config.llm_models || config.llm,
        quickInputs: config.quickInputs,
        basic: config.basic || {
          defaultExtractionMethod: config.defaultExtractionMethod,
          jinaApiKey: config.jinaApiKey,
          jinaResponseTemplate: config.jinaResponseTemplate,
          systemPrompt: config.systemPrompt,
          contentDisplayHeight: config.contentDisplayHeight,
          theme: config.theme,
          defaultModelId: (config.llm_models && config.llm_models.defaultModelId) ||
                         (config.llm && config.llm.defaultModelId) ||
                         'gemini-pro',
          lastModified: Date.now()
        }
      },
      pageCache: pageCache,
      chatHistory: chatHistory
    };
    
    serializerLogger.info('Local data collected successfully:', {
      configKeys: Object.keys(syncData.config).length,
      pageCacheCount: Object.keys(pageCache).length,
      chatHistoryCount: Object.keys(chatHistory).length,
      metadata: syncData.metadata
    });
    
    return syncData;
  } catch (error) {
    serializerLogger.error('Error collecting local data:', error.message);
    throw error;
  }
};

/**
 * Collect page cache data
 */
dataSerializer.collectPageCache = async function() {
  try {
    const allData = await chrome.storage.local.get(null);
    const pageCache = {};
    
    for (const key in allData) {
      if (key.startsWith(CACHE_KEYS.PAGE_PREFIX)) {
        const urlHash = key.replace(CACHE_KEYS.PAGE_PREFIX, '');
        const pageData = allData[key];
        
        // Decompress data if needed
        if (pageData.content) {
          for (const method in pageData.content) {
            const contentEntry = pageData.content[method];
            if (contentEntry && contentEntry.data && compressionAvailable) {
              contentEntry.data = cacheCompression.decompressPageContent(contentEntry.data);
            }
          }
        }
        
        pageCache[urlHash] = pageData;
      }
    }
    
    serializerLogger.info('Page cache collected:', { count: Object.keys(pageCache).length });
    return pageCache;
  } catch (error) {
    serializerLogger.error('Error collecting page cache:', error.message);
    return {};
  }
};

/**
 * Collect chat history data
 */
dataSerializer.collectChatHistory = async function() {
  try {
    const allData = await chrome.storage.local.get(null);
    const chatHistory = {};
    
    for (const key in allData) {
      if (key.startsWith(CACHE_KEYS.CHAT_PREFIX)) {
        const urlHash = key.replace(CACHE_KEYS.CHAT_PREFIX, '');
        let chatData = allData[key];
        
        // Decompress chat history if needed
        if (compressionAvailable && cacheCompression.decompressChatHistory) {
          chatData = cacheCompression.decompressChatHistory(chatData);
        }
        
        chatHistory[urlHash] = chatData;
      }
    }
    
    serializerLogger.info('Chat history collected:', { count: Object.keys(chatHistory).length });
    return chatHistory;
  } catch (error) {
    serializerLogger.error('Error collecting chat history:', error.message);
    return {};
  }
};

/**
 * Serialize and compress data for upload
 */
dataSerializer.serializeForUpload = function(data) {
  try {
    serializerLogger.debug('Starting serialization for upload:', {
      hasMetadata: !!data.metadata,
      metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
      topLevelKeys: Object.keys(data)
    });

    // Create a safe copy of data with metadata
    const dataForSerialization = {
      ...data,
      metadata: {
        ...data.metadata,
        serializedAt: Date.now()
      }
    };

    // First serialization to get size using safe stringify
    const jsonString = safeJSONStringify(dataForSerialization, 2);
    const originalSize = new Blob([jsonString]).size;

    // Update metadata with size information
    dataForSerialization.metadata.totalSize = originalSize;
    
    // Use compression if available and beneficial
    let finalContent = jsonString;
    let compressed = false;
    
    if (compressionAvailable && compressionModule) {
      try {
        // Use the dedicated sync compression configuration
        const syncConfig = (typeof COMPRESSION_CONFIG !== 'undefined' &&
                           COMPRESSION_CONFIG.CONFIGS &&
                           COMPRESSION_CONFIG.CONFIGS.SYNC) ?
                           COMPRESSION_CONFIG.CONFIGS.SYNC : {
                             MIN_SIZE_FOR_COMPRESSION: 512,
                             COMPRESSION_THRESHOLD: 0.85,
                             TYPE_NAME: 'sync'
                           };

        const compressedData = compressionModule.compress(jsonString, syncConfig);
        
        if (typeof compressedData === 'object' && compressedData.__compressed__) {
          finalContent = safeJSONStringify(compressedData);
          compressed = true;
          serializerLogger.debug('Data compressed successfully, checking final content structure');
        }
      } catch (compressionError) {
        serializerLogger.warn('Compression failed, using uncompressed data:', compressionError.message);
      }
    }
    
    const finalSize = new Blob([finalContent]).size;
    
    const compressionRatio = compressed ? (finalSize / originalSize) : 1;
    const spaceSaved = originalSize - finalSize;

    // Verify that the final content contains metadata
    try {
      const testParse = JSON.parse(finalContent);
      // If compressed, we can't check for metadata without decompressing, which is inefficient.
      // We'll trust that if the __compressed__ flag is there, the metadata is inside.
      // The deserializer is responsible for the full validation after decompression.
      const hasMetadata = compressed ? (testParse && testParse.__compressed__) : (testParse && !!testParse.metadata);

      serializerLogger.info('Data serialized for upload:', {
        originalSize: `${(originalSize / 1024).toFixed(2)} KB`,
        finalSize: `${(finalSize / 1024).toFixed(2)} KB`,
        compressed,
        compressionRatio: compressionRatio.toFixed(3),
        spaceSaved: compressed ? `${(spaceSaved / 1024).toFixed(2)} KB` : '0 KB',
        compressionPercentage: compressed ? `${((1 - compressionRatio) * 100).toFixed(1)}%` : '0%',
        finalContentHasMetadata: hasMetadata
      });

      if (!hasMetadata) {
        serializerLogger.error('CRITICAL: Final serialized content is missing metadata or compression flag!');
      }
    } catch (verifyError) {
      serializerLogger.error('Failed to verify final content structure:', verifyError.message);
    }

    return {
      content: finalContent,
      metadata: {
        originalSize,
        finalSize,
        compressed,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    serializerLogger.error('Error serializing data for upload:', error.message);
    throw error;
  }
};

/**
 * Deserialize and decompress data from download
 */
dataSerializer.deserializeFromDownload = function(content) {
  try {
    // Handle empty or whitespace-only content
    if (!content || typeof content !== 'string' || content.trim() === '') {
      serializerLogger.warn('Downloaded content is empty, returning null');
      return null;
    }

    // Log the first 200 characters of content for debugging
    serializerLogger.debug('Downloaded content preview:', {
      contentLength: content.length,
      preview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      startsWithBrace: content.trim().startsWith('{'),
      endsWithBrace: content.trim().endsWith('}')
    });

    let data;

    // Try to parse as JSON first
    try {
      data = JSON.parse(content);
    } catch (parseError) {
      serializerLogger.error('Invalid JSON format in downloaded data:', {
        error: parseError.message,
        contentPreview: content.substring(0, 500)
      });
      throw new Error('Invalid JSON format in downloaded data');
    }

    // Handle null or non-object data
    if (!data || typeof data !== 'object') {
      serializerLogger.warn('Downloaded data is not a valid object, returning null');
      return null;
    }

    // Log data structure for debugging
    serializerLogger.debug('Parsed data structure:', {
      hasMetadata: !!data.metadata,
      hasVersion: !!(data.metadata && data.metadata.version),
      isCompressed: !!data.__compressed__,
      topLevelKeys: Object.keys(data)
    });

    // Check if data is compressed
    if (typeof data === 'object' && data.__compressed__) {
      if (compressionAvailable && compressionModule) {
        try {
          const compressedSize = new Blob([content]).size;
          const decompressed = compressionModule.decompress(data);
          const decompressedSize = new Blob([decompressed]).size;

          serializerLogger.info('Data decompressed from download:', {
            compressedSize: `${(compressedSize / 1024).toFixed(2)} KB`,
            decompressedSize: `${(decompressedSize / 1024).toFixed(2)} KB`,
            expansionRatio: (decompressedSize / compressedSize).toFixed(3),
            method: data.__compression_method__ || 'unknown'
          });

          data = JSON.parse(decompressed);
        } catch (decompressionError) {
          serializerLogger.error('Failed to decompress downloaded data:', decompressionError.message);
          throw new Error('Failed to decompress downloaded data: ' + decompressionError.message);
        }
      } else {
        throw new Error('Downloaded data is compressed but compression module is not available');
      }
    }

    // Validate data structure
    if (!data.metadata || !data.metadata.version) {
      serializerLogger.warn('Downloaded data missing metadata, treating as invalid format', {
        hasMetadata: !!data.metadata,
        metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
        dataKeys: Object.keys(data),
        suggestion: 'This might be old format data. Consider using "Clear Gist Data" button in options to refresh with current format.'
      });
      return null;
    }

    // Check version compatibility
    if (!this.isVersionCompatible(data.metadata.version)) {
      serializerLogger.error(`Incompatible data version: ${data.metadata.version}, expected: ${SYNC_DATA_VERSION}`);
      throw new Error(`Incompatible data version: ${data.metadata.version}, expected: ${SYNC_DATA_VERSION}`);
    }

    serializerLogger.info('Data deserialized from download:', {
      version: data.metadata.version,
      timestamp: data.metadata.timestamp,
      deviceId: data.metadata.deviceId,
      dataTypes: data.metadata.dataTypes
    });

    return data;
  } catch (error) {
    serializerLogger.error('Error deserializing data from download:', error.message);
    throw error;
  }
};

/**
 * Check if data version is compatible
 */
dataSerializer.isVersionCompatible = function(version) {
  // For now, only exact version match is supported
  // In the future, we can implement more sophisticated version compatibility
  return version === SYNC_DATA_VERSION;
};

/**
 * Generate unique sync ID
 */
dataSerializer.generateSyncId = function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `sync_${timestamp}_${random}`;
};

/**
 * Generate filename for sync data
 * Uses a fixed filename to maintain only one sync file in the Gist
 */
dataSerializer.generateSyncFilename = function() {
  return `${SYNC_FILE_PREFIX}.json`;
};

/**
 * Check if filename is a valid sync data file
 */
dataSerializer.isValidSyncFilename = function(filename) {
  return filename === `${SYNC_FILE_PREFIX}.json`;
};

/**
 * Compare two sync data objects to detect conflicts
 */
dataSerializer.compareData = function(localData, remoteData) {
  const comparison = {
    hasConflict: false,
    localNewer: false,
    remoteNewer: false,
    conflicts: []
  };
  
  if (!localData.metadata || !remoteData.metadata) {
    comparison.hasConflict = true;
    comparison.conflicts.push('Missing metadata in one or both datasets');
    return comparison;
  }
  
  const localTime = localData.metadata.timestamp;
  const remoteTime = remoteData.metadata.timestamp;
  
  if (localTime > remoteTime) {
    comparison.localNewer = true;
  } else if (remoteTime > localTime) {
    comparison.remoteNewer = true;
  }
  
  // Check if data comes from different devices at similar times (potential conflict)
  const timeDiff = Math.abs(localTime - remoteTime);
  const devicesDifferent = localData.metadata.deviceId !== remoteData.metadata.deviceId;
  
  if (devicesDifferent && timeDiff < 60000) { // Less than 1 minute difference
    comparison.hasConflict = true;
    comparison.conflicts.push('Simultaneous updates from different devices detected');
  }
  
  serializerLogger.info('Data comparison completed:', comparison);
  return comparison;
};

/**
 * Merge two data objects with intelligent field-level comparison based on modification time
 */
dataSerializer.mergeData = function(localData, remoteData) {
  try {
    serializerLogger.info('Starting intelligent data merge based on modification time');

    // Handle null or invalid data
    if (!localData || !localData.metadata) {
      serializerLogger.error('Local data is null or missing metadata');
      throw new Error('Local data is null or missing metadata');
    }

    if (!remoteData || !remoteData.metadata) {
      serializerLogger.info('Remote data is null or missing metadata, using local data only');
      return localData;
    }

    // Initialize merged data structure
    const mergedData = {
      metadata: {
        version: SYNC_DATA_VERSION, // Always use current version for merged data
        timestamp: Date.now(),
        deviceId: localData.metadata?.deviceId || remoteData.metadata?.deviceId,
        syncId: this.generateSyncId(),
        dataTypes: ['config', 'pageCache', 'chatHistory'],
        totalSize: 0,
        mergedAt: Date.now(),
        mergeStrategy: 'field-level-timestamp-based'
      },
      config: {},
      pageCache: {},
      chatHistory: {}
    };

    // Merge configuration data
    mergedData.config = this.mergeConfigData(localData.config, remoteData.config);

    // Merge page cache data (merge by individual pages based on their timestamps)
    mergedData.pageCache = this.mergePageCacheData(localData.pageCache, remoteData.pageCache);

    // Merge chat history data (select entire chat history per tab based on latest message timestamp)
    mergedData.chatHistory = this.mergeChatHistoryData(localData.chatHistory, remoteData.chatHistory);

    // Clean up deleted items from merged data before upload
    mergedData = this.cleanupDeletedItemsAfterMerge(mergedData);

    serializerLogger.info('Data merged successfully using field-level timestamp comparison:', {
      strategy: 'field-level-timestamp-based',
      configMerged: Object.keys(mergedData.config).length > 0,
      pageCacheCount: Object.keys(mergedData.pageCache).length,
      chatHistoryCount: Object.keys(mergedData.chatHistory).length
    });

    return mergedData;
  } catch (error) {
    serializerLogger.error('Error merging data:', error.message);
    throw error;
  }
};

/**
 * Merge configuration data with intelligent field-level merging for quickInputs
 * Uses timestamp-based merging for Quick Input Tabs to prevent data loss
 */
dataSerializer.mergeConfigData = function(localConfig, remoteConfig) {
  try {
    serializerLogger.info('Starting config data merge with quickInputs field-level merging');

    if (!localConfig && !remoteConfig) {
      return {};
    }

    if (!localConfig) {
      serializerLogger.info('Using remote config (no local config available)');
      return remoteConfig;
    }

    if (!remoteConfig) {
      serializerLogger.info('Using local config (no remote config available)');
      return localConfig;
    }

    // Start with local config as base
    const mergedConfig = { ...localConfig };

    // For most config fields, use remote config (latest sync)
    // But for quickInputs, llm_models, llm, and basic do intelligent merging based on lastModified timestamps
    Object.keys(remoteConfig).forEach(key => {
      if (key === 'quickInputs') {
        // Special handling for quickInputs - merge by individual items
        mergedConfig.quickInputs = this.mergeQuickInputs(localConfig.quickInputs, remoteConfig.quickInputs);
      } else if (key === 'llm_models') {
        // Special handling for new format LLM configuration - merge models by individual items
        mergedConfig.llm_models = this.mergeLlmConfig(localConfig.llm_models, remoteConfig.llm_models);
      } else if (key === 'llm') {
        // Special handling for old format LLM configuration - merge models by individual items
        mergedConfig.llm = this.mergeLlmConfig(localConfig.llm, remoteConfig.llm);
      } else if (key === 'basic') {
        // Special handling for basic configuration - merge based on timestamp
        mergedConfig.basic = this.mergeBasicConfig(localConfig.basic, remoteConfig.basic);
      } else {
        // For other config fields, use remote config (latest sync)
        mergedConfig[key] = remoteConfig[key];
      }
    });

    serializerLogger.info('Config data merge completed with quickInputs and llm models field-level merging');
    return mergedConfig;
  } catch (error) {
    serializerLogger.error('Error merging config data:', error.message);
    return localConfig || remoteConfig || {};
  }
};

/**
 * Get the latest lastModified timestamp from a list of quick inputs
 */
dataSerializer.getQuickInputsListTimestamp = function(quickInputs) {
  if (!Array.isArray(quickInputs) || quickInputs.length === 0) {
    return 0;
  }
  return quickInputs.reduce((latest, item) => {
    const timestamp = item.lastModified || 0;
    return Math.max(latest, timestamp);
  }, 0);
};

/**
 * Merge quickInputs arrays with soft-delete support.
 */
dataSerializer.mergeQuickInputs = function(localQuickInputs = [], remoteQuickInputs = []) {
  try {
    serializerLogger.info('Starting quickInputs merge with soft-delete logic.');

    const allItems = new Map();

    // Process local items
    localQuickInputs.forEach(item => {
      if (item.id) {
        allItems.set(item.id, { local: item });
      }
    });

    // Process remote items
    remoteQuickInputs.forEach(item => {
      if (item.id) {
        const existing = allItems.get(item.id) || {};
        allItems.set(item.id, { ...existing, remote: item });
      }
    });

    const mergedMap = new Map();

    // Merge items based on timestamps and deletion status
    for (const [id, { local, remote }] of allItems.entries()) {
      if (local && remote) {
        const localTimestamp = local.lastModified || 0;
        const remoteTimestamp = remote.lastModified || 0;
        const localIsDeleted = local.isDeleted === true;
        const remoteIsDeleted = remote.isDeleted === true;

        if (localIsDeleted && remoteIsDeleted) {
          // Both are deleted, keep the newer deletion record
          const newerItem = localTimestamp >= remoteTimestamp ? local : remote;
          mergedMap.set(id, newerItem);
          serializerLogger.debug(`Both local and remote quickInput ${id} are deleted, using newer deletion record`);
        } else if (localIsDeleted && !remoteIsDeleted) {
          // Local is deleted, remote has data
          if (localTimestamp > remoteTimestamp) {
            // Deletion is newer, keep deletion
            mergedMap.set(id, local);
            serializerLogger.debug(`Local deletion of quickInput ${id} is newer than remote data, keeping deletion`);
          } else {
            // Remote data is newer, keep it (cancel deletion)
            mergedMap.set(id, remote);
            serializerLogger.debug(`Remote data for quickInput ${id} is newer than local deletion, keeping data`);
          }
        } else if (!localIsDeleted && remoteIsDeleted) {
          // Remote is deleted, local has data
          if (remoteTimestamp > localTimestamp) {
            // Deletion is newer, keep deletion
            mergedMap.set(id, remote);
            serializerLogger.debug(`Remote deletion of quickInput ${id} is newer than local data, keeping deletion`);
          } else {
            // Local data is newer, keep it (cancel deletion)
            mergedMap.set(id, local);
            serializerLogger.debug(`Local data for quickInput ${id} is newer than remote deletion, keeping data`);
          }
        } else {
          // Neither is deleted, normal timestamp comparison
          mergedMap.set(id, localTimestamp >= remoteTimestamp ? local : remote);
          serializerLogger.debug(`Using ${localTimestamp >= remoteTimestamp ? 'local' : 'remote'} quickInput: ${id}`);
        }
      } else {
        // Item exists in only one list, so we take it as is.
        mergedMap.set(id, local || remote);
      }
    }

    // Determine the order from the list with the most recent overall change.
    const localListTimestamp = this.getQuickInputsListTimestamp(localQuickInputs);
    const remoteListTimestamp = this.getQuickInputsListTimestamp(remoteQuickInputs);
    const baseOrderList = localListTimestamp >= remoteListTimestamp ? localQuickInputs : remoteQuickInputs;
    
    const orderedMergedList = [];
    const processedIds = new Set();

    // Add items in the order of the base list
    baseOrderList.forEach(item => {
      if (item.id && mergedMap.has(item.id)) {
        orderedMergedList.push(mergedMap.get(item.id));
        processedIds.add(item.id);
      }
    });

    // Add any remaining new items that were not in the base list
    for (const [id, item] of mergedMap.entries()) {
      if (!processedIds.has(id)) {
        orderedMergedList.push(item);
      }
    }
    
    serializerLogger.info(`Merged quickInputs: ${orderedMergedList.length} items.`);
    return orderedMergedList;

  } catch (error) {
    serializerLogger.error('Error merging quickInputs:', error.message);
    // Fallback to a simple union to avoid data loss in case of unexpected errors.
    return [...(localQuickInputs || []), ...(remoteQuickInputs || [])];
  }
};

/**
 * Legacy merge quickInputs arrays based on individual item timestamps (fallback)
 */
dataSerializer.legacyMergeQuickInputs = function(localQuickInputs, remoteQuickInputs) {
  try {
    serializerLogger.info('Starting legacy quickInputs merge based on lastModified timestamps');

    if (!localQuickInputs && !remoteQuickInputs) {
      return [];
    }

    if (!localQuickInputs || localQuickInputs.length === 0) {
      return remoteQuickInputs || [];
    }

    if (!remoteQuickInputs || remoteQuickInputs.length === 0) {
      return localQuickInputs || [];
    }

    const localMap = new Map();
    const remoteMap = new Map();

    localQuickInputs.forEach(item => {
      if (item.id) {
        if (!item.lastModified) item.lastModified = 0;
        localMap.set(item.id, item);
      }
    });

    remoteQuickInputs.forEach(item => {
      if (item.id) {
        if (!item.lastModified) item.lastModified = 0;
        remoteMap.set(item.id, item);
      }
    });

    const mergedQuickInputs = [];
    const processedIds = new Set();

    localMap.forEach((localItem, id) => {
      if (remoteMap.has(id)) {
        const remoteItem = remoteMap.get(id);
        if ((localItem.lastModified || 0) >= (remoteItem.lastModified || 0)) {
          mergedQuickInputs.push(localItem);
        } else {
          mergedQuickInputs.push(remoteItem);
        }
        processedIds.add(id);
      }
    });

    localMap.forEach((localItem, id) => {
      if (!processedIds.has(id)) {
        mergedQuickInputs.push(localItem);
        processedIds.add(id);
      }
    });

    remoteMap.forEach((remoteItem, id) => {
      if (!processedIds.has(id)) {
        mergedQuickInputs.push(remoteItem);
        processedIds.add(id);
      }
    });

    return mergedQuickInputs;
  } catch (error) {
    serializerLogger.error('Error in legacyMergeQuickInputs:', error.message);
    return localQuickInputs || remoteQuickInputs || [];
  }
};

/**
 * Merge LLM configuration with intelligent model merging based on timestamps
 */
dataSerializer.mergeLlmConfig = function(localLlm, remoteLlm) {
  try {
    serializerLogger.info('Starting LLM config merge based on lastModified timestamps');

    if (!localLlm && !remoteLlm) {
      return {};
    }

    if (!localLlm) {
      serializerLogger.info('Using remote LLM config (no local config available)');
      return remoteLlm;
    }

    if (!remoteLlm) {
      serializerLogger.info('Using local LLM config (no remote config available)');
      return localLlm;
    }

    // Start with local LLM config as base
    const mergedLlm = { ...localLlm };

    // Remove defaultModelId from LLM config if it exists (migration cleanup)
    // defaultModelId is now handled in basic config with timestamp protection
    if (mergedLlm.defaultModelId) {
      delete mergedLlm.defaultModelId;
    }

    // Merge models array based on individual model timestamps
    if (remoteLlm.models || localLlm.models) {
      mergedLlm.models = this.mergeLlmModels(localLlm.models, remoteLlm.models);
    }

    serializerLogger.info('LLM config merge completed');
    return mergedLlm;
  } catch (error) {
    serializerLogger.error('Error merging LLM config:', error.message);
    return localLlm || remoteLlm || {};
  }
};

/**
 * Merge basic configuration based on lastModified timestamp
 */
dataSerializer.mergeBasicConfig = function(localBasic, remoteBasic) {
  try {
    serializerLogger.info('Starting basic config merge based on lastModified timestamp');

    if (!localBasic && !remoteBasic) {
      return {};
    }

    if (!localBasic) {
      serializerLogger.info('Using remote basic config (no local config available)');
      return remoteBasic;
    }

    if (!remoteBasic) {
      serializerLogger.info('Using local basic config (no remote config available)');
      return localBasic;
    }

    // Compare timestamps
    const localTimestamp = localBasic.lastModified || 0;
    const remoteTimestamp = remoteBasic.lastModified || 0;

    if (localTimestamp >= remoteTimestamp) {
      serializerLogger.info(`Using local basic config (local: ${new Date(localTimestamp).toISOString()}, remote: ${new Date(remoteTimestamp).toISOString()})`);
      return localBasic;
    } else {
      serializerLogger.info(`Using remote basic config (local: ${new Date(localTimestamp).toISOString()}, remote: ${new Date(remoteTimestamp).toISOString()})`);
      return remoteBasic;
    }
  } catch (error) {
    serializerLogger.error('Error merging basic config:', error.message);
    return localBasic || remoteBasic || {};
  }
};

/**
 * Merge LLM models arrays based on individual model timestamps with soft-delete support
 */
dataSerializer.mergeLlmModels = function(localModels, remoteModels) {
  try {
    serializerLogger.info('Starting LLM models merge with soft-delete support based on lastModified timestamps');

    if (!localModels && !remoteModels) {
      return [];
    }

    if (!localModels) {
      serializerLogger.info('Using remote models (no local models available)');
      return remoteModels;
    }

    if (!remoteModels) {
      serializerLogger.info('Using local models (no remote models available)');
      return localModels;
    }

    // Create maps for efficient lookup
    const localMap = new Map();
    const remoteMap = new Map();

    localModels.forEach(model => {
      if (model.id) {
        localMap.set(model.id, model);
      }
    });

    remoteModels.forEach(model => {
      if (model.id) {
        remoteMap.set(model.id, model);
      }
    });

    const mergedModels = [];
    const processedIds = new Set();

    // Get all unique model IDs from both local and remote
    const allModelIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

    // Process each unique model ID
    for (const id of allModelIds) {
      const localModel = localMap.get(id);
      const remoteModel = remoteMap.get(id);

      if (localModel && remoteModel) {
        // Both exist, compare timestamps and handle soft delete conflicts
        const localTimestamp = localModel.lastModified || 0;
        const remoteTimestamp = remoteModel.lastModified || 0;
        const localIsDeleted = localModel.isDeleted === true;
        const remoteIsDeleted = remoteModel.isDeleted === true;

        if (localIsDeleted && remoteIsDeleted) {
          // Both are deleted, keep the newer deletion record
          const newerModel = localTimestamp >= remoteTimestamp ? localModel : remoteModel;
          mergedModels.push(newerModel);
          serializerLogger.debug(`Both local and remote model ${id} are deleted, using newer deletion record`);
        } else if (localIsDeleted && !remoteIsDeleted) {
          // Local is deleted, remote has data
          if (localTimestamp > remoteTimestamp) {
            // Deletion is newer, keep deletion
            mergedModels.push(localModel);
            serializerLogger.debug(`Local deletion of ${id} is newer than remote data, keeping deletion`);
          } else {
            // Remote data is newer, keep it
            mergedModels.push(remoteModel);
            serializerLogger.debug(`Remote data for ${id} is newer than local deletion, keeping data`);
          }
        } else if (!localIsDeleted && remoteIsDeleted) {
          // Remote is deleted, local has data
          if (remoteTimestamp > localTimestamp) {
            // Deletion is newer, keep deletion
            mergedModels.push(remoteModel);
            serializerLogger.debug(`Remote deletion of ${id} is newer than local data, keeping deletion`);
          } else {
            // Local data is newer, keep it
            mergedModels.push(localModel);
            serializerLogger.debug(`Local data for ${id} is newer than remote deletion, keeping data`);
          }
        } else {
          // Neither is deleted, normal timestamp comparison
          if (localTimestamp >= remoteTimestamp) {
            mergedModels.push(localModel);
            serializerLogger.debug(`Using local model: ${id} (local: ${new Date(localTimestamp).toISOString()}, remote: ${new Date(remoteTimestamp).toISOString()})`);
          } else {
            mergedModels.push(remoteModel);
            serializerLogger.debug(`Using remote model: ${id} (local: ${new Date(localTimestamp).toISOString()}, remote: ${new Date(remoteTimestamp).toISOString()})`);
          }
        }
        processedIds.add(id);
      } else if (localModel && !remoteModel) {
        // Only local exists
        mergedModels.push(localModel);
        serializerLogger.debug(`Adding local-only model: ${id} (deleted: ${localModel.isDeleted || false})`);
        processedIds.add(id);
      } else if (!localModel && remoteModel) {
        // Only remote exists
        mergedModels.push(remoteModel);
        serializerLogger.debug(`Adding remote-only model: ${id} (deleted: ${remoteModel.isDeleted || false})`);
        processedIds.add(id);
      }
    }

    serializerLogger.info(`Merged LLM models: ${mergedModels.length} items (local: ${localModels.length}, remote: ${remoteModels.length})`);
    return mergedModels;
  } catch (error) {
    serializerLogger.error('Error merging LLM models:', error.message);
    return localModels || remoteModels || [];
  }
};

/**
 * Merge page cache data - merge individual pages based on their timestamps with soft delete support
 */
dataSerializer.mergePageCacheData = function(localPageCache, remotePageCache) {
  try {
    const mergedPageCache = {};
    const deletionRecords = []; // Track deletion records for cleanup
    const allUrlHashes = new Set([
      ...Object.keys(localPageCache || {}),
      ...Object.keys(remotePageCache || {})
    ]);

    for (const urlHash of allUrlHashes) {
      const localPage = localPageCache?.[urlHash];
      const remotePage = remotePageCache?.[urlHash];

      if (!localPage && remotePage) {
        // Only remote data exists
        if (this.isPageSoftDeleted(remotePage)) {
          deletionRecords.push(urlHash);
          serializerLogger.debug(`Remote page ${urlHash} is soft deleted, marking for cleanup`);
        } else {
          mergedPageCache[urlHash] = remotePage;
          serializerLogger.debug(`Using remote page data for ${urlHash}`);
        }
      } else if (localPage && !remotePage) {
        // Only local data exists
        if (this.isPageSoftDeleted(localPage)) {
          deletionRecords.push(urlHash);
          serializerLogger.debug(`Local page ${urlHash} is soft deleted, marking for cleanup`);
        } else {
          mergedPageCache[urlHash] = localPage;
          serializerLogger.debug(`Using local page data for ${urlHash}`);
        }
      } else if (localPage && remotePage) {
        // Both exist, compare timestamps and handle soft delete conflicts
        const localTimestamp = this.getPageTimestamp(localPage);
        const remoteTimestamp = this.getPageTimestamp(remotePage);
        const localIsDeleted = this.isPageSoftDeleted(localPage);
        const remoteIsDeleted = this.isPageSoftDeleted(remotePage);

        if (localIsDeleted && remoteIsDeleted) {
          // Both are deleted, keep the newer deletion record for cleanup
          deletionRecords.push(urlHash);
          serializerLogger.debug(`Both local and remote page ${urlHash} are deleted, marking for cleanup`);
        } else if (localIsDeleted && !remoteIsDeleted) {
          // Local is deleted, remote has data
          if (localTimestamp > remoteTimestamp) {
            // Deletion is newer, delete the item
            deletionRecords.push(urlHash);
            serializerLogger.debug(`Local deletion of ${urlHash} is newer than remote data, deleting item`);
          } else {
            // Remote data is newer, keep it
            mergedPageCache[urlHash] = remotePage;
            serializerLogger.debug(`Remote data for ${urlHash} is newer than local deletion, keeping data`);
          }
        } else if (!localIsDeleted && remoteIsDeleted) {
          // Remote is deleted, local has data
          if (remoteTimestamp > localTimestamp) {
            // Deletion is newer, delete the item
            deletionRecords.push(urlHash);
            serializerLogger.debug(`Remote deletion of ${urlHash} is newer than local data, deleting item`);
          } else {
            // Local data is newer, keep it
            mergedPageCache[urlHash] = localPage;
            serializerLogger.debug(`Local data for ${urlHash} is newer than remote deletion, keeping data`);
          }
        } else {
          // Neither is deleted, normal timestamp comparison
          if (localTimestamp >= remoteTimestamp) {
            mergedPageCache[urlHash] = localPage;
            serializerLogger.debug(`Using local page data for ${urlHash} (newer: ${new Date(localTimestamp).toISOString()})`);
          } else {
            mergedPageCache[urlHash] = remotePage;
            serializerLogger.debug(`Using remote page data for ${urlHash} (newer: ${new Date(remoteTimestamp).toISOString()})`);
          }
        }
      }
    }

    serializerLogger.info(`Merged page cache: ${Object.keys(mergedPageCache).length} pages, ${deletionRecords.length} deletion records to cleanup`);

    // Store deletion records for cleanup after merge is applied
    this._deletionRecordsToCleanup = deletionRecords;

    return mergedPageCache;
  } catch (error) {
    serializerLogger.error('Error merging page cache data:', error.message);
    return { ...(localPageCache || {}), ...(remotePageCache || {}) };
  }
};

/**
 * Merge chat history data - select entire chat history per tab based on latest timestamp
 */
dataSerializer.mergeChatHistoryData = function(localChatHistory, remoteChatHistory) {
  try {
    const mergedChatHistory = {};
    const allUrlHashes = new Set([
      ...Object.keys(localChatHistory || {}),
      ...Object.keys(remoteChatHistory || {})
    ]);

    for (const urlHash of allUrlHashes) {
      const localChat = localChatHistory?.[urlHash];
      const remoteChat = remoteChatHistory?.[urlHash];

      if (!localChat && remoteChat) {
        mergedChatHistory[urlHash] = remoteChat;
        serializerLogger.debug(`Using remote chat history for ${urlHash} (no local version)`);
      } else if (localChat && !remoteChat) {
        mergedChatHistory[urlHash] = localChat;
        serializerLogger.debug(`Using local chat history for ${urlHash} (no remote version)`);
      } else if (localChat && remoteChat) {
        // Both exist, compare timestamps and select the entire chat history with latest activity
        const localTimestamp = this.getChatHistoryTimestamp(localChat);
        const remoteTimestamp = this.getChatHistoryTimestamp(remoteChat);

        if (localTimestamp >= remoteTimestamp) {
          mergedChatHistory[urlHash] = localChat;
          serializerLogger.debug(`Using local chat history for ${urlHash} (newer: ${new Date(localTimestamp).toISOString()}, ${localChat.length} messages)`);
        } else {
          mergedChatHistory[urlHash] = remoteChat;
          serializerLogger.debug(`Using remote chat history for ${urlHash} (newer: ${new Date(remoteTimestamp).toISOString()}, ${remoteChat.length} messages)`);
        }
      }
    }

    serializerLogger.info(`Merged chat history: ${Object.keys(mergedChatHistory).length} conversations`);
    return mergedChatHistory;
  } catch (error) {
    serializerLogger.error('Error merging chat history data:', error.message);
    return { ...(localChatHistory || {}), ...(remoteChatHistory || {}) };
  }
};

/**
 * Check if page data is soft deleted
 */
dataSerializer.isPageSoftDeleted = function(pageData) {
  return pageData && pageData.del === true;
};

/**
 * Get timestamp from page data (including soft deleted items)
 */
dataSerializer.getPageTimestamp = function(pageData) {
  try {
    // For soft deleted items, use lastModified timestamp
    if (pageData.del === true) {
      return pageData.lastModified || 0;
    }

    // For regular page data, use lastUpdated first
    if (pageData.lastUpdated) {
      return pageData.lastUpdated;
    }

    // Look for timestamp in metadata
    if (pageData.metadata && pageData.metadata.timestamp) {
      return pageData.metadata.timestamp;
    }

    // Look for timestamp in content entries
    let latestTimestamp = 0;
    if (pageData.content) {
      for (const method in pageData.content) {
        const contentEntry = pageData.content[method];
        if (contentEntry && contentEntry.timestamp) {
          latestTimestamp = Math.max(latestTimestamp, contentEntry.timestamp);
        }
      }
    }

    return latestTimestamp || 0;
  } catch (error) {
    serializerLogger.error('Error getting page timestamp:', error.message);
    return 0;
  }
};

/**
 * Get timestamp from chat history (latest message timestamp)
 */
dataSerializer.getChatHistoryTimestamp = function(chatHistory) {
  try {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
      return 0;
    }

    // Find the latest timestamp among all messages
    let latestTimestamp = 0;
    for (const message of chatHistory) {
      if (message && message.timestamp) {
        latestTimestamp = Math.max(latestTimestamp, message.timestamp);
      }
    }

    return latestTimestamp;
  } catch (error) {
    serializerLogger.error('Error getting chat history timestamp:', error.message);
    return 0;
  }
};

/**
 * Clean up deleted items from merged data after merge is complete
 */
dataSerializer.cleanupDeletedItemsAfterMerge = function(mergedData) {
  try {
    serializerLogger.info('Cleaning up deleted items from merged data');
    
    let deletedQuickInputsCount = 0;
    let deletedModelsCount = 0;
    
    // Clean up deleted quick inputs
    if (mergedData.config && mergedData.config.quickInputs) {
      const originalCount = mergedData.config.quickInputs.length;
      mergedData.config.quickInputs = mergedData.config.quickInputs.filter(item => {
        if (item.isDeleted === true) {
          deletedQuickInputsCount++;
          serializerLogger.debug(`Removing deleted quickInput from upload: ${item.id}`);
          return false;
        }
        return true;
      });
      serializerLogger.info(`Filtered quickInputs: removed ${deletedQuickInputsCount} deleted items (${originalCount} → ${mergedData.config.quickInputs.length})`);
    }
    
    // Clean up deleted models from both old and new format
    if (mergedData.config && mergedData.config.llm_models && mergedData.config.llm_models.models) {
      const originalCount = mergedData.config.llm_models.models.length;
      mergedData.config.llm_models.models = mergedData.config.llm_models.models.filter(model => {
        if (model.isDeleted === true) {
          deletedModelsCount++;
          serializerLogger.debug(`Removing deleted model from upload: ${model.id} (${model.name || 'Unnamed'})`);
          return false;
        }
        return true;
      });
      serializerLogger.info(`Filtered LLM models: removed ${deletedModelsCount} deleted items (${originalCount} → ${mergedData.config.llm_models.models.length})`);
    }
    
    // Handle old format LLM config if exists
    if (mergedData.config && mergedData.config.llm && mergedData.config.llm.models) {
      const originalCount = mergedData.config.llm.models.length;
      mergedData.config.llm.models = mergedData.config.llm.models.filter(model => {
        if (model.isDeleted === true) {
          deletedModelsCount++;
          serializerLogger.debug(`Removing deleted model from old format upload: ${model.id} (${model.name || 'Unnamed'})`);
          return false;
        }
        return true;
      });
      serializerLogger.info(`Filtered old format LLM models: removed ${deletedModelsCount} deleted items (${originalCount} → ${mergedData.config.llm.models.length})`);
    }
    
    serializerLogger.info(`Cleanup completed: removed ${deletedQuickInputsCount} quickInputs and ${deletedModelsCount} models`);
    return mergedData;
  } catch (error) {
    serializerLogger.error('Error cleaning up deleted items after merge:', error.message);
    // Return original data if cleanup fails to avoid breaking the sync
    return mergedData;
  }
};
