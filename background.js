/**
 * WebContentExtractor - Background Service Worker
 * 处理消息传递、规则存储、上下文菜单等后台任务
 * 
 * DEBUG模式说明：
 * - 所有操作都有详细的日志输出
 * - 错误信息包含完整的堆栈跟踪
 * - 使用 console.group 进行日志分组便于阅读
 */

'use strict';

// ==================== 日志工具 ====================

const Logger = {
  prefix: '[WebContentExtractor]',
  
  _getTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  },
  
  _formatMessage(level, ...args) {
    const timestamp = this._getTimestamp();
    return [`${this.prefix} [${level}] [${timestamp}]`, ...args];
  },
  
  info(...args) {
    console.info(...this._formatMessage('INFO', ...args));
  },
  
  warn(...args) {
    console.warn(...this._formatMessage('WARN', ...args));
  },
  
  error(...args) {
    console.error(...this._formatMessage('ERROR', ...args));
  },
  
  debug(...args) {
    console.debug(...this._formatMessage('DEBUG', ...args));
  },
  
  log(...args) {
    console.log(...this._formatMessage('LOG', ...args));
  },
  
  group(label) {
    console.group(`${this.prefix} ${label}`);
  },
  
  groupEnd() {
    console.groupEnd();
  },
  
  table(data, columns) {
    this.log('Table data:');
    console.table(data, columns);
  },
  
  dir(obj) {
    console.dir(obj);
  },
  
  /**
   * 记录错误并返回格式化的错误对象
   */
  recordError(context, error, extra = {}) {
    this.group('ERROR DETAILS');
    this.error('Context:', context);
    this.error('Message:', error.message);
    if (error.stack) {
      this.error('Stack trace:');
      console.error(error.stack);
    }
    if (Object.keys(extra).length > 0) {
      this.error('Extra info:');
      this.dir(extra);
    }
    this.groupEnd();
    
    return {
      success: false,
      error: error.message,
      errorType: error.constructor?.name || 'UnknownError',
      context: context,
      timestamp: new Date().toISOString()
    };
  },
  
  /**
   * 包装函数，自动捕获异常并记录日志
   */
  wrapAsync(context, fn) {
    return async (...args) => {
      try {
        this.debug('Executing:', context);
        const result = await fn(...args);
        this.debug('Completed:', context, '->', result?.success !== false ? 'SUCCESS' : 'FAILED');
        return result;
      } catch (error) {
        return this.recordError(context, error);
      }
    };
  }
};

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
  normalizeWhitespace: true,
  debugMode: false
};

const STORAGE_KEYS = {
  RULES: 'wce_rules',
  CONFIG: 'wce_config',
  ERROR_LOG: 'wce_error_log'
};

const MAX_ERROR_LOGS = 50;

// ==================== 错误日志存储 ====================

const ErrorLog = {
  async add(errorData) {
    try {
      const result = await chrome.storage.local.get({ [STORAGE_KEYS.ERROR_LOG]: [] });
      let logs = result[STORAGE_KEYS.ERROR_LOG];
      
      logs.unshift(errorData);
      
      if (logs.length > MAX_ERROR_LOGS) {
        logs = logs.slice(0, MAX_ERROR_LOGS);
      }
      
      await chrome.storage.local.set({ [STORAGE_KEYS.ERROR_LOG]: logs });
      Logger.debug('Error saved to log storage');
    } catch (storageError) {
      Logger.error('Failed to save error log:', storageError.message);
    }
  },
  
  async getAll() {
    try {
      const result = await chrome.storage.local.get({ [STORAGE_KEYS.ERROR_LOG]: [] });
      return result[STORAGE_KEYS.ERROR_LOG];
    } catch (error) {
      Logger.error('Failed to get error logs:', error.message);
      return [];
    }
  },
  
  async clear() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.ERROR_LOG]: [] });
      Logger.info('Error logs cleared');
    } catch (error) {
      Logger.error('Failed to clear error logs:', error.message);
    }
  }
};

// ==================== 规则存储管理 ====================

class RulesManager {
  constructor() {
    this.rulesKey = STORAGE_KEYS.RULES;
    this.configKey = STORAGE_KEYS.CONFIG;
  }

