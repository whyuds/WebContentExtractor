/**
 * WebContentExtractor - Popup Script
 * Handles popup UI interactions and communication with background script
 */

// DOM elements
const extractBtn = document.getElementById('extractBtn');
const manualBtn = document.getElementById('manualBtn');
const manageRulesBtn = document.getElementById('manageRulesBtn');
const rulesList = document.getElementById('rulesList');
const noRules = document.getElementById('noRules');

// Current tab information
let currentDomain = '';

/**
 * Initializes the popup
 */
function initPopup() {
  // Get current tab information
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const url = new URL(tabs[0].url);
      currentDomain = url.hostname;
      
      // Load rules for current domain
      loadRules();
    }
  });
  
  // Add event listeners
  extractBtn.addEventListener('click', handleExtractContent);
  manualBtn.addEventListener('click', handleManualSelection);
  manageRulesBtn.addEventListener('click', handleManageRules);
}

/**
 * Loads rules for the current domain
 */
function loadRules() {
  chrome.runtime.sendMessage({ action: 'getRules', domain: currentDomain }, (response) => {
    if (response && response.rules) {
      displayRules(response.rules);
    } else {
      showError('Failed to load rules');
    }
  });
}

/**
 * Displays rules in the popup
 * @param {Array} rules - The rules to display
 */
function displayRules(rules) {
  // Clear loading message
  rulesList.innerHTML = '';
  
  if (rules.length === 0) {
    // Show no rules message
    noRules.classList.remove('hidden');
    rulesList.classList.add('hidden');
    return;
  }
  
  // Hide no rules message
  noRules.classList.add('hidden');
  rulesList.classList.remove('hidden');
  
  // Sort rules (default first, then by creation date)
  rules.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  // Create rule items
  rules.forEach(rule => {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    
    const ruleName = document.createElement('div');
    ruleName.className = 'rule-name';
    ruleName.textContent = rule.name;
    
    if (rule.isDefault) {
      const defaultBadge = document.createElement('span');
      defaultBadge.className = 'default-badge';
      defaultBadge.textContent = 'Default';
      ruleName.appendChild(defaultBadge);
    }
    
    const ruleActions = document.createElement('div');
    ruleActions.className = 'rule-actions';
    
    // Set as default button
    if (!rule.isDefault) {
      const setDefaultBtn = document.createElement('button');
      setDefaultBtn.innerHTML = '⭐';
      setDefaultBtn.title = 'Set as default';
      setDefaultBtn.addEventListener('click', () => setDefaultRule(rule.name));
      ruleActions.appendChild(setDefaultBtn);
    }
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit rule name';
    editBtn.addEventListener('click', () => editRuleName(rule.name));
    ruleActions.appendChild(editBtn);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete rule';
    deleteBtn.addEventListener('click', () => deleteRule(rule.name));
    ruleActions.appendChild(deleteBtn);
    
    ruleItem.appendChild(ruleName);
    ruleItem.appendChild(ruleActions);
    rulesList.appendChild(ruleItem);
  });
}

/**
 * Sets a rule as the default rule
 * @param {string} ruleName - The name of the rule to set as default
 */
function setDefaultRule(ruleName) {
  chrome.storage.local.get(['domains'], (result) => {
    const domains = result.domains || {};
    
    if (domains[currentDomain] && domains[currentDomain].rules) {
      // Find the rule to set as default
      const ruleIndex = domains[currentDomain].rules.findIndex(r => r.name === ruleName);
      
      if (ruleIndex >= 0) {
        // Unset current default
        domains[currentDomain].rules.forEach((r, i) => {
          domains[currentDomain].rules[i].isDefault = false;
        });
        
        // Set new default
        domains[currentDomain].rules[ruleIndex].isDefault = true;
        
        // Save updated rules
        chrome.storage.local.set({ domains }, () => {
          // Reload rules
          loadRules();
        });
      }
    }
  });
}

/**
 * Edits a rule name
 * @param {string} ruleName - The current name of the rule
 */
function editRuleName(ruleName) {
  const newName = prompt('Enter new name for the rule:', ruleName);
  
  if (newName && newName !== ruleName) {
    chrome.storage.local.get(['domains'], (result) => {
      const domains = result.domains || {};
      
      if (domains[currentDomain] && domains[currentDomain].rules) {
        // Find the rule to edit
        const ruleIndex = domains[currentDomain].rules.findIndex(r => r.name === ruleName);
        
        if (ruleIndex >= 0) {
          // Update rule name
          domains[currentDomain].rules[ruleIndex].name = newName;
          
          // Save updated rules
          chrome.storage.local.set({ domains }, () => {
            // Reload rules
            loadRules();
          });
        }
      }
    });
  }
}

/**
 * Deletes a rule
 * @param {string} ruleName - The name of the rule to delete
 */
function deleteRule(ruleName) {
  if (confirm(`Are you sure you want to delete the rule "${ruleName}"?`)) {
    chrome.runtime.sendMessage({
      action: 'deleteRule',
      domain: currentDomain,
      ruleName: ruleName
    }, (response) => {
      if (response && response.status === 'success') {
        // Reload rules
        loadRules();
      } else {
        showError('Failed to delete rule');
      }
    });
  }
}

/**
 * Handles extract content button click
 */
function handleExtractContent() {
  chrome.runtime.sendMessage({ action: 'extractContent' }, (response) => {
    // Close popup
    window.close();
  });
}

/**
 * Handles manual selection button click
 */
function handleManualSelection() {
  chrome.runtime.sendMessage({ action: 'manualSelection' }, (response) => {
    // Close popup
    window.close();
  });
}

/**
 * Handles manage rules button click
 */
function handleManageRules() {
  // Open options page
  chrome.runtime.openOptionsPage();
}

/**
 * Shows an error message
 * @param {string} message - The error message to display
 */
function showError(message) {
  // Remove existing error
  const existingError = document.querySelector('.error');
  if (existingError) {
    existingError.remove();
  }
  
  // Create error element
  const error = document.createElement('div');
  error.className = 'error';
  error.textContent = message;
  
  // Add to container
  document.querySelector('.container').appendChild(error);
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', initPopup);