// Think Bot WebDAV Client Module
// Handles WebDAV operations for sync functionality

// Create a global webdavClient object
var webdavClient = {};

// Create module logger
const webdavLogger = logger.createModuleLogger('WebDAVClient');

// WebDAV configuration
const WEBDAV_REQUEST_TIMEOUT = 30000; // 30 seconds
const WEBDAV_MAX_RETRIES = 3;
const WEBDAV_RETRY_DELAY = 1000; // 1 second

/**
 * Make authenticated request to WebDAV server with retry logic
 */
webdavClient.makeRequest = async function(url, options = {}) {
  const config = await syncConfig.getSyncConfig();

  if (!config.webdavUrl || !config.webdavUsername || !config.webdavPassword) {
    throw new Error('WebDAV configuration incomplete');
  }

  // Prepare authentication
  const credentials = btoa(`${config.webdavUsername}:${config.webdavPassword}`);
  
  const defaultHeaders = {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/octet-stream',
    'User-Agent': 'ThinkBot-Extension'
  };

  const requestOptions = {
    timeout: WEBDAV_REQUEST_TIMEOUT,
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  };

  return await this.makeRequestWithRetry(url, requestOptions);
};

/**
 * Make request with retry logic
 */
webdavClient.makeRequestWithRetry = async function(url, options) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= WEBDAV_MAX_RETRIES; attempt++) {
    try {
      webdavLogger.debug(`WebDAV request attempt ${attempt}/${WEBDAV_MAX_RETRIES}:`, { 
        url: url.replace(/\/\/[^@]+@/, '//***@'), // Hide credentials in logs
        method: options.method || 'GET'
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || WEBDAV_REQUEST_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      webdavLogger.debug('WebDAV request successful');
      return response;

    } catch (error) {
      lastError = error;
      webdavLogger.warn(`WebDAV request attempt ${attempt} failed:`, error.message);

      if (attempt < WEBDAV_MAX_RETRIES) {
        webdavLogger.info(`Retrying in ${WEBDAV_RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, WEBDAV_RETRY_DELAY));
      }
    }
  }

  webdavLogger.error('All WebDAV request attempts failed:', lastError.message);
  throw lastError;
};

/**
 * Ensure directory exists on WebDAV server
 */
webdavClient.ensureDirectory = async function(dirPath) {
  try {
    const config = await syncConfig.getSyncConfig();
    const fullUrl = this.buildWebdavUrl(config.webdavUrl, dirPath);
    
    // Try to create directory with MKCOL
    const response = await this.makeRequest(fullUrl, {
      method: 'MKCOL'
    });
    
    webdavLogger.info('Directory created or already exists:', { dirPath });
    return true;
  } catch (error) {
    // 405 Method Not Allowed typically means directory already exists
    if (error.message.includes('405')) {
      webdavLogger.debug('Directory already exists:', { dirPath });
      return true;
    }
    
    webdavLogger.error('Error ensuring directory:', { dirPath, error: error.message });
    throw error;
  }
};

/**
 * Upload file to WebDAV server
 */
webdavClient.uploadFile = async function(filePath, content) {
  try {
    const config = await syncConfig.getSyncConfig();
    const fullUrl = this.buildWebdavUrl(config.webdavUrl, filePath);
    
    // Ensure parent directory exists
    const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (parentDir) {
      await this.ensureDirectory(parentDir);
    }
    
    const response = await this.makeRequest(fullUrl, {
      method: 'PUT',
      body: content,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    webdavLogger.info('File uploaded successfully:', { 
      filePath, 
      size: typeof content === 'string' ? content.length : content.size 
    });
    
    return {
      success: true,
      filePath: filePath,
      size: typeof content === 'string' ? content.length : content.size
    };
  } catch (error) {
    webdavLogger.error('Error uploading file:', { filePath, error: error.message });
    throw error;
  }
};

/**
 * Download file from WebDAV server
 */
webdavClient.downloadFile = async function(filePath) {
  try {
    const config = await syncConfig.getSyncConfig();
    const fullUrl = this.buildWebdavUrl(config.webdavUrl, filePath);
    
    const response = await this.makeRequest(fullUrl, {
      method: 'GET'
    });
    
    const content = await response.text();
    
    webdavLogger.info('File downloaded successfully:', { 
      filePath, 
      size: content.length 
    });
    
    return content;
  } catch (error) {
    // 404 means file doesn't exist, which is OK for sync operations
    if (error.message.includes('404')) {
      webdavLogger.info('File not found (this is OK for initial sync):', { filePath });
      return null;
    }
    
    webdavLogger.error('Error downloading file:', { filePath, error: error.message });
    throw error;
  }
};

/**
 * Check if file exists on WebDAV server
 */
webdavClient.fileExists = async function(filePath) {
  try {
    const config = await syncConfig.getSyncConfig();
    const fullUrl = this.buildWebdavUrl(config.webdavUrl, filePath);
    
    const response = await this.makeRequest(fullUrl, {
      method: 'HEAD'
    });
    
    return response.ok;
  } catch (error) {
    if (error.message.includes('404')) {
      return false;
    }
    throw error;
  }
};

/**
 * Delete file from WebDAV server
 */
webdavClient.deleteFile = async function(filePath) {
  try {
    const config = await syncConfig.getSyncConfig();
    const fullUrl = this.buildWebdavUrl(config.webdavUrl, filePath);
    
    const response = await this.makeRequest(fullUrl, {
      method: 'DELETE'
    });
    
    webdavLogger.info('File deleted successfully:', { filePath });
    return true;
  } catch (error) {
    if (error.message.includes('404')) {
      webdavLogger.info('File not found (already deleted):', { filePath });
      return true;
    }
    
    webdavLogger.error('Error deleting file:', { filePath, error: error.message });
    throw error;
  }
};

/**
 * Test WebDAV connection
 */
webdavClient.testConnection = async function(webdavUrl, username, password) {
  try {
    // Build test URL
    const testUrl = this.buildWebdavUrl(webdavUrl, '');
    
    // Prepare authentication
    const credentials = btoa(`${username}:${password}`);
    
    const response = await fetch(testUrl, {
      method: 'PROPFIND', // WebDAV method to test connectivity
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Depth': '0',
        'Content-Type': 'application/xml'
      },
      body: '<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>'
    });
    
    if (response.ok || response.status === 207) { // 207 Multi-Status is also OK for WebDAV
      webdavLogger.info('WebDAV connection test successful');
      return {
        success: true,
        message: 'WebDAV connection successful',
        serverInfo: {
          status: response.status,
          server: response.headers.get('Server') || 'Unknown'
        }
      };
    } else {
      return {
        success: false,
        message: `WebDAV connection failed: ${response.status} ${response.statusText}`,
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    webdavLogger.error('WebDAV connection test failed:', error.message);
    return {
      success: false,
      message: 'WebDAV connection test failed',
      error: error.message
    };
  }
};

/**
 * Build full WebDAV URL
 */
webdavClient.buildWebdavUrl = function(baseUrl, filePath) {
  // Ensure base URL ends with /
  let url = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  
  // Add ThinkBot directory prefix
  url += 'thinkbot/';
  
  // Add file path if provided
  if (filePath) {
    // Remove leading slash if present
    filePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    url += filePath;
  }
  
  return url;
};

/**
 * Get file content (alias for downloadFile to match gist_client interface)
 */
webdavClient.getFile = async function(filePath) {
  return await this.downloadFile(filePath);
};

/**
 * Update file (alias for uploadFile to match gist_client interface)
 */
webdavClient.updateFile = async function(filePath, content) {
  return await this.uploadFile(filePath, content);
};
