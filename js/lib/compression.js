// Unified Compression Module
// Handles compression and decompression using Pako deflate
// Supports different compression configurations for various data types

var compressionModule = {};

// Create module logger
const compressionLogger = logger.createModuleLogger('Compression');

/**
 * Safe JSON stringify that handles circular references
 */
function safeStringify(obj) {
  const seen = new WeakSet();

  return JSON.stringify(obj, function(key, val) {
    if (val != null && typeof val === 'object') {
      if (seen.has(val)) {
        return '[Circular Reference]';
      }
      seen.add(val);
    }
    return val;
  });
}

// Base compression configuration
const COMPRESSION_CONFIG = {
  // Compression methods
  METHOD_NONE: 'none',
  METHOD_PAKO_DEFLATE: 'pako-deflate',
  
  // Metadata indicators
  COMPRESSED_INDICATOR: '__compressed__',
  COMPRESSION_METHOD_KEY: '__compression_method__',
  ORIGINAL_SIZE_KEY: '__original_size__',
  COMPRESSION_TIMESTAMP_KEY: '__compression_timestamp__',
  
  // Default configurations for different data types
  CONFIGS: {
    // Configuration for page content and chat history
    CACHE: {
      MIN_SIZE_FOR_COMPRESSION: 500, // bytes - higher threshold for cache data
      COMPRESSION_THRESHOLD: 0.7,   // Require 30% compression for cache data
      TYPE_NAME: 'cache'
    },
    
    // Configuration for quick inputs and system prompts
    QUICK_INPUT: {
      MIN_SIZE_FOR_COMPRESSION: 200, // bytes - lower threshold for smaller quick inputs
      COMPRESSION_THRESHOLD: 0.8,   // More lenient threshold for quick inputs
      TYPE_NAME: 'quick-input'
    },
    
    // General purpose configuration
    GENERAL: {
      MIN_SIZE_FOR_COMPRESSION: 300, // bytes - balanced threshold
      COMPRESSION_THRESHOLD: 0.75,  // Balanced compression threshold
      TYPE_NAME: 'general'
    },

    // Configuration for sync data (optimized for network transfer)
    SYNC: {
      MIN_SIZE_FOR_COMPRESSION: 512, // bytes - sync data threshold
      COMPRESSION_THRESHOLD: 0.85,  // Only compress if saves at least 15%
      TYPE_NAME: 'sync'
    }
  }
};

/**
 * Check if Pako library is available
 * @returns {boolean} - Whether Pako is loaded
 */
compressionModule.isPakoAvailable = function() {
  try {
    // Check for Pako in different environments
    if (typeof pako !== 'undefined' && pako.deflate && pako.inflate) {
      return true; // Global pako variable
    }
    
    if (typeof window !== 'undefined' && typeof window.pako !== 'undefined' && window.pako.deflate) {
      return true; // Browser window.pako
    }
    
    if (typeof self !== 'undefined' && typeof self.pako !== 'undefined' && self.pako.deflate) {
      return true; // Web Worker self.pako
    }
    
    return false;
  } catch (error) {
    compressionLogger.error('Error checking Pako availability:', error.message);
    return false;
  }
};

/**
 * Get Pako reference from available scopes
 * @returns {Object|null} - Pako library reference or null
 */
compressionModule.getPakoReference = function() {
  try {
    if (typeof pako !== 'undefined') {
      return pako;
    }
    
    if (typeof window !== 'undefined' && window.pako) {
      return window.pako;
    }
    
    if (typeof self !== 'undefined' && self.pako) {
      return self.pako;
    }
    
    return null;
  } catch (error) {
    compressionLogger.error('Error getting Pako reference:', error.message);
    return null;
  }
};

/**
 * Get the best available compression method
 * @returns {string} - Best compression method available
 */
