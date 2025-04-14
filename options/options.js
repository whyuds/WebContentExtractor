/**
 * WebContentExtractor - Options Page Script
 * Handles options UI interactions and rule management
 */

// DOM elements
const domainSelect = document.getElementById('domainSelect');
const currentDomainSpan = document.getElementById('currentDomain');
const rulesList = document.getElementById('rulesList');
const noRules = document.getElementById('noRules');
const exportRulesBtn = document.getElementById('exportRulesBtn');
const importRulesBtn = document.getElementById('importRulesBtn');
const autoExtractToggle = document.getElementById('autoExtractToggle');
const importDialog = document.getElementById('importDialog');
const importText = document.getElementById('importText');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');

// Current domain
let currentDomain = '';

/**
 * Initializes the options page
 */
function initOptions() {
  // Load domains
  loadDomains();
  
  // Load global settings
  loadSettings();
  
  // Add event listeners
  domainSelect.addEventListener('change', handleDomainChange);
  exportRulesBtn.addEventListener('click', handleExportRules);
  importRulesBtn.addEventListener('click', handleImportRules);
  autoExtractToggle.addEventListener('change', handleAutoExtractToggle);
  confirmImportBtn.addEventListener('click', handleConfirmImport);
  cancelImportBtn.addEventListener('click', handleCancelImport);
}

/**
 * Loads all domains with saved rules
 */
function loadDomains() {
  chrome.storage.local.get(['domains'], (result) => {
    const domains = result.domains || {};
    const domainNames = Object.keys(domains);
    
    // Clear select options
    domainSelect.innerHTML = '';
    
    // Add placeholder if no domains
    if (domainNames.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No domains with saved rules';
      domainSelect.appendChild(option);
      return;
    }
    
    // Add empty option
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Select a domain';
    domainSelect.appendChild(emptyOption);
    
    // Add domain options
    domainNames.sort().forEach(domain => {
      const option = document.createElement('option');
      option.value = domain;
      option.textContent = domain;
      domainSelect.appendChild(option);
    });
  });
}

/**
 * Loads global settings
 */
function loadSettings() {
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || {};
    
    // Set auto-extract toggle
    autoExtractToggle.checked = settings.autoExtract || false;
  });
}

/**
 * Loads rules for a specific domain
 * @param {string} domain - The domain to load rules for
 */
function loadRules(domain) {
  if (!domain) {
    // Clear rules list
    rulesList.innerHTML = '<div class="loading">Select a domain to view rules</div>';
    return;
  }
  
  chrome.storage.local.get(['domains'], (result) => {
    const domains = result.domains || {};
    const domainRules = domains[domain] ? domains[domain].rules : [];
    
    displayRules(domainRules);
  });
}

/**
 * Displays rules in the options page
 * @param {Array} rules - The rules to display
 */
function displayRules(rules) {
  // Clear rules list
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
    
    const ruleInfo = document.createElement('div');
    ruleInfo.className = 'rule-info';
    
    const ruleName = document.createElement('div');
    ruleName.className = 'rule-name';
    ruleName.textContent = rule.name;
    
    if (rule.isDefault) {
      const defaultBadge = document.createElement('span');
      defaultBadge.className = 'default-badge';
      defaultBadge.textContent = 'Default';
      ruleName.appendChild(defaultBadge);
    }
    
    const ruleXpath = document.createElement('div');
    ruleXpath.className = 'rule-xpath';
    ruleXpath.textContent = rule.xpath;
    ruleXpath.title = rule.xpath;
    
    const ruleDate = document.createElement('div');
    ruleDate.className = 'rule-date';
    ruleDate.textContent = `Created: ${new Date(rule.createdAt).toLocaleString()}`;
    
    ruleInfo.appendChild(ruleName);
    ruleInfo.appendChild(ruleXpath);
    ruleInfo.appendChild(ruleDate);
    
    const ruleActions = document.createElement('div');
    ruleActions.className = 'rule-actions';
    
    // Set as default button
    if (!rule.isDefault) {
      const setDefaultBtn = document.createElement('button');
      setDefaultBtn.className = 'btn secondary';
      setDefaultBtn.textContent = 'Set as Default';
      setDefaultBtn.addEventListener('click', () => setDefaultRule(rule.name));
      ruleActions.appendChild(setDefaultBtn);
    }
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn secondary';
    editBtn.textContent = 'Edit Name';
    editBtn.addEventListener('click', () => editRuleName(rule.name));
    ruleActions.appendChild(editBtn);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteRule(rule.name));
    ruleActions.appendChild(deleteBtn);
    
    ruleItem.appendChild(ruleInfo);
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
          loadRules(currentDomain);
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
            loadRules(currentDomain);
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
    chrome.storage.local.get(['domains'], (result) => {
      const domains = result.domains || {};
      
      if (domains[currentDomain] && domains[currentDomain].rules) {
        // Filter out the rule to delete
        domains[currentDomain].rules = domains[currentDomain].rules.filter(r => r.name !== ruleName);
        
        // Save updated rules
        chrome.storage.local.set({ domains }, () => {
          // Reload rules
          loadRules(currentDomain);
          
          // Reload domains if no rules left
          if (domains[currentDomain].rules.length === 0) {
            delete domains[currentDomain];
            chrome.storage.local.set({ domains }, () => {
              loadDomains();
            });
          }
        });
      }
    });
  }
}

