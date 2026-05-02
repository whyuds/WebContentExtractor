/**
 * WebContentExtractor - Content Script (Enhanced Version 2.0)
 * 增强版内容提取脚本，支持智能识别、动态内容处理、多格式输出
 */

'use strict';

(function() {

// ==================== 配置常量 ====================

const DEFAULT_CONFIG = {
  minTextLength: 200,
  textDensityThreshold: 0.25,
  toastDuration: 3000,
  extractTimeout: 5000,
  removeAds: true,
  preserveLinks: true,
  preserveImages: true,
  cleanEmptyLines: true,
  normalizeWhitespace: true,
  excludeSelectors: [
    'script', 'style', 'noscript', 'iframe',
    '.advertisement', '.ad', '[class*="ad-"]', '[id*="ad-"]',
    '#comments', '.comments', '#sidebar', '.sidebar',
    'nav', 'footer', 'aside', 'header',
    '.social-share', '.related-posts', '.author-bio'
  ]
};

const AD_SELECTORS = [
  '[class*="ad-"]', '[id*="ad-"]',
  '[class*="advertisement"]', '[id*="advertisement"]',
  '[class*="sponsored"]', '[id*="sponsored"]',
  '[class*="promo"]', '[id*="promo"]',
  '.adsbygoogle', '.ad-container', '.ad-wrapper',
  '[data-ad-client]', '[data-ad-slot]',
  'ins.adsbygoogle',
  '[class*="banner"]', '[id*="banner"]'
];

const CONTENT_SELECTORS = [
  'article', 'main', '[role="main"]',
  '.content', '#content', '.main-content',
  '.post', '.article', '.entry',
  '.post-content', '.article-content', '.entry-content',
  '.blog-content', '.page-content',
  '[class*="article-body"]', '[id*="article-body"]',
  '[class*="post-body"]', '[id*="post-body"]'
];

// ==================== 全局变量 ====================

let config = { ...DEFAULT_CONFIG };
let isSelectionMode = false;
let selectedElement = null;
let highlightOverlay = null;
let lastExtractedContent = null;
let currentSelector = null;
let mutationObserver = null;
let lazyLoadObserver = null;

// ==================== 工具函数模块 ====================

const Utils = {
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return window.location.hostname;
    }
  },

  cleanText(text) {
    if (!text) return '';
    
    let cleaned = text;
    
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    cleaned = cleaned.replace(/[  ]/g, ' ');
    
    if (config.normalizeWhitespace) {
      cleaned = cleaned.replace(/[ \t]+/g, ' ');
    }
    
    if (config.cleanEmptyLines) {
      cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    }
    
    return cleaned.trim();
  },

  async copyToClipboard(content) {
    try {
      const textContent = typeof content === 'string' ? content : (content.text || content.html || '');
      
      if (navigator.clipboard && window.ClipboardItem) {
        const items = {};
        
        if (content.html) {
          items['text/html'] = new Blob([content.html], { type: 'text/html' });
        }
        items['text/plain'] = new Blob([textContent], { type: 'text/plain' });
        
        await navigator.clipboard.write([new ClipboardItem(items)]);
        return true;
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      }
    } catch (error) {
      console.error('[WebContentExtractor] Copy failed:', error);
      return false;
    }
  },

  getElementByXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    } catch (error) {
      console.warn('[WebContentExtractor] XPath evaluation failed:', error);
      return null;
    }
  },

  generateXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c.trim());
      for (const className of classes) {
        const elements = document.getElementsByClassName(className);
        if (elements.length === 1) {
          return `//*[contains(@class, "${className}")]`;
        }
      }
    }
    
    let path = '';
    let current = element;
    
    while (current && current !== document.documentElement && current.parentNode) {
      const tag = current.tagName.toLowerCase();
      
      if (current.parentNode) {
        const siblings = Array.from(current.parentNode.children)
          .filter(child => child.tagName === current.tagName);
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          path = `/${tag}[${index}]${path}`;
        } else {
          path = `/${tag}${path}`;
        }
      }
      
      current = current.parentNode;
    }
    
    return `/html${path}`;
  },

  generateCSSSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ')
          .filter(c => c.trim() && !c.includes('__') && !c.includes('--'))
          .slice(0, 3);
        
        if (classes.length > 0) {
          selector += '.' + classes.join('.');
        }
      }
      
      if (current.parentNode) {
        const siblings = Array.from(current.parentNode.querySelectorAll(selector));
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      
      path.unshift(selector);
      
      try {
        const testSelector = path.join(' > ');
        if (document.querySelectorAll(testSelector).length === 1) {
          return testSelector;
        }
      } catch (e) {}
      
      current = current.parentNode;
    }
    
    return path.join(' > ');
  },

  getVisibleText(element) {
    if (!element) return '';
    
    let text = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent + ' ';
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const style = window.getComputedStyle(child);
          
          if (style.display === 'none' || style.visibility === 'hidden') {
            continue;
          }
          
          const tagName = child.tagName.toLowerCase();
          if (['br', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'td'].includes(tagName)) {
            text += '\n';
          }
          
          walk(child);
        }
      }
    };
    
    walk(element);
    return this.cleanText(text);
  }
};

