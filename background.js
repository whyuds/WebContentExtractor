/**
 * WebContentExtractor - Background Script
 * Manages extension lifecycle, cross-page communication, and rule storage
 */

// Initialize rule storage structure if not exists
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['domains'], (result) => {
    if (!result.domains) {
      chrome.storage.local.set({ domains: {} });
      console.log('WebContentExtractor: Storage initialized');
    }
  });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    // Forward the extract content request to the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extractContent' });
      }
    });
    sendResponse({ status: 'processing' });
    return true;
  }
  
  if (request.action === 'manualSelection') {
    // Forward the manual selection request to the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'manualSelection' });
      }
    });
    sendResponse({ status: 'processing' });
    return true;
  }
  
  if (request.action === 'getRules') {
    // Get domain from the request
    const domain = request.domain;
    
    // Retrieve rules for the specified domain
    chrome.storage.local.get(['domains'], (result) => {
      const domains = result.domains || {};
      const domainRules = domains[domain] ? domains[domain].rules : [];
      sendResponse({ rules: domainRules });
    });
    return true;
  }
  
  if (request.action === 'saveRule') {
    // Save a new rule or update existing one
    const { domain, rule } = request;
    
    chrome.storage.local.get(['domains'], (result) => {
      const domains = result.domains || {};
      
      // Initialize domain entry if it doesn't exist
      if (!domains[domain]) {
        domains[domain] = { rules: [] };
      }
      
      // Check if rule with same name exists
      const existingRuleIndex = domains[domain].rules.findIndex(r => r.name === rule.name);
      
      if (existingRuleIndex >= 0) {
        // Update existing rule
        domains[domain].rules[existingRuleIndex] = rule;
      } else {
        // Add new rule
        domains[domain].rules.push(rule);
      }
      
      // If this rule is set as default, unset other defaults
      if (rule.isDefault) {
        domains[domain].rules.forEach((r, index) => {
          if (r.name !== rule.name && r.isDefault) {
            domains[domain].rules[index].isDefault = false;
          }
        });
      }
      
      // Save updated rules
      chrome.storage.local.set({ domains }, () => {
        sendResponse({ status: 'success', message: 'Rule saved successfully' });
      });
    });
    return true;
  }
  
  if (request.action === 'deleteRule') {
    // Delete a rule
    const { domain, ruleName } = request;
    
    chrome.storage.local.get(['domains'], (result) => {
      const domains = result.domains || {};
      
      if (domains[domain] && domains[domain].rules) {
        // Filter out the rule to delete
        domains[domain].rules = domains[domain].rules.filter(r => r.name !== ruleName);
        
        // Save updated rules
        chrome.storage.local.set({ domains }, () => {
          sendResponse({ status: 'success', message: 'Rule deleted successfully' });
        });
      } else {
        sendResponse({ status: 'error', message: 'Domain or rule not found' });
      }
    });
    return true;
  }
});