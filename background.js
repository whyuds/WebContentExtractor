/**
 * WebContentExtractor - Background Service Worker
 * 处理消息传递、规则存储、上下文菜单等后台任务
 */

'use strict';

// ==================== 默认配置 ====================

const DEFAULT_CONFIG = {
  autoExtract: false,
  defaultFormat: 'html',
  autoCopy: true,
  showHighlights: true,
  toastDuration: 3000,
  extractTimeout: 5000,
  minTextLength: 200,
  removeAds: true,
  preserveLinks: true,
  preserveImages: true,
  cleanEmptyLines: true,
  normalizeWhitespace: true
};

// ==================== 规则存储管理 ====================

class RulesManager {
  constructor() {
    this.rulesKey = 'wce_rules';
    this.configKey = 'wce_config';
  }

  async getRules(domain = null) {
    try {
      const result = await chrome.storage.local.get({ [this.rulesKey]: {} });
      const allRules = result[this.rulesKey];
      
      if (domain) {
        return allRules[domain] || [];
      }
      return allRules;
    } catch (error) {
      console.error('[RulesManager] Failed to get rules:', error);
      return domain ? [] : {};
    }
  }

  async saveRule(domain, rule) {
    try {
      const rules = await this.getRules();
      
      if (!rules[domain]) {
        rules[domain] = [];
      }
      
      if (rule.isDefault) {
        rules[domain].forEach(r => r.isDefault = false);
      }
      
      const existingIndex = rules[domain].findIndex(r => r.id === rule.id);
      if (existingIndex >= 0) {
        rules[domain][existingIndex] = rule;
      } else {
        rule.id = this.generateId();
        rule.createdAt = new Date().toISOString();
        rules[domain].push(rule);
      }
      
      await chrome.storage.local.set({ [this.rulesKey]: rules });
      return { success: true, rule };
    } catch (error) {
      console.error('[RulesManager] Failed to save rule:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteRule(domain, ruleId) {
    try {
      const rules = await this.getRules();
      
      if (rules[domain]) {
        rules[domain] = rules[domain].filter(r => r.id !== ruleId);
        
        if (rules[domain].length === 0) {
          delete rules[domain];
        }
      }
      
      await chrome.storage.local.set({ [this.rulesKey]: rules });
      return { success: true };
    } catch (error) {
      console.error('[RulesManager] Failed to delete rule:', error);
      return { success: false, error: error.message };
    }
  }

  async setDefaultRule(domain, ruleId) {
    try {
      const rules = await this.getRules();
      
      if (rules[domain]) {
        rules[domain].forEach(r => {
          r.isDefault = r.id === ruleId;
        });
        
        await chrome.storage.local.set({ [this.rulesKey]: rules });
        return { success: true };
      }
      
      return { success: false, error: 'Rule not found' };
    } catch (error) {
      console.error('[RulesManager] Failed to set default rule:', error);
      return { success: false, error: error.message };
    }
  }

  async clearAllRules() {
    try {
      await chrome.storage.local.set({ [this.rulesKey]: {} });
      return { success: true };
    } catch (error) {
      console.error('[RulesManager] Failed to clear rules:', error);
      return { success: false, error: error.message };
    }
  }

  async exportRules(domains = null) {
    try {
      const allRules = await this.getRules();
      
      if (domains && domains.length > 0) {
        const filtered = {};
        domains.forEach(domain => {
          if (allRules[domain]) {
            filtered[domain] = allRules[domain];
          }
        });
        return { success: true, data: filtered };
      }
      
      return { success: true, data: allRules };
    } catch (error) {
      console.error('[RulesManager] Failed to export rules:', error);
      return { success: false, error: error.message };
    }
  }

  async importRules(rulesData, merge = true) {
    try {
      if (typeof rulesData === 'string') {
        rulesData = JSON.parse(rulesData);
      }
      
      let currentRules = {};
      if (merge) {
        currentRules = await this.getRules();
      }
      
      let importedCount = 0;
      for (const [domain, rules] of Object.entries(rulesData)) {
        if (!Array.isArray(rules)) continue;
        
        if (!currentRules[domain]) {
          currentRules[domain] = [];
        }
        
        for (const rule of rules) {
          if (!rule.id) {
            rule.id = this.generateId();
          }
          if (!rule.createdAt) {
            rule.createdAt = new Date().toISOString();
          }
          
          const existingIndex = currentRules[domain].findIndex(r => r.id === rule.id);
          if (existingIndex >= 0) {
            currentRules[domain][existingIndex] = rule;
          } else {
            currentRules[domain].push(rule);
          }
          importedCount++;
        }
      }
      
      await chrome.storage.local.set({ [this.rulesKey]: currentRules });
      return { success: true, imported: importedCount };
    } catch (error) {
      console.error('[RulesManager] Failed to import rules:', error);
      return { success: false, error: error.message };
    }
  }

  async getConfig() {
    try {
      const result = await chrome.storage.local.get({ [this.configKey]: DEFAULT_CONFIG });
      return { ...DEFAULT_CONFIG, ...result[this.configKey] };
    } catch (error) {
      console.error('[RulesManager] Failed to get config:', error);
      return { ...DEFAULT_CONFIG };
    }
  }

  async saveConfig(config) {
    try {
      const currentConfig = await this.getConfig();
      const mergedConfig = { ...currentConfig, ...config };
      await chrome.storage.local.set({ [this.configKey]: mergedConfig });
      return { success: true };
    } catch (error) {
      console.error('[RulesManager] Failed to save config:', error);
      return { success: false, error: error.message };
    }
  }

  generateId() {
    return 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// ==================== 消息处理 ====================

const rulesManager = new RulesManager();

async function handleMessage(message, sender) {
  const tabId = sender.tab ? sender.tab.id : null;
  
  try {
    switch (message.action) {
      case 'getRules':
        return await rulesManager.getRules(message.domain);
      
      case 'saveRule':
        return await rulesManager.saveRule(message.domain, message.rule);
      
      case 'deleteRule':
        return await rulesManager.deleteRule(message.domain, message.ruleId);
      
      case 'setDefaultRule':
        return await rulesManager.setDefaultRule(message.domain, message.ruleId);
      
      case 'clearAllRules':
        return await rulesManager.clearAllRules();
      
      case 'exportRules':
        return await rulesManager.exportRules(message.domains);
      
      case 'importRules':
        return await rulesManager.importRules(message.rulesData, message.merge !== false);
      
      case 'getConfig':
        return await rulesManager.getConfig();
      
      case 'saveConfig':
        return await rulesManager.saveConfig(message.config);
      
      case 'extractContent':
        return await executeInTab(tabId || message.tabId, 'extractContent');
      
      case 'manualSelection':
        return await executeInTab(tabId || message.tabId, 'manualSelection');
      
      case 'getAllRules':
        return await rulesManager.getRules();
      
      default:
        return { success: false, error: 'Unknown action: ' + message.action };
    }
  } catch (error) {
    console.error('[Background] Message handling error:', error);
    return { success: false, error: error.message };
  }
}

async function executeInTab(tabId, action, data = {}) {
  if (!tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
      return { success: false, error: 'No active tab found' };
    }
    tabId = activeTab.id;
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action, ...data });
    return response || { success: true };
  } catch (error) {
    console.error('[Background] Failed to execute in tab:', error);
    return { success: false, error: error.message };
  }
}

// ==================== 上下文菜单 ====================

function createContextMenus() {
  chrome.contextMenus.create({
    id: 'wce-extract',
    title: '提取页面内容',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'wce-manual',
    title: '手动选择内容',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'wce-separator-1',
    type: 'separator',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'wce-selection-extract',
    title: '提取选中内容',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'wce-copy-plain',
    title: '复制为纯文本',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'wce-copy-rich',
    title: '复制为富文本',
    contexts: ['selection']
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab.id;
  
  try {
    switch (info.menuItemId) {
      case 'wce-extract':
        await executeInTab(tabId, 'extractContent');
        break;
      case 'wce-manual':
        await executeInTab(tabId, 'manualSelection');
        break;
      case 'wce-selection-extract':
        await executeInTab(tabId, 'extractSelection');
        break;
      case 'wce-copy-plain':
        await executeInTab(tabId, 'copySelectionPlain');
        break;
      case 'wce-copy-rich':
        await executeInTab(tabId, 'copySelectionRich');
        break;
    }
  } catch (error) {
    console.error('[Background] Context menu error:', error);
  }
});

// ==================== 命令监听 ====================

chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab) return;
  
  try {
    switch (command) {
      case 'extract-content':
        await executeInTab(activeTab.id, 'extractContent');
        break;
      case 'manual-selection':
        await executeInTab(activeTab.id, 'manualSelection');
        break;
    }
  } catch (error) {
    console.error('[Background] Command error:', error);
  }
});

// ==================== 消息监听 ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(response => {
      sendResponse(response);
    })
    .catch(error => {
      console.error('[Background] Unhandled error:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
});

// ==================== 初始化 ====================

async function init() {
  console.log('[Background] WebContentExtractor v2.0 initialized');
  
  try {
    createContextMenus();
  } catch (error) {
    console.warn('[Background] Failed to create context menus:', error);
  }
}

init();
