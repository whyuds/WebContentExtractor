/**
 * WebContentExtractor - Options Script
 * 选项页面交互逻辑
 */

'use strict';

// ==================== 全局变量 ====================

let allRules = {};
let config = {};
let excludeSelectors = [
  '.advertisement',
  '.ad',
  '#comments',
  '.comments',
  '#sidebar',
  '.sidebar',
  'nav',
  'footer',
  'aside'
];
let currentEditRule = null;
let confirmCallback = null;

// ==================== DOM 元素 ====================

const elements = {
  navButtons: document.querySelectorAll('.nav-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  
  defaultFormat: document.getElementById('defaultFormat'),
  autoExtract: document.getElementById('autoExtract'),
  autoCopy: document.getElementById('autoCopy'),
  showHighlights: document.getElementById('showHighlights'),
  removeAds: document.getElementById('removeAds'),
  preserveLinks: document.getElementById('preserveLinks'),
  preserveImages: document.getElementById('preserveImages'),
  cleanEmptyLines: document.getElementById('cleanEmptyLines'),
  normalizeWhitespace: document.getElementById('normalizeWhitespace'),
  toastDuration: document.getElementById('toastDuration'),
  
  btnImportRules: document.getElementById('btnImportRules'),
  btnExportRules: document.getElementById('btnExportRules'),
  btnClearAllRules: document.getElementById('btnClearAllRules'),
  rulesSearch: document.getElementById('rulesSearch'),
  rulesEmptyState: document.getElementById('rulesEmptyState'),
  rulesList: document.getElementById('rulesList'),
  
  ruleEditorCard: document.getElementById('ruleEditorCard'),
  ruleEditorTitle: document.getElementById('ruleEditorTitle'),
  btnCloseRuleEditor: document.getElementById('btnCloseRuleEditor'),
  ruleEditId: document.getElementById('ruleEditId'),
  ruleDomain: document.getElementById('ruleDomain'),
  ruleName: document.getElementById('ruleName'),
  ruleSelectorType: document.getElementById('ruleSelectorType'),
  ruleSelector: document.getElementById('ruleSelector'),
  ruleIsDefault: document.getElementById('ruleIsDefault'),
  ruleDescription: document.getElementById('ruleDescription'),
  btnCancelRuleEdit: document.getElementById('btnCancelRuleEdit'),
  ruleEditorForm: document.getElementById('ruleEditorForm'),
  
  minTextLength: document.getElementById('minTextLength'),
  textDensityThreshold: document.getElementById('textDensityThreshold'),
  extractTimeout: document.getElementById('extractTimeout'),
  enableLazyLoadDetection: document.getElementById('enableLazyLoadDetection'),
  enableDynamicContent: document.getElementById('enableDynamicContent'),
  
  excludeList: document.getElementById('excludeList'),
  newExcludeSelector: document.getElementById('newExcludeSelector'),
  btnAddExclude: document.getElementById('btnAddExclude'),
  
  btnExportAllData: document.getElementById('btnExportAllData'),
  btnImportAllData: document.getElementById('btnImportAllData'),
  btnResetAll: document.getElementById('btnResetAll'),
  
  fileInput: document.getElementById('fileInput'),
  
  confirmModal: document.getElementById('confirmModal'),
  confirmModalTitle: document.getElementById('confirmModalTitle'),
  confirmModalMessage: document.getElementById('confirmModalMessage'),
  btnConfirmCancel: document.getElementById('btnConfirmCancel'),
  btnConfirmOk: document.getElementById('btnConfirmOk')
};

// ==================== 初始化 ====================

async function init() {
  setupEventListeners();
  await loadConfig();
  await loadRules();
  await loadExcludeSelectors();
}

function setupEventListeners() {
  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  const configInputs = [
    'defaultFormat', 'autoExtract', 'autoCopy', 'showHighlights',
    'removeAds', 'preserveLinks', 'preserveImages', 'cleanEmptyLines',
    'normalizeWhitespace', 'toastDuration', 'minTextLength',
    'textDensityThreshold', 'extractTimeout', 'enableLazyLoadDetection',
    'enableDynamicContent'
  ];
  
  configInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === 'checkbox') {
        el.addEventListener('change', saveConfig);
      } else {
        el.addEventListener('change', saveConfig);
        el.addEventListener('input', debounce(saveConfig, 500));
      }
    }
  });

  elements.btnImportRules.addEventListener('click', () => importData('rules'));
  elements.btnExportRules.addEventListener('click', exportRules);
  elements.btnClearAllRules.addEventListener('click', () => {
    showConfirm('清空所有规则', '确定要清空所有保存的规则吗？此操作无法撤销。', () => {
      clearAllRules();
    });
  });
  elements.rulesSearch.addEventListener('input', filterRules);

  elements.btnCloseRuleEditor.addEventListener('click', closeRuleEditor);
  elements.btnCancelRuleEdit.addEventListener('click', closeRuleEditor);
  elements.ruleEditorForm.addEventListener('submit', handleRuleFormSubmit);

  elements.btnAddExclude.addEventListener('click', addExcludeSelector);
  elements.newExcludeSelector.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addExcludeSelector();
    }
  });

  elements.btnExportAllData.addEventListener('click', exportAllData);
  elements.btnImportAllData.addEventListener('click', () => importData('all'));
  elements.btnResetAll.addEventListener('click', () => {
    showConfirm('重置所有设置', '确定要重置为默认设置吗？所有规则和配置将被清除。此操作无法撤销。', () => {
      resetAll();
    });
  });

  elements.fileInput.addEventListener('change', handleFileImport);

  elements.btnConfirmCancel.addEventListener('click', hideConfirm);
  elements.btnConfirmOk.addEventListener('click', () => {
    if (confirmCallback) {
      confirmCallback();
      confirmCallback = null;
    }
    hideConfirm();
  });
}

