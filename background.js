/**
 * WebContentExtractor - Background Service Worker
 * 处理消息传递、规则存储、上下文菜单等后台任务
 * 
 * 版本: 2.0.1 (增强错误处理版)
 * 调试模式: 可通过 chrome://extensions 中的 Service Worker 控制台查看详细日志
 */

'use strict';

// ==================== 调试日志工具 ====================

const DEBUG = true;
const LOG_PREFIX = '[WCE]';

const Logger = {
  getTimestamp() {
    return new Date().toISOString();
  },

  formatLog(level, module, message, data = null) {
    const timestamp = this.getTimestamp();
    const prefix = `${LOG_PREFIX} [${timestamp}] [${level.toUpperCase()}] [${module}]`;
    
    if (data !== null) {
      return { prefix, message, data };
    }
    return { prefix, message };
  },

  info(module, message, data = null) {
    if (!DEBUG) return;
    const log = this.formatLog('info', module, message, data);
    if (data !== null) {
      console.log(`${log.prefix} ${log.message}`, log.data);
    } else {
      console.log(`${log.prefix} ${log.message}`);
    }
  },

  warn(module, message, data = null) {
    const log = this.formatLog('warn', module, message, data);
    if (data !== null) {
      console.warn(`${log.prefix} ${log.message}`, log.data);
    } else {
      console.warn(`${log.prefix} ${log.message}`);
    }
  },

  error(module, message, error = null) {
    const log = this.formatLog('error', module, message);
    
    if (error) {
      const errorInfo = {
        message: error.message || 'Unknown error',
        name: error.name || 'Error',
        stack: error.stack || 'No stack trace',
        details: this.extractErrorDetails(error)
      };
      console.error(`${log.prefix} ${log.message}`, errorInfo);
    } else {
      console.error(`${log.prefix} ${log.message}`);
    }
  },

  debug(module, message, data = null) {
    if (!DEBUG) return;
    const log = this.formatLog('debug', module, message, data);
    if (data !== null) {
      console.debug(`${log.prefix} ${log.message}`, log.data);
    } else {
      console.debug(`${log.prefix} ${log.message}`);
    }
  },

  extractErrorDetails(error) {
    const details = {};
    
    if (error.message) {
      details.message = error.message;
    }
    
    if (chrome.runtime.lastError) {
      details.chromeRuntimeError = chrome.runtime.lastError.message;
    }
    
    if (error.stack) {
      const stackLines = error.stack.split('\n');
      if (stackLines.length > 1) {
        details.callsite = stackLines[1].trim();
      }
    }
    
    return details;
  },

  groupStart(label) {
    if (DEBUG) {
      console.group(`${LOG_PREFIX} ${label}`);
    }
  },

  groupEnd() {
    if (DEBUG) {
      console.groupEnd();
    }
  }
};

// ==================== 错误包装工具 ====================

function wrapError(module, operation, error) {
  Logger.error(module, `操作失败: ${operation}`, error);
  
  const userMessage = `${operation} 失败: ${error.message || '未知错误'}`;
  
  return {
    success: false,
    error: userMessage,
    errorDetails: {
      module,
      operation,
      originalMessage: error.message,
      timestamp: new Date().toISOString()
    }
  };
}

function tryCatch(module, operation, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.catch(error => wrapError(module, operation, error));
    }
    return result;
  } catch (error) {
    return wrapError(module, operation, error);
  }
}

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
  excludeSelectors: [
    'script', 'style', 'noscript', 'iframe',
    '.advertisement', '.ad', '[class*="ad-"]', '[id*="ad-"]',
    '#comments', '.comments', '#sidebar', '.sidebar',
    'nav', 'footer', 'aside', 'header'
  ]
};

// ==================== 规则存储管理 ====================

class RulesManager {
  constructor() {
    this.rulesKey = 'wce_rules';
    this.configKey = 'wce_config';
    this.moduleName = 'RulesManager';
    
    Logger.info(this.moduleName, '规则管理器初始化');
  }

  async getRules(domain = null) {
    return tryCatch(this.moduleName, `获取规则${domain ? ` (域名: ${domain})` : ' (全部)'}`, async () => {
      Logger.debug(this.moduleName, `开始获取规则`, { domain });
      
      const result = await chrome.storage.local.get({ [this.rulesKey]: {} });
      const allRules = result[this.rulesKey];
      
      const domainCount = Object.keys(allRules).length;
      let totalRules = 0;
      Object.values(allRules).forEach(rules => {
        totalRules += Array.isArray(rules) ? rules.length : 0;
      });
      
      Logger.info(this.moduleName, `规则获取成功`, { 
        domainCount, 
        totalRules,
        queriedDomain: domain 
      });
      
      if (domain) {
        const domainRules = allRules[domain] || [];
        Logger.debug(this.moduleName, `指定域名规则数量`, { domain, count: domainRules.length });
        return domainRules;
      }
      
      return allRules;
    });
  }