compressionModule.getBestCompressionMethod = function() {
  const pakoAvailable = compressionModule.isPakoAvailable();
  
  if (pakoAvailable) {
    return COMPRESSION_CONFIG.METHOD_PAKO_DEFLATE;
  }
  
  compressionLogger.warn('Pako not available, compression disabled');
  return COMPRESSION_CONFIG.METHOD_NONE;
};

/**
 * Check if data should be compressed based on configuration
 * @param {string|Object} data - The data to check
 * @param {Object} config - Compression configuration
 * @returns {boolean} - Whether compression is beneficial
 */
compressionModule.shouldCompress = function(data, config) {
  if (!data) {
    return false;
  }
  
  let stringData;
  if (typeof data === 'string') {
    stringData = data;
  } else if (typeof data === 'object') {
    try {
      stringData = safeStringify(data);
    } catch (error) {
      compressionLogger.warn('Cannot stringify data for compression check:', error.message);
      return false;
    }
  } else {
    return false;
  }
  
  // Only compress data larger than minimum threshold
  const dataSize = new Blob([stringData]).size;
  return dataSize >= config.MIN_SIZE_FOR_COMPRESSION;
};

/**
 * Compress data using the best available method
 * @param {string|Object} data - The data to compress
 * @param {Object} config - Compression configuration
 * @returns {string|Object} - Compressed data or original if not beneficial
 */
compressionModule.compress = function(data, config = COMPRESSION_CONFIG.CONFIGS.GENERAL) {
  try {
    // Convert data to string if needed
    let stringData;
    if (typeof data === 'string') {
      stringData = data;
    } else if (typeof data === 'object') {
      try {
        stringData = safeStringify(data);
      } catch (error) {
        compressionLogger.warn('Cannot stringify data for compression:', error.message);
        return data;
      }
    } else {
      compressionLogger.warn('Invalid data type for compression');
      return data;
    }
    
    const originalSize = new Blob([stringData]).size;
    
    // Check if data should be compressed
    if (!compressionModule.shouldCompress(stringData, config)) {
      return data;
    }
    
    // Get best available compression method
    const compressionMethod = compressionModule.getBestCompressionMethod();
    
    if (compressionMethod === COMPRESSION_CONFIG.METHOD_NONE) {
      compressionLogger.warn('No compression method available');
      return data;
    }
    
    if (compressionMethod === COMPRESSION_CONFIG.METHOD_PAKO_DEFLATE) {
      if (!compressionModule.isPakoAvailable()) {
        compressionLogger.warn('Pako not available for deflate compression');
        return data;
      }
      
      const pakoLib = compressionModule.getPakoReference();
      if (!pakoLib) {
        compressionLogger.warn('Pako reference not found');
        return data;
      }
      
      // Convert string to Uint8Array for Pako
      const utf8Bytes = new TextEncoder().encode(stringData);
      const pakoCompressed = pakoLib.deflate(utf8Bytes);
      
      // Convert to base64 for storage
      // Use a safe method to avoid stack overflow with large arrays
      let binaryString = '';
      for (let i = 0; i < pakoCompressed.length; i++) {
        binaryString += String.fromCharCode(pakoCompressed[i]);
      }
      const compressed = btoa(binaryString);
      
      // Create compressed data with metadata
      const compressedData = {
        [COMPRESSION_CONFIG.COMPRESSED_INDICATOR]: true,
        [COMPRESSION_CONFIG.COMPRESSION_METHOD_KEY]: compressionMethod,
        [COMPRESSION_CONFIG.ORIGINAL_SIZE_KEY]: originalSize,
        [COMPRESSION_CONFIG.COMPRESSION_TIMESTAMP_KEY]: Date.now(),
        data: compressed
      };
      
      const compressedSize = new Blob([safeStringify(compressedData)]).size;
      const compressionRatio = compressedSize / originalSize;
      
      // Check if compression is beneficial
      if (compressionRatio > config.COMPRESSION_THRESHOLD) {
        return data;
      }
      
      return compressedData;
    } else {
      compressionLogger.warn(`Unknown compression method: ${compressionMethod}`);
      return data;
    }
    
  } catch (error) {
    const typeName = (config && config.TYPE_NAME) ? config.TYPE_NAME : 'unknown';
    compressionLogger.error(`Error compressing data for ${typeName}:`, error.message);
    return data; // Return original on error
  }
};

