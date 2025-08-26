// Background service worker for Crane Email Database Extension

// Installation and setup
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Crane Email Database Extension installed');
    
    // Set default settings
    chrome.storage.sync.set({
      dbType: 'mysql',
      apiUrl: 'http://localhost:3000/api',
      apiKey: ''
    });
    
    // Open welcome page or instructions
    
  } else if (details.reason === 'update') {
    console.log('Crane Email Database Extension updated');
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Open popup (this is handled automatically by manifest action.default_popup)
  console.log('Extension icon clicked');
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action) {
    case 'storeEmail':
      handleStoreEmail(request.emailData, sendResponse);
      return true; // Keep the message channel open for async response
      
    case 'getSettings':
      handleGetSettings(sendResponse);
      return true;
      
    case 'updateSettings':
      handleUpdateSettings(request.settings, sendResponse);
      return true;
      
    case 'testConnection':
      handleTestConnection(request.apiUrl, request.apiKey, sendResponse);
      return true;
      
    case 'downloadFile':
      handleDownloadFile(request.url, request.filename, request.originalFilename, sendResponse);
      return true;
      
    default:
      console.log('Unknown action:', request.action);
      sendResponse({ success: false, message: 'Unknown action' });
  }
});

// Handle file download with specific path
async function handleDownloadFile(url, filename, originalFilename, sendResponse) {
  try {
    // Try to download with the specific path first
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false // Don't show save dialog, use suggested path
    }).catch(async (error) => {
      console.log('Specific path download failed, trying with saveAs:', error);
      
      // If specific path fails, try with save dialog
      return await chrome.downloads.download({
        url: url,
        filename: originalFilename,
        saveAs: true // Show save dialog so user can navigate to correct folder
      }).catch(async (fallbackError) => {
        console.log('Save dialog download failed, using default:', fallbackError);
        
        // Final fallback: download to default location
        return await chrome.downloads.download({
          url: url,
          filename: originalFilename
        });
      });
    });
    
    console.log('File download initiated with ID:', downloadId);
    
    // Monitor download progress
    const downloadListener = (downloadDelta) => {
      if (downloadDelta.id === downloadId) {
        if (downloadDelta.state && downloadDelta.state.current === 'complete') {
          console.log('Download completed successfully');
          chrome.downloads.onChanged.removeListener(downloadListener);
        } else if (downloadDelta.state && downloadDelta.state.current === 'interrupted') {
          console.log('Download interrupted');
          chrome.downloads.onChanged.removeListener(downloadListener);
        }
      }
    };
    
    chrome.downloads.onChanged.addListener(downloadListener);
    
    sendResponse({ 
      success: true, 
      downloadId: downloadId,
      message: 'Download started successfully'
    });
    
  } catch (error) {
    console.error('Download error:', error);
    sendResponse({ 
      success: false, 
      message: `Download failed: ${error.message}` 
    });
  }
}

// Handle storing email
async function handleStoreEmail(emailData, sendResponse) {
  try {
    // Get current settings
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(['dbType', 'apiUrl', 'apiKey'], resolve);
    });
    
    let result;
    
    if (settings.dbType === 'local') {
      // Store locally using Chrome storage
      result = await storeEmailLocally(emailData);
    } else {
      // Send to API
      const apiUrl = settings.apiUrl || 'http://localhost:3000/api';
      result = await sendEmailToAPI(emailData, apiUrl, settings.apiKey);
    }
    
    sendResponse(result);
    
  } catch (error) {
    console.error('Error storing email:', error);
    sendResponse({ success: false, message: error.message });
  }
}

// Store email locally in Chrome storage
async function storeEmailLocally(emailData) {
  return new Promise((resolve) => {
    // Get existing emails
    chrome.storage.local.get(['emails'], (result) => {
      const emails = result.emails || [];
      
      // Check if email already exists
      const existingIndex = emails.findIndex(email => email.emailId === emailData.emailId);
      
      if (existingIndex !== -1) {
        resolve({ success: false, message: 'Email already exists in local storage' });
        return;
      }
      
      // Add timestamp
      emailData.createdAt = new Date().toISOString();
      emailData.id = Date.now(); // Simple ID for local storage
      
      // Add new email
      emails.push(emailData);
      
      // Store back
      chrome.storage.local.set({ emails }, () => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, message: chrome.runtime.lastError.message });
        } else {
          resolve({ success: true, message: 'Email stored locally', id: emailData.id });
        }
      });
    });
  });
}

// Send email to API
async function sendEmailToAPI(emailData, apiUrl, apiKey) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(`${apiUrl}/emails`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(emailData)
    });
    
    const result = await response.json();
    return result;
    
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

// Handle getting settings
function handleGetSettings(sendResponse) {
  chrome.storage.sync.get(['dbType', 'apiUrl', 'apiKey'], (result) => {
    sendResponse({ success: true, settings: result });
  });
}

// Handle updating settings
function handleUpdateSettings(settings, sendResponse) {
  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, message: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true, message: 'Settings updated successfully' });
    }
  });
}

// Handle testing connection
async function handleTestConnection(apiUrl, apiKey, sendResponse) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(`${apiUrl}/test`, {
      method: 'GET',
      headers: headers
    });
    
    const result = await response.json();
    sendResponse(result);
    
  } catch (error) {
    sendResponse({ success: false, message: `Connection test failed: ${error.message}` });
  }
}

// Handle tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('mail.google.com')) {
    console.log('Gmail tab loaded, content script should be active');
  }
});

// Keep service worker alive
chrome.runtime.onConnect.addListener((port) => {
  console.log('Port connected:', port.name);
});

// Handle external messages (if needed for API communication)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('External message received:', request);
  // Handle external API calls if needed
  sendResponse({ success: true });
});

console.log('Crane Email Database background service worker loaded');