  async getRules(domain = null) {
    return Logger.wrapAsync('RulesManager.getRules', async () => {
      Logger.group('Getting Rules');
      Logger.debug('Domain:', domain || 'ALL');
      
      const result = await chrome.storage.local.get({ [this.rulesKey]: {} });
      const allRules = result[this.rulesKey];
      
      Logger.debug('Raw rules data:');
      Logger.dir(allRules);
      
      let response;
      if (domain) {
        const domainRules = allRules[domain] || [];
        Logger.info(`Found ${domainRules.length} rules for domain: ${domain}`);
        response = domainRules;
      } else {
        const totalDomains = Object.keys(allRules).length;
        const totalRules = Object.values(allRules).reduce((sum, rules) => sum + rules.length, 0);
        Logger.info(`Found ${totalRules} rules across ${totalDomains} domains`);
        response = allRules;
      }
      
      Logger.groupEnd();
      return response;
    })();
  }

  async saveRule(domain, rule) {
    return Logger.wrapAsync('RulesManager.saveRule', async () => {
      Logger.group('Saving Rule');
      Logger.debug('Domain:', domain);
      Logger.debug('Rule data:');
      Logger.dir(rule);
      
      const rules = await this.getRules();
      
      if (!rules[domain]) {
        rules[domain] = [];
        Logger.debug('Creating new domain entry');
      }
      
      if (rule.isDefault) {
        Logger.debug('Setting as default, clearing other defaults');
        rules[domain].forEach(r => r.isDefault = false);
      }
      
      const existingIndex = rules[domain].findIndex(r => r.id === rule.id);
      if (existingIndex >= 0) {
        Logger.info(`Updating existing rule at index: ${existingIndex}`);
        rule.updatedAt = new Date().toISOString();
        rules[domain][existingIndex] = rule;
      } else {
        rule.id = this.generateId();
        rule.createdAt = new Date().toISOString();
        Logger.info(`Creating new rule with ID: ${rule.id}`);
        rules[domain].push(rule);
      }
      
      Logger.debug('Saving to storage...');
      await chrome.storage.local.set({ [this.rulesKey]: rules });
      Logger.info('Rule saved successfully');
      
      Logger.groupEnd();
      return { success: true, rule };
    })();
  }

  async deleteRule(domain, ruleId) {
    return Logger.wrapAsync('RulesManager.deleteRule', async () => {
      Logger.group('Deleting Rule');
      Logger.debug('Domain:', domain);
      Logger.debug('Rule ID:', ruleId);
      
      const rules = await this.getRules();
      
      if (rules[domain]) {
        const initialCount = rules[domain].length;
        rules[domain] = rules[domain].filter(r => r.id !== ruleId);
        const deletedCount = initialCount - rules[domain].length;
        
        Logger.debug(`Deleted ${deletedCount} rule(s)`);
        
        if (rules[domain].length === 0) {
          Logger.debug('Removing empty domain entry');
          delete rules[domain];
        }
        
        await chrome.storage.local.set({ [this.rulesKey]: rules });
        Logger.info('Rule deleted successfully');
      } else {
        Logger.warn('Domain not found, nothing to delete');
      }
      
      Logger.groupEnd();
      return { success: true };
    })();
  }

  async setDefaultRule(domain, ruleId) {
    return Logger.wrapAsync('RulesManager.setDefaultRule', async () => {
      Logger.group('Setting Default Rule');
      Logger.debug('Domain:', domain);
      Logger.debug('Rule ID:', ruleId);
      
      const rules = await this.getRules();
      
      if (rules[domain]) {
        const ruleExists = rules[domain].some(r => r.id === ruleId);
        if (!ruleExists) {
          Logger.error('Rule not found:', ruleId);
          Logger.groupEnd();
          return { success: false, error: 'Rule not found' };
        }
        
        rules[domain].forEach(r => {
          const wasDefault = r.isDefault;
          r.isDefault = r.id === ruleId;
          if (wasDefault !== r.isDefault) {
            Logger.debug(`Rule ${r.id} isDefault: ${wasDefault} -> ${r.isDefault}`);
          }
        });
        
        await chrome.storage.local.set({ [this.rulesKey]: rules });
        Logger.info('Default rule updated successfully');
        Logger.groupEnd();
        return { success: true };
      }
      
      Logger.warn('Domain not found');
      Logger.groupEnd();
      return { success: false, error: 'Domain not found' };
    })();
  }

