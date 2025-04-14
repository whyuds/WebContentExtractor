/**
 * WebContentExtractor - Content Script
 * Implements content parsing algorithm, DOM operations, and user interaction logic
 */

// Global variables
let isSelectionMode = false;
let selectedElement = null;
let highlightOverlay = null;
let toast = null;

/**
 * Main content extraction algorithm
 * Uses text density analysis and HTML structure evaluation to identify main content
 */
function extractMainContent() {
  // Check if there's a custom rule for this domain
  const domain = window.location.hostname;
  chrome.runtime.sendMessage({ action: 'getRules', domain }, (response) => {
    if (response && response.rules && response.rules.length > 0) {
      // Find default rule if exists
      const defaultRule = response.rules.find(rule => rule.isDefault);
      
      if (defaultRule) {
        // Use the default rule to extract content
        const element = document.evaluate(defaultRule.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (element) {
          highlightElement(element);
          copyToClipboard(element.innerText);
          showToast('Content extracted using saved rule');
          return;
        }
      }
    }
    
    // No valid rule found, use automatic extraction algorithm
    const mainContent = findMainContentBlock();
    if (mainContent) {
      highlightElement(mainContent);
      copyToClipboard(mainContent.innerText);
      showToast('Content extracted and copied to clipboard');
    } else {
      showToast('Could not identify main content. Try manual selection.', 'error');
    }
  });
}

/**
 * Algorithm to find the main content block based on various heuristics
 * @returns {HTMLElement} The identified main content element
 */
function findMainContentBlock() {
  // 1. Try common content containers first
  const commonSelectors = [
    'article', 
    'main', 
    '.content', 
    '.post', 
    '.article', 
    '.post-content',
    '#content',
    '[role="main"]'
  ];
  
  for (const selector of commonSelectors) {
    const element = document.querySelector(selector);
    if (element && isLikelyMainContent(element)) {
      return element;
    }
  }
  
  // 2. Text density analysis
  return findElementWithHighestTextDensity();
}

/**
 * Checks if an element is likely to be main content based on various factors
 * @param {HTMLElement} element - The element to check
 * @returns {boolean} Whether the element is likely main content
 */
function isLikelyMainContent(element) {
  // Skip small elements
  if (element.offsetHeight < 200 || element.offsetWidth < 200) {
    return false;
  }
  
  // Skip elements with too little text
  const text = element.innerText;
  if (text.length < 500) {
    return false;
  }
  
  // Check text-to-HTML ratio (text density)
  const textDensity = text.length / element.innerHTML.length;
  if (textDensity < 0.25) {
    return false;
  }
  
  // Check position (main content is usually in the middle)
  const rect = element.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  const elementCenter = rect.left + rect.width / 2;
  const distanceFromCenter = Math.abs(elementCenter - windowWidth / 2);
  
  if (distanceFromCenter > windowWidth / 3) {
    return false;
  }
  
  return true;
}

/**
 * Finds the element with the highest text density
 * @returns {HTMLElement} The element with highest text density
 */
function findElementWithHighestTextDensity() {
  const elements = document.querySelectorAll('div, section, article');
  let bestElement = null;
  let highestScore = 0;
  
  elements.forEach(element => {
    // Skip tiny elements and those with no text
    if (element.offsetHeight < 100 || element.innerText.trim().length < 200) {
      return;
    }
    
    const text = element.innerText;
    const html = element.innerHTML;
    
    // Calculate text density score
    const textDensity = text.length / html.length;
    
    // Calculate paragraph density
    const paragraphs = element.querySelectorAll('p').length;
    const paragraphDensity = paragraphs / (element.querySelectorAll('*').length || 1);
    
    // Calculate position score (prefer elements in the middle)
    const rect = element.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const elementCenter = rect.left + rect.width / 2;
    const distanceFromCenter = Math.abs(elementCenter - windowWidth / 2);
    const positionScore = 1 - (distanceFromCenter / (windowWidth / 2));
    
    // Combined score
    const score = (textDensity * 0.4) + (paragraphDensity * 0.3) + (positionScore * 0.3);
    
    if (score > highestScore) {
      highestScore = score;
      bestElement = element;
    }
  });
  
  return bestElement;
}

/**
 * Enables manual selection mode
 */
function enableSelectionMode() {
  isSelectionMode = true;
  document.body.style.cursor = 'pointer';
  showToast('Click on the content block you want to extract', 'info', 5000);
  
  // Add event listeners for hovering and clicking
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('click', handleClick);
  
  // Add escape key listener to cancel selection mode
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Disables manual selection mode
 */
function disableSelectionMode() {
  isSelectionMode = false;
  document.body.style.cursor = 'default';
  
  // Remove event listeners
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  document.removeEventListener('click', handleClick);
  document.removeEventListener('keydown', handleKeyDown);
  
  // Remove any temporary highlights
  const tempHighlight = document.querySelector('.wce-temp-highlight');
  if (tempHighlight) {
    tempHighlight.remove();
  }
}

/**
 * Handles mouse over event during selection mode
 * @param {MouseEvent} event - The mouse event
 */
function handleMouseOver(event) {
  if (!isSelectionMode) return;
  
  // Prevent default behavior
  event.preventDefault();
  event.stopPropagation();
  
  // Add temporary highlight to the hovered element
  const element = event.target;
  
  // Skip body and html elements
  if (element === document.body || element === document.documentElement) {
    return;
  }
  
  // Create temporary highlight
  const tempHighlight = document.createElement('div');
  tempHighlight.className = 'wce-temp-highlight';
  
  const rect = element.getBoundingClientRect();
  tempHighlight.style.position = 'absolute';
  tempHighlight.style.top = `${window.scrollY + rect.top}px`;
  tempHighlight.style.left = `${window.scrollX + rect.left}px`;
  tempHighlight.style.width = `${rect.width}px`;
  tempHighlight.style.height = `${rect.height}px`;
  tempHighlight.style.backgroundColor = 'rgba(255, 165, 0, 0.2)';
  tempHighlight.style.border = '2px dashed orange';
  tempHighlight.style.zIndex = '9999';
  tempHighlight.style.pointerEvents = 'none';
  
  // Remove any existing temporary highlight
  const existingTempHighlight = document.querySelector('.wce-temp-highlight');
  if (existingTempHighlight) {
    existingTempHighlight.remove();
  }
  
  document.body.appendChild(tempHighlight);
}

/**
 * Handles mouse out event during selection mode
 * @param {MouseEvent} event - The mouse event
 */
function handleMouseOut(event) {
  if (!isSelectionMode) return;
  
  // Remove temporary highlight
  const tempHighlight = document.querySelector('.wce-temp-highlight');
  if (tempHighlight) {
    tempHighlight.remove();
  }
}

/**
 * Handles click event during selection mode
 * @param {MouseEvent} event - The mouse event
 */
function handleClick(event) {
  if (!isSelectionMode) return;
  
  // Prevent default behavior
  event.preventDefault();
  event.stopPropagation();
  
  // Get the clicked element
  selectedElement = event.target;
  
  // Skip body and html elements
  if (selectedElement === document.body || selectedElement === document.documentElement) {
    return;
  }
  
  // Highlight the selected element
  highlightElement(selectedElement);
  
  // Generate XPath for the selected element
  const xpath = generateXPath(selectedElement);
  
  // Prompt user for rule name
  const ruleName = prompt('Enter a name for this rule:', 'Custom Rule');
  
  if (ruleName) {
    // Save the rule
    const domain = window.location.hostname;
    const rule = {
      name: ruleName,
      xpath: xpath,
      isDefault: true,
      createdAt: new Date().toISOString()
    };
    
    chrome.runtime.sendMessage({
      action: 'saveRule',
      domain: domain,
      rule: rule
    }, (response) => {
      if (response && response.status === 'success') {
        showToast('Rule saved successfully');
        copyToClipboard(selectedElement.innerText);
      } else {
        showToast('Failed to save rule', 'error');
      }
    });
  }
  
  // Disable selection mode
  disableSelectionMode();
}

/**
 * Handles key down event during selection mode
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleKeyDown(event) {
  if (!isSelectionMode) return;
  
  // Cancel selection mode on Escape key
  if (event.key === 'Escape') {
    disableSelectionMode();
    showToast('Selection mode cancelled');
  }
}

/**
 * Generates an optimized XPath for an element
 * @param {HTMLElement} element - The element to generate XPath for
 * @returns {string} The generated XPath
 */
function generateXPath(element) {
  // Try to generate a simple XPath using id
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  // Try to generate XPath using class if it's unique enough
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.trim().length > 0);
    
    for (const className of classes) {
      const elements = document.getElementsByClassName(className);
      if (elements.length === 1) {
        return `//*[contains(@class, "${className}")]`;
      }
    }
  }
  
  // Generate relative XPath
  let path = '';
  let current = element;
  
  while (current && current !== document.documentElement) {
    let tag = current.tagName.toLowerCase();
    let siblings = Array.from(current.parentNode.children).filter(child => child.tagName === current.tagName);
    
    if (siblings.length > 1) {
      let index = siblings.indexOf(current) + 1;
      tag += `[${index}]`;
    }
    
    path = `/${tag}${path}`;
    current = current.parentNode;
  }
  
  return `/html${path}`;
}

