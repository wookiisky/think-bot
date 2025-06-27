// Stream Monitor Module
// Monitors streaming connections and handles interruptions/recovery

var streamMonitor = {};

// Create module logger - safe initialization
let streamLogger;
try {
  if (typeof logger !== 'undefined' && logger && logger.createModuleLogger) {
    streamLogger = logger.createModuleLogger('StreamMonitor');
  } else if (window.logger && window.logger.createModuleLogger) {
    streamLogger = window.logger.createModuleLogger('StreamMonitor');
  } else {
    streamLogger = console;
  }
} catch (e) {
  streamLogger = console;
}

// Function to reinitialize logger when it becomes available
function reinitializeLogger() {
  try {
    if (window.logger && window.logger.createModuleLogger && streamLogger === console) {
      streamLogger = window.logger.createModuleLogger('StreamMonitor');
    }
  } catch (e) {
    // Keep using console if still not available
  }
}

// Try to reinitialize logger after page loads
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', reinitializeLogger);
  // Also try after a short delay in case DOM is already loaded
  setTimeout(reinitializeLogger, 100);
}

// Constants
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const MAX_SILENCE_DURATION = 30000; // 30 seconds without chunks
const RECOVERY_RETRY_DELAY = 2000; // 2 seconds between retries
const MAX_RECOVERY_ATTEMPTS = 3;

// Active stream tracking
const activeStreams = new Map();

/**
 * Register a new streaming session
 * @param {string} streamId - Unique identifier for the stream
 * @param {Object} streamInfo - Stream information
 */
streamMonitor.registerStream = function(streamId, streamInfo) {
  const startTime = Date.now();
  const stream = {
    id: streamId,
    startTime,
    lastChunkTime: startTime,
    chunkCount: 0,
    totalBytes: 0,
    isActive: true,
    silenceWarningIssued: false,
    recoveryAttempts: 0,
    ...streamInfo
  };
  
  activeStreams.set(streamId, stream);
  streamLogger.info('[Monitor] Stream registered', {
    streamId,
    timestamp: startTime,
    streamInfo
  });
  
  // Start monitoring this stream
  startStreamMonitoring(streamId);
};

/**
 * Update stream with new chunk information
 * @param {string} streamId - Stream identifier
 * @param {string} chunk - Received chunk
 */
streamMonitor.updateStream = function(streamId, chunk) {
  const stream = activeStreams.get(streamId);
  if (!stream) {
    streamLogger.warn('[Monitor] Attempted to update non-existent stream', { streamId });
    return;
  }
  
  const now = Date.now();
  stream.lastChunkTime = now;
  stream.chunkCount++;
  stream.totalBytes += chunk?.length || 0;
  stream.silenceWarningIssued = false; // Reset silence warning
  

};

/**
 * Mark stream as completed
 * @param {string} streamId - Stream identifier
 * @param {string} finalResponse - Final response content
 */
streamMonitor.completeStream = function(streamId, finalResponse) {
  const stream = activeStreams.get(streamId);
  if (!stream) {
    streamLogger.warn('[Monitor] Attempted to complete non-existent stream', { streamId });
    return;
  }
  
  const completionTime = Date.now();
  const duration = completionTime - stream.startTime;
  
  streamLogger.info('[Monitor] Stream completed successfully', {
    streamId,
    duration,
    chunkCount: stream.chunkCount,
    totalBytes: stream.totalBytes,
    finalResponseLength: finalResponse?.length || 0,
    averageChunkSize: stream.chunkCount > 0 ? Math.round(stream.totalBytes / stream.chunkCount) : 0
  });
  
  // Clean up
  activeStreams.delete(streamId);
  clearStreamTimeout(streamId);
};

/**
 * Mark stream as failed
 * @param {string} streamId - Stream identifier
 * @param {Error} error - Error that caused the failure
 */
streamMonitor.failStream = function(streamId, error) {
  const stream = activeStreams.get(streamId);
  if (!stream) {
    streamLogger.warn('[Monitor] Attempted to fail non-existent stream', { streamId });
    return;
  }
  
  const failureTime = Date.now();
  const duration = failureTime - stream.startTime;
  
  streamLogger.error('[Monitor] Stream failed', {
    streamId,
    duration,
    chunkCount: stream.chunkCount,
    totalBytes: stream.totalBytes,
    error: error.message,
    errorType: error.constructor.name,
    lastChunkAge: failureTime - stream.lastChunkTime
  });
  
  // Check if we should attempt recovery
  if (stream.recoveryAttempts < MAX_RECOVERY_ATTEMPTS && stream.chunkCount > 0) {
    streamLogger.info('[Monitor] Attempting stream recovery', {
      streamId,
      attempt: stream.recoveryAttempts + 1,
      maxAttempts: MAX_RECOVERY_ATTEMPTS
    });
    
    attemptStreamRecovery(streamId, error);
  } else {
    streamLogger.error('[Monitor] Stream recovery not possible or exhausted', {
      streamId,
      recoveryAttempts: stream.recoveryAttempts,
      chunkCount: stream.chunkCount
    });
    
    // Clean up
    activeStreams.delete(streamId);
    clearStreamTimeout(streamId);
  }
};