// ==================== 标签页切换 ====================

function switchTab(tabId) {
  elements.navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  elements.tabContents.forEach(tab => {
    tab.classList.toggle('active', tab.id === `tab-${tabId}`);
  });
}

// ==================== 配置管理 ====================

async function loadConfig() {
  try {
    config = await chrome.runtime.sendMessage({ action: 'getConfig' });
    
    elements.defaultFormat.value = config.defaultFormat || 'html';
    elements.autoExtract.checked = config.autoExtract || false;
    elements.autoCopy.checked = config.autoCopy !== false;
    elements.showHighlights.checked = config.showHighlights !== false;
    elements.removeAds.checked = config.removeAds !== false;
    elements.preserveLinks.checked = config.preserveLinks !== false;
    elements.preserveImages.checked = config.preserveImages !== false;
    elements.cleanEmptyLines.checked = config.cleanEmptyLines !== false;
    elements.normalizeWhitespace.checked = config.normalizeWhitespace !== false;
    elements.toastDuration.value = config.toastDuration || 3000;
    elements.minTextLength.value = config.minTextLength || 200;
    elements.textDensityThreshold.value = config.textDensityThreshold || 25;
    elements.extractTimeout.value = config.extractTimeout || 5000;
    elements.enableLazyLoadDetection.checked = config.enableLazyLoadDetection || false;
    elements.enableDynamicContent.checked = config.enableDynamicContent || false;
    
    if (config.excludeSelectors && Array.isArray(config.excludeSelectors)) {
      excludeSelectors = config.excludeSelectors;
      renderExcludeSelectors();
    }
  } catch (error) {
    console.error('[Options] Failed to load config:', error);
    showToast('加载配置失败', 'error');
  }
}

