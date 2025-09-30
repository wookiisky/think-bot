import { i18n } from '../../js/modules/i18n.js';
import { messagePreviewOverlay } from '../components/message-preview-overlay.js';
import { createLogger } from './utils.js';

const logger = createLogger('BranchPreview');

/**
 * Create branch header container with model label
 * @param {string} modelName - Model name to display
 * @returns {{ header: HTMLElement, label: HTMLElement }}
 */
const createBranchHeader = (modelName = 'unknown') => {
  const header = document.createElement('div');
  header.className = 'branch-header';

  const label = document.createElement('div');
  label.className = 'branch-model-label';
  label.textContent = modelName || 'unknown';

  header.appendChild(label);
  return { header, label };
};

/**
 * Open preview overlay for the specified branch element
 * @param {HTMLElement} branchElement - Branch element containing message content
 */
const openBranchPreview = (branchElement) => {
  if (!branchElement) {
    logger.warn('openBranchPreview called without branchElement');
    return;
  }

  try {
    const contentDiv = branchElement.querySelector('.message-content');
    const raw = contentDiv?.getAttribute('data-raw-content') || contentDiv?.textContent || '';
    let html = '';

    if (raw && window.marked && typeof window.marked.parse === 'function') {
      try {
        html = window.marked.parse(raw);
      } catch (error) {
        logger.warn('Failed to parse markdown for preview, falling back to plain text', error);
        html = raw.replace(/\n/g, '<br>');
      }
    } else {
      html = contentDiv?.innerHTML || '';
    }

    const modelName = branchElement.getAttribute('data-model') || 'assistant';
    messagePreviewOverlay.show({ html, title: modelName });
    logger.info('Message preview overlay opened from branch trigger', branchElement.getAttribute('data-branch-id'));
  } catch (error) {
    logger.error('Failed to open branch preview overlay:', error);
  }
};

/**
 * Ensure a preview trigger icon exists in the branch header
 * @param {HTMLElement} branchElement - Branch element to attach preview trigger to
 * @param {Function} [onClick] - Optional click handler
 * @returns {HTMLElement|null} - The preview trigger element if created/found
 */
const ensureBranchPreviewTrigger = (branchElement, onClick) => {
  if (!branchElement) {
    return null;
  }

  const header = branchElement.querySelector('.branch-header');
  if (!header) {
    return null;
  }

  let trigger = header.querySelector('.branch-preview-trigger');
  if (!trigger) {
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'branch-preview-trigger';
    trigger.innerHTML = '<i class="material-icons">visibility</i>';
    trigger.title = i18n.getMessage('sidebar_chatManager_title_preview') || 'Preview';
    trigger.setAttribute('aria-label', trigger.title);
    header.insertBefore(trigger, header.firstChild);
  }

  const clickHandler = typeof onClick === 'function'
    ? onClick
    : () => openBranchPreview(branchElement);

  trigger.onclick = clickHandler;

  return trigger;
};

export {
  createBranchHeader,
  openBranchPreview,
  ensureBranchPreviewTrigger
};