/**
 * Get stream statistics
 * @param {string} streamId - Stream identifier
 * @returns {Object|null} Stream statistics or null if not found
 */
streamMonitor.getStreamStats = function(streamId) {
  const stream = activeStreams.get(streamId);
  if (!stream) {
    return null;
  }
  
  const now = Date.now();
  return {
    id: streamId,
    duration: now - stream.startTime,
    chunkCount: stream.chunkCount,
    totalBytes: stream.totalBytes,
    timeSinceLastChunk: now - stream.lastChunkTime,
    averageChunkSize: stream.chunkCount > 0 ? Math.round(stream.totalBytes / stream.chunkCount) : 0,
    isActive: stream.isActive,
    recoveryAttempts: stream.recoveryAttempts
  };
};

/**
 * Get all active streams
 * @returns {Array} Array of active stream statistics
 */
streamMonitor.getAllActiveStreams = function() {
  const activeStreamStats = [];
  for (const [streamId] of activeStreams) {
    const stats = streamMonitor.getStreamStats(streamId);
    if (stats) {
      activeStreamStats.push(stats);
    }
  }
  return activeStreamStats;
};

// Private functions

/**
 * Start monitoring a stream for issues
 * @param {string} streamId - Stream identifier
 */
function startStreamMonitoring(streamId) {
  const timeoutId = setTimeout(() => {
    checkStreamHealth(streamId);
  }, HEARTBEAT_INTERVAL);
  
  // Store timeout ID for cleanup
  if (!streamMonitor._timeouts) {
    streamMonitor._timeouts = new Map();
  }
  streamMonitor._timeouts.set(streamId, timeoutId);
}

/**
 * Check stream health and detect issues
 * @param {string} streamId - Stream identifier
 */
function checkStreamHealth(streamId) {
  const stream = activeStreams.get(streamId);
  if (!stream || !stream.isActive) {
    return; // Stream no longer active
  }
  
  const now = Date.now();
  const timeSinceLastChunk = now - stream.lastChunkTime;
  
  // Check for prolonged silence
  if (timeSinceLastChunk > MAX_SILENCE_DURATION) {
    if (!stream.silenceWarningIssued) {
      streamLogger.warn('[Monitor] Stream silence detected', {
        streamId,
        timeSinceLastChunk,
        maxSilenceDuration: MAX_SILENCE_DURATION,
        chunkCount: stream.chunkCount,
        totalBytes: stream.totalBytes
      });
      stream.silenceWarningIssued = true;
      
      // Notify about potential issue
      if (stream.onSilenceDetected && typeof stream.onSilenceDetected === 'function') {
        stream.onSilenceDetected(streamId, timeSinceLastChunk);
      }
    }
  }
  
  // Continue monitoring if stream is still active
  if (stream.isActive) {
    startStreamMonitoring(streamId);
  }
}

/**
 * Attempt to recover a failed stream
 * @param {string} streamId - Stream identifier
 * @param {Error} originalError - Original error that caused the failure
 */
function attemptStreamRecovery(streamId, originalError) {
  const stream = activeStreams.get(streamId);
  if (!stream) {
    return;
  }
  
  stream.recoveryAttempts++;
  
  setTimeout(() => {
    streamLogger.info('[Monitor] Executing stream recovery attempt', {
      streamId,
      attempt: stream.recoveryAttempts,
      originalError: originalError.message
    });
    
    // Call recovery callback if provided
    if (stream.onRecoveryAttempt && typeof stream.onRecoveryAttempt === 'function') {
      try {
        stream.onRecoveryAttempt(streamId, stream.recoveryAttempts, originalError);
      } catch (recoveryError) {
        streamLogger.error('[Monitor] Error during recovery attempt', {
          streamId,
          attempt: stream.recoveryAttempts,
          recoveryError: recoveryError.message
        });
        
        // If recovery fails, try again or give up
        if (stream.recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
          attemptStreamRecovery(streamId, recoveryError);
        } else {
          streamMonitor.failStream(streamId, recoveryError);
        }
      }
    }
  }, RECOVERY_RETRY_DELAY);
}

/**
 * Clear timeout for a stream
 * @param {string} streamId - Stream identifier
 */
function clearStreamTimeout(streamId) {
  if (streamMonitor._timeouts && streamMonitor._timeouts.has(streamId)) {
    clearTimeout(streamMonitor._timeouts.get(streamId));
    streamMonitor._timeouts.delete(streamId);
  }
}

// Cleanup function for module unload
streamMonitor.cleanup = function() {
  streamLogger.info('[Monitor] Cleaning up stream monitor');
  
  // Clear all timeouts
  if (streamMonitor._timeouts) {
    for (const [streamId, timeoutId] of streamMonitor._timeouts) {
      clearTimeout(timeoutId);
    }
    streamMonitor._timeouts.clear();
  }
  
  // Clear active streams
  activeStreams.clear();
};

// Export the module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = streamMonitor;
} 