  async clearAllRules() {
    return Logger.wrapAsync('RulesManager.clearAllRules', async () => {
      Logger.group('Clearing All Rules');
      Logger.warn('This will remove ALL rules!');
      
      const currentRules = await this.getRules();
      const domainCount = Object.keys(currentRules).length;
      const totalRules = Object.values(currentRules).reduce((sum, rules) => sum + rules.length, 0);
      
      Logger.debug(`Will delete: ${totalRules} rule(s) from ${domainCount} domain(s)`);
      
      await chrome.storage.local.set({ [this.rulesKey]: {} });
      Logger.info('All rules cleared successfully');
      
      Logger.groupEnd();
      return { success: true, domainsCleared: domainCount, rulesCleared: totalRules };
    })();
  }

  async exportRules(domains = null) {
    return Logger.wrapAsync('RulesManager.exportRules', async () => {
      Logger.group('Exporting Rules');
      Logger.debug('Filter domains:', domains || 'ALL');
      
      const allRules = await this.getRules();
      
      if (domains && domains.length > 0) {
        const filtered = {};
        let count = 0;
        domains.forEach(domain => {
          if (allRules[domain]) {
            filtered[domain] = allRules[domain];
            count += allRules[domain].length;
          }
        });
        Logger.info(`Exporting ${count} rule(s) from ${Object.keys(filtered).length} domain(s)`);
        Logger.groupEnd();
        return { 
          success: true, 
          data: filtered,
          metadata: {
            exportedAt: new Date().toISOString(),
            version: '2.0.0',
            totalRules: count,
            totalDomains: Object.keys(filtered).length
          }
        };
      }
      
      const totalRules = Object.values(allRules).reduce((sum, rules) => sum + rules.length, 0);
      Logger.info(`Exporting all: ${totalRules} rule(s) from ${Object.keys(allRules).length} domain(s)`);
      
      Logger.groupEnd();
      return { 
        success: true, 
        data: allRules,
        metadata: {
          exportedAt: new Date().toISOString(),
          version: '2.0.0',
          totalRules: totalRules,
          totalDomains: Object.keys(allRules).length
        }
      };
    })();
  }

  async importRules(rulesData, merge = true) {
    return Logger.wrapAsync('RulesManager.importRules', async () => {
      Logger.group('Importing Rules');
      Logger.debug('Merge mode:', merge);
      
      let parsedData = rulesData;
      if (typeof rulesData === 'string') {
        Logger.debug('Parsing JSON string...');
        try {
          parsedData = JSON.parse(rulesData);
        } catch (parseError) {
          Logger.error('JSON parse error');
          Logger.groupEnd();
          throw new Error('Invalid JSON format: ' + parseError.message);
        }
      }
      
      const dataToImport = parsedData.data || parsedData;
      
      if (typeof dataToImport !== 'object' || dataToImport === null || Array.isArray(dataToImport)) {
        Logger.error('Invalid format: expected object');
        Logger.groupEnd();
        throw new Error('Invalid format: expected domain-keyed object');
      }
      
      Logger.debug('Import data structure:');
      Logger.dir(dataToImport);
      
      let currentRules = {};
      if (merge) {
        Logger.debug('Loading existing rules for merge...');
        currentRules = await this.getRules();
      } else {
        Logger.warn('Replacing all existing rules (merge=false)');
      }
      
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const importedDomains = [];
      
      for (const [domain, rules] of Object.entries(dataToImport)) {
        if (!Array.isArray(rules)) {
          Logger.warn(`Skipping domain "${domain}": not an array`);
          skippedCount++;
          continue;
        }
        
        if (!currentRules[domain]) {
          currentRules[domain] = [];
        }
        importedDomains.push(domain);
        
        for (const rule of rules) {
          if (!rule || typeof rule !== 'object') {
            Logger.warn('Skipping invalid rule entry');
            skippedCount++;
            continue;
          }
          
          const isUpdate = rule.id && currentRules[domain].some(r => r.id === rule.id);
          
          if (!rule.id) {
            rule.id = this.generateId();
            Logger.debug('Generated new ID for rule:', rule.id);
          }
          if (!rule.createdAt) {
            rule.createdAt = new Date().toISOString();
          }
          rule.importedAt = new Date().toISOString();
          
          const existingIndex = currentRules[domain].findIndex(r => r.id === rule.id);
          if (existingIndex >= 0) {
            currentRules[domain][existingIndex] = rule;
            updatedCount++;
          } else {
            currentRules[domain].push(rule);
            importedCount++;
          }
        }
      }
      
      Logger.debug('Saving imported rules to storage...');
      await chrome.storage.local.set({ [this.rulesKey]: currentRules });
      
      Logger.info(`Import complete: ${importedCount} new, ${updatedCount} updated, ${skippedCount} skipped`);
      Logger.groupEnd();
      
      return { 
        success: true, 
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        domains: importedDomains
      };
    })();
  }