// ==================== 内容分析器模块 ====================

const ContentAnalyzer = {
  analyzeElement(element) {
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    const text = Utils.getVisibleText(element);
    const innerHTML = element.innerHTML;
    
    const textLength = text.length;
    const htmlLength = innerHTML.length;
    const textDensity = htmlLength > 0 ? textLength / htmlLength : 0;
    
    const paragraphs = element.querySelectorAll('p').length;
    const links = element.querySelectorAll('a').length;
    const images = element.querySelectorAll('img').length;
    const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    
    const totalElements = element.querySelectorAll('*').length || 1;
    const paragraphDensity = paragraphs / totalElements;
    
    const windowWidth = window.innerWidth;
    const elementCenter = rect.left + rect.width / 2;
    const distanceFromCenter = Math.abs(elementCenter - windowWidth / 2);
    const positionScore = Math.max(0, 1 - (distanceFromCenter / (windowWidth / 2)));
    
    const tagName = element.tagName.toLowerCase();
    let tagScore = 0;
    if (['article', 'main', 'section'].includes(tagName)) tagScore = 1;
    else if (['div', 'article'].includes(tagName)) tagScore = 0.8;
    else if (['p'].includes(tagName)) tagScore = 0.5;
    else if (['nav', 'footer', 'aside', 'header'].includes(tagName)) tagScore = -0.5;
    
    let adScore = 0;
    const classAttr = (element.className || '').toLowerCase();
    const idAttr = (element.id || '').toLowerCase();
    
    if (AD_SELECTORS.some(sel => {
      try {
        return element.matches(sel);
      } catch {
        return false;
      }
    })) {
      adScore = -1;
    }
    
    if (classAttr.includes('ad') || classAttr.includes('advertisement') ||
        idAttr.includes('ad') || idAttr.includes('advertisement')) {
      adScore = Math.min(adScore, -0.5);
    }
    
    const textScore = Math.min(1, textLength / 2000);
    const paragraphScore = Math.min(1, paragraphs / 10);
    const headingScore = Math.min(1, headings / 5);
    
    const finalScore = 
      (textDensity * 0.35) +
      (paragraphDensity * 0.2) +
      (positionScore * 0.15) +
      (tagScore * 0.15) +
      (adScore * 0.2) +
      (textScore * 0.1) +
      (paragraphScore * 0.05) +
      (headingScore * 0.05);
    
    return {
      element,
      score: finalScore,
      textLength,
      textDensity,
      paragraphs,
      paragraphDensity,
      positionScore,
      tagScore,
      adScore,
      rect,
      text
    };
  },

  findMainContent() {
    let bestElement = null;
    let bestScore = -Infinity;
    let bestAnalysis = null;
    
    for (const selector of CONTENT_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const analysis = this.analyzeElement(element);
          if (analysis && analysis.score > bestScore && analysis.textLength >= config.minTextLength) {
            bestScore = analysis.score;
            bestElement = element;
            bestAnalysis = analysis;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    const candidates = document.querySelectorAll('div, section, article, main');
    const analyses = [];
    
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      
      if (rect.height < 100 || rect.width < 200) continue;
      
      const analysis = this.analyzeElement(element);
      if (analysis && analysis.textLength >= config.minTextLength) {
        analyses.push(analysis);
      }
    }
    
    analyses.sort((a, b) => b.score - a.score);
    
    for (const analysis of analyses.slice(0, 5)) {
      if (analysis.score > bestScore) {
        bestScore = analysis.score;
        bestElement = analysis.element;
        bestAnalysis = analysis;
      }
    }
    
    if (bestElement && bestAnalysis) {
      console.log('[WebContentExtractor] Best element found:', {
        tag: bestElement.tagName,
        score: bestScore,
        textLength: bestAnalysis.textLength
      });
    }
    
    return bestElement ? { element: bestElement, analysis: bestAnalysis } : null;
  },

  removeAdsAndNoise(element) {
    if (!config.removeAds) return element;
    
    const clone = element.cloneNode(true);
    
    for (const selector of [...AD_SELECTORS, ...config.excludeSelectors]) {
      try {
        const elements = clone.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.parentNode) {
            el.remove();
          }
        });
      } catch (e) {
        continue;
      }
    }
    
    return clone;
  }
};

