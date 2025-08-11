// Think Bot Sync Manager Module
// Coordinates all sync operations and manages sync state
// Note: storage-keys.js should be loaded before this module

// Create a global syncManager object
var syncManager = {};

// Create module logger
const syncLogger = logger.createModuleLogger('SyncManager');

// Sync operation states
const SYNC_STATES = {
  IDLE: 'idle',
  TESTING: 'testing',
  UPLOADING: 'uploading',
  DOWNLOADING: 'downloading',
  ERROR: 'error',
  SUCCESS: 'success'
};

// 内部并发控制（去重同类操作，防止重复调用导致性能浪费）
syncManager._operationPromises = {};
syncManager._runExclusive = function(operationKey, executor) {
  // 如果已有同名操作在进行，直接复用同一个 Promise（去重）
  if (this._operationPromises[operationKey]) {
    syncLogger.info(`Skip duplicate operation: ${operationKey} already in progress`);
    return this._operationPromises[operationKey];
  }
  const run = (async () => {
    try {
      return await executor();
    } finally {
      // 清理占位，允许后续同类操作再次执行
      delete this._operationPromises[operationKey];
    }
  })();
  this._operationPromises[operationKey] = run;
  return run;
};

// Check if compression module is available
const syncManagerCompressionAvailable = typeof compressionModule !== 'undefined';
if (!syncManagerCompressionAvailable) {
  syncLogger.warn('Compression module not available, sync data will be processed uncompressed');
}

/**
 * Initialize sync manager
 */
syncManager.init = async function() {
  try {
    await syncConfig.initializeIfNeeded();
    syncLogger.info('Sync manager initialized successfully');
  } catch (error) {
    syncLogger.error('Error initializing sync manager:', error.message);
  }
};

/**
 * Test sync connection with network check
 */
syncManager.testConnection = async function(token = null, gistId = null) {
  try {
    await syncConfig.updateSyncStatus(SYNC_STATES.TESTING);

    // First check network connectivity
    const isOnline = await gistClient.checkNetworkConnectivity();
    if (!isOnline) {
      throw new Error('No network connection available');
    }

    const config = await syncConfig.getSyncConfig();
    const testToken = token || config.gistToken;
    const testGistId = gistId || config.gistId;

    if (!testToken || !testGistId) {
      throw new Error('Token and Gist ID are required for connection test');
    }

    syncLogger.info('Testing sync connection...');
    const result = await gistClient.testConnection(testToken, testGistId);

    if (result.success) {
      await syncConfig.updateSyncStatus(SYNC_STATES.SUCCESS);
      syncLogger.info('Connection test successful');
    } else {
      await syncConfig.updateSyncStatus(SYNC_STATES.ERROR, result.error);
      syncLogger.error('Connection test failed:', result.error);
    }

    return result;
  } catch (error) {
    await syncConfig.updateSyncStatus(SYNC_STATES.ERROR, error.message);
    syncLogger.error('Connection test error:', error.message);
    return {
      success: false,
      message: 'Connection test failed',
      error: error.message
    };
  }
};

/**
 * Upload local data to Gist
 */
