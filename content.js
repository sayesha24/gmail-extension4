// Gmail Email Extractor and Database Sender
// This script runs on Gmail pages and adds the "Send to Database" button

// Configuration
let API_BASE_URL = 'https://your-project-name.vercel.app/api';


// Load API configuration from storage
chrome.storage.sync.get(['apiUrl', 'dbType'], function(result) {
  if (result.apiUrl && (result.dbType === 'api' || result.dbType === 'mysql')) {
    API_BASE_URL = result.apiUrl;
  }
});

// Dynamic folder calculation algorithm
function calculateFolderRange(clientId) {
  const clientNum = parseInt(clientId);
  
  // Calculate the range based on hundreds
  const lowerBound = Math.floor(clientNum / 100) * 100;
  const upperBound = lowerBound + 99;
  
  return `CON-${lowerBound}-${upperBound}`;
}

// Wait for Gmail to load
function waitForGmail() {
  if (window.location.hostname === 'mail.google.com') {
    console.log('Gmail detected, initializing email database extension...');
    initializeExtension();
  }
}

// Initialize the extension
function initializeExtension() {
  // Wait for Gmail to fully load
  setTimeout(() => {
    addSendToDatabaseButton();
    
    // Monitor for URL changes (Gmail is a SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(addSendToDatabaseButton, 1000);
      }
    }).observe(document, { subtree: true, childList: true });
    
  }, 2000);
}

// Add the "Send to Database" button
function addSendToDatabaseButton() {
  // Remove existing button if present
  const existingButton = document.querySelector('.crane-db-button');
  if (existingButton) {
    existingButton.remove();
  }
  
  // Check if we're viewing an email
  if (!isEmailView()) {
    return;
  }
  
  // Find the toolbar where we'll add our button
  const toolbar = findEmailToolbar();
  if (!toolbar) {
    console.log('Email toolbar not found, retrying...');
    setTimeout(addSendToDatabaseButton, 1000);
    return;
  }
  
  // Create the button
  const button = createSendButton();
  
  // Add button to toolbar
  toolbar.appendChild(button);
  console.log('Send to Database button added');
}

// Check if current view is an email
function isEmailView() {
  // Gmail email view indicators
  return document.querySelector('[data-message-id]') !== null ||
         document.querySelector('.ii.gt .a3s') !== null ||
         document.querySelector('.AO .adn') !== null ||
         location.href.includes('/mail/u/') && location.href.includes('#inbox/');
}

// Find the email toolbar
function findEmailToolbar() {
  // Try multiple selectors for different Gmail layouts
  const toolbarSelectors = [
    '.G-Ni.J-J5-Ji',           // Main email toolbar
    '.ar9.T-I-J3.J-J5-Ji',     // Alternative toolbar
    '.aaq',                    // Another toolbar variant
    '.G-Ni',                   // Simplified selector
    '[role="toolbar"]'         // Generic toolbar
  ];
  
  for (const selector of toolbarSelectors) {
    const toolbar = document.querySelector(selector);
    if (toolbar) {
      return toolbar;
    }
  }
  
  // If no specific toolbar found, try to find any suitable container
  const containers = document.querySelectorAll('.T-I-J3, .ar, .G-Ni');
  for (const container of containers) {
    if (container.offsetParent !== null) { // Check if visible
      return container;
    }
  }
  
  return null;
}

// Create the send button
function createSendButton() {
  const button = document.createElement('div');
  button.className = 'T-I J-J5-Ji ar7 nf T-I-ax7 L3 crane-db-button';
  button.style.cssText = `
    background: #4285f4;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    margin: 0 4px;
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    font-weight: 500;
    transition: background-color 0.2s;
    user-select: none;
  `;
  
  button.innerHTML = '📤 Send to Database';
  
  // Hover effects
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = '#3367d6';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = '#4285f4';
  });
  
  // Click handler
  button.addEventListener('click', handleSendToDatabase);
  
  return button;
}