async function saveConfig() {
  const newConfig = {
    defaultFormat: elements.defaultFormat.value,
    autoExtract: elements.autoExtract.checked,
    autoCopy: elements.autoCopy.checked,
    showHighlights: elements.showHighlights.checked,
    removeAds: elements.removeAds.checked,
    preserveLinks: elements.preserveLinks.checked,
    preserveImages: elements.preserveImages.checked,
    cleanEmptyLines: elements.cleanEmptyLines.checked,
    normalizeWhitespace: elements.normalizeWhitespace.checked,
    toastDuration: parseInt(elements.toastDuration.value) || 3000,
    minTextLength: parseInt(elements.minTextLength.value) || 200,
    textDensityThreshold: parseInt(elements.textDensityThreshold.value) || 25,
    extractTimeout: parseInt(elements.extractTimeout.value) || 5000,
    enableLazyLoadDetection: elements.enableLazyLoadDetection.checked,
    enableDynamicContent: elements.enableDynamicContent.checked,
    excludeSelectors: excludeSelectors
  };
  
  try {
    await chrome.runtime.sendMessage({
      action: 'saveConfig',
      config: newConfig
    });
    config = newConfig;
  } catch (error) {
    console.error('[Options] Failed to save config:', error);
  }
}

// ==================== 规则管理 ====================

async function loadRules() {
  try {
    allRules = await chrome.runtime.sendMessage({ action: 'getAllRules' });
    renderRulesList();
  } catch (error) {
    console.error('[Options] Failed to load rules:', error);
  }
}

function renderRulesList(filterText = '') {
  const domains = Object.keys(allRules);
  
  if (domains.length === 0) {
    elements.rulesEmptyState.style.display = 'block';
    elements.rulesList.style.display = 'none';
    return;
  }

  let hasVisibleItems = false;
  let html = '';
  
  for (const domain of domains) {
    const rules = allRules[domain];
    
    const domainMatches = filterText === '' || domain.toLowerCase().includes(filterText.toLowerCase());
    
    for (const rule of rules) {
      const ruleMatches = filterText === '' || 
        domain.toLowerCase().includes(filterText.toLowerCase()) ||
        rule.name.toLowerCase().includes(filterText.toLowerCase()) ||
        (rule.xpath && rule.xpath.toLowerCase().includes(filterText.toLowerCase()));
      
      if (!ruleMatches) continue;
      
      hasVisibleItems = true;
      
      html += `
        <div class="rule-item ${rule.isDefault ? 'default' : ''}" data-domain="${domain}" data-rule-id="${rule.id}">
          <div class="rule-info">
            <div class="rule-header">
              <span class="rule-name">${escapeHtml(rule.name)}</span>
              ${rule.isDefault ? '<span class="rule-badge">默认</span>' : ''}
            </div>
            <div class="rule-domain">${escapeHtml(domain)}</div>
            <div class="rule-selector">${escapeHtml(rule.xpath || rule.selector || '')}</div>
          </div>
          <div class="rule-actions">
            <button class="btn btn-secondary" data-action="edit">编辑</button>
            <button class="btn btn-secondary" data-action="setDefault" ${rule.isDefault ? 'disabled' : ''}>设为默认</button>
            <button class="btn btn-danger" data-action="delete">删除</button>
          </div>
        </div>
      `;
    }
  }

  if (hasVisibleItems) {
    elements.rulesEmptyState.style.display = 'none';
    elements.rulesList.style.display = 'block';
    elements.rulesList.innerHTML = html;
    
    elements.rulesList.querySelectorAll('.rule-item').forEach(item => {
      const domain = item.dataset.domain;
      const ruleId = item.dataset.ruleId;
      const rule = allRules[domain]?.find(r => r.id === ruleId);
      
      item.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          
          switch (action) {
            case 'edit':
              openRuleEditor(domain, rule);
              break;
            case 'setDefault':
              await setDefaultRule(domain, ruleId);
              break;
            case 'delete':
              showConfirm('删除规则', `确定要删除规则 "${rule?.name}" 吗？`, async () => {
                await deleteRule(domain, ruleId);
              });
              break;
          }
        });
      });
    });
  } else {
    elements.rulesEmptyState.style.display = 'block';
    elements.rulesList.style.display = 'none';
  }
}

function filterRules() {
  const filterText = elements.rulesSearch.value.trim();
  renderRulesList(filterText);
}