syncManager.uploadData = async function(options = {}) {
  // options: { skipConfigCheck?: boolean, applyLocally?: boolean }
  return this._runExclusive('upload', async () => {
    const operation = this.performanceMonitor.startOperation('upload');

    try {
      // Check if sync is configured before attempting upload
      if (!options.skipConfigCheck) {
        const isConfigured = await this.isConfigured({ silent: true });
        if (!isConfigured) {
          const config = await syncConfig.getSyncConfig();
          const missingFields = [];
          if (!config.gistToken) missingFields.push('GitHub Token');
          if (!config.gistId) missingFields.push('Gist ID');
          throw new Error(`Sync configuration incomplete: Missing ${missingFields.join(' and ')}. Please configure sync settings in the options page.`);
        }
      }

      const config = await syncConfig.getSyncConfig();

      await syncConfig.updateSyncStatus(SYNC_STATES.UPLOADING);
      syncLogger.info('Starting data upload...');

      // Collect local data
      const sCollectLocal = this.performanceMonitor.startStage(operation, 'collectLocalData');
      const localData = await dataSerializer.collectLocalData();
      let localDataBytes = 0;
      try { localDataBytes = new Blob([JSON.stringify(localData)]).size; } catch (_) { /* ignore */ }
      this.performanceMonitor.endStage(operation, sCollectLocal, { bytesOut: localDataBytes });

      // Generate filename
      const filename = dataSerializer.generateSyncFilename();

      // Try to download and merge with remote data first
      let finalData = localData;
      try {
        const sDownloadRemote = this.performanceMonitor.startStage(operation, 'downloadRemoteForMerge', { filename });
        const remoteContent = await gistClient.getGistFile(config.gistId, filename);
        const remoteBytes = typeof remoteContent === 'string' ? new Blob([remoteContent]).size : 0;
        this.performanceMonitor.endStage(operation, sDownloadRemote, { bytesIn: remoteBytes });
        const remoteData = dataSerializer.deserializeFromDownload(remoteContent);

        if (remoteData === null) {
          // No valid remote data found, use local data only
          syncLogger.info('No valid remote data found, using local data only');
        } else {
          // Merge local and remote data
          syncLogger.info('Merging local data with remote data before upload');
          const sMerge = this.performanceMonitor.startStage(operation, 'mergeLocalAndRemote');
          finalData = dataSerializer.mergeData(localData, remoteData);
          let mergedBytes = 0;
          try { mergedBytes = new Blob([JSON.stringify(finalData)]).size; } catch (_) { /* ignore */ }
          this.performanceMonitor.endStage(operation, sMerge, { bytesOut: mergedBytes });
        }
      } catch (error) {
        // If remote file doesn't exist or can't be read, use local data only
        syncLogger.info('No remote data found or error reading remote data, using local data only:', error.message);
      }

      // Serialize the final merged data
      const sSerialize = this.performanceMonitor.startStage(operation, 'serializeForUpload');
      const serializedData = dataSerializer.serializeForUpload(finalData);
      this.performanceMonitor.endStage(operation, sSerialize, { bytesIn: serializedData.metadata.originalSize, bytesOut: serializedData.metadata.finalSize });

      // Upload to Gist
      const sUpload = this.performanceMonitor.startStage(operation, 'uploadToGist', { filename });
      const result = await gistClient.updateGistFile(
        config.gistId,
        filename,
        serializedData.content,
        `ThinkBot sync data updated at ${new Date().toISOString()}`
      );
      this.performanceMonitor.endStage(operation, sUpload, { bytesOut: serializedData.metadata.finalSize });

      await syncConfig.updateSyncStatus(SYNC_STATES.SUCCESS);

      syncLogger.info('Data upload completed successfully:', {
        filename,
        gistId: config.gistId,
        dataSize: serializedData.metadata.finalSize,
        merged: finalData !== localData
      });

      // 可选：上传后直接本地应用合并结果，避免冗余下载
      let appliedLocally = false;
      if (options.applyLocally) {
        const sApplyAfterUpload = this.performanceMonitor.startStage(operation, 'applyAfterUpload');
        try {
          await this.applyDownloadedData(finalData);
          appliedLocally = true;
        } finally {
          let finalBytes = 0;
          try { finalBytes = new Blob([JSON.stringify(finalData)]).size; } catch (_) { /* ignore */ }
          this.performanceMonitor.endStage(operation, sApplyAfterUpload, { bytesIn: finalBytes });
          syncLogger.info('Applied merged data locally after upload');
        }
      }

      const uploadResult = {
        success: true,
        message: 'Data uploaded successfully',
        filename,
        size: serializedData.metadata.finalSize,
        gistUrl: result.html_url,
        merged: finalData !== localData,
        appliedLocally,
        finalData // 保留以便上层按需使用（例如跳过下载）
      };

      this.performanceMonitor.endOperation(operation, true);
      return uploadResult;
    } catch (error) {
      await syncConfig.updateSyncStatus(SYNC_STATES.ERROR, error.message);
      syncLogger.error('Data upload failed:', error.message);

      const errorResult = {
        success: false,
        message: 'Data upload failed',
        error: error.message
      };

      this.performanceMonitor.endOperation(operation, false, error.message);
      return errorResult;
    }
  });
};

/**
 * Download data from Gist
 */