// Handle sending email to database
async function handleSendToDatabase(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const button = event.target;
  const originalText = button.innerHTML;
  
  console.log('=== GMAIL BUTTON CLICKED ===');
  
  try {
    // First prompt: Mail type selection
    const mailType = await showMailTypeDialog();
    if (!mailType) {
      console.log('User cancelled mail type selection');
      return; // User cancelled
    }
    
    // Second prompt: Client ID input
    const clientId = await showClientIdDialog();
    if (!clientId) {
      console.log('User cancelled client ID input');
      return; // User cancelled
    }
    
    console.log('User inputs - Mail type:', mailType, 'Client ID:', clientId);
    
    // Show loading state
    button.innerHTML = '⏳ Sending...';
    button.style.backgroundColor = '#ffa500';
    button.style.pointerEvents = 'none';
    
    // Extract email data
    console.log('Extracting complete email data for .eml export...');
    const emailData = extractCompleteEmailData();
    
    console.log('Extracted email data:', emailData);
    
    if (!emailData) {
      throw new Error('Could not extract email data');
    }
    
    // Add user inputs to email data
    emailData.mailType = mailType;
    emailData.clientId = clientId;
    
    // Validate required fields
    if (!emailData.emailId || !emailData.subject || !emailData.sender) {
      console.error('Missing required fields:', {
        emailId: !!emailData.emailId,
        subject: !!emailData.subject,
        sender: !!emailData.sender
      });
      throw new Error('Missing required fields');
    }
    
    // Generate .eml file
    console.log('Generating .eml file...');
    const emlContent = generateEmlContent(emailData);
    const emlFilename = generateEmlFilename(emailData, clientId, mailType);
    
    console.log('Generated filename:', emlFilename);
    
    // Try to save to specific folder using File System Access API (with date folder)
    let savedPath;
    try {
      savedPath = await saveToSpecificFolder(emlContent, emlFilename, clientId, emailData.dateReceived);
    } catch (error) {
      console.log('File System Access API failed, falling back to regular download:', error);
      // Fallback to regular download
      downloadEmlFile(emlContent, emlFilename);
      savedPath = `Downloads folder (please move to: ${getSpecificFolderPath(clientId, emlFilename, emailData.dateReceived)})`;
    }
    
    // Create file path for database (with date folder)
    const specificPath = savedPath.includes('Downloads') ? 
      getSpecificFolderPath(clientId, emlFilename, emailData.dateReceived) : savedPath;
    emailData.emlFilePath = specificPath;
    
    console.log('Sending to API with file path...');
    
    // Send to database
    const result = await sendEmailToDatabase(emailData);
    
    console.log('API result:', result);
    
    if (result.success) {
      // Success state
      button.innerHTML = '✅ Sent!';
      button.style.backgroundColor = '#0f9d58';
      
      // Show success notification with file location
      const locationMsg = savedPath.includes('Downloads') 
        ? `File downloaded to Downloads. Please move to: ${specificPath}`
        : `File saved to: ${savedPath}`;
      
      showNotification(`Email sent successfully! ${locationMsg} | Record ID: ${result.id} | Type: ${mailType} | Client: ${clientId}`, 'success');
      
    } else {
      throw new Error(result.message || 'Failed to send email');
    }
    
  } catch (error) {
    console.error('Error sending email to database:', error);
    
    // Error state
    button.innerHTML = '❌ Failed';
    button.style.backgroundColor = '#d93025';
    
    // Show error notification
    showNotification('Failed to send email: ' + error.message, 'error');
  }
  
  // Reset button after 3 seconds
  setTimeout(() => {
    button.innerHTML = originalText;
    button.style.backgroundColor = '#4285f4';
    button.style.pointerEvents = 'auto';
  }, 3000);
}