/**
 * Decompress data using the appropriate method
 * @param {string|Object} data - The data to decompress
 * @param {string} dataType - Type of data for logging (optional)
 * @returns {string|Object} - Decompressed data
 */
compressionModule.decompress = function(data, dataType = 'unknown') {
  try {
    // If data is string or non-object, it's not compressed
    if (typeof data === 'string' || !data || typeof data !== 'object') {
      return data;
    }
    
    // Check if data is compressed
    if (!data[COMPRESSION_CONFIG.COMPRESSED_INDICATOR]) {
      return data;
    }
    
    const compressionMethod = data[COMPRESSION_CONFIG.COMPRESSION_METHOD_KEY];
    
    if (compressionMethod === COMPRESSION_CONFIG.METHOD_PAKO_DEFLATE) {
      if (!compressionModule.isPakoAvailable()) {
        compressionLogger.error('Pako not available for decompression');
        return data;
      }
      
      const pakoLib = compressionModule.getPakoReference();
      if (!pakoLib) {
        compressionLogger.error('Pako reference not found for decompression');
        return data;
      }
      
      // Convert base64 back to Uint8Array
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Decompress using Pako
      const inflated = pakoLib.inflate(bytes);
      const decompressed = new TextDecoder().decode(inflated);
      
      return decompressed;
      
    } else {
      compressionLogger.warn(`Unknown compression method: ${compressionMethod} for ${dataType}`);
      return data;
    }
    
  } catch (error) {
    compressionLogger.error(`Error decompressing data for ${dataType}:`, error.message);
    return data; // Return original on error
  }
};

/**
 * Get compression statistics for data
 * @param {string|Object|Array} data - The data to analyze
 * @param {Object} config - Compression configuration
 * @returns {Object} - Compression statistics
 */
compressionModule.getCompressionStats = function(data, config = COMPRESSION_CONFIG.CONFIGS.GENERAL) {
  try {
    let stringData;
    
    if (typeof data === 'string') {
      stringData = data;
    } else if (typeof data === 'object') {
      try {
        stringData = safeStringify(data);
      } catch (error) {
        return { canCompress: false, originalSize: 0, compressedSize: 0, ratio: 1, error: 'Cannot stringify data' };
      }
    } else {
      return { canCompress: false, originalSize: 0, compressedSize: 0, ratio: 1, error: 'Invalid data type' };
    }
    
    const originalSize = new Blob([stringData]).size;
    
    if (originalSize < config.MIN_SIZE_FOR_COMPRESSION) {
      return {
        canCompress: false,
        originalSize,
        compressedSize: originalSize,
        ratio: 1,
        savings: 0,
        reason: 'Below minimum size threshold',
        type: config.TYPE_NAME
      };
    }
    
    // Try compression to get actual stats
    const compressed = compressionModule.compress(data, config);
    
    // If compression failed or wasn't beneficial
    if (compressed === data) {
      return {
        canCompress: false,
        originalSize,
        compressedSize: originalSize,
        ratio: 1,
        savings: 0,
        reason: 'Compression not beneficial or unavailable',
        type: config.TYPE_NAME
      };
    }
    
    // Calculate compressed size from the actual compressed result
    let compressedSize = originalSize;
    let method = 'none';
    
    if (typeof compressed === 'object' && compressed[COMPRESSION_CONFIG.COMPRESSED_INDICATOR]) {
      compressedSize = new Blob([safeStringify(compressed)]).size;
      method = compressed[COMPRESSION_CONFIG.COMPRESSION_METHOD_KEY] || 'unknown';
    }
    
    const ratio = compressedSize / originalSize;
    const savings = originalSize - compressedSize;
    
    return {
      canCompress: ratio <= config.COMPRESSION_THRESHOLD,
      originalSize,
      compressedSize,
      ratio,
      savings,
      method: method,
      type: config.TYPE_NAME
    };
    
  } catch (error) {
    compressionLogger.error('Error getting compression stats:', error.message);
    return { canCompress: false, originalSize: 0, compressedSize: 0, ratio: 1, error: error.message };
  }
};

