/**
 * WebContentExtractor - Popup Script
 * 弹出窗口交互逻辑
 */

'use strict';

// ==================== 全局变量 ====================

let currentTab = null;
let currentDomain = null;
let extractedContent = null;
let selectedFormat = 'html';
let config = null;

// ==================== DOM 元素 ====================

const elements = {
  pageTitle: document.getElementById('pageTitle'),
  pageUrl: document.getElementById('pageUrl'),
  btnExtract: document.getElementById('btnExtract'),
  btnManual: document.getElementById('btnManual'),
  formatButtons: document.querySelectorAll('.btn-format'),
  quickActions: document.getElementById('quickActions'),
  btnCopyContent: document.getElementById('btnCopyContent'),
  btnDownload: document.getElementById('btnDownload'),
  btnSaveRule: document.getElementById('btnSaveRule'),
  btnClearFormat: document.getElementById('btnClearFormat'),
  rulesSection: document.getElementById('rulesSection'),
  rulesList: document.getElementById('rulesList'),
  btnManageRules: document.getElementById('btnManageRules'),
  statusPanel: document.getElementById('statusPanel'),
  statusMessage: document.getElementById('statusMessage'),
  selectionModeIndicator: document.getElementById('selectionModeIndicator'),
  btnCancelSelection: document.getElementById('btnCancelSelection'),
  btnSettings: document.getElementById('btnSettings'),
  linkOptions: document.getElementById('linkOptions'),
  
  ruleModal: document.getElementById('ruleModal'),
  ruleName: document.getElementById('ruleName'),
  ruleSelector: document.getElementById('ruleSelector'),
  ruleIsDefault: document.getElementById('ruleIsDefault'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  btnCancelSaveRule: document.getElementById('btnCancelSaveRule'),
  btnConfirmSaveRule: document.getElementById('btnConfirmSaveRule'),
  
  exportModal: document.getElementById('exportModal'),
  exportFormat: document.getElementById('exportFormat'),
  exportFilename: document.getElementById('exportFilename'),
  exportIncludeTitle: document.getElementById('exportIncludeTitle'),
  exportIncludeUrl: document.getElementById('exportIncludeUrl'),
  btnCloseExportModal: document.getElementById('btnCloseExportModal'),
  btnCancelExport: document.getElementById('btnCancelExport'),
  btnConfirmExport: document.getElementById('btnConfirmExport')
};

// ==================== 初始化 ====================

async function init() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      currentTab = tabs[0];
      updatePageInfo();
      currentDomain = extractDomain(currentTab.url);
      await loadRules();
      await loadConfig();
    }
  } catch (error) {
    console.error('[Popup] Initialization error:', error);
    showStatus('初始化失败: ' + error.message, 'error');
  }
  
  setupEventListeners();
}

function setupEventListeners() {
  elements.btnExtract.addEventListener('click', handleExtract);
  elements.btnManual.addEventListener('click', handleManualSelection);
  elements.btnCopyContent.addEventListener('click', handleCopyContent);
  elements.btnDownload.addEventListener('click', handleDownload);
  elements.btnSaveRule.addEventListener('click', handleSaveRule);
  elements.btnClearFormat.addEventListener('click', handleClearFormat);
  elements.btnCancelSelection.addEventListener('click', handleCancelSelection);
  elements.btnSettings.addEventListener('click', openOptions);
  elements.linkOptions.addEventListener('click', openOptions);
  elements.btnManageRules.addEventListener('click', openOptions);
  
  elements.formatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.formatButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFormat = btn.dataset.format;
      showToast(`已切换到${btn.querySelector('span:last-child').textContent}格式`);
    });
  });
  
  elements.btnCloseModal.addEventListener('click', closeRuleModal);
  elements.btnCancelSaveRule.addEventListener('click', closeRuleModal);
  elements.btnConfirmSaveRule.addEventListener('click', confirmSaveRule);
  
  elements.btnCloseExportModal.addEventListener('click', closeExportModal);
  elements.btnCancelExport.addEventListener('click', closeExportModal);
  elements.btnConfirmExport.addEventListener('click', confirmExport);
  
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
}

// ==================== 页面信息 ====================

