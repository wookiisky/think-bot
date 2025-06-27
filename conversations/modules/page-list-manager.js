/**
 * Page List Manager Module
 * Manages the left column page list functionality
 */

import { createLogger } from '../../sidebar/modules/utils.js';

// Create logger
const logger = createLogger('PageListManager');

export class PageListManager {
  constructor(confirmationDialog) {
    this.container = null;
    this.searchInput = null;
    this.callbacks = null;
    this.pages = [];
    this.filteredPages = [];
    this.selectedPageUrl = null;
    this.confirmationDialog = confirmationDialog;
  }

  /**
   * Initialize the page list manager
   * @param {HTMLElement} container - Container element for the page list
   * @param {HTMLElement} searchInput - Search input element
   * @param {Object} callbacks - Callback functions
   * @param {Function} callbacks.onPageSelect - Called when a page is selected
   * @param {Function} callbacks.onPageDelete - Called when a page is deleted
   */
  async init(container, searchInput, callbacks) {
    this.container = container;
    this.searchInput = searchInput;
    this.callbacks = callbacks;
    
    logger.info('Initializing page list manager');
    
    // Load and render pages
    await this.loadPages();
    this.renderPageList();
    
    logger.info('Page list manager initialized');
  }

  /**
   * Load pages from background script
   * Only include pages that have actual cached content
   */
  async loadPages() {
    try {
      logger.info('Loading page metadata from storage');

      const response = await chrome.runtime.sendMessage({
        type: 'GET_ALL_PAGE_METADATA'
      });

      if (response && response.pages) {
        // Filter pages to only include those with actual cached content
        const pagesWithContent = [];

        for (const page of response.pages) {
          try {
            // Check if this page has any cached content
            const contentResponse = await chrome.runtime.sendMessage({
              type: 'GET_ANY_CACHED_CONTENT',
              url: page.url
            });

            if (contentResponse && contentResponse.type === 'ANY_CACHED_CONTENT_LOADED' && contentResponse.data && contentResponse.data.content) {
              pagesWithContent.push(page);
              logger.debug(`Page ${page.url} has cached content, including in list`);
            } else {
              logger.debug(`Page ${page.url} has no cached content, excluding from list`);
            }
          } catch (contentError) {
            logger.warn(`Error checking content for page ${page.url}:`, contentError);
            // If we can't check content, exclude the page to be safe
          }
        }

        this.pages = pagesWithContent;
        this.filteredPages = [...this.pages];
        logger.info(`Loaded ${response.pages.length} page metadata entries, ${this.pages.length} have cached content`);
      } else {
        this.pages = [];
        this.filteredPages = [];
        logger.info('No pages found in storage');
      }
    } catch (error) {
      logger.error('Error loading pages from storage:', error);
      this.pages = [];
      this.filteredPages = [];
      this.showError('Failed to load conversations');
    }
  }

  /**
   * Render the page list
   */
  renderPageList() {
    if (!this.container) {
      logger.error('Container not initialized');
      return;
    }
    
    // Clear container
    this.container.innerHTML = '';
    
    if (this.filteredPages.length === 0) {
      this.showEmptyState();
      return;
    }
    
    // Sort pages by timestamp (most recent first)
    const sortedPages = [...this.filteredPages].sort((a, b) => {
      const timestampA = a.timestamp || 0;
      const timestampB = b.timestamp || 0;
      return timestampB - timestampA;
    });
    
    // Create page list items
    sortedPages.forEach(page => {
      const pageItem = this.createPageListItem(page);
      this.container.appendChild(pageItem);
    });
    
    logger.info(`Rendered ${sortedPages.length} page items`);
  }