// =============================================================================
// HIGH-LEVEL API FUNCTIONS FOR DIFFERENT DATA TYPES
// =============================================================================

/**
 * Page Content Compression Functions
 */
compressionModule.compressPageContent = function(content) {
  return compressionModule.compress(content, COMPRESSION_CONFIG.CONFIGS.CACHE);
};

compressionModule.decompressPageContent = function(data) {
  const decompressed = compressionModule.decompress(data, 'page-content');
  // For page content, we expect a string result
  return typeof decompressed === 'string' ? decompressed : data;
};

/**
 * Chat History Compression Functions
 */
compressionModule.compressChatHistory = function(chatHistory) {
  try {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
      return chatHistory;
    }
    
    const chatHistoryStr = safeStringify(chatHistory);
    const result = compressionModule.compress(chatHistoryStr, COMPRESSION_CONFIG.CONFIGS.CACHE);
    
    // If result is same as input (not compressed), return original array
    if (result === chatHistoryStr) {
      return chatHistory;
    }
    
    // Add message count to metadata for chat history
    if (typeof result === 'object' && result[COMPRESSION_CONFIG.COMPRESSED_INDICATOR]) {
      result.messageCount = chatHistory.length;
    }
    
    return result;
    
  } catch (error) {
    compressionLogger.error('Error compressing chat history:', error.message);
    return chatHistory; // Return original on error
  }
};

compressionModule.decompressChatHistory = function(data) {
  try {
    // If data is array, it's not compressed
    if (Array.isArray(data)) {
      return data;
    }
    
    // Check if data is compressed
    if (!data || typeof data !== 'object' || !data[COMPRESSION_CONFIG.COMPRESSED_INDICATOR]) {
      // Return empty array for invalid data
      return [];
    }
    
    const decompressedStr = compressionModule.decompress(data, 'chat-history');
    
    if (typeof decompressedStr !== 'string') {
      compressionLogger.warn('Decompressed chat history data is not a string');
      return [];
    }
    
    const chatHistory = JSON.parse(decompressedStr);
    
    if (!Array.isArray(chatHistory)) {
      throw new Error('Decompressed chat history is not an array');
    }
    
    return chatHistory;
    
  } catch (error) {
    compressionLogger.error('Error decompressing chat history:', error.message);
    return []; // Return empty array on error
  }
};

/**
 * Quick Input Compression Functions
 */
compressionModule.compressQuickInputs = function(data) {
  return compressionModule.compress(data, COMPRESSION_CONFIG.CONFIGS.QUICK_INPUT);
};

compressionModule.decompressQuickInputs = function(data) {
  const decompressed = compressionModule.decompress(data, 'quick-inputs');
  
  // For quick inputs, try to parse JSON if it's a string
  if (typeof decompressed === 'string') {
    try {
      return JSON.parse(decompressed);
    } catch (error) {
      compressionLogger.warn('Failed to parse decompressed quick input data as JSON');
      return data;
    }
  }
  
  return decompressed;
};

/**
 * Text Compression Functions (for system prompts, etc.)
 */