function updatePageInfo() {
  if (currentTab) {
    elements.pageTitle.textContent = currentTab.title || '未知页面';
    elements.pageUrl.textContent = currentTab.url || '';
  }
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

// ==================== 配置加载 ====================

async function loadConfig() {
  try {
    config = await chrome.runtime.sendMessage({ action: 'getConfig' });
    
    if (config && config.defaultFormat) {
      selectedFormat = config.defaultFormat;
      elements.formatButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === selectedFormat);
      });
    }
  } catch (error) {
    console.warn('[Popup] Failed to load config:', error);
  }
}

// ==================== 规则管理 ====================

async function loadRules() {
  if (!currentDomain) return;
  
  try {
    const rules = await chrome.runtime.sendMessage({ 
      action: 'getRules', 
      domain: currentDomain 
    });
    
    if (rules && rules.length > 0) {
      elements.rulesSection.style.display = 'block';
      renderRulesList(rules);
    } else {
      elements.rulesSection.style.display = 'none';
    }
  } catch (error) {
    console.warn('[Popup] Failed to load rules:', error);
  }
}

function renderRulesList(rules) {
  if (rules.length === 0) {
    elements.rulesList.innerHTML = '<p class="no-rules">暂无规则</p>';
    return;
  }
  
  elements.rulesList.innerHTML = rules.map(rule => `
    <div class="rule-item ${rule.isDefault ? 'default' : ''}" data-rule-id="${rule.id}">
      <div class="rule-info">
        <span class="rule-name">${escapeHtml(rule.name)}</span>
        ${rule.isDefault ? '<span class="rule-badge">默认</span>' : ''}
      </div>
      <div class="rule-actions">
        <button class="btn-rule-action" data-action="apply" title="应用规则">▶</button>
        <button class="btn-rule-action" data-action="edit" title="编辑">✏</button>
        <button class="btn-rule-action" data-action="delete" title="删除">×</button>
      </div>
    </div>
  `).join('');
  
  elements.rulesList.querySelectorAll('.rule-item').forEach(item => {
    const ruleId = item.dataset.ruleId;
    const rule = rules.find(r => r.id === ruleId);
    
    item.querySelectorAll('.btn-rule-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        
        switch (action) {
          case 'apply':
            await applyRule(rule);
            break;
          case 'edit':
            openRuleModal(rule);
            break;
          case 'delete':
            await deleteRule(ruleId);
            break;
        }
      });
    });
  });
}

async function applyRule(rule) {
  if (!currentTab) return;
  
  try {
    showStatus('正在应用规则...', 'info');
    
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'applyRule',
      rule: rule,
      format: selectedFormat
    });
    
    if (response && response.success) {
      extractedContent = response.content;
      elements.quickActions.style.display = 'block';
      showStatus('规则应用成功', 'success');
      
      if (config && config.autoCopy) {
        copyContentToClipboard();
      }
    } else {
      showStatus('规则应用失败: ' + (response?.error || '未知错误'), 'error');
    }
  } catch (error) {
    showStatus('应用规则时出错: ' + error.message, 'error');
  }
}

async function deleteRule(ruleId) {
  if (!currentDomain) return;
  
  if (!confirm('确定要删除这个规则吗？')) return;
  
  try {
    await chrome.runtime.sendMessage({
      action: 'deleteRule',
      domain: currentDomain,
      ruleId: ruleId
    });
    
    showToast('规则已删除');
    await loadRules();
  } catch (error) {
    showStatus('删除规则失败: ' + error.message, 'error');
  }
}

// ==================== 内容提取 ====================

async function handleExtract() {
  if (!currentTab) {
    showStatus('无法获取当前标签页', 'error');
    return;
  }
  
  try {
    showStatus('正在提取内容...', 'info');
    setButtonsEnabled(false);
    
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'extractContent',
      format: selectedFormat
    });
    
    if (response && response.success) {
      extractedContent = response.content;
      elements.quickActions.style.display = 'block';
      showStatus(`提取成功，共 ${response.charCount || '?'} 字符`, 'success');
      
      if (config && config.autoCopy) {
        copyContentToClipboard();
      }
    } else {
      showStatus('提取失败: ' + (response?.error || '无法识别主要内容'), 'error');
    }
  } catch (error) {
    showStatus('提取内容时出错: ' + error.message, 'error');
  } finally {
    setButtonsEnabled(true);
  }
}

async function handleManualSelection() {
  if (!currentTab) {
    showStatus('无法获取当前标签页', 'error');
    return;
  }
  
  try {
    showStatus('正在进入手动选择模式...', 'info');
    
    await chrome.tabs.sendMessage(currentTab.id, {
      action: 'manualSelection'
    });
    
    elements.selectionModeIndicator.style.display = 'block';
    showStatus('点击页面上的内容块进行选择', 'info');
    
    window.close();
  } catch (error) {
    showStatus('进入手动选择模式失败: ' + error.message, 'error');
  }
}