  async getConfig() {
    return Logger.wrapAsync('RulesManager.getConfig', async () => {
      Logger.debug('Loading config from storage...');
      
      const result = await chrome.storage.local.get({ [this.configKey]: DEFAULT_CONFIG });
      const config = { ...DEFAULT_CONFIG, ...result[this.configKey] };
      
      Logger.debug('Loaded config:');
      Logger.dir(config);
      
      return config;
    })();
  }

  async saveConfig(config) {
    return Logger.wrapAsync('RulesManager.saveConfig', async () => {
      Logger.group('Saving Config');
      Logger.debug('New config values:');
      Logger.dir(config);
      
      const currentConfig = await this.getConfig();
      const mergedConfig = { ...currentConfig, ...config };
      
      Logger.debug('Merged config:');
      Logger.dir(mergedConfig);
      
      await chrome.storage.local.set({ [this.configKey]: mergedConfig });
      Logger.info('Config saved successfully');
      
      Logger.groupEnd();
      return { success: true };
    })();
  }

  generateId() {
    const id = 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    Logger.debug('Generated ID:', id);
    return id;
  }
}

// ==================== 消息处理 ====================

const rulesManager = new RulesManager();

async function handleMessage(message, sender) {
  const tabId = sender.tab ? sender.tab.id : null;
  const tabUrl = sender.tab?.url || 'N/A';
  
  Logger.group('Message Received');
  Logger.debug('Action:', message.action);
  Logger.debug('Tab ID:', tabId || 'N/A');
  Logger.debug('Tab URL:', tabUrl);
  Logger.debug('Sender frame:', sender.frameId !== undefined ? sender.frameId : 'N/A');
  Logger.debug('Message data:');
  Logger.dir(message);
  
  try {
    let result;
    
    switch (message.action) {
      case 'getRules':
        result = await rulesManager.getRules(message.domain);
        break;
      
      case 'saveRule':
        result = await rulesManager.saveRule(message.domain, message.rule);
        break;
      
      case 'deleteRule':
        result = await rulesManager.deleteRule(message.domain, message.ruleId);
        break;
      
      case 'setDefaultRule':
        result = await rulesManager.setDefaultRule(message.domain, message.ruleId);
        break;
      
      case 'clearAllRules':
        result = await rulesManager.clearAllRules();
        break;
      
      case 'exportRules':
        result = await rulesManager.exportRules(message.domains);
        break;
      
      case 'importRules':
        result = await rulesManager.importRules(message.rulesData, message.merge !== false);
        break;
      
      case 'getConfig':
        result = await rulesManager.getConfig();
        break;
      
      case 'saveConfig':
        result = await rulesManager.saveConfig(message.config);
        break;
      
      case 'extractContent':
        result = await executeInTab(tabId || message.tabId, 'extractContent', { format: message.format });
        break;
      
      case 'manualSelection':
        result = await executeInTab(tabId || message.tabId, 'manualSelection');
        break;
      
      case 'getAllRules':
        result = await rulesManager.getRules();
        break;
      
      case 'getErrorLogs':
        result = await ErrorLog.getAll();
        break;
      
      case 'clearErrorLogs':
        result = await ErrorLog.clear();
        break;
      
      case 'ping':
        Logger.debug('Ping received, responding with pong');
        result = { success: true, pong: true, timestamp: Date.now() };
        break;
      
      default:
        Logger.warn('Unknown action:', message.action);
        result = { success: false, error: 'Unknown action: ' + message.action };
    }
    
    Logger.debug('Message result:', result?.success !== false ? 'SUCCESS' : 'FAILED');
    Logger.groupEnd();
    return result;
    
  } catch (error) {
    const errorData = Logger.recordError('handleMessage:' + message.action, error, {
      tabId,
      tabUrl,
      message: message
    });
    
    await ErrorLog.add(errorData);
    Logger.groupEnd();
    return errorData;
  }
}