  async saveRule(domain, rule) {
    return tryCatch(this.moduleName, `保存规则 (域名: ${domain})`, async () => {
      Logger.groupStart(`保存规则 - ${domain}`);
      Logger.debug(this.moduleName, '规则数据', { rule });
      
      const rules = await this.getRules();
      
      if (rules.success === false) {
        Logger.groupEnd();
        return rules;
      }
      
      if (!rules[domain]) {
        rules[domain] = [];
        Logger.debug(this.moduleName, `创建新域名字典`);
      }
      
      if (rule.isDefault) {
        rules[domain].forEach(r => r.isDefault = false);
        Logger.debug(this.moduleName, '已将其他规则设为非默认');
      }
      
      const existingIndex = rules[domain].findIndex(r => r.id === rule.id);
      let operation;
      
      if (existingIndex >= 0) {
        rules[domain][existingIndex] = rule;
        operation = '更新';
        Logger.info(this.moduleName, `更新现有规则`, { ruleId: rule.id });
      } else {
        rule.id = this.generateId();
        rule.createdAt = new Date().toISOString();
        rules[domain].push(rule);
        operation = '新增';
        Logger.info(this.moduleName, `新增规则`, { ruleId: rule.id });
      }
      
      await chrome.storage.local.set({ [this.rulesKey]: rules });
      
      Logger.info(this.moduleName, `规则保存成功`, { 
        operation,
        domain,
        ruleId: rule.id,
        ruleName: rule.name 
      });
      
      Logger.groupEnd();
      return { success: true, rule };
    });
  }

  async deleteRule(domain, ruleId) {
    return tryCatch(this.moduleName, `删除规则 (域名: ${domain}, ID: ${ruleId})`, async () => {
      Logger.info(this.moduleName, `开始删除规则`, { domain, ruleId });
      
      const rules = await this.getRules();
      
      if (rules.success === false) {
        return rules;
      }
      
      if (rules[domain]) {
        const originalCount = rules[domain].length;
        rules[domain] = rules[domain].filter(r => r.id !== ruleId);
        
        if (rules[domain].length === 0) {
          delete rules[domain];
          Logger.debug(this.moduleName, `域名规则已清空，移除域名字典`, { domain });
        }
        
        const deletedCount = originalCount - (rules[domain]?.length || 0);
        Logger.info(this.moduleName, `规则删除成功`, { deletedCount, domain, ruleId });
      } else {
        Logger.warn(this.moduleName, `未找到指定域名的规则`, { domain, ruleId });
      }
      
      await chrome.storage.local.set({ [this.rulesKey]: rules });
      
      return { success: true };
    });
  }

  async setDefaultRule(domain, ruleId) {
    return tryCatch(this.moduleName, `设置默认规则 (域名: ${domain}, ID: ${ruleId})`, async () => {
      Logger.info(this.moduleName, `设置默认规则`, { domain, ruleId });
      
      const rules = await this.getRules();
      
      if (rules.success === false) {
        return rules;
      }
      
      if (rules[domain]) {
        let found = false;
        
        rules[domain].forEach(r => {
          if (r.id === ruleId) {
            r.isDefault = true;
            found = true;
          } else {
            r.isDefault = false;
          }
        });
        
        if (!found) {
          Logger.warn(this.moduleName, `未找到指定规则`, { domain, ruleId });
          return { success: false, error: 'Rule not found' };
        }
        
        await chrome.storage.local.set({ [this.rulesKey]: rules });
        
        Logger.info(this.moduleName, `默认规则设置成功`, { domain, ruleId });
        return { success: true };
      }
      
      Logger.warn(this.moduleName, `未找到域名规则`, { domain });
      return { success: false, error: 'Domain rules not found' };
    });
  }

  async clearAllRules() {
    return tryCatch(this.moduleName, '清空所有规则', async () => {
      Logger.warn(this.moduleName, '正在清空所有规则...');
      
      await chrome.storage.local.set({ [this.rulesKey]: {} });
      
      Logger.info(this.moduleName, '所有规则已清空');
      return { success: true };
    });
  }