function handleCancelSelection() {
  if (currentTab) {
    chrome.tabs.sendMessage(currentTab.id, {
      action: 'cancelSelection'
    }).catch(() => {});
  }
  elements.selectionModeIndicator.style.display = 'none';
  showToast('已取消选择模式');
}

// ==================== 内容操作 ====================

function handleCopyContent() {
  if (!extractedContent) {
    showStatus('没有可复制的内容', 'error');
    return;
  }
  
  copyContentToClipboard();
}

function copyContentToClipboard() {
  if (!extractedContent) return;
  
  try {
    let textToCopy = '';
    let htmlToCopy = '';
    
    if (selectedFormat === 'html') {
      textToCopy = extractedContent.text || extractedContent;
      htmlToCopy = extractedContent.html || extractedContent;
    } else if (selectedFormat === 'text') {
      textToCopy = extractedContent.text || extractedContent;
    } else if (selectedFormat === 'markdown') {
      textToCopy = extractedContent.markdown || extractedContent.text || extractedContent;
    }
    
    if (navigator.clipboard) {
      const data = [new ClipboardItem({
        'text/plain': new Blob([textToCopy], { type: 'text/plain' }),
        ...(htmlToCopy && selectedFormat === 'html' ? {
          'text/html': new Blob([htmlToCopy], { type: 'text/html' })
        } : {})
      })];
      
      navigator.clipboard.write(data)
        .then(() => {
          showToast('内容已复制到剪贴板');
        })
        .catch(() => {
          fallbackCopy(textToCopy);
        });
    } else {
      fallbackCopy(textToCopy);
    }
  } catch (error) {
    showStatus('复制失败: ' + error.message, 'error');
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('内容已复制到剪贴板');
}

function handleDownload() {
  if (!extractedContent) {
    showStatus('没有可导出的内容', 'error');
    return;
  }
  
  elements.exportFilename.value = sanitizeFilename(currentTab?.title || 'content');
  elements.exportModal.style.display = 'flex';
}

function closeExportModal() {
  elements.exportModal.style.display = 'none';
}

async function confirmExport() {
  if (!extractedContent) return;
  
  const format = elements.exportFormat.value;
  const filename = elements.exportFilename.value || 'content';
  const includeTitle = elements.exportIncludeTitle.checked;
  const includeUrl = elements.exportIncludeUrl.checked;
  
  let content = '';
  let mimeType = 'text/plain';
  let extension = '.txt';
  
  switch (format) {
    case 'html':
      mimeType = 'text/html';
      extension = '.html';
      content = buildHtmlContent(extractedContent, includeTitle, includeUrl);
      break;
    case 'md':
      extension = '.md';
      content = buildMarkdownContent(extractedContent, includeTitle, includeUrl);
      break;
    default:
      content = buildTextContent(extractedContent, includeTitle, includeUrl);
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  try {
    await chrome.downloads.download({
      url: url,
      filename: sanitizeFilename(filename) + extension,
      saveAs: true
    });
    
    showToast('文件已开始下载');
    closeExportModal();
  } catch (error) {
    showStatus('下载失败: ' + error.message, 'error');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildHtmlContent(content, includeTitle, includeUrl) {
  const title = currentTab?.title || 'Untitled';
  const url = currentTab?.url || '';
  
  let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
  
  if (includeTitle) {
    html += `<title>${escapeHtml(title)}</title>`;
  }
  
  html += '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}h1{border-bottom:1px solid #eee;padding-bottom:10px}.meta{color:#666;font-size:14px;margin-bottom:20px}</style>';
  html += '</head><body>';
  
  if (includeTitle) {
    html += `<h1>${escapeHtml(title)}</h1>`;
  }
  
  if (includeUrl && url) {
    html += `<p class="meta">来源: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;
  }
  
  if (content.html) {
    html += content.html;
  } else if (content.text) {
    html += `<p>${escapeHtml(content.text).replace(/\n/g, '</p><p>')}</p>`;
  } else {
    html += `<p>${escapeHtml(content)}</p>`;
  }
  
  html += '</body></html>';
  return html;
}

function buildMarkdownContent(content, includeTitle, includeUrl) {
  const title = currentTab?.title || 'Untitled';
  const url = currentTab?.url || '';
  
  let md = '';
  
  if (includeTitle) {
    md += `# ${title}\n\n`;
  }
  
  if (includeUrl && url) {
    md += `> 来源: [${url}](${url})\n\n`;
  }
  
  if (content.markdown) {
    md += content.markdown;
  } else if (content.text) {
    md += content.text;
  } else {
    md += content;
  }
  
  return md;
}

function buildTextContent(content, includeTitle, includeUrl) {
  const title = currentTab?.title || 'Untitled';
  const url = currentTab?.url || '';
  
  let text = '';
  
  if (includeTitle) {
    text += `${title}\n${'='.repeat(title.length)}\n\n`;
  }
  
  if (includeUrl && url) {
    text += `来源: ${url}\n\n`;
  }
  
  if (content.text) {
    text += content.text;
  } else {
    text += content;
  }
  
  return text;
}

// ==================== 规则保存 ====================

function handleSaveRule() {
  if (!currentTab) return;
  
  chrome.tabs.sendMessage(currentTab.id, {
    action: 'getCurrentSelector'
  }).then(response => {
    if (response && response.selector) {
      elements.ruleSelector.value = response.selector;
    }
  }).catch(() => {});
  
  elements.ruleName.value = `${currentDomain} 内容规则`;
  elements.ruleModal.style.display = 'flex';
}

function openRuleModal(rule) {
  elements.ruleName.value = rule.name || '';
  elements.ruleSelector.value = rule.xpath || rule.selector || '';
  elements.ruleIsDefault.checked = rule.isDefault || false;
  elements.ruleModal.dataset.editId = rule.id || '';
  elements.ruleModal.style.display = 'flex';
}

function closeRuleModal() {
  elements.ruleModal.style.display = 'none';
  delete elements.ruleModal.dataset.editId;
}

async function confirmSaveRule() {
  const name = elements.ruleName.value.trim();
  const selector = elements.ruleSelector.value.trim();
  const isDefault = elements.ruleIsDefault.checked;
  const editId = elements.ruleModal.dataset.editId;
  
  if (!name) {
    showStatus('请输入规则名称', 'error');
    return;
  }
  
  if (!selector) {
    showStatus('请输入选择器', 'error');
    return;
  }
  
  if (!currentDomain) {
    showStatus('无法获取当前域名', 'error');
    return;
  }
  
  try {
    const rule = {
      name: name,
      xpath: selector,
      selector: selector,
      isDefault: isDefault
    };
    
    if (editId) {
      rule.id = editId;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'saveRule',
      domain: currentDomain,
      rule: rule
    });
    
    if (response && response.success) {
      showToast('规则保存成功');
      closeRuleModal();
      await loadRules();
    } else {
      showStatus('保存失败: ' + (response?.error || '未知错误'), 'error');
    }
  } catch (error) {
    showStatus('保存规则时出错: ' + error.message, 'error');
  }
}

// ==================== 格式清理 ====================

async function handleClearFormat() {
  if (!extractedContent) {
    showStatus('没有可清理的内容', 'error');
    return;
  }
  
  try {
    showStatus('正在清理格式...', 'info');
    
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'cleanContent',
      content: extractedContent
    });
    
    if (response && response.success) {
      extractedContent = response.content;
      showToast('格式已清理');
      
      if (config && config.autoCopy) {
        copyContentToClipboard();
      }
    } else {
      showStatus('清理失败: ' + (response?.error || '未知错误'), 'error');
    }
  } catch (error) {
    showStatus('清理格式时出错: ' + error.message, 'error');
  }
}

// ==================== 辅助函数 ====================

function setButtonsEnabled(enabled) {
  elements.btnExtract.disabled = !enabled;
  elements.btnManual.disabled = !enabled;
}

function showStatus(message, type = 'info') {
  elements.statusPanel.style.display = 'block';
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-${type}`;
  
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      elements.statusPanel.style.display = 'none';
    }, 3000);
  }
}

function showToast(message) {
  let toast = document.querySelector('.wce-toast-popup');
  if (toast) {
    toast.remove();
  }
  
  toast = document.createElement('div');
  toast.className = 'wce-toast-popup';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function handleBackgroundMessage(message, sender, sendResponse) {
  if (message.action === 'contentExtracted') {
    extractedContent = message.content;
    elements.quickActions.style.display = 'block';
    showStatus('提取成功', 'success');
  }
  sendResponse({ success: true });
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', init);