compressionModule.compressText = function(text) {
  if (typeof text !== 'string') {
    compressionLogger.warn('compressText called with non-string value');
    return text;
  }
  
  // Wrap text in an object to use the general compression
  const textObj = { text: text };
  const compressed = compressionModule.compress(textObj, COMPRESSION_CONFIG.CONFIGS.QUICK_INPUT);
  
  // If compression was applied, return the compressed object
  // If not compressed, return the original text
  return compressed !== textObj ? compressed : text;
};

compressionModule.decompressText = function(data) {
  // If it's a plain string, return as-is
  if (typeof data === 'string') {
    return data;
  }
  
  // If it's a compressed object, decompress it
  if (data && typeof data === 'object') {
    const decompressed = compressionModule.decompress(data, 'text');
    
    // If decompressed is a string, try to parse it as JSON
    if (typeof decompressed === 'string') {
      try {
        const parsed = JSON.parse(decompressed);
        // If parsed object has text property, return the text
        if (parsed && parsed.text) {
          return parsed.text;
        }
      } catch (error) {
        // If parsing fails, return the string as-is
        return decompressed;
      }
    }
    
    // If decompressed object has text property, return the text
    if (decompressed && decompressed.text) {
      return decompressed.text;
    }
    
    // Otherwise return the original data
    return data;
  }
  
  return data;
};

/**
 * General purpose compression with best method
 */
compressionModule.compressWithBestMethod = function(content) {
  return compressionModule.compress(content, COMPRESSION_CONFIG.CONFIGS.CACHE);
};

compressionModule.decompressWithMethod = function(data) {
  return compressionModule.decompress(data, 'general');
};

// =============================================================================
// BACKWARD COMPATIBILITY ALIASES
// =============================================================================

// Singular forms for backward compatibility
compressionModule.compressQuickInput = compressionModule.compressQuickInputs;
compressionModule.decompressQuickInput = compressionModule.decompressQuickInputs;

// =============================================================================
// UTILITY AND MAINTENANCE FUNCTIONS
// =============================================================================

/**
 * Initialize compression module
 */
compressionModule.initialize = async function() {
  try {
    compressionLogger.info('Initializing unified compression module');
    
    // Check available compression methods
    const pakoAvailable = compressionModule.isPakoAvailable();
    compressionLogger.info(`Compression support - Pako: ${pakoAvailable ? 'available' : 'not available'}`);
    
    compressionLogger.info('Unified compression module initialized successfully');
    return true;
    
  } catch (error) {
    compressionLogger.error('Error initializing unified compression module:', error.message);
    return false;
  }
};

// =============================================================================
// EXPORTS AND GLOBAL REFERENCES
// =============================================================================

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = compressionModule;
}