// Show mail type selection dialog
function showMailTypeDialog() {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      text-align: center;
      font-family: Arial, sans-serif;
    `;
    
    modal.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: #333;">Select Mail Type</h3>
      <div style="margin: 20px 0;">
        <button class="mail-type-btn" data-type="approval" style="
          background: #4285f4; color: white; border: none; padding: 12px 24px; 
          margin: 5px; border-radius: 4px; cursor: pointer; font-size: 14px;
        ">Approval</button>
        <button class="mail-type-btn" data-type="cmnt" style="
          background: #4285f4; color: white; border: none; padding: 12px 24px; 
          margin: 5px; border-radius: 4px; cursor: pointer; font-size: 14px;
        ">Comment</button>
        <button class="mail-type-btn" data-type="fs" style="
          background: #4285f4; color: white; border: none; padding: 12px 24px; 
          margin: 5px; border-radius: 4px; cursor: pointer; font-size: 14px;
        ">FS</button>
      </div>
      <button id="cancel-mail-type" style="
        background: #ccc; color: #333; border: none; padding: 8px 16px; 
        border-radius: 4px; cursor: pointer; font-size: 12px;
      ">Cancel</button>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Add hover effects
    const buttons = modal.querySelectorAll('.mail-type-btn');
    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', () => btn.style.backgroundColor = '#3367d6');
      btn.addEventListener('mouseleave', () => btn.style.backgroundColor = '#4285f4');
      btn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(btn.getAttribute('data-type'));
      });
    });
    
    // Cancel button
    modal.querySelector('#cancel-mail-type').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    });
  });
}

// Show client ID input dialog with dynamic path preview
function showClientIdDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      text-align: center;
      font-family: Arial, sans-serif;
    `;
    
    modal.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: #333;">Enter Client ID</h3>
      <p style="margin: 0 0 15px 0; color: #666; font-size: 12px;">
        The file will be saved to: design\\contractdrgs New\\CON-[RANGE]\\[ClientID]\\RECIEVED\\[DATE]\\
      </p>
      <input type="text" id="client-id-input" placeholder="Enter client ID (e.g., 7640, 6503, 8829)..." style="
        width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; 
        font-size: 14px; margin: 10px 0; box-sizing: border-box;
      ">
      <div style="margin-top: 20px;">
        <button id="submit-client-id" style="
          background: #4285f4; color: white; border: none; padding: 12px 24px; 
          margin: 5px; border-radius: 4px; cursor: pointer; font-size: 14px;
        ">Submit</button>
        <button id="cancel-client-id" style="
          background: #ccc; color: #333; border: none; padding: 12px 24px; 
          margin: 5px; border-radius: 4px; cursor: pointer; font-size: 14px;
        ">Cancel</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#client-id-input');
    const submitBtn = modal.querySelector('#submit-client-id');
    const cancelBtn = modal.querySelector('#cancel-client-id');
    
    setTimeout(() => input.focus(), 100);
    
    // Update path preview dynamically as user types
    input.addEventListener('input', () => {
      const clientId = input.value.trim();
      const pathPreview = modal.querySelector('p');
      
      if (clientId && /^\d+$/.test(clientId)) {
        const rangeFolder = calculateFolderRange(clientId);
        const folderPath = `design\\contractdrgs New\\${rangeFolder}\\${clientId}\\RECIEVED\\[DATE]\\`;
        
        pathPreview.textContent = `The file will be saved to: ${folderPath}`;
        pathPreview.style.color = '#0066cc';
      } else {
        pathPreview.textContent = 'The file will be saved to: design\\contractdrgs New\\CON-[RANGE]\\[ClientID]\\RECIEVED\\[DATE]\\';
        pathPreview.style.color = '#666';
      }
    });
    
    const submit = () => {
      const value = input.value.trim();
      if (value) {
        document.body.removeChild(overlay);
        resolve(value);
      } else {
        input.style.borderColor = 'red';
        input.placeholder = 'Client ID is required!';
      }
    };
    
    submitBtn.addEventListener('click', submit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submit();
    });
    
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    });
  });
}

