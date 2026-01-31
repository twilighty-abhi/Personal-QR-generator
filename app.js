/**
 * Premium QR Generator - Main Application
 * A feature-rich, premium QR code generator
 * 
 * Features:
 * - Multiple QR types (URL, Text, WiFi, vCard, Email, Phone, SMS)
 * - Customizable colors, size, and error correction
 * - Logo embedding support
 * - Dark/Light theme
 * - QR History with localStorage
 * - Multiple export formats (PNG, JPG, SVG)
 * - Copy to clipboard
 */

// ============================================
// Configuration & State
// ============================================

const CONFIG = {
  MAX_HISTORY: 15,
  DEFAULT_SIZE: 256,
  MIN_SIZE: 128,
  MAX_SIZE: 512,
  DEFAULT_FG: '#1a1a2e',
  DEFAULT_BG: '#ffffff',
  ERROR_LEVELS: ['L', 'M', 'Q', 'H'],
  STORAGE_KEY: 'qr_generator_history',
  THEME_KEY: 'qr_generator_theme'
};

const state = {
  currentType: 'url',
  qrCode: null,
  customization: {
    size: CONFIG.DEFAULT_SIZE,
    fgColor: CONFIG.DEFAULT_FG,
    bgColor: CONFIG.DEFAULT_BG,
    errorLevel: 'H', // High error correction for logo support
    logo: null,
    logoSize: 20 // Logo size as percentage (max 28% for scanability)
  },
  history: [],
  currentData: null
};

// ============================================
// QR Data Generators
// ============================================

const QRDataGenerators = {
  url: () => {
    let url = document.getElementById('input-url').value.trim();
    if (!url) return null;
    
    // Auto-prefix with https if no protocol
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    
    // Validate URL
    try {
      new URL(url);
      return { data: url, display: url };
    } catch {
      showToast('Please enter a valid URL', 'error');
      return null;
    }
  },
  
  text: () => {
    const text = document.getElementById('input-text').value.trim();
    if (!text) {
      showToast('Please enter some text', 'error');
      return null;
    }
    return { data: text, display: text.substring(0, 50) + (text.length > 50 ? '...' : '') };
  },
  
  wifi: () => {
    const ssid = document.getElementById('wifi-ssid').value.trim();
    const password = document.getElementById('wifi-password').value;
    const encryption = document.getElementById('wifi-encryption').value;
    const hidden = document.getElementById('wifi-hidden')?.checked || false;
    
    if (!ssid) {
      showToast('Please enter network name (SSID)', 'error');
      return null;
    }
    
    // WiFi QR format: WIFI:T:WPA;S:mynetwork;P:mypass;H:false;;
    let wifiString = `WIFI:T:${encryption};S:${escapeWifiString(ssid)};`;
    if (password && encryption !== 'nopass') {
      wifiString += `P:${escapeWifiString(password)};`;
    }
    wifiString += `H:${hidden};;`;
    
    return { data: wifiString, display: `WiFi: ${ssid}` };
  },
  
  vcard: () => {
    const firstName = document.getElementById('vcard-firstname').value.trim();
    const lastName = document.getElementById('vcard-lastname').value.trim();
    const phone = document.getElementById('vcard-phone').value.trim();
    const email = document.getElementById('vcard-email').value.trim();
    const company = document.getElementById('vcard-company').value.trim();
    const title = document.getElementById('vcard-title').value.trim();
    const website = document.getElementById('vcard-website').value.trim();
    
    if (!firstName && !lastName) {
      showToast('Please enter at least a name', 'error');
      return null;
    }
    
    let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
    vcard += `N:${lastName};${firstName};;;\n`;
    vcard += `FN:${firstName} ${lastName}\n`;
    if (phone) vcard += `TEL:${phone}\n`;
    if (email) vcard += `EMAIL:${email}\n`;
    if (company) vcard += `ORG:${company}\n`;
    if (title) vcard += `TITLE:${title}\n`;
    if (website) vcard += `URL:${website}\n`;
    vcard += 'END:VCARD';
    
    return { data: vcard, display: `${firstName} ${lastName}`.trim() };
  },
  
  email: () => {
    const address = document.getElementById('email-address').value.trim();
    const subject = document.getElementById('email-subject').value.trim();
    const body = document.getElementById('email-body').value.trim();
    
    if (!address) {
      showToast('Please enter an email address', 'error');
      return null;
    }
    
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      showToast('Please enter a valid email address', 'error');
      return null;
    }
    
    let mailto = `mailto:${address}`;
    const params = [];
    if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
    if (body) params.push(`body=${encodeURIComponent(body)}`);
    if (params.length) mailto += '?' + params.join('&');
    
    return { data: mailto, display: address };
  },
  
  phone: () => {
    const number = document.getElementById('phone-number').value.trim();
    if (!number) {
      showToast('Please enter a phone number', 'error');
      return null;
    }
    
    return { data: `tel:${number}`, display: number };
  },
  
  sms: () => {
    const number = document.getElementById('sms-number').value.trim();
    const message = document.getElementById('sms-message').value.trim();
    
    if (!number) {
      showToast('Please enter a phone number', 'error');
      return null;
    }
    
    let smsUri = `sms:${number}`;
    if (message) {
      smsUri += `?body=${encodeURIComponent(message)}`;
    }
    
    return { data: smsUri, display: number };
  }
};

