// API Configuration
let API_BASE_URL = 'http://localhost:3000/api'; // Default local development URL

// Load settings from Chrome storage
chrome.storage.sync.get(['apiUrl', 'apiKey', 'dbType'], function(result) {
  if (result.apiUrl && result.dbType === 'api') {
    API_BASE_URL = result.apiUrl;
  }
});

// Update stored count on popup load
document.addEventListener('DOMContentLoaded', function() {
  updateStoredCount();
  loadSettings();
  
  // Setup database type change handler
  const dbTypeSelect = document.getElementById('dbType');
  dbTypeSelect.addEventListener('change', toggleApiFields);
  toggleApiFields(); // Initial call
});

// Toggle API fields based on database type
function toggleApiFields() {
  const dbType = document.getElementById('dbType').value;
  const apiUrlGroup = document.getElementById('apiUrlGroup');
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  
  if (dbType === 'api' || dbType === 'mysql') {
    apiUrlGroup.style.display = 'block';
    apiKeyGroup.style.display = 'block';
    
    // Set default URL for MySQL
    if (dbType === 'mysql') {
      document.getElementById('apiUrl').value = API_BASE_URL;
    }
  } else {
    apiUrlGroup.style.display = 'none';
    apiKeyGroup.style.display = 'none';
  }
}