// Extract complete email data including headers for .eml format
function extractCompleteEmailData() {
  try {
    // Get Gmail message ID from URL
    const messageId = getMessageIdFromUrl();
    
    // Extract basic data
    const subject = extractSubject();
    const sender = extractSender();
    const recipient = extractRecipient();
    const dateReceived = extractDate();
    const content = extractContent();
    const attachments = extractAttachments();
    
    // Extract additional email headers for .eml format
    const emailHeaders = extractEmailHeaders();
    
    return {
      emailId: messageId,
      subject: subject,
      sender: sender,
      recipient: recipient,
      dateReceived: dateReceived,
      content: content,
      attachments: attachments,
      headers: emailHeaders
    };
    
  } catch (error) {
    console.error('Error extracting complete email data:', error);
    return null;
  }
}

// Extract email headers for .eml format
function extractEmailHeaders() {
  const headers = {};
  
  try {
    // Try to get headers from various Gmail elements
    const messageElement = document.querySelector('[data-message-id]');
    if (messageElement) {
      headers.messageId = messageElement.getAttribute('data-message-id');
    }
    
    // Get received date in proper format
    const dateElement = document.querySelector('.g3');
    if (dateElement) {
      const dateTitle = dateElement.getAttribute('title');
      if (dateTitle) {
        headers.receivedDate = new Date(dateTitle).toUTCString();
      }
    }
    
    // Get reply-to if available
    const replyToElement = document.querySelector('[email]');
    if (replyToElement) {
      headers.replyTo = replyToElement.getAttribute('email');
    }
    
    return headers;
  } catch (error) {
    console.error('Error extracting headers:', error);
    return {};
  }
}

// Generate .eml content
function generateEmlContent(emailData) {
  const { subject, sender, recipient, dateReceived, content, headers } = emailData;
  
  // Format date for email header
  const emailDate = new Date(dateReceived).toUTCString();
  
  // Create .eml content with proper headers
  let emlContent = '';
  emlContent += `From: ${sender}\r\n`;
  emlContent += `To: ${recipient}\r\n`;
  emlContent += `Subject: ${subject}\r\n`;
  emlContent += `Date: ${emailDate}\r\n`;
  emlContent += `Message-ID: <${emailData.emailId}@gmail.com>\r\n`;
  emlContent += `MIME-Version: 1.0\r\n`;
  emlContent += `Content-Type: text/html; charset=UTF-8\r\n`;
  emlContent += `Content-Transfer-Encoding: quoted-printable\r\n`;
  emlContent += `\r\n`;
  
  // Add email body (convert HTML content)
  emlContent += content;
  emlContent += `\r\n`;
  
  return emlContent;
}