/**
 * Highlights an element by creating an overlay
 * @param {HTMLElement} element - The element to highlight
 */
function highlightElement(element) {
  // Remove existing highlight if any
  if (highlightOverlay) {
    highlightOverlay.remove();
  }
  
  // Create highlight overlay
  highlightOverlay = document.createElement('div');
  highlightOverlay.className = 'wce-highlight';
  
  const rect = element.getBoundingClientRect();
  highlightOverlay.style.position = 'absolute';
  highlightOverlay.style.top = `${window.scrollY + rect.top}px`;
  highlightOverlay.style.left = `${window.scrollX + rect.left}px`;
  highlightOverlay.style.width = `${rect.width}px`;
  highlightOverlay.style.height = `${rect.height}px`;
  highlightOverlay.style.backgroundColor = 'rgba(66, 133, 244, 0.2)';
  highlightOverlay.style.border = '2px solid #4285f4';
  highlightOverlay.style.zIndex = '9999';
  highlightOverlay.style.pointerEvents = 'none';
  
  document.body.appendChild(highlightOverlay);
  
  // Auto-remove highlight after 3 seconds
  setTimeout(() => {
    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }
  }, 3000);
}

/**
 * Copies text to clipboard
 * @param {string} text - The text to copy
 */
function copyToClipboard(text) {
  // Create a temporary textarea element
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  
  // Select and copy the text
  textarea.select();
  document.execCommand('copy');
  
  // Clean up
  document.body.removeChild(textarea);
}

/**
 * Shows a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast (success, error, info)
 * @param {number} duration - Duration in milliseconds
 */
function showToast(message, type = 'success', duration = 3000) {
  // Remove existing toast if any
  if (toast) {
    toast.remove();
  }
  
  // Create toast element
  toast = document.createElement('div');
  toast.className = 'wce-toast';
  toast.textContent = message;
  
  // Set toast style
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '4px';
  toast.style.color = '#fff';
  toast.style.fontSize = '14px';
  toast.style.zIndex = '10000';
  toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  
  // Set color based on type
  if (type === 'error') {
    toast.style.backgroundColor = '#f44336';
  } else if (type === 'info') {
    toast.style.backgroundColor = '#2196F3';
  } else {
    toast.style.backgroundColor = '#4CAF50';
  }
  
  // Add to document
  document.body.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    if (toast) {
      toast.remove();
      toast = null;
    }
  }, duration);
}

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    extractMainContent();
    sendResponse({ status: 'success' });
  }
  
  if (request.action === 'manualSelection') {
    enableSelectionMode();
    sendResponse({ status: 'success' });
  }
  
  return true;
});