  async exportRules(domains = null) {
    return tryCatch(this.moduleName, `导出规则${domains ? ' (指定域名)' : ' (全部)'}`, async () => {
      Logger.info(this.moduleName, `开始导出规则`, { domains });
      
      const allRules = await this.getRules();
      
      if (allRules.success === false) {
        return allRules;
      }
      
      if (domains && domains.length > 0) {
        const filtered = {};
        let exportedCount = 0;
        
        domains.forEach(domain => {
          if (allRules[domain]) {
            filtered[domain] = allRules[domain];
            exportedCount += allRules[domain].length;
          }
        });
        
        Logger.info(this.moduleName, `规则导出成功`, { 
          type: 'filtered',
          domainsCount: Object.keys(filtered).length,
          rulesCount: exportedCount
        });
        
        return { success: true, data: filtered };
      }
      
      let totalRules = 0;
      Object.values(allRules).forEach(rules => {
        totalRules += Array.isArray(rules) ? rules.length : 0;
      });
      
      Logger.info(this.moduleName, `规则导出成功`, { 
        type: 'all',
        domainsCount: Object.keys(allRules).length,
        rulesCount: totalRules
      });
      
      return { success: true, data: allRules };
    });
  }

  async importRules(rulesData, merge = true) {
    return tryCatch(this.moduleName, `导入规则 (合并模式: ${merge})`, async () => {
      Logger.groupStart('导入规则');
      
      let parsedData;
      
      if (typeof rulesData === 'string') {
        try {
          parsedData = JSON.parse(rulesData);
          Logger.debug(this.moduleName, '规则数据已解析');
        } catch (parseError) {
          Logger.error(this.moduleName, 'JSON 解析失败', parseError);
          Logger.groupEnd();
          return { success: false, error: `JSON 解析失败: ${parseError.message}` };
        }
      } else {
        parsedData = rulesData;
      }
      
      Logger.debug(this.moduleName, '规则数据预览', { 
        domains: Object.keys(parsedData),
        merge
      });
      
      let currentRules = {};
      if (merge) {
        const existing = await this.getRules();
        if (existing.success !== false) {
          currentRules = existing;
        }
        Logger.debug(this.moduleName, '合并模式 - 已加载现有规则');
      }
      
      let importedCount = 0;
      const importDetails = [];
      
      for (const [domain, rules] of Object.entries(parsedData)) {
        if (!Array.isArray(rules)) {
          Logger.warn(this.moduleName, `跳过无效域名数据`, { domain });
          continue;
        }
        
        if (!currentRules[domain]) {
          currentRules[domain] = [];
        }
        
        let domainImported = 0;
        
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
            Logger.debug(this.moduleName, '更新已有规则', { domain, ruleId: rule.id });
          } else {
            currentRules[domain].push(rule);
            Logger.debug(this.moduleName, '添加新规则', { domain, ruleId: rule.id });
          }
          domainImported++;
          importedCount++;
        }
        
        importDetails.push({ domain, count: domainImported });
      }
      
      await chrome.storage.local.set({ [this.rulesKey]: currentRules });
      
      Logger.info(this.moduleName, `规则导入成功`, { 
        totalImported: importedCount,
        details: importDetails
      });
      
      Logger.groupEnd();
      return { success: true, imported: importedCount, details: importDetails };
    });
  }

  async getConfig() {
    return tryCatch(this.moduleName, '获取配置', async () => {
      Logger.debug(this.moduleName, '正在获取配置...');
      
      const result = await chrome.storage.local.get({ [this.configKey]: DEFAULT_CONFIG });
      const config = { ...DEFAULT_CONFIG, ...result[this.configKey] };
      
      Logger.debug(this.moduleName, '配置获取成功', { 
        keys: Object.keys(config) 
      });
      
      return config;
    });
  }

  async saveConfig(config) {
    return tryCatch(this.moduleName, '保存配置', async () => {
      Logger.info(this.moduleName, '开始保存配置', { 
        updatedKeys: Object.keys(config) 
      });
      
      const currentConfig = await this.getConfig();
      
      if (currentConfig.success === false) {
        return currentConfig;
      }
      
      const mergedConfig = { ...currentConfig, ...config };
      
      await chrome.storage.local.set({ [this.configKey]: mergedConfig });
      
      Logger.info(this.moduleName, '配置保存成功');
      return { success: true };
    });
  }

  generateId() {
    const id = 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    Logger.debug('RulesManager', '生成规则ID', { id });
    return id;
  }
}

// ==================== 消息处理 ====================

const rulesManager = new RulesManager();

