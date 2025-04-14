# WebContentExtractor

## Overview

WebContentExtractor is a powerful browser extension designed to extract main content from web pages. It intelligently identifies and extracts core content blocks, helping users quickly obtain desired information while avoiding ads and irrelevant content.

## Key Features

### 1. Automatic Content Extraction

- **Smart Identification**: Automatically analyzes webpage structure to identify main content blocks
- **One-Click Extraction**: Extract current page's main content instantly by clicking the "Extract Content" button in the extension popup
- **Content Optimization**: Removes ads, navigation bars and other distracting elements, preserving only valuable content

### 2. Manual Content Selection

- **Precise Selection**: Use "Manual Selection" feature to manually choose content areas for extraction
- **Custom Extraction**: Create custom extraction rules for specific websites

### 3. Rule Management

- **Site-Specific Rules**: Save different extraction rules for different websites
- **Import/Export**: Supports rule import/export for easy synchronization across devices
- **Global Settings**: Configure global extraction behaviors like auto-extract on page load

## Installation

1. Download the source code from this repository
2. Open Chrome browser and navigate to extensions page (`chrome://extensions/`)
3. Enable "Developer mode"
4. Click "Load unpacked extension"
5. Select the root directory of this repository

## Usage Guide

### Basic Usage

1. Browse to any webpage
2. Click the WebContentExtractor icon in browser toolbar
3. In the popup window, choose:
   - "Extract Content" for automatic extraction
   - "Manual Selection" for manual content selection

### Rule Management

1. Click "Manage" button in extension popup
2. Or right-click extension icon and select "Options" to enter rule management page
3. In rule management page you can:
   - View saved website rules
   - Edit existing rules
   - Import/Export rules
   - Configure global settings

## Permission Explanation

- **activeTab**: Access current tab content for extraction
- **storage**: Store extraction rules and settings
- **clipboardWrite**: Allow copying extracted content to clipboard

## Technical Implementation

WebContentExtractor is built using Chrome Extension APIs and modern web technologies:

- **Manifest V3**: Uses latest Chrome extension manifest format
- **Content Scripts**: For analyzing and manipulating webpage content
- **Background Service Worker**: Handles background tasks and message passing
- **Storage API**: Saves user rules and preferences

## Contributing

We welcome bug reports, feature requests and code contributions. Please follow these steps:

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request