// Helper function to escape special characters in WiFi strings
function escapeWifiString(str) {
  return str.replace(/[\\;,"':]/g, '\\$&');
}

// ============================================
// Theme Management
// ============================================

function initTheme() {
  const savedTheme = localStorage.getItem(CONFIG.THEME_KEY);
  
  // Default to light theme for Neobrutalism aesthetic
  const theme = savedTheme || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(CONFIG.THEME_KEY, newTheme);
}

// ============================================
// Tab Management
// ============================================

function initTabs() {
  const tabs = document.querySelectorAll('.type-tab');
  const sections = document.querySelectorAll('.form-section');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.type;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active section
      sections.forEach(s => s.classList.remove('active'));
      document.getElementById(`section-${type}`).classList.add('active');
      
      state.currentType = type;
    });
  });
}

// ============================================
// Customization Panel
// ============================================

function initCustomization() {
  // Size slider
  const sizeSlider = document.getElementById('qr-size');
  const sizeValue = document.getElementById('size-value');
  
  sizeSlider.addEventListener('input', (e) => {
    state.customization.size = parseInt(e.target.value);
    sizeValue.textContent = `${e.target.value}px`;
  });
  
  // Foreground color
  const fgColor = document.getElementById('fg-color');
  const fgValue = document.getElementById('fg-value');
  
  fgColor.addEventListener('input', (e) => {
    state.customization.fgColor = e.target.value;
    fgValue.textContent = e.target.value.toUpperCase();
  });
  
  // Background color
  const bgColor = document.getElementById('bg-color');
  const bgValue = document.getElementById('bg-value');
  
  bgColor.addEventListener('input', (e) => {
    state.customization.bgColor = e.target.value;
    bgValue.textContent = e.target.value.toUpperCase();
  });
  
  // Logo size slider
  const logoSizeSlider = document.getElementById('logo-size');
  const logoSizeValue = document.getElementById('logo-size-value');
  
  if (logoSizeSlider) {
    logoSizeSlider.addEventListener('input', (e) => {
      state.customization.logoSize = parseInt(e.target.value);
      logoSizeValue.textContent = `${e.target.value}%`;
    });
  }
  
  // Logo upload
  const logoInput = document.getElementById('logo-input');
  const logoArea = document.getElementById('logo-upload-area');
  const logoPreview = document.getElementById('logo-preview');
  const removeLogo = document.getElementById('remove-logo');
  
  logoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        state.customization.logo = event.target.result;
        logoPreview.src = event.target.result;
        logoArea.classList.add('has-logo');
      };
      reader.readAsDataURL(file);
    }
  });
  
  removeLogo.addEventListener('click', (e) => {
    e.stopPropagation();
    state.customization.logo = null;
    logoInput.value = '';
    logoPreview.src = '';
    logoArea.classList.remove('has-logo');
  });
}

// ============================================
// QR Code Generation
// ============================================