// ==================== 内容格式化模块 ====================

const ContentFormatter = {
  toHTML(element) {
    if (!element) return '';
    
    const clone = config.removeAds ? ContentAnalyzer.removeAdsAndNoise(element) : element.cloneNode(true);
    
    if (!config.preserveLinks) {
      clone.querySelectorAll('a').forEach(link => {
        const span = document.createElement('span');
        span.innerHTML = link.innerHTML;
        link.parentNode.replaceChild(span, link);
      });
    }
    
    if (!config.preserveImages) {
      clone.querySelectorAll('img').forEach(img => {
        if (img.parentNode) {
          img.remove();
        }
      });
    }
    
    clone.querySelectorAll('script, style, noscript, iframe').forEach(el => {
      if (el.parentNode) el.remove();
    });
    
    clone.querySelectorAll('[style]').forEach(el => {
      const style = el.getAttribute('style');
      if (style && !style.includes('display:') && !style.includes('text-align:') && 
          !style.includes('font-weight:') && !style.includes('color:')) {
        el.removeAttribute('style');
      }
    });
    
    clone.querySelectorAll('[onclick], [onload], [onerror]').forEach(el => {
      el.removeAttribute('onclick');
      el.removeAttribute('onload');
      el.removeAttribute('onerror');
    });
    
    return clone.innerHTML;
  },

  toMarkdown(element) {
    if (!element) return '';
    
    const html = this.toHTML(element);
    return this.htmlToMarkdown(html);
  },

  htmlToMarkdown(html) {
    if (!html) return '';
    
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    let md = '';
    
    const processNode = (node, parentTag = '') => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text.trim()) {
          md += text.replace(/\s+/g, ' ');
        }
        return;
      }
      
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      
      const tag = node.tagName.toLowerCase();
      
      switch (tag) {
        case 'h1':
          md += '\n# ';
          processNodeContent(node);
          md += '\n';
          break;
        case 'h2':
          md += '\n## ';
          processNodeContent(node);
          md += '\n';
          break;
        case 'h3':
          md += '\n### ';
          processNodeContent(node);
          md += '\n';
          break;
        case 'h4':
        case 'h5':
        case 'h6':
          md += '\n#### ';
          processNodeContent(node);
          md += '\n';
          break;
          
        case 'p':
          md += '\n';
          processNodeContent(node);
          md += '\n';
          break;
          
        case 'br':
          md += '\n';
          break;
          
        case 'strong':
        case 'b':
          md += '**';
          processNodeContent(node);
          md += '**';
          break;
          
        case 'em':
        case 'i':
          md += '*';
          processNodeContent(node);
          md += '*';
          break;
          
        case 'a':
          const href = node.getAttribute('href') || '';
          md += '[';
          processNodeContent(node);
          md += `](${href})`;
          break;
          
        case 'img':
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || 'image';
          md += `![${alt}](${src})`;
          break;
          
        case 'ul':
          md += '\n';
          node.querySelectorAll(':scope > li').forEach((li, index) => {
            md += '- ';
            processNodeContent(li);
            md += '\n';
          });
          break;
          
        case 'ol':
          md += '\n';
          node.querySelectorAll(':scope > li').forEach((li, index) => {
            md += `${index + 1}. `;
            processNodeContent(li);
            md += '\n';
          });
          break;
          
        case 'li':
          if (parentTag !== 'ul' && parentTag !== 'ol') {
            md += '- ';
          }
          processNodeContent(node);
          break;
          
        case 'blockquote':
          md += '\n> ';
          const blockquoteContent = Array.from(node.childNodes).map(child => {
            if (child.nodeType === Node.ELEMENT_NODE) {
              return child.innerText;
            }
            return child.textContent;
          }).join(' ').trim();
          md += blockquoteContent.replace(/\n/g, '\n> ');
          md += '\n';
          break;
          
        case 'pre':
        case 'code':
          const codeText = node.textContent.trim();
          if (codeText.includes('\n')) {
            md += '\n```\n' + codeText + '\n```\n';
          } else {
            md += '`' + codeText + '`';
          }
          break;
          
        case 'table':
          md += '\n';
          const rows = node.querySelectorAll('tr');
          rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('th, td');
            cells.forEach((cell, cellIndex) => {
              const cellContent = cell.innerText.trim().replace(/\|/g, '\\|');
              md += `| ${cellContent} `;
            });
            md += '|\n';
            
            if (rowIndex === 0) {
              cells.forEach((cell, cellIndex) => {
                md += '| --- ';
              });
              md += '|\n';
            }
          });
          md += '\n';
          break;
          
        case 'script':
        case 'style':
        case 'noscript':
        case 'iframe':
          break;
          
        default:
          processNodeContent(node);
      }
    };
    
    const processNodeContent = (node) => {
      for (const child of node.childNodes) {
        processNode(child, node.tagName?.toLowerCase());
      }
    };
    
    processNodeContent(temp);
    
    md = md
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
    
    return md;
  },

  toText(element) {
    return Utils.getVisibleText(element);
  },

  formatContent(element, format = 'html') {
    const result = {
      html: '',
      text: '',
      markdown: ''
    };
    
    if (!element) return result;
    
    try {
      result.html = this.toHTML(element);
      result.text = this.toText(element);
      result.markdown = this.toMarkdown(element);
    } catch (error) {
      console.error('[WebContentExtractor] Formatting error:', error);
    }
    
    return result;
  }
};