syncManager.downloadData = async function(options = {}) {
  // options: { skipConfigCheck?: boolean }
  return this._runExclusive('download', async () => {
    const operation = this.performanceMonitor.startOperation('download');

    try {
      // Check if sync is configured before attempting download
      if (!options.skipConfigCheck) {
        const isConfigured = await this.isConfigured({ silent: true });
        if (!isConfigured) {
          const config = await syncConfig.getSyncConfig();
          const missingFields = [];
          if (!config.gistToken) missingFields.push('GitHub Token');
          if (!config.gistId) missingFields.push('Gist ID');
          throw new Error(`Sync configuration incomplete: Missing ${missingFields.join(' and ')}. Please configure sync settings in the options page.`);
        }
      }

      const config = await syncConfig.getSyncConfig();

      await syncConfig.updateSyncStatus(SYNC_STATES.DOWNLOADING);
      syncLogger.info('Starting data download...');

      // Generate the sync filename
      const syncFilename = dataSerializer.generateSyncFilename();

      // Download file content
      const sDownload = this.performanceMonitor.startStage(operation, 'downloadFromGist', { filename: syncFilename });
      const content = await gistClient.getGistFile(config.gistId, syncFilename);
      const downloadedBytes = typeof content === 'string' ? new Blob([content]).size : 0;
      this.performanceMonitor.endStage(operation, sDownload, { bytesIn: downloadedBytes });

      // Deserialize data
      const sDeserialize = this.performanceMonitor.startStage(operation, 'deserializeDownloadedData');
      const remoteData = dataSerializer.deserializeFromDownload(content);
      this.performanceMonitor.endStage(operation, sDeserialize, { bytesIn: downloadedBytes });

      // Get local data for comparison
      const sCollectLocal = this.performanceMonitor.startStage(operation, 'collectLocalData');
      const localData = await dataSerializer.collectLocalData();
      let localDataBytes = 0;
      try { localDataBytes = new Blob([JSON.stringify(localData)]).size; } catch (_) { /* ignore */ }
      this.performanceMonitor.endStage(operation, sCollectLocal, { bytesOut: localDataBytes });

      let finalData;
      if (remoteData === null) {
        // No valid remote data found, use local data only
        syncLogger.info('No valid remote data found, using local data only');
        finalData = localData;
      } else {
        // Always merge data based on modification time, not just on conflicts
        syncLogger.info('Merging local and remote data based on modification time');
        const sMerge = this.performanceMonitor.startStage(operation, 'mergeLocalAndRemote');
        finalData = dataSerializer.mergeData(localData, remoteData);
        let mergedBytes = 0;
        try { mergedBytes = new Blob([JSON.stringify(finalData)]).size; } catch (_) { /* ignore */ }
        this.performanceMonitor.endStage(operation, sMerge, { bytesOut: mergedBytes });
      }

      // Apply downloaded data
      const sApply = this.performanceMonitor.startStage(operation, 'applyDownloadedData');
      await this.applyDownloadedData(finalData);
      let finalBytes = 0;
      try { finalBytes = new Blob([JSON.stringify(finalData)]).size; } catch (_) { /* ignore */ }
      this.performanceMonitor.endStage(operation, sApply, { bytesIn: finalBytes });

      await syncConfig.updateSyncStatus(SYNC_STATES.SUCCESS);

      syncLogger.info('Data download completed successfully:', {
        filename: syncFilename,
        mergeStrategy: finalData.metadata.mergeStrategy,
        dataTimestamp: remoteData?.metadata?.timestamp
      });

      const downloadResult = {
        success: true,
        message: remoteData === null ? 'Local data used (no valid remote data)' : 'Data downloaded and merged successfully',
        filename: syncFilename,
        mergeStrategy: finalData.metadata.mergeStrategy,
        timestamp: remoteData?.metadata?.timestamp
      };

      this.performanceMonitor.endOperation(operation, true);
      return downloadResult;
    } catch (error) {
      await syncConfig.updateSyncStatus(SYNC_STATES.ERROR, error.message);
      syncLogger.error('Data download failed:', error.message);

      const errorResult = {
        success: false,
        message: 'Data download failed',
        error: error.message
      };

      this.performanceMonitor.endOperation(operation, false, error.message);
      return errorResult;
    }
  });
};

/**
 * Apply downloaded data to local storage
 */
syncManager.applyDownloadedData = async function(data) {
  try {
    syncLogger.info('Applying downloaded data...');
    
    // Apply configuration (not a user modification, preserve timestamps)
    if (data.config) {
      await configManager.saveConfig(data.config, false);
      syncLogger.info('Configuration applied');
    }
    
    // Apply page cache
    if (data.pageCache) {
      await this.applyPageCache(data.pageCache);
      syncLogger.info('Page cache applied');
    }

    // Apply chat history
    if (data.chatHistory) {
      await this.applyChatHistory(data.chatHistory);
      syncLogger.info('Chat history applied');
    }

    // Clean up deletion records after merge is complete
    await this.cleanupDeletionRecords();

    // Clean up soft-deleted quick inputs after successful sync and merge
    if (data.config && data.config.quickInputs) {
      await configManager.cleanupDeletedQuickInputs();
    }

    syncLogger.info('All downloaded data applied successfully');
  } catch (error) {
    syncLogger.error('Error applying downloaded data:', error.message);
    throw error;
  }
};

