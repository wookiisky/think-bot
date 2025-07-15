/**
 * Page List Manager Module
 * Manages the left column page list functionality
 */

import '../../js/modules/logger.js';
import { i18n } from '../../js/modules/i18n.js';

// Create module logger
const moduleLogger = logger.createModuleLogger('PageListManager');

/**
 * Page List Manager for Conversations
 */
export class PageListManager {
  constructor(confirmationDialog) {
    this.confirmationDialog = confirmationDialog;
    this.container = null;
    this.searchInput = null;
    this.pages = [];
    this.filteredPages = [];
    this.callbacks = null;
    this.selectedPageUrl = null;
  }

  /**
   * Initialize the page list manager
   * @param {HTMLElement} container - Container element for the page list
   * @param {HTMLElement} searchInput - Search input element
   * @param {Object} callbacks - Callback functions {onPageSelect, onPageDelete}
   */
  async init(container, searchInput, callbacks) {
    this.container = container;
    this.searchInput = searchInput;
    this.callbacks = callbacks;
    
    // Add search input listener
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filterPages(e.target.value);
      });
    }
    
    // Initial load
    await this.loadPages();
  }

  /**
   * Load pages from storage
   */
  async loadPages() {
    try {
      moduleLogger.info('Loading page list from storage');
      
      // Method 1: Try to get metadata using GET_ALL_PAGE_METADATA message (preferred)
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_ALL_PAGE_METADATA'
        });
        
        if (response && response.type === 'ALL_PAGE_METADATA_LOADED' && Array.isArray(response.pages)) {
          moduleLogger.info(`Loaded ${response.pages.length} pages from GET_ALL_PAGE_METADATA`);
          
          // Convert array to page objects
          this.pages = response.pages.map(page => ({
            url: page.url,
            title: page.title || '',
            icon: page.icon || '',
            timestamp: page.timestamp || 0,
            lastUpdated: page.lastUpdated || 0
          }));
          
          // Sort by last update
          this.pages.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
          this.filteredPages = [...this.pages];
          
          // Render the page list
          this.renderPageList();
          return;
        } else {
          moduleLogger.warn('GET_ALL_PAGE_METADATA returned invalid response:', response);
        }
      } catch (messageError) {
        moduleLogger.warn('Error getting metadata via GET_ALL_PAGE_METADATA:', messageError);
      }
      
      // Method 2: Fallback to direct pageMetadata access (legacy)
      moduleLogger.info('Falling back to legacy pageMetadata access');
      const result = await chrome.storage.local.get(['pageMetadata']);
      const pageMetadata = result.pageMetadata || {};
      
      // Convert to array and sort by last update
      this.pages = Object.entries(pageMetadata)
        .map(([url, data]) => ({
          url,
          ...data
        }))
        .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
      
      this.filteredPages = [...this.pages];
      
      // Render the page list
      this.renderPageList();
      
      moduleLogger.info(`Loaded ${this.pages.length} pages from legacy pageMetadata`);
    } catch (error) {
      moduleLogger.error('Failed to load pages:', error);
      this.showError(i18n.getMessage('page_list_manager_failed_to_load'));
    }
  }

  /**
   * Render the page list
   */
  renderPageList() {
    if (!this.container) return;
    
    this.container.innerHTML = '';
    
    if (this.filteredPages.length === 0) {
      this.showEmptyState();
      return;
    }
    
    // Create page list items
    this.filteredPages.forEach(page => {
      const item = this.createPageListItem(page);
      this.container.appendChild(item);
    });
  }

  /**
   * Create a page list item
   * @param {Object} page - Page object
   * @returns {HTMLElement} Page list item element
   */
  createPageListItem(page) {
    const item = document.createElement('div');
    item.className = 'page-list-item';
    item.dataset.url = page.url;
    
    // Create tooltip with title, URL and timestamp (three lines)
    const timestampText = page.timestamp
      ? i18n.getMessage('page_list_manager_tooltip_extracted', { time: new Date(page.timestamp).toLocaleString() })
      : i18n.getMessage('page_list_manager_tooltip_no_extraction_time');
    const tooltipText = `${page.title || this.getUrlDisplay(page.url)}\n${page.url}\n${timestampText}`;
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
    openBtn.title = i18n.getMessage('page_list_manager_open_in_new_tab_title');
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
    deleteBtn.title = i18n.getMessage('page_list_manager_delete_conversation_title');
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
      return i18n.getMessage('global_time_just_now');
    } else if (diffMins < 60) {
      return i18n.getMessage('global_time_minutes_ago', { minutes: diffMins });
    } else if (diffHours < 24) {
      return i18n.getMessage('global_time_hours_ago', { hours: diffHours });
    } else if (diffDays < 7) {
      return i18n.getMessage('global_time_days_ago', { days: diffDays });
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Check if a page exists in the page list
   * @param {string} url - Page URL
   * @returns {boolean} - Whether the page exists
   */
  hasPage(url) {
    return this.pages.some(page => page.url === url);
  }

  /**
   * Select a page
   * @param {string} url - Page URL
   */
  selectPage(url) {
    moduleLogger.info('Selecting page:', url);
    
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
    moduleLogger.info('Requesting to delete page:', url);
    const page = this.pages.find(p => p.url === url);
    const pageTitle = page ? (page.title || page.url) : url;
    
    // Find the delete button element for this URL
    const pageListItem = this.container.querySelector(`.page-list-item[data-url="${url}"]`);
    const deleteBtn = pageListItem ? pageListItem.querySelector('.page-delete-btn') : null;
    
    if (!deleteBtn) {
      moduleLogger.warn('Delete button not found for URL:', url);
      return;
    }

    // Check if confirmation is already visible
    if (this.confirmationDialog.isDialogVisible()) {
      moduleLogger.info('Confirmation dialog is already visible, ignoring delete request');
      return;
    }

    // Use mini confirmation instead of the full dialog
    const confirmed = await new Promise(resolve => {
      this.confirmationDialog.show({
        target: deleteBtn,
        message: i18n.getMessage('page_list_manager_confirm_delete_message'),
        confirmText: i18n.getMessage('common_delete'),
        cancelText: i18n.getMessage('common_cancel'),
        type: 'danger',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });

    if (confirmed) {
      moduleLogger.info('Deletion confirmed for page:', url);
      try {
        if (this.callbacks && this.callbacks.onPageDelete) {
          const result = await this.callbacks.onPageDelete(url);
          if (result) {
            this.pages = this.pages.filter(p => p.url !== url);
            this.filteredPages = this.filteredPages.filter(p => p.url !== url);
            this.renderPageList();
            moduleLogger.info('Page deleted successfully from list:', url);
          } else {
            throw new Error('Deletion callback returned false');
          }
        }
      } catch (error) {
        moduleLogger.error('Error during page deletion process:', error);
        // Optionally, show an error to the user
      }
    } else {
      moduleLogger.info('Deletion cancelled for page:', url);
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
    moduleLogger.info(`Filtered to ${this.filteredPages.length} pages with query: "${query}"`);
  }

  /**
   * Show empty state
   */
  showEmptyState() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="empty-state">
        <p>${i18n.getMessage('page_list_manager_empty_list_title')}</p>
        <p class="empty-subtitle">${i18n.getMessage('page_list_manager_empty_list_subtitle')}</p>
      </div>
    `;
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
    moduleLogger.info('Refreshing page list');
    await this.loadPages();
    
    // If there was a selected page, try to re-select it
    if (this.selectedPageUrl) {
      // Check if the page still exists
      if (this.hasPage(this.selectedPageUrl)) {
        this.selectPage(this.selectedPageUrl);
      } else {
        // Clear selection if page no longer exists
        this.selectedPageUrl = null;
      }
    }
  }

  /**
   * Update the title of a page in the page list
   * @param {string} url - Page URL
   * @param {string} newTitle - New title for the page
   */
  async updatePageTitle(url, newTitle) {
    moduleLogger.info('Updating page title:', url, 'to:', newTitle);
    
    // Find and update the page in the pages array
    const pageIndex = this.pages.findIndex(page => page.url === url);
    if (pageIndex !== -1) {
      this.pages[pageIndex].title = newTitle;
      this.pages[pageIndex].lastUpdated = Date.now();
      
      // Update the filtered pages array as well
      const filteredIndex = this.filteredPages.findIndex(page => page.url === url);
      if (filteredIndex !== -1) {
        this.filteredPages[filteredIndex].title = newTitle;
        this.filteredPages[filteredIndex].lastUpdated = Date.now();
      }
      
      // Re-render the page list to show the updated title
      this.renderPageList();
      
      // Re-select the page if it was previously selected
      if (this.selectedPageUrl === url) {
        this.selectPage(url);
      }
      
      moduleLogger.info('Page title updated successfully in page list');
    } else {
      moduleLogger.warn('Page not found in page list for title update:', url);
    }
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
    moduleLogger.info('Opening page in new tab:', url);
    window.open(url, '_blank');
  }
} 