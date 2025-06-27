// Think Bot Gist API Client Module
// Handles GitHub Gist API operations for sync functionality

// Create a global gistClient object
var gistClient = {};

// Create module logger
const gistLogger = logger.createModuleLogger('GistClient');

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'ThinkBot-Extension';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Make authenticated request to GitHub API with retry logic
 */
gistClient.makeRequest = async function(url, options = {}) {
  const config = await syncConfig.getSyncConfig();

  if (!config.gistToken) {
    throw new Error('Gist token not configured');
  }

  const defaultHeaders = {
    'Authorization': `token ${config.gistToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json'
  };

  const requestOptions = {
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
gistClient.makeRequestWithRetry = async function(url, requestOptions, retryCount = 0) {
  try {
    gistLogger.info('Making GitHub API request:', {
      url,
      method: requestOptions.method || 'GET',
      attempt: retryCount + 1
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(url, {
      ...requestOptions,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Check if this is a retryable error
      if (this.isRetryableError(response.status) && retryCount < MAX_RETRIES) {
        gistLogger.warn(`Request failed with status ${response.status}, retrying in ${RETRY_DELAY}ms...`);
        await this.delay(RETRY_DELAY * (retryCount + 1)); // Exponential backoff
        return await this.makeRequestWithRetry(url, requestOptions, retryCount + 1);
      }

      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`);
    }

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }

    // Check if this is a network error and we can retry
    if (this.isNetworkError(error) && retryCount < MAX_RETRIES) {
      gistLogger.warn(`Network error occurred, retrying in ${RETRY_DELAY}ms...`, error.message);
      await this.delay(RETRY_DELAY * (retryCount + 1)); // Exponential backoff
      return await this.makeRequestWithRetry(url, requestOptions, retryCount + 1);
    }

    gistLogger.error('GitHub API request failed:', error.message);
    throw error;
  }
};

/**
 * Get Gist information
 */
gistClient.getGist = async function(gistId) {
  try {
    const response = await this.makeRequest(`${GITHUB_API_BASE}/gists/${gistId}`);
    const gist = await response.json();
    
    gistLogger.info('Gist retrieved successfully:', { 
      gistId, 
      filesCount: Object.keys(gist.files).length,
      isPublic: gist.public 
    });
    
    return gist;
  } catch (error) {
    gistLogger.error('Error getting Gist:', { gistId, error: error.message });
    throw error;
  }
};

/**
 * Update Gist with new content
 */
gistClient.updateGist = async function(gistId, files, description = null) {
  try {
    const updateData = { files };
    if (description) {
      updateData.description = description;
    }
    
    const response = await this.makeRequest(`${GITHUB_API_BASE}/gists/${gistId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData)
    });
    
    const updatedGist = await response.json();
    
    gistLogger.info('Gist updated successfully:', { 
      gistId, 
      filesCount: Object.keys(files).length 
    });
    
    return updatedGist;
  } catch (error) {
    gistLogger.error('Error updating Gist:', { gistId, error: error.message });
    throw error;
  }
};

/**
 * Create a new Gist
 */
gistClient.createGist = async function(files, description = 'ThinkBot Sync Data', isPublic = false) {
  try {
    const createData = {
      description,
      public: isPublic,
      files
    };
    
    const response = await this.makeRequest(`${GITHUB_API_BASE}/gists`, {
      method: 'POST',
      body: JSON.stringify(createData)
    });
    
    const newGist = await response.json();
    
    gistLogger.info('Gist created successfully:', { 
      gistId: newGist.id, 
      filesCount: Object.keys(files).length 
    });
    
    return newGist;
  } catch (error) {
    gistLogger.error('Error creating Gist:', error.message);
    throw error;
  }
};

/**
 * Get specific file content from Gist
 */
gistClient.getGistFile = async function(gistId, filename) {
  try {
    const gist = await this.getGist(gistId);
    
    if (!gist.files[filename]) {
      throw new Error(`File '${filename}' not found in Gist`);
    }
    
    const file = gist.files[filename];

    let content;

    // If content is truncated, fetch the raw content
    if (file.truncated) {
      const response = await fetch(file.raw_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch raw content: ${response.statusText}`);
      }
      content = await response.text();
    } else {
      content = file.content;
    }

    // Log warning if content is empty
    if (!content || content.trim() === '') {
      gistLogger.warn('Retrieved Gist file is empty or contains only whitespace:', { gistId, filename });
    }

    return content;
  } catch (error) {
    gistLogger.error('Error getting Gist file:', { gistId, filename, error: error.message });
    throw error;
  }
};