/**
 * Apply page cache data
 */
syncManager.applyPageCache = async function(pageCache) {
  try {
    const updates = {};
    
    for (const urlHash in pageCache) {
      const pageData = pageCache[urlHash];
      const key = `${CACHE_KEYS.PAGE_PREFIX}${urlHash}`;
      
      // Compress content if compression is available
      if (pageData.content && syncManagerCompressionAvailable) {
        for (const method in pageData.content) {
          const contentEntry = pageData.content[method];
          if (contentEntry && contentEntry.data) {
            contentEntry.data = cacheCompression.compressPageContent(contentEntry.data);
          }
        }
      }
      
      updates[key] = pageData;
    }
    
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      syncLogger.info('Page cache updated:', { count: Object.keys(updates).length });
    }
  } catch (error) {
    syncLogger.error('Error applying page cache:', error.message);
    throw error;
  }
};

/**
 * Clean up deletion records after merge is complete
 */
syncManager.cleanupDeletionRecords = async function() {
  try {
    // Get deletion records from data serializer
    const deletionRecords = dataSerializer._deletionRecordsToCleanup || [];

    if (deletionRecords.length === 0) {
      return;
    }

    syncLogger.info(`Cleaning up ${deletionRecords.length} deletion records`);

    // Remove deletion records from storage
    const keysToRemove = deletionRecords.map(urlHash => `${CACHE_KEYS.PAGE_PREFIX}${urlHash}`);

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      syncLogger.info(`Removed ${keysToRemove.length} deletion records from storage`);
    }

    // Clear the deletion records list
    dataSerializer._deletionRecordsToCleanup = [];

  } catch (error) {
    syncLogger.error('Error cleaning up deletion records:', error.message);
    // Don't throw error as this is cleanup operation
  }
};

/**
 * Apply chat history data
 */
syncManager.applyChatHistory = async function(chatHistory) {
  try {
    const updates = {};
    
    for (const urlHash in chatHistory) {
      const chatData = chatHistory[urlHash];
      const key = `${CACHE_KEYS.CHAT_PREFIX}${urlHash}`;
      
      // Compress chat history if compression is available
      let dataToStore = chatData;
      if (syncManagerCompressionAvailable && cacheCompression.compressChatHistory) {
        dataToStore = cacheCompression.compressChatHistory(chatData);
      }
      
      updates[key] = dataToStore;
    }
    
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      syncLogger.info('Chat history updated:', { count: Object.keys(updates).length });
    }
  } catch (error) {
    syncLogger.error('Error applying chat history:', error.message);
    throw error;
  }
};

/**
 * Perform full sync (upload with merge ensures consistency)
 */
syncManager.fullSync = async function() {
  return this._runExclusive('fullSync', async () => {
    try {
      // Force refresh of sync configuration to get latest values
      await syncConfig.initializeIfNeeded();

      // Check once to avoid重复检查
      const isConfigured = await this.isConfigured({ silent: false });
      if (!isConfigured) {
        const errorMessage = 'Sync configuration incomplete. Please configure GitHub Token and Gist ID in the options page.';
        syncLogger.warn(errorMessage);
        return {
          success: false,
          message: 'Sync not configured',
          error: errorMessage
        };
      }

      syncLogger.info('Starting full sync...');

      // Upload with merge; 上传成功后本地直接应用合并结果，避免冗余下载
      const uploadResult = await this.uploadData({ skipConfigCheck: true, applyLocally: true });
      if (!uploadResult.success) {
        return uploadResult;
      }

      // 如果已经本地应用，则跳过下载；否则执行下载以确保一致性
      let downloadResult = { skipped: true, success: true, message: 'Download skipped (local applied after upload)' };
      if (!uploadResult.appliedLocally) {
        downloadResult = await this.downloadData({ skipConfigCheck: true });
      }

      syncLogger.info('Full sync completed');
      return {
        success: true,
        message: 'Full sync completed successfully',
        upload: uploadResult,
        download: downloadResult
      };
    } catch (error) {
      syncLogger.error('Full sync failed:', error.message);
      return {
        success: false,
        message: 'Full sync failed',
        error: error.message
      };
    }
  });
};

/**
 * Check if sync is properly configured
 */