function openRuleEditor(domain, rule = null) {
  currentEditRule = { domain, rule };
  
  elements.ruleEditorTitle.textContent = rule ? '编辑规则' : '新建规则';
  elements.ruleEditId.value = rule?.id || '';
  elements.ruleDomain.value = domain || '';
  elements.ruleName.value = rule?.name || '';
  elements.ruleSelectorType.value = rule?.selectorType || (rule?.xpath ? 'xpath' : 'css');
  elements.ruleSelector.value = rule?.xpath || rule?.selector || '';
  elements.ruleIsDefault.checked = rule?.isDefault || false;
  elements.ruleDescription.value = rule?.description || '';
  
  elements.ruleEditorCard.style.display = 'block';
}

function closeRuleEditor() {
  elements.ruleEditorCard.style.display = 'none';
  currentEditRule = null;
}

async function handleRuleFormSubmit(e) {
  e.preventDefault();
  
  const domain = elements.ruleDomain.value.trim();
  const name = elements.ruleName.value.trim();
  const selectorType = elements.ruleSelectorType.value;
  const selector = elements.ruleSelector.value.trim();
  const isDefault = elements.ruleIsDefault.checked;
  const description = elements.ruleDescription.value.trim();
  const editId = elements.ruleEditId.value;
  
  if (!domain) {
    showToast('请输入站点域名', 'error');
    return;
  }
  
  if (!name) {
    showToast('请输入规则名称', 'error');
    return;
  }
  
  if (!selector) {
    showToast('请输入选择器表达式', 'error');
    return;
  }
  
  const rule = {
    name: name,
    selectorType: selectorType,
    xpath: selectorType === 'xpath' ? selector : '',
    selector: selectorType === 'css' ? selector : '',
    isDefault: isDefault,
    description: description
  };
  
  if (editId) {
    rule.id = editId;
  }
  
  try {
    await chrome.runtime.sendMessage({
      action: 'saveRule',
      domain: domain,
      rule: rule
    });
    
    showToast(editId ? '规则已更新' : '规则已保存', 'success');
    closeRuleEditor();
    await loadRules();
  } catch (error) {
    console.error('[Options] Failed to save rule:', error);
    showToast('保存规则失败', 'error');
  }
}

async function setDefaultRule(domain, ruleId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'setDefaultRule',
      domain: domain,
      ruleId: ruleId
    });
    
    showToast('已设为默认规则', 'success');
    await loadRules();
  } catch (error) {
    console.error('[Options] Failed to set default rule:', error);
    showToast('操作失败', 'error');
  }
}

async function deleteRule(domain, ruleId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'deleteRule',
      domain: domain,
      ruleId: ruleId
    });
    
    showToast('规则已删除', 'success');
    await loadRules();
  } catch (error) {
    console.error('[Options] Failed to delete rule:', error);
    showToast('删除失败', 'error');
  }
}

async function clearAllRules() {
  try {
    await chrome.runtime.sendMessage({ action: 'clearAllRules' });
    showToast('所有规则已清空', 'success');
    await loadRules();
  } catch (error) {
    console.error('[Options] Failed to clear rules:', error);
    showToast('操作失败', 'error');
  }
}

async function exportRules() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportRules' });
    
    if (response && response.data) {
      const jsonStr = JSON.stringify(response.data, null, 2);
      downloadFile(jsonStr, `wce-rules-${formatDate(new Date())}.json`, 'application/json');
      showToast('规则已导出', 'success');
    }
  } catch (error) {
    console.error('[Options] Failed to export rules:', error);
    showToast('导出失败', 'error');
  }
}

async function exportAllData() {
  try {
    const rulesResponse = await chrome.runtime.sendMessage({ action: 'exportRules' });
    const config = await chrome.runtime.sendMessage({ action: 'getConfig' });
    
    const exportData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      config: config,
      rules: rulesResponse?.data || {}
    };
    
    const jsonStr = JSON.stringify(exportData, null, 2);
    downloadFile(jsonStr, `wce-backup-${formatDate(new Date())}.json`, 'application/json');
    showToast('所有数据已导出', 'success');
  } catch (error) {
    console.error('[Options] Failed to export all data:', error);
    showToast('导出失败', 'error');
  }
}

let importType = 'rules';

