// Jina Extractor Module for Think Bot

// This script should be imported by the main content_extractor.js using importScripts.
// It assumes 'logger' is available in the global scope.

const jinaExtractorLogger = logger.createModuleLogger('JinaExtractor');

// Extract with Jina AI
async function extractWithJina(url, apiKey, responseTemplate) {
  const strategies = [];
  
  if (apiKey) {
    strategies.push({
      name: 'r.jina.ai (authenticated)',
      execute: () => callJinaAPI('https://r.jina.ai/', url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      }, true)
    });
  }
  
  strategies.push({
    name: 'r.jina.ai (free)',
    execute: () => callJinaAPI('https://r.jina.ai/', url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    }, true)
  });
  
  jinaExtractorLogger.info(`Trying ${strategies.length} Jina extraction strategies`, { url });
  
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    try {
      const result = await strategy.execute();
      
      if (result) {
        jinaExtractorLogger.info(`Jina strategy succeeded: ${strategy.name}`, { url });
        const formatted = formatJinaResponse(result.data || result, responseTemplate, url);
        return formatted;
      } else {
        jinaExtractorLogger.warn(`Jina strategy returned empty result: ${strategy.name}`, { url });
      }
    } catch (error) {
      jinaExtractorLogger.warn(`Jina strategy failed: ${strategy.name}`, { url, error: error.message });
    }
  }
  
  jinaExtractorLogger.error('All Jina extraction strategies failed', { url, strategiesAttempted: strategies.length });
  throw new Error('All Jina AI services failed');
}

// Unified Jina AI API call function
async function callJinaAPI(baseUrl, url, options, expectJson = true) {
  let requestUrl;
  if (options.method === 'GET') {
    requestUrl = `${baseUrl}${encodeURIComponent(url)}`;
  } else {
    requestUrl = baseUrl;
  }
  
  const response = await fetch(requestUrl, options);
  
  if (!response.ok) {
    throw new Error(`Jina AI service returned: ${response.status} ${response.statusText}`);
  }
  
  let data;
  if (expectJson) {
    data = await response.json();
    if (!data) {
      throw new Error('No data returned from Jina AI service');
    }
  } else {
    data = await response.text();
    if (!data || !data.trim()) {
      throw new Error('No content returned from Jina AI service');
    }
  }
  
  return data;
}

// Format Jina AI response using template
function formatJinaResponse(data, template, originalUrl) {
  if (!template) {
    return data.content || data.text || JSON.stringify(data, null, 2);
  }
  
  const title = data.title || 'Untitled';
  const url = data.url || ''; // Jina's response might have its own URL field
  const description = data.description || '';
  const content = data.content || ''; // This is the main content
  
  let formatted = template
    .replace(/\{title\}/g, title)
    .replace(/\{url\}/g, url) 
    .replace(/\{description\}/g, description)
    .replace(/\{content\}/g, content);
  
  return formatted;
} 