  /**
   * Create a page list item element
   * @param {Object} page - Page metadata
   * @returns {HTMLElement} Page item element
   */
  createPageListItem(page) {
    const item = document.createElement('div');
    item.className = 'page-list-item';
    item.dataset.url = page.url;
    
    // Create tooltip with title, URL and timestamp (three lines)
    const tooltipText = `${page.title || this.getUrlDisplay(page.url)}\n${page.url}\n${page.timestamp ? 'Extracted: ' + new Date(page.timestamp).toLocaleString() : 'No extraction time'}`;
    item.title = tooltipText;
    
    // Create icon
    const iconDiv = document.createElement('div');
    iconDiv.className = 'page-icon';
    
    if (page.icon) {
      const iconImg = document.createElement('img');
      iconImg.src = page.icon;
      iconImg.alt = 'Page icon';
      iconImg.onerror = () => {
        // Fallback to default icon if image fails to load
        iconImg.style.display = 'none';
        const fallbackIcon = document.createElement('i');
        fallbackIcon.className = 'material-icons';
        fallbackIcon.textContent = 'web';
        iconDiv.appendChild(fallbackIcon);
      };
      iconDiv.appendChild(iconImg);
    } else {
      const fallbackIcon = document.createElement('i');
      fallbackIcon.className = 'material-icons';
      fallbackIcon.textContent = 'web';
      iconDiv.appendChild(fallbackIcon);
    }
    
    // Create open button
    const openBtn = document.createElement('button');
    openBtn.className = 'page-open-btn';
    openBtn.title = 'Open in new tab';
    openBtn.innerHTML = '<i class="material-icons">open_in_new</i>';
    
    // Create page info - simplified to show only title in one line
    const infoDiv = document.createElement('div');
    infoDiv.className = 'page-info single-line';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'page-title';
    titleDiv.textContent = page.title || this.getUrlDisplay(page.url);
    
    infoDiv.appendChild(titleDiv);
    
    // Create delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'page-delete-btn';
    deleteBtn.title = 'Delete this conversation';
    deleteBtn.innerHTML = '<i class="material-icons">delete</i>';
    
    // Add event listeners
    item.addEventListener('click', (e) => {
      // Don't trigger page select if buttons were clicked
      if (e.target.closest('.page-delete-btn') || e.target.closest('.page-open-btn')) {
        return;
      }
      this.selectPage(page.url);
    });
    
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openPageInNewTab(page.url);
    });
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deletePage(page.url);
    });
    
    // Assemble the item
    item.appendChild(iconDiv);
    item.appendChild(openBtn);
    item.appendChild(infoDiv);
    item.appendChild(deleteBtn);
    
    return item;
  }

  /**
   * Get display text for URL (show hostname or full URL if no title)
   * @param {string} url - Full URL
   * @returns {string} Display text
   */
  getUrlDisplay(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch (error) {
      return url;
    }
  }

  /**
   * Format timestamp for display
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Select a page
   * @param {string} url - Page URL
   */
  selectPage(url) {
    logger.info('Selecting page:', url);
    
    // Update selected state
    this.selectedPageUrl = url;
    
    // Update UI selection
    this.container.querySelectorAll('.page-list-item').forEach(item => {
      if (item.dataset.url === url) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
    
    // Call callback
    if (this.callbacks && this.callbacks.onPageSelect) {
      this.callbacks.onPageSelect(url);
    }
  }

  /**
   * Delete a page
   * @param {string} url - Page URL
   */
  async deletePage(url) {
    logger.info('Requesting to delete page:', url);
    const page = this.pages.find(p => p.url === url);
    const pageTitle = page ? (page.title || page.url) : url;

    const confirmed = await this.confirmationDialog.show({
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete the conversation for this page?`,
      details: `<strong>Title:</strong> ${pageTitle}<br>This will permanently remove all associated data, including chat history and extracted content.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      logger.info('Deletion confirmed for page:', url);
      try {
        if (this.callbacks && this.callbacks.onPageDelete) {
          const result = await this.callbacks.onPageDelete(url);
          if (result) {
            this.pages = this.pages.filter(p => p.url !== url);
            this.filteredPages = this.filteredPages.filter(p => p.url !== url);
            this.renderPageList();
            logger.info('Page deleted successfully from list:', url);
          } else {
            throw new Error('Deletion callback returned false');
          }
        }
      } catch (error) {
        logger.error('Error during page deletion process:', error);
        // Optionally, show an error to the user
      }
    } else {
      logger.info('Deletion cancelled for page:', url);
    }
  }

  /**
   * Filter pages based on search query
   * @param {string} query - Search query
   */
  filterPages(query) {
    if (!query || query.trim() === '') {
      this.filteredPages = [...this.pages];
    } else {
      const lowerQuery = query.toLowerCase().trim();
      this.filteredPages = this.pages.filter(page => {
        const title = (page.title || '').toLowerCase();
        const url = page.url.toLowerCase();
        return title.includes(lowerQuery) || url.includes(lowerQuery);
      });
    }
    
    this.renderPageList();
    logger.info(`Filtered to ${this.filteredPages.length} pages with query: "${query}"`);
  }

  /**
   * Show empty state
   */
  showEmptyState() {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'page-list-empty';
    emptyDiv.innerHTML = `
      <div class="empty-message">
        <i class="material-icons">chat_bubble_outline</i>
        <p>No conversations found</p>
        <p class="empty-subtitle">Browse pages and chat to see conversations here</p>
      </div>
    `;
    this.container.appendChild(emptyDiv);
  }

  /**
   * Show error state
   * @param {string} errorMessage - Error message
   */
  showError(errorMessage) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'page-list-error';
    errorDiv.innerHTML = `
      <div class="error-message">
        <i class="material-icons">error</i>
        <p>${errorMessage}</p>
      </div>
    `;
    this.container.appendChild(errorDiv);
  }

  /**
   * Refresh the page list
   */
  async refresh() {
    logger.info('Refreshing page list');
    await this.loadPages();
    this.renderPageList();
  }

  /**
   * Get currently selected page URL
   * @returns {string|null} Selected page URL
   */
  getSelectedPageUrl() {
    return this.selectedPageUrl;
  }

  /**
   * Open a page URL in a new browser tab
   * @param {string} url - Page URL to open
   */
  openPageInNewTab(url) {
    logger.info('Opening page in new tab:', url);
    window.open(url, '_blank');
  }
} 