async function handleMessage(message, sender) {
  const module = 'MessageHandler';
  const tabId = sender.tab ? sender.tab.id : null;
  const senderUrl = sender.tab?.url || 'N/A';
  
  Logger.groupStart(`处理消息 - ${message.action}`);
  Logger.debug(module, '消息详情', { 
    action: message.action,
    tabId,
    senderUrl,
    hasTab: !!sender.tab,
    messageKeys: Object.keys(message)
  });
  
  try {
    let result;
    
    switch (message.action) {
      case 'getRules':
        Logger.info(module, '获取规则请求', { domain: message.domain });
        result = await rulesManager.getRules(message.domain);
        break;
      
      case 'saveRule':
        Logger.info(module, '保存规则请求', { 
          domain: message.domain,
          ruleName: message.rule?.name 
        });
        result = await rulesManager.saveRule(message.domain, message.rule);
        break;
      
      case 'deleteRule':
        Logger.info(module, '删除规则请求', { 
          domain: message.domain,
          ruleId: message.ruleId 
        });
        result = await rulesManager.deleteRule(message.domain, message.ruleId);
        break;
      
      case 'setDefaultRule':
        Logger.info(module, '设置默认规则请求', { 
          domain: message.domain,
          ruleId: message.ruleId 
        });
        result = await rulesManager.setDefaultRule(message.domain, message.ruleId);
        break;
      
      case 'clearAllRules':
        Logger.warn(module, '清空所有规则请求');
        result = await rulesManager.clearAllRules();
        break;
      
      case 'exportRules':
        Logger.info(module, '导出规则请求', { domains: message.domains });
        result = await rulesManager.exportRules(message.domains);
        break;
      
      case 'importRules':
        Logger.info(module, '导入规则请求', { 
          merge: message.merge !== false,
          dataType: typeof message.rulesData
        });
        result = await rulesManager.importRules(message.rulesData, message.merge !== false);
        break;
      
      case 'getConfig':
        Logger.debug(module, '获取配置请求');
        result = await rulesManager.getConfig();
        break;
      
      case 'saveConfig':
        Logger.info(module, '保存配置请求', { 
          keys: Object.keys(message.config || {})
        });
        result = await rulesManager.saveConfig(message.config);
        break;
      
      case 'extractContent':
        Logger.info(module, '提取内容请求', { 
          targetTabId: tabId || message.tabId,
          format: message.format 
        });
        result = await executeInTab(tabId || message.tabId, 'extractContent', { format: message.format });
        break;
      
      case 'manualSelection':
        Logger.info(module, '手动选择请求', { targetTabId: tabId || message.tabId });
        result = await executeInTab(tabId || message.tabId, 'manualSelection');
        break;
      
      case 'getAllRules':
        Logger.info(module, '获取所有规则请求');
        result = await rulesManager.getRules();
        break;
      
      default:
        Logger.warn(module, '未知操作', { action: message.action });
        result = { success: false, error: 'Unknown action: ' + message.action };
    }
    
    Logger.debug(module, '处理结果', { success: result.success });
    Logger.groupEnd();
    return result;
    
  } catch (error) {
    const errResult = wrapError(module, `处理消息 ${message.action}`, error);
    Logger.groupEnd();
    return errResult;
  }
}

async function executeInTab(tabId, action, data = {}) {
  const module = 'TabExecutor';
  
  Logger.groupStart(`执行标签页操作 - ${action}`);
  
  try {
    let targetTabId = tabId;
    
    if (!targetTabId) {
      Logger.debug(module, '获取活动标签页...');
      
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!activeTab) {
        Logger.error(module, '未找到活动标签页');
        Logger.groupEnd();
        return { success: false, error: 'No active tab found' };
      }
      
      targetTabId = activeTab.id;
      Logger.debug(module, '使用活动标签页', { 
        tabId: targetTabId,
        title: activeTab.title,
        url: activeTab.url
      });
    }
    
    Logger.info(module, '发送消息到标签页', { 
      tabId: targetTabId,
      action,
      dataKeys: Object.keys(data)
    });
    
    const response = await chrome.tabs.sendMessage(targetTabId, { action, ...data });
    
    Logger.info(module, '收到标签页响应', { 
      tabId: targetTabId,
      responseSuccess: response?.success,
      responseType: typeof response
    });
    
    Logger.groupEnd();
    return response || { success: true };
    
  } catch (error) {
    const errResult = wrapError(module, `执行标签页操作 ${action}`, error);
    
    if (error.message && error.message.includes('receiving end')) {
      Logger.warn(module, 'Content Script 未就绪 - 可能需要刷新页面或检查扩展加载状态');
    }
    
    Logger.groupEnd();
    return errResult;
  }
}