// ==================== 懒加载处理模块 ====================

const LazyLoadHandler = {
  async handlePageWithLazyLoad() {
    console.log('[WebContentExtractor] Scanning for lazy load content...');
    
    const lazyElements = this.findLazyLoadElements();
    
    if (lazyElements.length === 0) {
      return;
    }
    
    console.log(`[WebContentExtractor] Found ${lazyElements.length} lazy load elements`);
    
    const scrollStep = Math.floor(window.innerHeight / 2);
    const maxScrolls = 20;
    let scrollCount = 0;
    
    const originalScrollY = window.scrollY;
    
    while (scrollCount < maxScrolls) {
      window.scrollBy(0, scrollStep);
      await Utils.delay(200);
      
      if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 100) {
        break;
      }
      
      scrollCount++;
    }
    
    await Utils.delay(500);
    
    window.scrollTo(0, originalScrollY);
    
    console.log('[WebContentExtractor] Lazy load handling complete');
  },

  findLazyLoadElements() {
    const lazySelectors = [
      'img[loading="lazy"]',
      'img[data-src]',
      'img[data-original]',
      'img[data-lazy]',
      '[class*="lazy"]',
      '[data-srcset]',
      'img.lazyload',
      'img.lazy'
    ];
    
    const elements = [];
    for (const selector of lazySelectors) {
      try {
        const found = document.querySelectorAll(selector);
        elements.push(...Array.from(found));
      } catch (e) {
        continue;
      }
    }
    
    return [...new Set(elements)];
  },

  triggerLazyLoad(element) {
    if (element.tagName.toLowerCase() === 'img') {
      const dataSrc = element.getAttribute('data-src');
      const dataSrcSet = element.getAttribute('data-srcset');
      const dataOriginal = element.getAttribute('data-original');
      
      if (dataSrc) {
        element.setAttribute('src', dataSrc);
      }
      if (dataSrcSet) {
        element.setAttribute('srcset', dataSrcSet);
      }
      if (dataOriginal) {
        element.setAttribute('src', dataOriginal);
      }
      
      element.removeAttribute('loading');
      element.classList.remove('lazy', 'lazyload');
    }
  }
};

// ==================== 高亮和提示模块 ====================