// Generate filename for .eml file
function generateEmlFilename(emailData, clientId, mailType) {
  const { subject, dateReceived } = emailData;
  
  // Format date as YYYY-MM-DD
  const date = new Date(dateReceived);
  const dateStr = date.toISOString().split('T')[0];
  
  // Clean subject for filename (remove invalid characters)
  const cleanSubject = subject.replace(/[<>:"/\\|?*]/g, '').substring(0, 50);
  
  // Create filename: Date_Subject_ClientID_Type.eml
  const filename = `${dateStr}_${cleanSubject}_${clientId}_${mailType}.eml`;
  
  return filename;
}

// Get the specific folder path based on client ID (WITH DYNAMIC ALGORITHM AND DATE FOLDER)
function getSpecificFolderPath(clientId, filename, emailDate) {
  let folderPath = 'design\\contractdrgs New\\';
  
  // Format email date as YYYY-MM-DD for folder name
  const date = new Date(emailDate);
  const dateFolder = date.toISOString().split('T')[0];
  
  // Calculate range folder dynamically
  const rangeFolder = calculateFolderRange(clientId);
  
  // Build path: design\contractdrgs New\CON-XXXX-YYYY\ClientID\RECIEVED\DATE\
  folderPath += `${rangeFolder}\\${clientId}\\RECIEVED\\${dateFolder}\\`;
  
  return folderPath + filename;
}

// Save file to specific folder using File System Access API (WITH DYNAMIC ALGORITHM AND DATE FOLDER)
async function saveToSpecificFolder(emlContent, filename, clientId, emailDate) {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API not supported');
  }
  
  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });
    
    let targetDir = dirHandle;
    
    // Navigate to contractdrgs New folder
    try {
      targetDir = await targetDir.getDirectoryHandle('contractdrgs New');
    } catch (error) {
      targetDir = await targetDir.getDirectoryHandle('contractdrgs New', { create: true });
    }
    
    // Calculate and create range folder dynamically
    const rangeFolder = calculateFolderRange(clientId);
    try {
      targetDir = await targetDir.getDirectoryHandle(rangeFolder);
    } catch (error) {
      targetDir = await targetDir.getDirectoryHandle(rangeFolder, { create: true });
    }
    
    // Create individual client folder
    try {
      targetDir = await targetDir.getDirectoryHandle(clientId);
    } catch (error) {
      targetDir = await targetDir.getDirectoryHandle(clientId, { create: true });
    }
    
    // Create RECIEVED folder
    try {
      targetDir = await targetDir.getDirectoryHandle('RECIEVED');
    } catch (error) {
      targetDir = await targetDir.getDirectoryHandle('RECIEVED', { create: true });
    }
    
    // Create date folder
    const date = new Date(emailDate);
    const dateFolder = date.toISOString().split('T')[0];
    
    try {
      targetDir = await targetDir.getDirectoryHandle(dateFolder);
    } catch (error) {
      targetDir = await targetDir.getDirectoryHandle(dateFolder, { create: true });
    }
    
    // Create and write the file
    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(emlContent);
    await writable.close();
    
    // Return full path
    const fullPath = `design\\contractdrgs New\\${rangeFolder}\\${clientId}\\RECIEVED\\${dateFolder}\\${filename}`;
    console.log('File saved successfully to:', fullPath);
    
    return fullPath;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('User cancelled folder selection');
    }
    throw error;
  }
}

// Fallback download function (regular browser download)
function downloadEmlFile(emlContent, filename) {
  try {
    // Create blob with .eml content
    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Error downloading .eml file:', error);
    return false;
  }
}