syncManager.isConfigured = async function(options = {}) {
  try {
    const config = await syncConfig.getSyncConfig();
    const isConfigured = !!(config.gistToken && config.gistId);

    if (!options.silent) {
      syncLogger.info('Checking sync configuration:', {
        hasToken: !!config.gistToken,
        hasGistId: !!config.gistId,
        isConfigured: isConfigured,
        tokenLength: config.gistToken ? config.gistToken.length : 0,
        gistIdLength: config.gistId ? config.gistId.length : 0
      });
    }

    return isConfigured;
  } catch (error) {
    syncLogger.error('Error checking sync configuration:', error.message);
    return false;
  }
};

/**
 * Get current sync status
 */
syncManager.getSyncStatus = async function() {
  try {
    const config = await syncConfig.getSyncConfig();
    return {
      enabled: config.enabled,
      status: config.syncStatus,
      lastSyncTime: config.lastSyncTime,
      lastError: config.lastError,
      isConfigured: !!(config.gistToken && config.gistId)
    };
  } catch (error) {
    syncLogger.error('Error getting sync status:', error.message);
    return {
      enabled: false,
      status: SYNC_STATES.ERROR,
      lastSyncTime: null,
      lastError: error.message,
      isConfigured: false
    };
  }
};

/**
 * Performance monitoring for sync operations
 */
syncManager.performanceMonitor = {
  operations: [],

  startOperation: function(operationType) {
    const operation = {
      type: operationType,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      success: null,
      error: null,
      // 分阶段信息
      stages: []
    };
    this.operations.push(operation);
    return operation;
  },

  // 开始一个阶段
  startStage: function(operation, stageName, extra = {}) {
    const stage = {
      name: stageName,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      bytesIn: null,
      bytesOut: null,
      notes: extra || {}
    };
    if (operation && Array.isArray(operation.stages)) {
      operation.stages.push(stage);
    }
    return stage;
  },

  // 结束一个阶段并输出日志
  endStage: function(operation, stage, metrics = {}) {
    if (!stage) return;
    stage.endTime = Date.now();
    stage.duration = stage.endTime - stage.startTime;
    if (typeof metrics.bytesIn === 'number') stage.bytesIn = metrics.bytesIn;
    if (typeof metrics.bytesOut === 'number') stage.bytesOut = metrics.bytesOut;
    if (metrics.notes) stage.notes = { ...(stage.notes || {}), ...(metrics.notes || {}) };

    const processedBytes = typeof stage.bytesOut === 'number' ? stage.bytesOut : stage.bytesIn;
    const speed = this._calcSpeed(processedBytes, stage.duration);

    syncLogger.info('Sync stage completed:', {
      operation: operation?.type,
      stage: stage.name,
      durationMs: stage.duration,
      bytesIn: this._formatBytes(stage.bytesIn),
      bytesOut: this._formatBytes(stage.bytesOut),
      speed: speed ? `${speed} MB/s` : null,
      notes: stage.notes || null
    });
  },

  endOperation: function(operation, success, error = null) {
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.success = success;
    operation.error = error;

    syncLogger.info('Sync operation completed:', {
      type: operation.type,
      duration: operation.duration,
      success: operation.success
    });

    // Keep only last 50 operations
    if (this.operations.length > 50) {
      this.operations = this.operations.slice(-50);
    }
  },

  getStats: function() {
    const stats = {
      totalOperations: this.operations.length,
      successfulOperations: this.operations.filter(op => op.success).length,
      failedOperations: this.operations.filter(op => op.success === false).length,
      averageDuration: 0,
      lastOperation: null
    };

    if (this.operations.length > 0) {
      const completedOps = this.operations.filter(op => op.duration !== null);
      if (completedOps.length > 0) {
        stats.averageDuration = completedOps.reduce((sum, op) => sum + op.duration, 0) / completedOps.length;
      }
      stats.lastOperation = this.operations[this.operations.length - 1];
    }

    return stats;
  },

  // 计算速度（MB/s）
  _calcSpeed: function(bytes, durationMs) {
    try {
      if (!bytes || !durationMs || durationMs <= 0) return null;
      const mb = bytes / (1024 * 1024);
      const seconds = durationMs / 1000;
      if (seconds === 0) return null;
      return (mb / seconds).toFixed(2);
    } catch (_) {
      return null;
    }
  },

  // 格式化字节
  _formatBytes: function(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes)) return null;
    const units = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(2)} ${units[i]}`;
  }
};

/**
 * Get sync performance statistics
 */
syncManager.getPerformanceStats = function() {
  return this.performanceMonitor.getStats();
};



// Initialize sync manager when module loads
if (typeof chrome !== 'undefined' && chrome.storage) {
  syncManager.init().catch(error => {
    syncLogger.error('Failed to initialize sync manager:', error.message);
  });
}