function generateQRCode() {
  const generator = QRDataGenerators[state.currentType];
  if (!generator) return;
  
  const result = generator();
  if (!result) return;
  
  const { data, display } = result;
  state.currentData = { type: state.currentType, data, display };
  
  // Show loading state
  const btn = document.getElementById('generate-btn');
  btn.classList.add('loading');
  
  // Clear previous QR
  const qrContainer = document.getElementById('qrcode');
  qrContainer.innerHTML = '';
  
  // Determine appropriate size based on viewport
  let qrSize = state.customization.size;
  const isMobile = window.innerWidth <= 480;
  if (isMobile && qrSize > 220) {
    qrSize = 220; // Cap size on mobile
  }
  
  // Generate QR code
  setTimeout(() => {
    try {
      // Create QR code with canvas mode
      state.qrCode = new QRCode(qrContainer, {
        text: data,
        width: qrSize,
        height: qrSize,
        colorDark: state.customization.fgColor,
        colorLight: state.customization.bgColor,
        correctLevel: QRCode.CorrectLevel[state.customization.errorLevel]
      });
      
      // QRCode.js creates both canvas and img - hide the img to prevent duplicates
      setTimeout(() => {
        const imgEl = qrContainer.querySelector('img');
        if (imgEl) {
          imgEl.style.display = 'none';
        }
      }, 100);
      
      // Add logo if present - wait for QR to render fully
      if (state.customization.logo) {
        setTimeout(() => addLogoToQR(qrSize), 300);
      }
      
      // Update UI
      document.querySelector('.qr-display').classList.remove('empty');
      document.querySelector('.qr-display').classList.add('qr-generated');
      document.querySelector('.qr-placeholder').style.display = 'none';
      
      // Enable download buttons
      enableDownloadButtons();
      
      // Add to history
      setTimeout(() => addToHistory(), 350);
      
      showToast('QR Code generated successfully!', 'success');
    } catch (error) {
      console.error('QR generation error:', error);
      showToast('Failed to generate QR code', 'error');
    }
    
    btn.classList.remove('loading');
  }, 300);
}

function addLogoToQR(qrSize) {
  const qrContainer = document.getElementById('qrcode');
  if (!qrContainer || !state.customization.logo) return;
  
  const size = qrSize || state.customization.size;
  
  // QRCode.js creates both canvas and img - we need the canvas
  let canvas = qrContainer.querySelector('canvas');
  const img = qrContainer.querySelector('img');
  
  // If only img exists, we need to draw it to a canvas first
  if (!canvas && img) {
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    img.style.display = 'none';
    qrContainer.appendChild(canvas);
  }
  
  if (!canvas) {
    console.error('No canvas found for QR code');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const logo = new Image();
  logo.crossOrigin = 'anonymous';
  
  logo.onload = () => {
    const logoSizePercent = state.customization.logoSize / 100;
    const logoSize = Math.floor(size * logoSizePercent);
    const x = Math.floor((size - logoSize) / 2);
    const y = Math.floor((size - logoSize) / 2);
    const padding = 8;
    const borderRadius = 10;
    
    // Draw rounded white background for logo
    ctx.fillStyle = state.customization.bgColor;
    ctx.beginPath();
    
    // Rounded rectangle path (cross-browser compatible)
    const rx = x - padding;
    const ry = y - padding;
    const rw = logoSize + padding * 2;
    const rh = logoSize + padding * 2;
    
    ctx.moveTo(rx + borderRadius, ry);
    ctx.lineTo(rx + rw - borderRadius, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + borderRadius);
    ctx.lineTo(rx + rw, ry + rh - borderRadius);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - borderRadius, ry + rh);
    ctx.lineTo(rx + borderRadius, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - borderRadius);
    ctx.lineTo(rx, ry + borderRadius);
    ctx.quadraticCurveTo(rx, ry, rx + borderRadius, ry);
    ctx.closePath();
    ctx.fill();
    
    // Draw logo
    ctx.drawImage(logo, x, y, logoSize, logoSize);
    
    // Hide the img element if it exists (QRCode.js creates both)
    const imgEl = qrContainer.querySelector('img');
    if (imgEl) {
      imgEl.style.display = 'none';
    }
    
    console.log('Logo added successfully');
  };
  
  logo.onerror = (e) => {
    console.error('Failed to load logo image:', e);
  };
  
  logo.src = state.customization.logo;
}

// ============================================
// Download Functions
// ============================================

function enableDownloadButtons() {
  const buttons = document.querySelectorAll('.download-btn');
  buttons.forEach(btn => btn.removeAttribute('disabled'));
}