async function executeInTab(tabId, action, data = {}) {
  return Logger.wrapAsync('executeInTab:' + action, async () => {
    Logger.group('Executing in Tab');
    Logger.debug('Action:', action);
    Logger.debug('Initial tab ID:', tabId || 'N/A');
    Logger.debug('Data:', data);
    
    let targetTabId = tabId;
    let targetTabInfo = null;
    
    if (!targetTabId) {
      Logger.debug('No tab ID provided, querying active tab...');
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!activeTab) {
        Logger.error('No active tab found!');
        Logger.groupEnd();
        return { success: false, error: 'No active tab found' };
      }
      
      targetTabId = activeTab.id;
      targetTabInfo = activeTab;
      Logger.debug('Using active tab:', targetTabId, targetTabInfo.url);
    }
    
    Logger.info('Sending message to tab:', targetTabId, 'Action:', action);
    
    try {
      const response = await chrome.tabs.sendMessage(targetTabId, { action, ...data });
      
      Logger.debug('Response from tab:');
      Logger.dir(response);
      
      Logger.groupEnd();
      return response || { success: true };
      
    } catch (error) {
      Logger.error('Failed to communicate with tab');
      Logger.error('Possible reasons:');
      Logger.error('  1. Content script not loaded in this tab');
      Logger.error('  2. Tab is a chrome:// URL or extension page');
      Logger.error('  3. Tab has been closed');
      
      if (targetTabInfo) {
        Logger.error('Tab URL:', targetTabInfo.url);
        Logger.error('Tab status:', targetTabInfo.status);
      }
      
      const errorData = Logger.recordError('executeInTab', error, {
        tabId: targetTabId,
        action,
        data,
        tabUrl: targetTabInfo?.url
      });
      
      await ErrorLog.add(errorData);
      Logger.groupEnd();
      return errorData;
    }
  })();
}

// ==================== 上下文菜单 ====================

function createContextMenus() {
  Logger.group('Creating Context Menus');
  
  try {
    chrome.contextMenus.removeAll(() => {
      Logger.debug('Removed existing context menus');
      
      const menuItems = [
        { id: 'wce-extract', title: '提取页面内容', contexts: ['page'] },
        { id: 'wce-manual', title: '手动选择内容', contexts: ['page'] },
        { id: 'wce-separator-1', type: 'separator', contexts: ['page'] },
        { id: 'wce-selection-extract', title: '提取选中内容', contexts: ['selection'] },
        { id: 'wce-separator-2', type: 'separator', contexts: ['selection'] },
        { id: 'wce-copy-plain', title: '复制为纯文本', contexts: ['selection'] },
        { id: 'wce-copy-rich', title: '复制为富文本', contexts: ['selection'] }
      ];
      
      menuItems.forEach((item, index) => {
        try {
          chrome.contextMenus.create(item);
          Logger.debug(`Created menu item ${index + 1}: ${item.id} (${item.title || item.type})`);
        } catch (menuError) {
          Logger.warn(`Failed to create menu item ${item.id}:`, menuError.message);
        }
      });
      
      Logger.info('Context menus created successfully');
    });
  } catch (error) {
    Logger.recordError('createContextMenus', error);
  }
  
  Logger.groupEnd();
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab.id;
  const tabUrl = tab.url;
  
  Logger.group('Context Menu Clicked');
  Logger.debug('Menu ID:', info.menuItemId);
  Logger.debug('Tab:', tabId, tabUrl);
  Logger.debug('Selection text:', info.selectionText || 'N/A');
  
  try {
    switch (info.menuItemId) {
      case 'wce-extract':
        Logger.info('Triggering: 提取页面内容');
        await executeInTab(tabId, 'extractContent');
        break;
      case 'wce-manual':
        Logger.info('Triggering: 手动选择内容');
        await executeInTab(tabId, 'manualSelection');
        break;
      case 'wce-selection-extract':
        Logger.info('Triggering: 提取选中内容');
        await executeInTab(tabId, 'extractSelection');
        break;
      case 'wce-copy-plain':
        Logger.info('Triggering: 复制为纯文本');
        await executeInTab(tabId, 'copySelectionPlain');
        break;
      case 'wce-copy-rich':
        Logger.info('Triggering: 复制为富文本');
        await executeInTab(tabId, 'copySelectionRich');
        break;
      default:
        Logger.warn('Unhandled menu item:', info.menuItemId);
    }
  } catch (error) {
    const errorData = Logger.recordError('contextMenus.onClicked', error, {
      menuItemId: info.menuItemId,
      tabId,
      tabUrl
    });
    await ErrorLog.add(errorData);
  }
  
  Logger.groupEnd();
});