/**
 * Handles domain selection change
 */
function handleDomainChange() {
  currentDomain = domainSelect.value;
  currentDomainSpan.textContent = currentDomain || 'selected domain';
  loadRules(currentDomain);
}

/**
 * Handles export rules button click
 */
function handleExportRules() {
  if (!currentDomain) {
    alert('Please select a domain first');
    return;
  }
  
  chrome.storage.local.get(['domains'], (result) => {
    const domains = result.domains || {};
    
    if (domains[currentDomain]) {
      // Create export data
      const exportData = {
        domain: currentDomain,
        rules: domains[currentDomain].rules
      };
      
      // Convert to JSON string
      const jsonStr = JSON.stringify(exportData, null, 2);
      
      // Create download link
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDomain}-rules.json`;
      a.click();
      
      // Clean up
      URL.revokeObjectURL(url);
    }
  });
}

/**
 * Handles import rules button click
 */
function handleImportRules() {
  // Show import dialog
  importDialog.classList.remove('hidden');
  importText.value = '';
  importText.focus();
}

/**
 * Handles confirm import button click
 */
function handleConfirmImport() {
  try {
    // Parse import data
    const importData = JSON.parse(importText.value);
    
    if (!importData.domain || !Array.isArray(importData.rules)) {
      throw new Error('Invalid import data format');
    }
    
    // Get current domains
    chrome.storage.local.get(['domains'], (result) => {
      const domains = result.domains || {};
      
      // Initialize domain if it doesn't exist
      if (!domains[importData.domain]) {
        domains[importData.domain] = { rules: [] };
      }
      
      // Add imported rules
      importData.rules.forEach(rule => {
        // Check if rule with same name exists
        const existingRuleIndex = domains[importData.domain].rules.findIndex(r => r.name === rule.name);
        
        if (existingRuleIndex >= 0) {
          // Update existing rule
          domains[importData.domain].rules[existingRuleIndex] = rule;
        } else {
          // Add new rule
          domains[importData.domain].rules.push(rule);
        }
      });
      
      // Save updated domains
      chrome.storage.local.set({ domains }, () => {
        // Update UI
        loadDomains();
        
        // Select imported domain
        setTimeout(() => {
          domainSelect.value = importData.domain;
          handleDomainChange();
        }, 100);
        
        // Hide import dialog
        importDialog.classList.add('hidden');
        
        // Show success message
        alert('Rules imported successfully');
      });
    });
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

/**
 * Handles cancel import button click
 */
function handleCancelImport() {
  // Hide import dialog
  importDialog.classList.add('hidden');
}

/**
 * Handles auto-extract toggle change
 */
function handleAutoExtractToggle() {
  // Save setting
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || {};
    settings.autoExtract = autoExtractToggle.checked;
    chrome.storage.local.set({ settings });
  });
}

// Initialize options when DOM is loaded
document.addEventListener('DOMContentLoaded', initOptions);