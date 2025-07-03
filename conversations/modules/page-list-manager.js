/**
 * Page List Manager Module
 * Manages the left column page list functionality
 */

import { logger } from '../../js/modules/logger.js';
import { i18n } from '../../js/modules/i18n.js';

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
    } catch (error) {
      logger.error('Failed to load pages:', error);
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
      title: i18n.getMessage('global_confirm_deletion_title'),
      message: i18n.getMessage('page_list_manager_confirm_delete_message'),
      details: i18n.getMessage('page_list_manager_confirm_delete_details', { title: pageTitle }),
      confirmText: i18n.getMessage('global_delete_button'),
      cancelText: i18n.getMessage('global_cancel_button')
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