function downloadPNG() {
  const canvas = document.querySelector('#qrcode canvas');
  if (!canvas) return;
  
  const link = document.createElement('a');
  link.download = `qrcode-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  
  showToast('PNG downloaded!', 'success');
}

function downloadJPG() {
  const canvas = document.querySelector('#qrcode canvas');
  if (!canvas) return;
  
  // Create new canvas with white background
  const newCanvas = document.createElement('canvas');
  const padding = 20;
  newCanvas.width = canvas.width + padding * 2;
  newCanvas.height = canvas.height + padding * 2;
  
  const ctx = newCanvas.getContext('2d');
  ctx.fillStyle = state.customization.bgColor;
  ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
  ctx.drawImage(canvas, padding, padding);
  
  const link = document.createElement('a');
  link.download = `qrcode-${Date.now()}.jpg`;
  link.href = newCanvas.toDataURL('image/jpeg', 0.95);
  link.click();
  
  showToast('JPG downloaded!', 'success');
}

function downloadSVG() {
  const canvas = document.querySelector('#qrcode canvas');
  if (!canvas) return;
  
  // Convert canvas to SVG (simplified version)
  const size = state.customization.size;
  const dataUrl = canvas.toDataURL('image/png');
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="${state.customization.bgColor}"/>
  <image xlink:href="${dataUrl}" width="${size}" height="${size}"/>
</svg>`;
  
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.download = `qrcode-${Date.now()}.svg`;
  link.href = url;
  link.click();
  
  URL.revokeObjectURL(url);
  showToast('SVG downloaded!', 'success');
}

async function copyToClipboard() {
  const canvas = document.querySelector('#qrcode canvas');
  if (!canvas) return;
  
  const copyBtn = document.getElementById('copy-btn');
  
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    
    copyBtn.classList.add('copied');
    copyBtn.querySelector('.btn-text').textContent = 'Copied!';
    
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtn.querySelector('.btn-text').textContent = 'Copy to Clipboard';
    }, 2000);
    
    showToast('QR Code copied to clipboard!', 'success');
  } catch (error) {
    console.error('Copy failed:', error);
    showToast('Failed to copy. Try downloading instead.', 'error');
  }
}

// ============================================
// History Management
// ============================================

function loadHistory() {
  try {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    state.history = saved ? JSON.parse(saved) : [];
  } catch {
    state.history = [];
  }
  renderHistory();
}

function saveHistory() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.history));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