// ==================== 上下文菜单 ====================

function createContextMenus() {
  const module = 'ContextMenu';
  
  Logger.info(module, '正在创建上下文菜单...');
  
  const menuItems = [
    { id: 'wce-extract', title: '提取页面内容', contexts: ['page'] },
    { id: 'wce-manual', title: '手动选择内容', contexts: ['page'] },
    { id: 'wce-separator-1', type: 'separator', contexts: ['page'] },
    { id: 'wce-selection-extract', title: '提取选中内容', contexts: ['selection'] },
    { id: 'wce-copy-plain', title: '复制为纯文本', contexts: ['selection'] },
    { id: 'wce-copy-rich', title: '复制为富文本', contexts: ['selection'] }
  ];
  
  let successCount = 0;
  
  for (const item of menuItems) {
    try {
      chrome.contextMenus.create(item, () => {
        if (chrome.runtime.lastError) {
          Logger.warn(module, `创建菜单项失败: ${item.id}`, chrome.runtime.lastError);
        } else {
          Logger.debug(module, `菜单项创建成功: ${item.id}`);
        }
      });
      successCount++;
    } catch (error) {
      Logger.error(module, `创建菜单项异常: ${item.id}`, error);
    }
  }
  
  Logger.info(module, `上下文菜单创建完成`, { 
    total: menuItems.length, 
    successful: successCount 
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const module = 'ContextMenuHandler';
  const tabId = tab?.id;
  
  Logger.info(module, '上下文菜单点击', { 
    menuItemId: info.menuItemId,
    tabId,
    tabUrl: tab?.url
  });
  
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
      default:
        Logger.warn(module, '未知菜单项', { menuItemId: info.menuItemId });
    }
  } catch (error) {
    Logger.error(module, '上下文菜单处理失败', error);
  }
});

// ==================== 命令监听 ====================

chrome.commands.onCommand.addListener(async (command) => {
  const module = 'CommandHandler';
  
  Logger.info(module, '收到快捷键命令', { command });
  
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab) {
      Logger.warn(module, '未找到活动标签页');
      return;
    }
    
    Logger.debug(module, '目标标签页', { 
      tabId: activeTab.id,
      title: activeTab.title 
    });
    
    switch (command) {
      case 'extract-content':
        Logger.info(module, '执行提取内容命令');
        await executeInTab(activeTab.id, 'extractContent');
        break;
      case 'manual-selection':
        Logger.info(module, '执行手动选择命令');
        await executeInTab(activeTab.id, 'manualSelection');
        break;
      default:
        Logger.warn(module, '未知命令', { command });
    }
  } catch (error) {
    Logger.error(module, '命令处理失败', error);
  }
});

// ==================== 消息监听 ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const module = 'RuntimeMessage';
  
  Logger.debug(module, '收到运行时消息', { 
    action: message?.action,
    hasSender: !!sender,
    senderTab: sender?.tab?.id
  });
  
  handleMessage(message, sender)
    .then(response => {
      Logger.debug(module, '发送响应', { success: response?.success });
      sendResponse(response);
    })
    .catch(error => {
      const errResult = wrapError(module, '消息处理', error);
      sendResponse(errResult);
    });
  
  return true;
});

// ==================== 运行时错误监听 ====================

if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    Logger.info('Runtime', '扩展已安装/更新', { 
      reason: details.reason,
      previousVersion: details.previousVersion
    });
  });
}

// ==================== 初始化 ====================

async function init() {
  const module = 'Init';
  
  console.log('');
  Logger.info(module, '========================================');
  Logger.info(module, '  WebContentExtractor v2.0.1 初始化');
  Logger.info(module, '========================================');
  console.log('');
  
  Logger.info(module, '调试模式已启用，详细日志将输出到控制台');
  Logger.info(module, '调试提示:');
  Logger.info(module, '  1. 打开 chrome://extensions/');
  Logger.info(module, '  2. 找到 WebContentExtractor');
  Logger.info(module, '  3. 点击 "Service Worker" 查看后台日志');
  Logger.info(module, '  4. 在网页按 F12 查看 Content Script 日志');
  console.log('');
  
  try {
    createContextMenus();
    Logger.info(module, '扩展初始化完成 ✓');
  } catch (error) {
    Logger.warn(module, '创建上下文菜单失败（可能已存在）', error);
  }
}

init();
