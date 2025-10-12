// js/modules/i18n.js
// Enhanced i18n module with dynamic language switching support

const i18n = {
  // Current language
  currentLanguage: 'en',
  
  // Loaded translations cache
  translations: {},
  
  // Available languages
  availableLanguages: ['en', 'zh_CN'],
  
  // Fallback language when translation is not found
  fallbackLanguage: 'en',

  /**
   * Initialize i18n system
   */
  async init() {
    try {
      // Load user's preferred language from storage
      // Check both locations for backward compatibility
      const localResult = await chrome.storage.local.get(['ThinkBotConfig', 'language']);
      
      let language = 'en';
      
      // First try to get from main config (local storage)
      if (localResult.ThinkBotConfig?.basic?.language) {
        language = localResult.ThinkBotConfig.basic.language;
      }
      // Then try language key as fallback
      else if (localResult.language) {
        language = localResult.language;
      }
      
      this.currentLanguage = language;
      
      // Load translations for current language
      await this.loadTranslations(this.currentLanguage);
      
      // Apply translations to DOM
      this.applyToDOM();
      
      console.log(`i18n initialized with language: ${this.currentLanguage}`);
    } catch (error) {
      console.error('Failed to initialize i18n:', error);
      // Fallback to default language
      this.currentLanguage = 'en';
      await this.loadTranslations(this.currentLanguage);
      this.applyToDOM();
    }
  },

  /**
   * Load translations for a specific language
   * @param {string} language - Language code (e.g., 'en', 'zh_CN')
   */
  async loadTranslations(language) {
    try {
      // Check if translations are already loaded
      if (this.translations[language]) {
        return;
      }

      // Try to load from Chrome i18n API first (for current browser locale)
      const browserLanguage = chrome.i18n.getUILanguage().replace('-', '_');
      
      // Load translations from _locales directory
      const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
      if (!response.ok) {
        throw new Error(`Failed to load translations for ${language}: ${response.statusText}`);
      }
      
      const messages = await response.json();
      
      // Convert Chrome i18n format to simple key-value pairs
      const translations = {};
      for (const [key, value] of Object.entries(messages)) {
        translations[key] = value.message;
      }
      
      this.translations[language] = translations;
      console.log(`Loaded translations for language: ${language}`);
    } catch (error) {
      console.error(`Failed to load translations for ${language}:`, error);
      
      // If failed to load custom translations, try Chrome i18n API as fallback
      if (language === this.fallbackLanguage) {
        console.log('Using Chrome i18n API as fallback');
        // Chrome i18n API will be used in getMessage method
      } else {
        // Load fallback language
        await this.loadTranslations(this.fallbackLanguage);
      }
    }
  },

  /**
   * Get translated message
   * @param {string} key - Translation key
   * @param {string|string[]|object} [substitutions] - Optional placeholder values
   * @returns {string} The translated string
   */
  getMessage(key, substitutions = []) {
    try {
      // First try to get from custom translations
      let message = this.translations[this.currentLanguage]?.[key];
      let isFromCustomTranslations = !!message;
      
      // If not found in current language, try fallback language
      if (!message && this.currentLanguage !== this.fallbackLanguage) {
        message = this.translations[this.fallbackLanguage]?.[key];
        isFromCustomTranslations = !!message;
      }
      
      // If still not found, try Chrome i18n API
      if (!message) {
        message = chrome.i18n.getMessage(key, substitutions);
        isFromCustomTranslations = false;
      }
      
      // If still not found, return the key as fallback
      if (!message) {
        console.warn(`Translation not found for key: ${key}`);
        return key;
      }
      
      // Handle substitutions for custom translations only
      // Chrome i18n API handles substitutions automatically
      if (isFromCustomTranslations && substitutions) {
        if (Array.isArray(substitutions)) {
          // Array format: ['value1', 'value2', ...]
          substitutions.forEach((sub, index) => {
            // Handle Chrome i18n API format {0}, {1}, etc.
            message = message.replace(`{${index}}`, sub);
            // Also handle custom format $1, $2, etc. for backward compatibility
            message = message.replace(`$${index + 1}`, sub);
          });
        } else if (typeof substitutions === 'object') {
          // Object format: {key: 'value', key2: 'value2', ...}
          // First handle named placeholders like {time}, {minutes}, etc.
          for (const [key, value] of Object.entries(substitutions)) {
            // Replace named placeholders in curly braces
            message = message.replace(`{${key}}`, value);
            // Also handle uppercase format like $MINUTES$, $HOURS$, etc.
            const upperKey = key.toUpperCase();
            message = message.replace(`$${upperKey}$`, value);
          }
          
          // Then handle positional placeholders for backward compatibility
          const keys = Object.keys(substitutions);
          if (keys.length > 0) {
            // For backward compatibility, if there's only one key, use it as $1
            if (keys.length === 1) {
              message = message.replace('$1', substitutions[keys[0]]);
            } else {
              // For multiple keys, replace based on key names or index
              keys.forEach((key, index) => {
                message = message.replace(`$${index + 1}`, substitutions[key]);
              });
            }
          }
        } else {
          // String format: 'value'
          message = message.replace('$1', substitutions);
          // Also handle Chrome i18n API format {0} for single substitution
          message = message.replace('{0}', substitutions);
        }
      }
      
      return message;
    } catch (error) {
      console.error(`Error getting message for key: ${key}`, error);
      return key;
    }
  },

     /**
    * Change language and reload translations
    * @param {string} language - New language code
    */
   async changeLanguage(language) {
     try {
       if (!this.availableLanguages.includes(language)) {
         throw new Error(`Language ${language} is not available`);
       }
       
       console.log(`Changing language from ${this.currentLanguage} to ${language}`);
       
       // Save language preference to both local storage and main config
       await chrome.storage.local.set({ language: language });
       
       // Also update the main config to keep it in sync
       try {
         const localResult = await chrome.storage.local.get(['ThinkBotConfig']);
         if (localResult.ThinkBotConfig) {
           const config = localResult.ThinkBotConfig;
           if (config.basic) {
             config.basic.language = language;
           } else {
             config.basic = { language: language };
           }
           await chrome.storage.local.set({ ThinkBotConfig: config });
         }
       } catch (localError) {
         console.warn('Failed to update main config language, but language preference updated:', localError);
       }
       
       // Update current language
       this.currentLanguage = language;
       
       // Load translations for new language
       await this.loadTranslations(language);
       
       // Re-apply translations to DOM
       this.applyToDOM();
       
       console.log(`Language changed to: ${language}`);
       
       // Dispatch custom event for other components to react
       window.dispatchEvent(new CustomEvent('languageChanged', { 
         detail: { language: language } 
       }));
       
     } catch (error) {
       console.error('Failed to change language:', error);
       throw error;
     }
   },

  /**
   * Apply translations to the DOM
   * Scans for elements with data-i18n attributes and sets their content
   */
  applyToDOM() {
    try {
      // Handle text content
      document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (key) {
          elem.textContent = this.getMessage(key);
        }
      });

      // Handle title attributes
      document.querySelectorAll('[data-i18n-title]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-title');
        if (key) {
          elem.title = this.getMessage(key);
        }
      });

      // Handle placeholder attributes
      document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-placeholder');
        if (key) {
          elem.placeholder = this.getMessage(key);
        }
      });

      // Handle HTML content (for elements that contain HTML)
      document.querySelectorAll('[data-i18n-html]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-html');
        if (key) {
          elem.innerHTML = this.getMessage(key);
        }
      });

      // Handle option elements in select dropdowns
      document.querySelectorAll('option[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (key) {
          elem.textContent = this.getMessage(key);
        }
      });      
      
    } catch (error) {
      console.error('Error applying translations to DOM:', error);
    }
  },

  /**
   * Get current language
   * @returns {string} Current language code
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  },

  /**
   * Get available languages
   * @returns {string[]} Array of available language codes
   */
  getAvailableLanguages() {
    return this.availableLanguages;
  }
};

// Make i18n globally available
window.i18n = i18n;

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  await i18n.init();
});

// Export for use in other modules
export { i18n };