function addToHistory() {
  if (!state.currentData) return;
  
  const canvas = document.querySelector('#qrcode canvas');
  if (!canvas) return;
  
  // Check for duplicate - don't add if same data already exists
  const existingIndex = state.history.findIndex(h => 
    h.data === state.currentData.data && h.type === state.currentData.type
  );
  
  // If duplicate exists, remove it (we'll add fresh one at top)
  if (existingIndex !== -1) {
    state.history.splice(existingIndex, 1);
  }
  
  const historyItem = {
    id: Date.now(),
    type: state.currentData.type,
    data: state.currentData.data,
    display: state.currentData.display,
    preview: canvas.toDataURL('image/png'),
    customization: { ...state.customization },
    timestamp: new Date().toISOString()
  };
  
  // Remove logo from stored customization to save space
  delete historyItem.customization.logo;
  
  // Add to beginning, limit size
  state.history.unshift(historyItem);
  if (state.history.length > CONFIG.MAX_HISTORY) {
    state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
  }
  
  saveHistory();
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-list');
  
  if (state.history.length === 0) {
    container.innerHTML = '<div class="history-empty">No QR codes generated yet</div>';
    return;
  }
  
  container.innerHTML = state.history.map(item => `
    <div class="history-item" data-id="${item.id}">
      <div class="history-item-preview">
        <img src="${item.preview}" alt="QR Preview">
      </div>
      <div class="history-item-info">
        <div class="history-item-type">${getTypeLabel(item.type)}</div>
        <div class="history-item-content" title="${escapeHtml(item.display)}">${escapeHtml(item.display)}</div>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => restoreFromHistory(parseInt(el.dataset.id)));
  });
}

function restoreFromHistory(id) {
  const item = state.history.find(h => h.id === id);
  if (!item) return;
  
  // Switch to correct tab
  const tab = document.querySelector(`.type-tab[data-type="${item.type}"]`);
  if (tab) tab.click();
  
  // Restore customization
  if (item.customization) {
    state.customization.size = item.customization.size || CONFIG.DEFAULT_SIZE;
    state.customization.fgColor = item.customization.fgColor || CONFIG.DEFAULT_FG;
    state.customization.bgColor = item.customization.bgColor || CONFIG.DEFAULT_BG;
    
    // Update UI
    document.getElementById('qr-size').value = state.customization.size;
    document.getElementById('size-value').textContent = `${state.customization.size}px`;
    document.getElementById('fg-color').value = state.customization.fgColor;
    document.getElementById('fg-value').textContent = state.customization.fgColor.toUpperCase();
    document.getElementById('bg-color').value = state.customization.bgColor;
    document.getElementById('bg-value').textContent = state.customization.bgColor.toUpperCase();
  }
  
  // Set input value based on type
  setTimeout(() => {
    setInputForType(item.type, item.data);
    generateQRCode();
  }, 100);
}

function setInputForType(type, data) {
  switch (type) {
    case 'url':
      document.getElementById('input-url').value = data;
      break;
    case 'text':
      document.getElementById('input-text').value = data;
      break;
    case 'phone':
      document.getElementById('phone-number').value = data.replace('tel:', '');
      break;
    case 'email':
      const emailMatch = data.match(/mailto:([^?]+)/);
      if (emailMatch) document.getElementById('email-address').value = emailMatch[1];
      break;
    case 'sms':
      const smsMatch = data.match(/sms:([^?]+)/);
      if (smsMatch) document.getElementById('sms-number').value = smsMatch[1];
      break;
    // WiFi and vCard are complex, just show toast
    case 'wifi':
    case 'vcard':
      showToast('Restored from history. Customize and regenerate if needed.', 'success');
      break;
  }
}

function clearHistory() {
  if (!confirm('Clear all QR code history?')) return;
  
  state.history = [];
  saveHistory();
  renderHistory();
  showToast('History cleared', 'success');
}

function getTypeLabel(type) {
  const labels = {
    url: 'URL',
    text: 'Text',
    wifi: 'WiFi',
    vcard: 'Contact',
    email: 'Email',
    phone: 'Phone',
    sms: 'SMS'
  };
  return labels[type] || type;
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg viewBox="0 0 24 24">
      ${type === 'success' 
        ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'
        : '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'}
    </svg>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close">&times;</button>
  `;
  
  container.appendChild(toast);
  
  // Auto remove
  const timeout = setTimeout(() => removeToast(toast), 4000);
  
  // Manual close
  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearTimeout(timeout);
    removeToast(toast);
  });
}

function removeToast(toast) {
  toast.style.animation = 'slideInRight 0.3s ease reverse';
  setTimeout(() => toast.remove(), 300);
}

// ============================================
// Utility Functions
// ============================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// Keyboard Shortcuts
// ============================================

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      generateQRCode();
    }
    
    // Ctrl/Cmd + D to download PNG
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      downloadPNG();
    }
    
    // Ctrl/Cmd + Shift + D to download SVG
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      downloadSVG();
    }
  });
  
  // Enter key in inputs to generate
  document.querySelectorAll('.form-input, .form-textarea').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        generateQRCode();
      }
    });
  });
}

// ============================================
// Advanced Settings Toggle
// ============================================

function initAdvancedToggle() {
  const toggle = document.getElementById('advanced-toggle');
  const content = document.getElementById('advanced-content');
  
  if (toggle && content) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      content.classList.toggle('open');
    });
  }
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTabs();
  initCustomization();
  initAdvancedToggle();
  loadHistory();
  initKeyboardShortcuts();
  
  // Event Listeners
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('generate-btn').addEventListener('click', generateQRCode);
  document.getElementById('download-png').addEventListener('click', downloadPNG);
  document.getElementById('download-jpg').addEventListener('click', downloadJPG);
  document.getElementById('download-svg').addEventListener('click', downloadSVG);
  document.getElementById('copy-btn').addEventListener('click', copyToClipboard);
  document.getElementById('clear-history').addEventListener('click', clearHistory);
  
  // Focus first input
  document.getElementById('input-url').focus();
});

// Polyfill for roundRect (older browsers)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}
