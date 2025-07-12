// Configuration
const API_BASE = 'https://dny.li';
const API_ENDPOINTS = {
  create: '/admin/urls',
  list: '/all.json'
};

// DOM Elements
let urlInput, slugInput, createBtn, createForm, messageDiv, settingsBtn, settingsPanel, mainPanel;
let apiTokenInput, saveSettingsBtn, cancelSettingsBtn, searchInput, urlsList, statsDiv, totalCountSpan;

// State
let apiToken = null;
let allUrls = [];
let hasClickedToFocus = false;

// Initialize extension
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  await loadSettings();
  await loadCurrentPageInfo();
  await loadExistingUrls();
  setupEventListeners();
});


function initializeElements() {
  urlInput = document.getElementById('url-input');
  slugInput = document.getElementById('slug-input');
  createBtn = document.getElementById('create-btn');
  createForm = document.getElementById('create-form');
  messageDiv = document.getElementById('message');
  settingsBtn = document.getElementById('settings-btn');
  settingsPanel = document.getElementById('settings-panel');
  mainPanel = document.getElementById('main-panel');
  apiTokenInput = document.getElementById('api-token');
  saveSettingsBtn = document.getElementById('save-settings');
  cancelSettingsBtn = document.getElementById('cancel-settings');
  searchInput = document.getElementById('search-input');
  urlsList = document.getElementById('urls-list');
  statsDiv = document.getElementById('stats');
  totalCountSpan = document.getElementById('total-count');
}

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['apiToken']);
    apiToken = result.apiToken || null;
    
    if (!apiToken) {
      showSettings();
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function loadCurrentPageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith('chrome://')) {
      urlInput.value = tab.url;
      
      // Generate suggested slug from page title or URL
      const suggestedSlug = generateSlug(tab.title, tab.url);
      if (suggestedSlug) {
        slugInput.value = suggestedSlug;
      }
      
      // Reset the click-to-focus flag for new page
      hasClickedToFocus = false;
    }
  } catch (error) {
    console.error('Error loading current page info:', error);
  }
}

function generateSlug(title, url) {
  // Try title first, fallback to URL path
  let source = title;
  
  if (!source || source === 'New Tab' || source === '') {
    // Extract meaningful part from URL
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      source = pathParts[pathParts.length - 1] || urlObj.hostname;
    } catch {
      source = '';
    }
  }
  
  if (!source) return '';
  
  return source
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length
}

async function loadExistingUrls() {
  try {
    const response = await fetch(`${API_BASE}${API_ENDPOINTS.list}`);
    if (response.ok) {
      allUrls = await response.json();
      updateStats();
      renderUrlsList();
    } else {
      showMessage('Failed to load existing URLs', 'error');
    }
  } catch (error) {
    console.error('Error loading URLs:', error);
    showMessage('Failed to load existing URLs', 'error');
  }
}

function updateStats() {
  totalCountSpan.textContent = allUrls.length;
}

function renderUrlsList() {
  const filteredUrls = filterUrls();
  
  if (filteredUrls.length === 0) {
    urlsList.innerHTML = '<div class="no-results">No URLs found</div>';
    return;
  }
  
  const urlsHtml = filteredUrls.map(url => `
    <div class="url-item">
      <div class="url-info">
        <div class="url-slug">/${url.slug}</div>
        <div class="url-destination" title="${escapeHtml(url.url)}">${escapeHtml(url.url)}</div>
      </div>
      <button class="copy-btn" data-url="https://dny.li/${url.slug}" title="Copy short URL">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>
  `).join('');
  
  urlsList.innerHTML = urlsHtml;
}

function filterUrls() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  if (!searchTerm) return allUrls;
  
  return allUrls.filter(url => 
    url.slug.toLowerCase().includes(searchTerm) || 
    url.url.toLowerCase().includes(searchTerm)
  );
}

function setupEventListeners() {
  // Create form submission
  createForm.addEventListener('submit', handleCreateUrl);
  
  // Settings
  settingsBtn.addEventListener('click', showSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);
  cancelSettingsBtn.addEventListener('click', hideSettings);
  
  // Search
  searchInput.addEventListener('input', renderUrlsList);
  
  // Copy buttons (event delegation)
  urlsList.addEventListener('click', handleCopyClick);
  
  // Click anywhere to focus slug input (first time only)
  document.addEventListener('click', handleFirstClickFocus);
}

function handleFirstClickFocus(e) {
  // Only trigger on first click after panel opens
  if (hasClickedToFocus) return;
  
  // Don't trigger if clicking on interactive elements
  if (e.target.matches('button, input, a, label, [role="button"]') || 
      e.target.closest('button, input, a, label, [role="button"]')) {
    return;
  }
  
  // Don't trigger if settings panel is open
  if (!settingsPanel.classList.contains('hidden')) return;
  
  // Focus and select the slug input
  if (slugInput && slugInput.value) {
    slugInput.select();
    slugInput.focus();
    hasClickedToFocus = true;
  }
}

async function handleCreateUrl(e) {
  e.preventDefault();
  
  if (!apiToken) {
    showMessage('Please configure your API token in settings', 'error');
    showSettings();
    return;
  }
  
  const url = urlInput.value.trim();
  const slug = slugInput.value.trim();
  
  if (!url) {
    showMessage('Please enter a URL', 'error');
    return;
  }
  
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';
  
  try {
    const payload = { url };
    if (slug) payload.slug = slug;
    
    const response = await fetch(`${API_BASE}${API_ENDPOINTS.create}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      const shortUrl = result.shortUrl;
      
      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(shortUrl);
        showMessage(`Created and copied: ${shortUrl}`, 'success');
      } catch {
        showMessage(`Created: ${shortUrl}`, 'success');
      }
      
      // Clear form
      urlInput.value = '';
      slugInput.value = '';
      
      // Reload URLs list
      await loadExistingUrls();
      
      // Auto-populate current page again for next use
      setTimeout(() => {
        loadCurrentPageInfo();
        // Reset click flag so user can click to focus again
        hasClickedToFocus = false;
      }, 500);
      
    } else {
      showMessage(result.error || 'Failed to create short URL', 'error');
    }
  } catch (error) {
    console.error('Error creating URL:', error);
    showMessage('Failed to create short URL', 'error');
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Short URL';
  }
}

function handleCopyClick(e) {
  const copyBtn = e.target.closest('.copy-btn');
  if (!copyBtn) return;
  
  const url = copyBtn.dataset.url;
  navigator.clipboard.writeText(url).then(() => {
    const originalHtml = copyBtn.innerHTML;
    copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => {
      copyBtn.innerHTML = originalHtml;
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy:', err);
    showMessage('Failed to copy URL', 'error');
  });
}

function showSettings() {
  settingsPanel.classList.remove('hidden');
  mainPanel.classList.add('hidden');
  if (apiToken) {
    apiTokenInput.value = apiToken;
  }
  apiTokenInput.focus();
}

function hideSettings() {
  settingsPanel.classList.add('hidden');
  mainPanel.classList.remove('hidden');
}

async function saveSettings() {
  const token = apiTokenInput.value.trim();
  
  if (!token) {
    showMessage('Please enter an API token', 'error');
    return;
  }
  
  try {
    await chrome.storage.sync.set({ apiToken: token });
    apiToken = token;
    hideSettings();
    showMessage('Settings saved', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage('Failed to save settings', 'error');
  }
}

function showMessage(text, type = 'info') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.classList.remove('hidden');
  
  setTimeout(() => {
    messageDiv.classList.add('hidden');
  }, 5000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}