// ==================== 命令监听 ====================

chrome.commands.onCommand.addListener(async (command) => {
  Logger.group('Command Triggered');
  Logger.debug('Command:', command);
  
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab) {
      Logger.error('No active tab found for command');
      Logger.groupEnd();
      return;
    }
    
    Logger.debug('Active tab:', activeTab.id, activeTab.url);
    
    switch (command) {
      case 'extract-content':
        Logger.info('Executing command: extract-content');
        await executeInTab(activeTab.id, 'extractContent');
        break;
      case 'manual-selection':
        Logger.info('Executing command: manual-selection');
        await executeInTab(activeTab.id, 'manualSelection');
        break;
      default:
        Logger.warn('Unknown command:', command);
    }
  } catch (error) {
    const errorData = Logger.recordError('commands.onCommand', error, { command });
    await ErrorLog.add(errorData);
  }
  
  Logger.groupEnd();
});

// ==================== 消息监听 ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(response => {
      Logger.debug('Sending response to sender:', response?.success !== false ? 'SUCCESS' : 'FAILED');
      sendResponse(response);
    })
    .catch(error => {
      const errorData = Logger.recordError('onMessage unhandled', error);
      ErrorLog.add(errorData).then(() => {
        sendResponse(errorData);
      }).catch(() => {
        sendResponse(errorData);
      });
    });
  return true;
});

// ==================== 扩展安装/更新监听 ====================

chrome.runtime.onInstalled.addListener((details) => {
  Logger.group('Extension Installed/Updated');
  Logger.info('Event type:', details.reason);
  if (details.previousVersion) {
    Logger.info('Previous version:', details.previousVersion);
  }
  Logger.info('Current version:', chrome.runtime.getManifest().version);
  
  createContextMenus();
  
  if (details.reason === 'install') {
    Logger.info('First install - initializing default config');
    rulesManager.saveConfig(DEFAULT_CONFIG).then(() => {
      Logger.info('Default config saved');
    });
  }
  
  if (details.reason === 'update') {
    Logger.info('Extension updated - running migration if needed');
  }
  
  Logger.groupEnd();
});

// ==================== 扩展启动监听 ====================

chrome.runtime.onStartup.addListener(() => {
  Logger.info('Extension Startup - Browser restart detected');
  createContextMenus();
});

// ==================== 初始化 ====================

async function init() {
  console.log('');
  Logger.log('========================================');
  Logger.log('  WebContentExtractor v2.0.0');
  Logger.log('  Enhanced Debug Mode Enabled');
  Logger.log('========================================');
  console.log('');
  
  Logger.info('Background Service Worker starting...');
  
  const manifest = chrome.runtime.getManifest();
  Logger.debug('Manifest version:', manifest.version);
  Logger.debug('Manifest V3: true');
  
  Logger.debug('Available permissions:');
  Logger.dir(manifest.permissions);
  
  Logger.debug('Host permissions:');
  Logger.dir(manifest.host_permissions);
  
  try {
    createContextMenus();
  } catch (error) {
    Logger.recordError('init:createContextMenus', error);
  }
  
  try {
    const config = await rulesManager.getConfig();
    Logger.debug('Loaded config during init:', config.debugMode ? 'DEBUG mode enabled' : 'Normal mode');
  } catch (error) {
    Logger.warn('Could not load config during init:', error.message);
  }
  
  Logger.info('Initialization complete - ready to receive messages');
}

// 全局错误处理
self.addEventListener('error', async (event) => {
  const errorData = Logger.recordError('Global Error Event', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  }, {
    error: event.error?.stack || event.error
  });
  
  await ErrorLog.add(errorData);
});

self.addEventListener('unhandledrejection', async (event) => {
  const errorData = Logger.recordError('Unhandled Promise Rejection', {
    reason: event.reason?.message || String(event.reason)
  }, {
    reasonStack: event.reason?.stack
  });
  
  await ErrorLog.add(errorData);
});

init();