const UI = {
  toastElement: null,
  highlightElement: null,
  tempHighlightElement: null,
  selectionOverlay: null,
  controlPanel: null,

  showToast(message, type = 'success', duration = null) {
    if (this.toastElement) {
      this.toastElement.remove();
    }
    
    duration = duration || config.toastDuration;
    
    const toast = document.createElement('div');
    toast.className = 'wce-toast wce-toast-' + type;
    toast.textContent = message;
    
    const colors = {
      success: '#4CAF50',
      error: '#f44336',
      info: '#2196F3',
      warning: '#ff9800'
    };
    
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: ${colors[type] || colors.success};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: wce-slide-up 0.3s ease;
      pointer-events: none;
    `;
    
    document.body.appendChild(toast);
    this.toastElement = toast;
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'wce-fade-out 0.3s ease';
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 300);
      }
    }, duration);
  },

  highlight(element, temporary = false) {
    if (!element) return;
    
    const rect = element.getBoundingClientRect();
    
    if (temporary && this.tempHighlightElement) {
      this.tempHighlightElement.remove();
    } else if (!temporary && this.highlightElement) {
      this.highlightElement.remove();
    }
    
    const highlight = document.createElement('div');
    highlight.className = temporary ? 'wce-temp-highlight' : 'wce-highlight';
    
    highlight.style.cssText = `
      position: absolute;
      top: ${window.scrollY + rect.top}px;
      left: ${window.scrollX + rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background: ${temporary ? 'rgba(255, 165, 0, 0.2)' : 'rgba(66, 133, 244, 0.2)'};
      border: ${temporary ? '2px dashed #ff9800' : '2px solid #4285f4'};
      z-index: 99999;
      pointer-events: none;
      box-sizing: border-box;
    `;
    
    document.body.appendChild(highlight);
    
    if (temporary) {
      this.tempHighlightElement = highlight;
    } else {
      this.highlightElement = highlight;
      
      setTimeout(() => {
        if (highlight.parentNode) {
          highlight.style.opacity = '0';
          setTimeout(() => {
            if (highlight.parentNode) highlight.remove();
          }, 300);
        }
      }, 3000);
    }
  },

  removeTempHighlight() {
    if (this.tempHighlightElement) {
      this.tempHighlightElement.remove();
      this.tempHighlightElement = null;
    }
  },

  removeAllHighlights() {
    if (this.highlightElement) {
      this.highlightElement.remove();
      this.highlightElement = null;
    }
    this.removeTempHighlight();
  },

  showSelectionPanel(element) {
    if (this.controlPanel) {
      this.controlPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'wce-control-panel';
    
    panel.innerHTML = `
      <div class="wce-panel-header">
        <h3>内容已选中</h3>
        <button class="wce-panel-close">×</button>
      </div>
      <div class="wce-panel-content">
        <p>已选中内容区域，约 ${element.innerText.length} 字符</p>
        <div class="wce-panel-buttons">
          <button class="wce-btn wce-btn-primary" data-action="copyHtml">
            <span class="wce-btn-icon">📝</span>
            <span>复制富文本</span>
          </button>
          <button class="wce-btn" data-action="copyText">
            <span class="wce-btn-icon">📃</span>
            <span>复制纯文本</span>
          </button>
          <button class="wce-btn" data-action="copyMarkdown">
            <span class="wce-btn-icon">📋</span>
            <span>复制MD</span>
          </button>
          <button class="wce-btn wce-btn-secondary" data-action="saveRule">
            <span class="wce-btn-icon">📌</span>
            <span>保存规则</span>
          </button>
        </div>
      </div>
    `;
    
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-width: 350px;
      animation: wce-scale-in 0.2s ease;
    `;
    
    document.body.appendChild(panel);
    this.controlPanel = panel;
    
    panel.querySelector('.wce-panel-close').addEventListener('click', () => {
      panel.remove();
      this.controlPanel = null;
    });
    
    panel.querySelectorAll('.wce-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.dataset.action;
        
        switch (action) {
          case 'copyHtml':
            await this.copySelectedContent(element, 'html');
            break;
          case 'copyText':
            await this.copySelectedContent(element, 'text');
            break;
          case 'copyMarkdown':
            await this.copySelectedContent(element, 'markdown');
            break;
          case 'saveRule':
            await this.saveSelectedRule(element);
            break;
        }
      });
    });
  },

  async copySelectedContent(element, format) {
    const formatted = ContentFormatter.formatContent(element, format);
    lastExtractedContent = formatted;
    
    let contentToCopy = {};
    switch (format) {
      case 'html':
        contentToCopy = { text: formatted.text, html: formatted.html };
        break;
      case 'markdown':
        contentToCopy = formatted.markdown;
        break;
      default:
        contentToCopy = formatted.text;
    }
    
    const success = await Utils.copyToClipboard(contentToCopy);
    
    if (success) {
      this.showToast('内容已复制到剪贴板', 'success');
    } else {
      this.showToast('复制失败', 'error');
    }
    
    if (this.controlPanel) {
      this.controlPanel.remove();
      this.controlPanel = null;
    }
  },

  async saveSelectedRule(element) {
    const xpath = Utils.generateXPath(element);
    const cssSelector = Utils.generateCSSSelector(element);
    const domain = Utils.extractDomain(window.location.href);
    
    const ruleName = prompt('请输入规则名称:', `${domain} 内容规则`);
    
    if (!ruleName || ruleName.trim() === '') {
      return;
    }
    
    const rule = {
      name: ruleName.trim(),
      xpath: xpath,
      selector: cssSelector,
      selectorType: xpath.startsWith('//') ? 'xpath' : 'css',
      isDefault: true,
      createdAt: new Date().toISOString()
    };
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveRule',
        domain: domain,
        rule: rule
      });
      
      if (response && response.success) {
        this.showToast('规则已保存', 'success');
        currentSelector = { xpath, selector: cssSelector };
      } else {
        this.showToast('保存规则失败', 'error');
      }
    } catch (error) {
      console.error('[WebContentExtractor] Save rule error:', error);
      this.showToast('保存规则失败', 'error');
    }
    
    if (this.controlPanel) {
      this.controlPanel.remove();
      this.controlPanel = null;
    }
  }
};

// ==================== 手动选择模块 ====================