// Get message ID from URL (more reliable for Gmail links)
function getMessageIdFromUrl() {
  const url = window.location.href;
  console.log('Extracting email ID from URL:', url);
  
  // Extract message ID from Gmail URL patterns - updated for longer IDs
  const patterns = [
    /\/mail\/u\/\d+\/#inbox\/([a-zA-Z0-9]+)/,     // Standard inbox view
    /\/mail\/u\/\d+\/#[^\/]+\/([a-zA-Z0-9]+)/,    // Other folder views
    /\/#[^\/]*\/([a-zA-Z0-9]{10,})/,              // Any view with long message ID
    /#[\w\/]*\/([a-zA-Z0-9]{10,})(?:\/.*)?$/,     // More flexible pattern
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = url.match(pattern);
    console.log(`Pattern ${i + 1} (${pattern}):`, match ? match[1] : 'NO MATCH');
    if (match && match[1] && match[1].length >= 10) {
      console.log('Gmail message ID found:', match[1]);
      return match[1];
    }
  }
  
  // Fallback: try to get from DOM
  const messageElement = document.querySelector('[data-message-id]');
  if (messageElement) {
    const messageId = messageElement.getAttribute('data-message-id');
    if (messageId) {
      console.log('Message ID from DOM:', messageId);
      return messageId;
    }
  }
  
  // Last resort: extract manually from URL
  const urlParts = url.split('/');
  const hashPart = url.split('#')[1];
  if (hashPart) {
    const parts = hashPart.split('/');
    for (const part of parts) {
      if (part.length >= 20 && /^[a-zA-Z0-9]+$/.test(part)) {
        console.log('Found long alphanumeric part:', part);
        return part;
      }
    }
  }
  
  // Generate fallback ID
  const subject = extractSubject() || 'no-subject';
  const sender = extractSender() || 'no-sender';
  const timestamp = Date.now();
  const fallbackId = `email_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
  console.log('Using fallback message ID:', fallbackId);
  return fallbackId;
}

// Extract subject
function extractSubject() {
  const selectors = [
    'h2[data-thread-perm-id]',
    '.hP',
    '.bog',
    '.hP .bog',
    '[data-thread-perm-id] .bog'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  
  return 'No Subject';
}

// Extract sender
function extractSender() {
  const selectors = [
    '.go .g2',
    '.gD',
    '.gb .g2',
    '.yW .g2',
    'span[email]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const email = element.getAttribute('email');
      if (email) return email;
      
      const text = element.textContent.trim();
      if (text) return text;
    }
  }
  
  return 'Unknown Sender';
}

// Extract recipient
function extractRecipient() {
  // This is harder to extract reliably in Gmail
  // Try to find "To:" information
  const toElements = document.querySelectorAll('.hb .g2');
  const recipients = [];
  
  for (const element of toElements) {
    const email = element.getAttribute('email');
    if (email) {
      recipients.push(email);
    } else {
      const text = element.textContent.trim();
      if (text && text.includes('@')) {
        recipients.push(text);
      }
    }
  }
  
  return recipients.join(', ') || 'Unknown Recipient';
}

// Extract date
function extractDate() {
  const selectors = [
    '.g3',
    '.hb .g3',
    '.abl .g3',
    '[title*="GMT"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const title = element.getAttribute('title');
      if (title) {
        const date = new Date(title);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      
      const text = element.textContent.trim();
      if (text) {
        const date = new Date(text);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }
  }
  
  return new Date().toISOString();
}

// Extract content
function extractContent() {
  const selectors = [
    '.ii.gt .a3s',
    '.ii.gt',
    '.adn.ads .ii.gt',
    'div[dir="ltr"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element.innerHTML || element.textContent || '';
    }
  }
  
  return 'Content not available';
}

// Extract attachments
function extractAttachments() {
  try {
    const attachments = [];
    const attachmentElements = document.querySelectorAll('.aZo, .aZp');
    
    console.log('Found', attachmentElements.length, 'attachment elements');
    
    for (const element of attachmentElements) {
      const nameElement = element.querySelector('.aV3');
      const sizeElement = element.querySelector('.SaHBd');
      
      if (nameElement) {
        const name = nameElement.textContent.trim();
        const size = sizeElement ? sizeElement.textContent.trim() : 'Unknown size';
        
        // Only include basic text data, avoid any DOM references
        const attachment = {
          name: String(name),
          size: String(size)
        };
        
        console.log('Adding attachment:', attachment);
        attachments.push(attachment);
      }
    }
    
    console.log('Final attachments array:', attachments);
    
    // Test if it can be serialized
    try {
      JSON.stringify(attachments);
      console.log('Attachments can be serialized');
    } catch (jsonError) {
      console.error('Attachments cannot be serialized:', jsonError);
      return []; // Return empty array if serialization fails
    }
    
    return attachments;
  } catch (error) {
    console.error('Error extracting attachments:', error);
    return []; // Return empty array on any error
  }
}

// Send email to database
async function sendEmailToDatabase(emailData) {
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
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#0f9d58' : type === 'error' ? '#d93025' : type === 'info' ? '#2196F3' : '#4285f4'};
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    animation: slideInRight 0.3s ease-out;
    max-width: 500px;
    word-wrap: break-word;
  `;
  
  notification.textContent = message;
  
  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Remove after appropriate duration
  const duration = type === 'success' ? 10000 : type === 'info' ? 12000 : 5000;
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForGmail);
} else {
  waitForGmail();
}