// Create global references for backward compatibility
// This ensures existing code that expects cacheCompression and quickInputCompression still works
var cacheCompression = {
  isPakoAvailable: compressionModule.isPakoAvailable,
  getBestCompressionMethod: compressionModule.getBestCompressionMethod,
  shouldCompress: function(data) {
    return compressionModule.shouldCompress(data, COMPRESSION_CONFIG.CONFIGS.CACHE);
  },
  compressWithBestMethod: function(content) {
    return compressionModule.compress(content, COMPRESSION_CONFIG.CONFIGS.CACHE);
  },
  decompressWithMethod: function(data) {
    return compressionModule.decompress(data, 'general');
  },
  compressPageContent: function(content) {
    return compressionModule.compress(content, COMPRESSION_CONFIG.CONFIGS.CACHE);
  },
  decompressPageContent: function(data) {
    const decompressed = compressionModule.decompress(data, 'page-content');
    return typeof decompressed === 'string' ? decompressed : data;
  },
  compressChatHistory: function(chatHistory) {
    try {
      if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
        return chatHistory;
      }
      
      const chatHistoryStr = safeStringify(chatHistory);
      const result = compressionModule.compress(chatHistoryStr, COMPRESSION_CONFIG.CONFIGS.CACHE);
      
      // If result is same as input (not compressed), return original array
      if (result === chatHistoryStr) {
        return chatHistory;
      }
      
      // Add message count to metadata for chat history
      if (typeof result === 'object' && result[COMPRESSION_CONFIG.COMPRESSED_INDICATOR]) {
        result.messageCount = chatHistory.length;
      }
      
      return result;
      
    } catch (error) {
      compressionLogger.error('Error compressing chat history:', error.message);
      return chatHistory; // Return original on error
    }
  },
  decompressChatHistory: function(data) {
    try {
      // If data is array, it's not compressed
      if (Array.isArray(data)) {
        return data;
      }
      
      // Check if data is compressed
      if (!data || typeof data !== 'object' || !data[COMPRESSION_CONFIG.COMPRESSED_INDICATOR]) {
        return [];
      }
      
      const decompressedStr = compressionModule.decompress(data, 'chat-history');
      
      if (typeof decompressedStr !== 'string') {
        compressionLogger.warn('Decompressed chat history data is not a string');
        return [];
      }
      
      const chatHistory = JSON.parse(decompressedStr);
      
      if (!Array.isArray(chatHistory)) {
        throw new Error('Decompressed chat history is not an array');
      }
      
      return chatHistory;
      
    } catch (error) {
      compressionLogger.error('Error decompressing chat history:', error.message);
      return []; // Return empty array on error
    }
  },
  getCompressionStats: function(data, dataType = 'general') {
    return compressionModule.getCompressionStats(data, COMPRESSION_CONFIG.CONFIGS.CACHE);
  },
  initialize: compressionModule.initialize
};

var quickInputCompression = {
  isPakoAvailable: compressionModule.isPakoAvailable,
  compressQuickInputs: function(data) {
    return compressionModule.compress(data, COMPRESSION_CONFIG.CONFIGS.QUICK_INPUT);
  },
  decompressQuickInputs: function(data) {
    const decompressed = compressionModule.decompress(data, 'quick-inputs');
    
    // For quick inputs, try to parse JSON if it's a string
    if (typeof decompressed === 'string') {
      try {
        return JSON.parse(decompressed);
      } catch (error) {
        compressionLogger.warn('Failed to parse decompressed quick input data as JSON');
        return data;
      }
    }
    
    return decompressed;
  },
  compressQuickInput: function(data) {
    return quickInputCompression.compressQuickInputs(data);
  },
  decompressQuickInput: function(data) {
    return quickInputCompression.decompressQuickInputs(data);
  },
  compressText: function(text) {
    if (typeof text !== 'string') {
      compressionLogger.warn('compressText called with non-string value');
      return text;
    }
    
    // Wrap text in an object to use the general compression
    const textObj = { text: text };
    const compressed = compressionModule.compress(textObj, COMPRESSION_CONFIG.CONFIGS.QUICK_INPUT);
    
    // If compression was applied, return the compressed object
    // If not compressed, return the original text
    return compressed !== textObj ? compressed : text;
  },
  decompressText: function(data) {
    // If it's a plain string, return as-is
    if (typeof data === 'string') {
      return data;
    }
    
    // If it's a compressed object, decompress it
    if (data && typeof data === 'object') {
      const decompressed = compressionModule.decompress(data, 'text');
      
      // If decompressed is a string, try to parse it as JSON
      if (typeof decompressed === 'string') {
        try {
          const parsed = JSON.parse(decompressed);
          // If parsed object has text property, return the text
          if (parsed && parsed.text) {
            return parsed.text;
          }
        } catch (error) {
          // If parsing fails, return the string as-is
          return decompressed;
        }
      }
      
      // If decompressed object has text property, return the text
      if (decompressed && decompressed.text) {
        return decompressed.text;
      }
      
      // Otherwise return the original data
      return data;
    }
    
    return data;
  },
  getCompressionStats: function(data) {
    return compressionModule.getCompressionStats(data, COMPRESSION_CONFIG.CONFIGS.QUICK_INPUT);
  }
}; 