const SelectionMode = {
  isActive: false,
  hoveredElement: null,
  selectionPath: [],

  enable() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.selectionPath = [];
    
    document.body.style.cursor = 'crosshair';
    document.body.classList.add('wce-selection-mode');
    
    document.addEventListener('mouseover', this.handleMouseOver, true);
    document.addEventListener('mouseout', this.handleMouseOut, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('wheel', this.handleWheel, true);
    
    this.showParentSelector();
    
    UI.showToast('点击选择内容区域，按上下键调整选择层级，按 ESC 取消', 'info', 5000);
  },

  disable() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    document.body.style.cursor = 'default';
    document.body.classList.remove('wce-selection-mode');
    
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('wheel', this.handleWheel, true);
    
    UI.removeTempHighlight();
    this.hideParentSelector();
  },

  handleMouseOver: function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    let target = e.target;
    
    while (target && (target === document.body || target === document.documentElement)) {
      target = target.parentNode;
    }
    
    if (!target || target === document.body) return;
    
    SelectionMode.hoveredElement = target;
    SelectionMode.buildSelectionPath(target);
    SelectionMode.highlightCurrent();
  },

  handleMouseOut: function(e) {
    e.preventDefault();
    e.stopPropagation();
  },

  handleClick: function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const element = SelectionMode.selectionPath[SelectionMode.selectionPath.length - 1];
    
    if (!element) return;
    
    SelectionMode.disable();
    selectedElement = element;
    currentSelector = {
      xpath: Utils.generateXPath(element),
      selector: Utils.generateCSSSelector(element)
    };
    
    UI.highlight(element);
    UI.showSelectionPanel(element);
  },

  handleKeyDown: function(e) {
    if (!SelectionMode.isActive) return;
    
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        SelectionMode.disable();
        UI.showToast('已取消选择', 'info');
        break;
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault();
        SelectionMode.selectParent();
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault();
        SelectionMode.selectChild();
        break;
      case 'Enter':
        e.preventDefault();
        const element = SelectionMode.selectionPath[SelectionMode.selectionPath.length - 1];
        if (element) {
          SelectionMode.disable();
          selectedElement = element;
          currentSelector = {
            xpath: Utils.generateXPath(element),
            selector: Utils.generateCSSSelector(element)
          };
          UI.highlight(element);
          UI.showSelectionPanel(element);
        }
        break;
    }
  },

  handleWheel: function(e) {
    if (!SelectionMode.isActive) return;
    
    e.preventDefault();
    
    if (e.deltaY < 0) {
      SelectionMode.selectParent();
    } else {
      SelectionMode.selectChild();
    }
  },

  buildSelectionPath(element) {
    this.selectionPath = [];
    
    let current = element;
    while (current && current !== document.body && current.parentNode) {
      const analysis = ContentAnalyzer.analyzeElement(current);
      if (analysis && analysis.textLength > 50) {
        this.selectionPath.unshift(current);
      }
      current = current.parentNode;
    }
    
    if (this.selectionPath.length === 0) {
      this.selectionPath = [element];
    }
  },

  selectParent() {
    if (this.selectionPath.length <= 1) return;
    this.selectionPath.pop();
    this.highlightCurrent();
  },

  selectChild() {
    if (!this.hoveredElement) return;
    
    const currentElement = this.selectionPath[this.selectionPath.length - 1];
    if (!currentElement) return;
    
    const children = Array.from(currentElement.querySelectorAll('div, section, article, p, ul, ol, table'))
      .filter(child => {
        const analysis = ContentAnalyzer.analyzeElement(child);
        return analysis && analysis.textLength > 100;
      });
    
    if (children.length > 0) {
      this.selectionPath.push(children[0]);
      this.highlightCurrent();
    }
  },

  highlightCurrent() {
    const element = this.selectionPath[this.selectionPath.length - 1];
    if (element) {
      UI.highlight(element, true);
      this.updateParentSelector();
    }
  },

  parentSelectorEl: null,

  showParentSelector() {
    this.parentSelectorEl = document.createElement('div');
    this.parentSelectorEl.className = 'wce-parent-selector';
    document.body.appendChild(this.parentSelectorEl);
  },

  hideParentSelector() {
    if (this.parentSelectorEl) {
      this.parentSelectorEl.remove();
      this.parentSelectorEl = null;
    }
  },

  updateParentSelector() {
    if (!this.parentSelectorEl) return;
    
    const element = this.selectionPath[this.selectionPath.length - 1];
    if (!element) return;
    
    const tag = element.tagName.toLowerCase();
    let label = `<${tag}`;
    
    if (element.id) {
      label += ` id="${element.id}"`;
    }
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').slice(0, 3).join(' ');
      if (classes) label += ` class="${classes}"`;
    }
    label += '>';
    
    const analysis = ContentAnalyzer.analyzeElement(element);
    const charCount = analysis ? analysis.textLength : element.innerText.length;
    
    this.parentSelectorEl.innerHTML = `
      <div class="wce-selector-info">
        <span class="wce-selector-tag">${Utils.escapeHtml(label)}</span>
        <span class="wce-selector-stats">${charCount} 字符</span>
        <span class="wce-selector-depth">层级: ${this.selectionPath.length}</span>
      </div>
      <div class="wce-selector-hint">
        ↑ 选择父元素 | ↓ 选择子元素 | Enter 确认 | ESC 取消
      </div>
    `;
    
    this.parentSelectorEl.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
  }
};