/**
 * Update specific file in Gist
 */
gistClient.updateGistFile = async function(gistId, filename, content, description = null) {
  try {
    const files = {
      [filename]: {
        content: content
      }
    };
    
    return await this.updateGist(gistId, files, description);
  } catch (error) {
    gistLogger.error('Error updating Gist file:', { gistId, filename, error: error.message });
    throw error;
  }
};

/**
 * Delete file from Gist
 */
gistClient.deleteGistFile = async function(gistId, filename) {
  try {
    const files = {
      [filename]: null // Setting to null deletes the file
    };
    
    return await this.updateGist(gistId, files);
  } catch (error) {
    gistLogger.error('Error deleting Gist file:', { gistId, filename, error: error.message });
    throw error;
  }
};

/**
 * Test connection to GitHub API and Gist access
 */
gistClient.testConnection = async function(token, gistId) {
  try {
    // Temporarily use provided credentials for testing
    const originalConfig = await syncConfig.getSyncConfig();
    
    // Create a temporary config for testing
    const testConfig = { ...originalConfig, gistToken: token };
    
    // Temporarily override the config
    const originalGetSyncConfig = syncConfig.getSyncConfig;
    syncConfig.getSyncConfig = async () => testConfig;
    
    try {
      const gist = await this.getGist(gistId);
      
      const result = {
        success: true,
        message: 'Connection successful',
        gistInfo: {
          id: gist.id,
          description: gist.description,
          isPublic: gist.public,
          filesCount: Object.keys(gist.files).length,
          updatedAt: gist.updated_at,
          owner: gist.owner ? gist.owner.login : 'Unknown'
        }
      };
      
      gistLogger.info('Connection test successful:', result.gistInfo);
      return result;
    } finally {
      // Restore original config function
      syncConfig.getSyncConfig = originalGetSyncConfig;
    }
  } catch (error) {
    gistLogger.error('Connection test failed:', error.message);
    return {
      success: false,
      message: 'Connection test failed',
      error: error.message
    };
  }
};

/**
 * Get rate limit information
 */
gistClient.getRateLimit = async function() {
  try {
    const response = await this.makeRequest(`${GITHUB_API_BASE}/rate_limit`);
    const rateLimit = await response.json();
    
    return {
      limit: rateLimit.rate.limit,
      remaining: rateLimit.rate.remaining,
      reset: new Date(rateLimit.rate.reset * 1000),
      used: rateLimit.rate.used
    };
  } catch (error) {
    gistLogger.error('Error getting rate limit:', error.message);
    throw error;
  }
};

/**
 * Check if we're approaching rate limits
 */
gistClient.checkRateLimit = async function() {
  try {
    const rateLimit = await this.getRateLimit();
    const isLow = rateLimit.remaining < 10;

    if (isLow) {
      gistLogger.warn('GitHub API rate limit is low:', rateLimit);
    }

    return {
      isLow,
      ...rateLimit
    };
  } catch (error) {
    // Don't throw error for rate limit checks
    gistLogger.warn('Could not check rate limit:', error.message);
    return { isLow: false };
  }
};

/**
 * Check if an HTTP status code indicates a retryable error
 */
gistClient.isRetryableError = function(status) {
  // Retry on server errors (5xx) and rate limiting (429)
  return status >= 500 || status === 429;
};

/**
 * Check if an error is a network error that can be retried
 */
gistClient.isNetworkError = function(error) {
  // Common network error patterns
  const networkErrorPatterns = [
    'network error',
    'fetch error',
    'connection error',
    'timeout',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED'
  ];

  const errorMessage = error.message.toLowerCase();
  return networkErrorPatterns.some(pattern => errorMessage.includes(pattern));
};

/**
 * Delay function for retry logic
 */
gistClient.delay = function(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Check network connectivity
 */
gistClient.checkNetworkConnectivity = async function() {
  try {
    // Try to reach GitHub's API endpoint
    const response = await fetch('https://api.github.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    return response.ok;
  } catch (error) {
    gistLogger.warn('Network connectivity check failed:', error.message);
    return false;
  }
};