function importData(type) {
  importType = type;
  elements.fileInput.click();
}

async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await readFileAsText(file);
    const data = JSON.parse(text);
    
    if (importType === 'all') {
      if (data.config) {
        await chrome.runtime.sendMessage({
          action: 'saveConfig',
          config: data.config
        });
      }
      
      if (data.rules) {
        await chrome.runtime.sendMessage({
          action: 'importRules',
          rulesData: data.rules,
          merge: true
        });
      }
      
      showToast('数据导入成功', 'success');
    } else {
      await chrome.runtime.sendMessage({
        action: 'importRules',
        rulesData: data,
        merge: true
      });
      
      showToast('规则导入成功', 'success');
    }
    
    await loadConfig();
    await loadRules();
    
  } catch (error) {
    console.error('[Options] Failed to import data:', error);
    showToast('导入失败: ' + error.message, 'error');
  }
  
  elements.fileInput.value = '';
}

async function resetAll() {
  try {
    await chrome.runtime.sendMessage({ action: 'clearAllRules' });
    
    await chrome.runtime.sendMessage({
      action: 'saveConfig',
      config: {
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
        enableLazyLoadDetection: false,
        enableDynamicContent: false,
        textDensityThreshold: 25,
        excludeSelectors: [
          '.advertisement', '.ad', '#comments', '.comments',
          '#sidebar', '.sidebar', 'nav', 'footer', 'aside'
        ]
      }
    });
    
    showToast('已重置为默认设置', 'success');
    await loadConfig();
    await loadRules();
    
  } catch (error) {
    console.error('[Options] Failed to reset:', error);
    showToast('重置失败', 'error');
  }
}

// ==================== 排除选择器管理 ====================

function renderExcludeSelectors() {
  if (excludeSelectors.length === 0) {
    elements.excludeList.innerHTML = '<div class="exclude-item"><span class="exclude-selector">暂无自定义排除项</span></div>';
    return;
  }
  
  elements.excludeList.innerHTML = excludeSelectors.map((selector, index) => `
    <div class="exclude-item" data-index="${index}">
      <span class="exclude-selector">${escapeHtml(selector)}</span>
      <button class="exclude-remove" title="移除">×</button>
    </div>
  `).join('');
  
  elements.excludeList.querySelectorAll('.exclude-item').forEach(item => {
    const index = parseInt(item.dataset.index);
    const removeBtn = item.querySelector('.exclude-remove');
    
    removeBtn.addEventListener('click', () => {
      excludeSelectors.splice(index, 1);
      renderExcludeSelectors();
      saveConfig();
    });
  });
}

function addExcludeSelector() {
  const selector = elements.newExcludeSelector.value.trim();
  
  if (!selector) {
    showToast('请输入选择器', 'error');
    return;
  }
  
  if (excludeSelectors.includes(selector)) {
    showToast('该选择器已存在', 'error');
    return;
  }
  
  excludeSelectors.push(selector);
  elements.newExcludeSelector.value = '';
  renderExcludeSelectors();
  saveConfig();
  showToast('选择器已添加', 'success');
}

// ==================== 排除选择器列表加载 ====================

async function loadExcludeSelectors() {
  try {
    const config = await chrome.runtime.sendMessage({ action: 'getConfig' });
    
    if (config.excludeSelectors && Array.isArray(config.excludeSelectors)) {
      excludeSelectors = config.excludeSelectors;
    }
    
    renderExcludeSelectors();
  } catch (error) {
    console.error('[Options] Failed to load exclude selectors:', error);
  }
}

// ==================== 辅助函数 ====================

function showConfirm(title, message, callback) {
  elements.confirmModalTitle.textContent = title;
  elements.confirmModalMessage.textContent = message;
  confirmCallback = callback;
  elements.confirmModal.style.display = 'flex';
}

function hideConfirm() {
  elements.confirmModal.style.display = 'none';
  confirmCallback = null;
}

function showToast(message, type = 'success') {
  let toast = document.querySelector('.wce-options-toast');
  if (toast) {
    toast.remove();
  }
  
  toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', init);