// Load settings from Chrome storage
function loadSettings() {
  chrome.storage.sync.get(['dbType', 'apiUrl', 'apiKey'], function(result) {
    if (result.dbType) {
      document.getElementById('dbType').value = result.dbType;
    }
    if (result.apiUrl) {
      document.getElementById('apiUrl').value = result.apiUrl;
    }
    if (result.apiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
    toggleApiFields();
  });
}

// Save settings to Chrome storage
function saveSettings() {
  const dbType = document.getElementById('dbType').value;
  const apiUrl = document.getElementById('apiUrl').value;
  const apiKey = document.getElementById('apiKey').value;
  
  chrome.storage.sync.set({
    dbType: dbType,
    apiUrl: apiUrl,
    apiKey: apiKey
  }, function() {
    showStatus('settingsStatus', 'Settings saved successfully!', 'success');
    
    // Update API_BASE_URL if using API
    if (dbType === 'api' || dbType === 'mysql') {
      API_BASE_URL = apiUrl;
    }
  });
}

// Test database connection
async function testConnection() {
  const dbType = document.getElementById('dbType').value;
  
  if (dbType === 'local') {
    showStatus('settingsStatus', 'Local storage is always available', 'success');
    return;
  }
  
  try {
    const apiUrl = document.getElementById('apiUrl').value;
    if (!apiUrl) {
      showStatus('settingsStatus', 'Please enter an API URL', 'error');
      return;
    }
    
    const response = await fetch(`${apiUrl}/test`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': document.getElementById('apiKey').value ? `Bearer ${document.getElementById('apiKey').value}` : ''
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      showStatus('settingsStatus', 'Connection successful!', 'success');
    } else {
      showStatus('settingsStatus', `Connection failed: ${result.message}`, 'error');
    }
  } catch (error) {
    showStatus('settingsStatus', `Connection error: ${error.message}`, 'error');
  }
}

// Update stored count
async function updateStoredCount() {
  try {
    const count = await getRecordCount();
    document.getElementById('storedCount').textContent = count;
  } catch (error) {
    console.error('Error updating count:', error);
    document.getElementById('storedCount').textContent = '?';
  }
}

// Get record count from API
async function getRecordCount() {
  try {
    const response = await fetch(`${API_BASE_URL}/emails/count`);
    const result = await response.json();
    
    if (result.success) {
      return result.count;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Error getting record count:', error);
    return 0;
  }
}

// View stored emails
async function viewStoredEmails() {
  try {
    const response = await fetch(`${API_BASE_URL}/emails`);
    const result = await response.json();
    
    if (result.success) {
      // Create a new tab with the records list
      const recordsHtml = generateEmailsListHtml(result.records);
      const blob = new Blob([recordsHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url: url });
    } else {
      alert('Failed to fetch records: ' + result.message);
    }
  } catch (error) {
    alert('Error fetching records: ' + error.message);
  }
}

// Generate HTML for records list
function generateEmailsListHtml(records) {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Database Records</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .record { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .record-header { font-weight: bold; margin-bottom: 10px; color: #2c5aa0; }
        .record-meta { color: #666; font-size: 12px; margin-bottom: 8px; }
        .gmail-link { color: #1a73e8; text-decoration: none; margin: 10px 0; display: block; }
        .gmail-link:hover { text-decoration: underline; }
        .delete-btn { background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; }
        .status-badge { padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
        .pending { background: #fff3cd; color: #856404; }
        .approved { background: #d4edda; color: #155724; }
      </style>
    </head>
    <body>
      <h1>Database Records - des_drg_pend_st (${records.length})</h1>
  `;
  
  records.forEach(record => {
    html += `
      <div class="record">
        <div class="record-header">Record ID: ${record.id}</div>
        <div class="record-meta">
          <span class="status-badge pending">Status: ${record.status}</span>
          <span class="status-badge pending">Mech Status: ${record.mech_st}</span>
          <span class="status-badge approved">First Sub: ${record.frst_sub}</span>
        </div>
        <div class="record-meta">
          Assigned Mechanic: <strong>${record.assgn_mech}</strong>
        </div>
        <div class="record-meta">
          Comment Date: ${new Date(record.comment_dt).toLocaleString()}
        </div>
        ${record.comments_link ? `<a href="${record.comments_link}" class="gmail-link" target="_blank">📧 View in Gmail</a>` : ''}
        <button class="delete-btn" onclick="deleteRecord(${record.id})">Delete</button>
      </div>
    `;
  });
  
  html += `
    </body>
    </html>
  `;
  
  return html;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export emails to CSV
async function exportEmails() {
  try {
    const response = await fetch(`${API_BASE_URL}/emails`);
    const result = await response.json();
    
    if (result.success) {
      const csv = convertEmailsToCSV(result.records);
      downloadCSV(csv, 'database_records.csv');
    } else {
      alert('Failed to fetch records: ' + result.message);
    }
  } catch (error) {
    alert('Error exporting records: ' + error.message);
  }
}

// Convert records to CSV format
function convertEmailsToCSV(records) {
  const headers = ['ID', 'Status', 'Mech Status', 'Assigned Mechanic', 'First Sub', 'Comment Date', 'Gmail Link'];
  const csvContent = [headers.join(',')];
  
  records.forEach(record => {
    const row = [
      record.id,
      `"${(record.status || '').replace(/"/g, '""')}"`,
      `"${(record.mech_st || '').replace(/"/g, '""')}"`,
      `"${(record.assgn_mech || '').replace(/"/g, '""')}"`,
      `"${(record.frst_sub || '').replace(/"/g, '""')}"`,
      record.comment_dt ? new Date(record.comment_dt).toISOString() : '',
      `"${(record.comments_link || '').replace(/"/g, '""')}"`
    ];
    csvContent.push(row.join(','));
  });
  
  return csvContent.join('\n');
}

// Download CSV file
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Clear all data
async function clearAllData() {
  if (!confirm('Are you sure you want to clear all stored records? This action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/emails`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('All records cleared successfully!');
      updateStoredCount();
    } else {
      alert('Failed to clear records: ' + result.message);
    }
  } catch (error) {
    alert('Error clearing records: ' + error.message);
  }
}

// Open Gmail
function openGmail() {
  chrome.tabs.create({ url: 'https://mail.google.com' });
}

// Show status message
function showStatus(elementId, message, type) {
  const statusDiv = document.getElementById(elementId);
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

// Store email (called from content script)
window.storeEmail = async function(emailData) {
  try {
    const response = await fetch(`${API_BASE_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, message: error.message };
  }
};