// ==================== 主控制器模块 ====================

const ContentExtractor = {
  async init() {
    try {
      config = await this.loadConfig();
    } catch (error) {
      console.warn('[WebContentExtractor] Failed to load config, using defaults:', error);
    }
    
    this.injectStyles();
    this.setupMessageListener();
    
    console.log('[WebContentExtractor] v2.0 initialized');
  },

  async loadConfig() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
      return { ...DEFAULT_CONFIG, ...response };
    } catch (error) {
      console.warn('[WebContentExtractor] Config load error:', error);
      return { ...DEFAULT_CONFIG };
    }
  },

  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes wce-slide-up {
        from { opacity: 0; transform: translate(-50%, 20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      @keyframes wce-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes wce-scale-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      
      body.wce-selection-mode,
      body.wce-selection-mode * {
        user-select: none !important;
      }
      
      .wce-control-panel .wce-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #eee;
      }
      .wce-control-panel .wce-panel-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .wce-control-panel .wce-panel-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        color: #999;
      }
      .wce-control-panel .wce-panel-content {
        padding: 16px;
      }
      .wce-control-panel .wce-panel-content p {
        margin: 0 0 12px 0;
        color: #666;
        font-size: 13px;
      }
      .wce-control-panel .wce-panel-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .wce-control-panel .wce-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        background: #f5f5f5;
        color: #333;
        transition: all 0.2s;
      }
      .wce-control-panel .wce-btn:hover {
        background: #e8e8e8;
      }
      .wce-control-panel .wce-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .wce-control-panel .wce-btn-primary:hover {
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      .wce-control-panel .wce-btn-secondary {
        background: #2196F3;
        color: white;
      }
      .wce-control-panel .wce-btn-secondary:hover {
        background: #1976D2;
      }
      .wce-control-panel .wce-btn-icon {
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  },

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
  },

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'extractContent':
          await this.extractContent(sendResponse, request.format);
          break;
        
        case 'manualSelection':
          SelectionMode.enable();
          sendResponse({ success: true });
          break;
        
        case 'cancelSelection':
          SelectionMode.disable();
          sendResponse({ success: true });
          break;
        
        case 'applyRule':
          await this.applyRule(request.rule, request.format, sendResponse);
          break;
        
        case 'getCurrentSelector':
          sendResponse({
            success: true,
            selector: currentSelector?.xpath || currentSelector?.selector || ''
          });
          break;
        
        case 'extractSelection':
          await this.extractSelection(sendResponse);
          break;
        
        case 'copySelectionPlain':
          await this.copySelection('text', sendResponse);
          break;
        
        case 'copySelectionRich':
          await this.copySelection('html', sendResponse);
          break;
        
        case 'cleanContent':
          await this.cleanContent(request.content, sendResponse);
          break;
        
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[WebContentExtractor] Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    }
  },

  async extractContent(sendResponse, format = 'html') {
    try {
      UI.showToast('正在分析页面内容...', 'info');
      
      await LazyLoadHandler.handlePageWithLazyLoad();
      
      const result = ContentAnalyzer.findMainContent();
      
      if (!result || !result.element) {
        UI.showToast('无法识别主要内容，请尝试手动选择', 'warning');
        sendResponse({ success: false, error: 'Could not identify main content' });
        return;
      }
      
      const { element, analysis } = result;
      
      UI.highlight(element);
      
      const formatted = ContentFormatter.formatContent(element, format);
      lastExtractedContent = formatted;
      
      let contentToCopy = {};
      switch (format) {
        case 'html':
          contentToCopy = { text: formatted.text, html: formatted.html };
          break;
        case 'markdown':
          contentToCopy = formatted.markdown;
          break;
        default:
          contentToCopy = formatted.text;
      }
      
      if (config.autoCopy) {
        const success = await Utils.copyToClipboard(contentToCopy);
        if (success) {
          UI.showToast(`提取成功！共 ${analysis.textLength} 字符，已复制到剪贴板`, 'success');
        } else {
          UI.showToast(`提取成功！共 ${analysis.textLength} 字符`, 'success');
        }
      } else {
        UI.showToast(`提取成功！共 ${analysis.textLength} 字符`, 'success');
      }
      
      sendResponse({
        success: true,
        content: formatted,
        charCount: analysis.textLength
      });
      
    } catch (error) {
      console.error('[WebContentExtractor] Extract error:', error);
      UI.showToast('提取失败: ' + error.message, 'error');
      sendResponse({ success: false, error: error.message });
    }
  },

  async applyRule(rule, format, sendResponse) {
    try {
      let element = null;
      
      if (rule.xpath) {
        element = Utils.getElementByXPath(rule.xpath);
      }
      
      if (!element && rule.selector) {
        try {
          element = document.querySelector(rule.selector);
        } catch (e) {
          console.warn('[WebContentExtractor] Invalid CSS selector:', rule.selector);
        }
      }
      
      if (!element) {
        UI.showToast('规则匹配失败，找不到对应元素', 'error');
        sendResponse({ success: false, error: 'Rule element not found' });
        return;
      }
      
      UI.highlight(element);
      
      const formatted = ContentFormatter.formatContent(element, format);
      lastExtractedContent = formatted;
      
      if (config.autoCopy) {
        let contentToCopy = {};
        switch (format) {
          case 'html':
            contentToCopy = { text: formatted.text, html: formatted.html };
            break;
          case 'markdown':
            contentToCopy = formatted.markdown;
            break;
          default:
            contentToCopy = formatted.text;
        }
        await Utils.copyToClipboard(contentToCopy);
      }
      
      currentSelector = { xpath: rule.xpath, selector: rule.selector };
      
      UI.showToast('规则应用成功', 'success');
      
      sendResponse({
        success: true,
        content: formatted
      });
      
    } catch (error) {
      console.error('[WebContentExtractor] Apply rule error:', error);
      UI.showToast('应用规则失败: ' + error.message, 'error');
      sendResponse({ success: false, error: error.message });
    }
  },

  async extractSelection(sendResponse) {
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      UI.showToast('请先选择文本', 'warning');
      sendResponse({ success: false, error: 'No selection' });
      return;
    }
    
    try {
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      
      const temp = document.createElement('div');
      temp.appendChild(fragment);
      
      const formatted = ContentFormatter.formatContent(temp);
      lastExtractedContent = formatted;
      
      if (config.autoCopy) {
        await Utils.copyToClipboard({ text: formatted.text, html: formatted.html });
      }
      
      UI.showToast('选中内容已提取', 'success');
      
      sendResponse({
        success: true,
        content: formatted
      });
      
    } catch (error) {
      console.error('[WebContentExtractor] Extract selection error:', error);
      UI.showToast('提取失败: ' + error.message, 'error');
      sendResponse({ success: false, error: error.message });
    }
  },

  async copySelection(format, sendResponse) {
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      UI.showToast('请先选择文本', 'warning');
      sendResponse({ success: false, error: 'No selection' });
      return;
    }
    
    try {
      const range = selection.getRangeAt(0);
      
      let content;
      if (format === 'html') {
        const fragment = range.cloneContents();
        const temp = document.createElement('div');
        temp.appendChild(fragment);
        content = { text: selection.toString(), html: temp.innerHTML };
      } else {
        content = selection.toString();
      }
      
      const success = await Utils.copyToClipboard(content);
      
      if (success) {
        UI.showToast('已复制到剪贴板', 'success');
      } else {
        UI.showToast('复制失败', 'error');
      }
      
      sendResponse({ success });
      
    } catch (error) {
      console.error('[WebContentExtractor] Copy selection error:', error);
      sendResponse({ success: false, error: error.message });
    }
  },

  async cleanContent(content, sendResponse) {
    try {
      let cleaned = { ...content };
      
      if (cleaned.text) {
        cleaned.text = Utils.cleanText(cleaned.text);
      }
      
      if (cleaned.html) {
        const temp = document.createElement('div');
        temp.innerHTML = cleaned.html;
        
        temp.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
        temp.querySelectorAll('script, style, iframe, noscript').forEach(el => el.remove());
        
        cleaned.html = temp.innerHTML;
      }
      
      if (cleaned.markdown) {
        cleaned.markdown = Utils.cleanText(cleaned.markdown);
      }
      
      lastExtractedContent = cleaned;
      
      sendResponse({
        success: true,
        content: cleaned
      });
      
    } catch (error) {
      console.error('[WebContentExtractor] Clean content error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
};

// ==================== 初始化执行 ====================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ContentExtractor.init());
} else {
  ContentExtractor.init();
}

})();
