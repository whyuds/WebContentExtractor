# WebContentExtractor

## 简介

WebContentExtractor是一个强大的浏览器扩展插件，专为提取网页主要内容而设计。它能够智能识别并提取网页中的核心内容区块，帮助用户快速获取所需信息，避免广告和无关内容的干扰。

## 核心功能

### 1. 自动内容提取

- **智能识别**：自动分析网页结构，识别主要内容区块
- **一键提取**：通过点击扩展图标中的「Extract Content」按钮，立即提取当前页面的主要内容
- **内容优化**：移除广告、导航栏和其他干扰元素，只保留有价值的内容

### 2. 手动内容选择

- **精确选择**：通过「Manual Selection」功能，手动选择需要提取的内容区域
- **自定义提取**：针对特定网站创建自定义的内容提取规则

### 3. 规则管理

- **网站规则**：为不同网站保存不同的内容提取规则
- **导入/导出**：支持规则的导入和导出，方便在不同设备间同步
- **全局设置**：配置全局提取行为，如页面加载时自动提取内容

## 安装方法

1. 下载本仓库的源代码
2. 打开Chrome浏览器，进入扩展管理页面 (`chrome://extensions/`)
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本仓库的根目录

## 使用指南

### 基本使用

1. 浏览到任意网页
2. 点击浏览器工具栏中的WebContentExtractor图标
3. 在弹出窗口中选择「Extract Content」进行自动提取，或「Manual Selection」进行手动选择

### 规则管理

1. 在扩展弹出窗口中点击「Manage」按钮
2. 或直接右键点击扩展图标，选择「选项」进入规则管理页面
3. 在规则管理页面，您可以：
   - 查看已保存的网站规则
   - 编辑现有规则
   - 导入/导出规则
   - 配置全局设置

## 权限说明

- **activeTab**：访问当前标签页内容，用于提取内容
- **storage**：存储提取规则和设置
- **clipboardWrite**：允许将提取的内容复制到剪贴板

## 技术实现

WebContentExtractor基于Chrome扩展API开发，使用现代Web技术栈：

- **Manifest V3**：采用最新的Chrome扩展清单格式
- **Content Scripts**：用于分析和操作网页内容
- **Background Service Worker**：处理后台任务和消息传递
- **Storage API**：保存用户规则和偏好设置

## 贡献指南

欢迎提交问题报告、功能请求或直接贡献代码。请遵循以下步骤：

1. Fork本仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启一个Pull Request