/**
 * Google Sheets Integration
 * Handles syncing, editing and real-time updates of sheet data
 */

// API URL from app configuration
const SHEETS_API_URL = 'http://localhost:5003/api/sheets';
const PAGES_API_URL = 'http://localhost:5003/api/pages';

// Socket.io connection
let socket;

// Current sheet state
const SheetState = {
  currentSheetId: null,
  data: null,
  html: null,
  lastSynced: null,
  isEditing: false,
  cellChanges: [],
  
  // Register change events
  registerChangeEvents() {
    const sheetTable = document.querySelector('.sheet-table');
    if (!sheetTable) return;
    
    // Listen for cell focus (edit start)
    sheetTable.addEventListener('focus', (e) => {
      if (e.target.tagName === 'TD' || e.target.tagName === 'TH') {
        this.isEditing = true;
        e.target.dataset.originalValue = e.target.innerText;
      }
    }, true);
    
    // Listen for cell blur (edit end)
    sheetTable.addEventListener('blur', (e) => {
      if ((e.target.tagName === 'TD' || e.target.tagName === 'TH') && this.isEditing) {
        const row = e.target.parentElement.rowIndex;
        const cell = e.target.cellIndex;
        const originalValue = e.target.dataset.originalValue;
        const newValue = e.target.innerText;
        
        if (originalValue !== newValue) {
          this.cellChanges.push({
            row,
            cell,
            value: newValue
          });
          
          // Show save button
          const saveBtn = document.getElementById('save-changes-btn');
          if (saveBtn) saveBtn.classList.remove('d-none');
        }
        
        this.isEditing = false;
      }
    }, true);
    
    // Auto-save timer
    setInterval(() => {
      if (this.cellChanges.length > 0 && !this.isEditing) {
        this.saveChanges();
      }
    }, 30000); // Auto-save every 30 seconds
  }
};

/**
 * Initialize socket.io connection for real-time updates
 */
function initializeSocket() {
  socket = io('http://localhost:5003');
  
  socket.on('connect', () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
  });
  
  socket.on('sheetUpdate', (data) => {
    console.log('Sheet update received:', data);
    if (data.sheetId === SheetState.currentSheetId) {
      fetchSheetData(SheetState.currentSheetId);
      showNotification('Sheet updated in real-time');
    }
  });
}

/**
 * Update connection status indicator
 * @param {boolean} isConnected Connection status
 */
function updateConnectionStatus(isConnected) {
  const statusDot = document.getElementById('connection-dot');
  const statusText = document.getElementById('connection-status');
  
  if (!statusDot || !statusText) return;
  
  if (isConnected) {
    statusDot.classList.remove('bg-danger');
    statusDot.classList.add('bg-success');
    statusText.textContent = 'Real-time connection active';
    statusText.classList.remove('text-danger');
    statusText.classList.add('text-success');
  } else {
    statusDot.classList.remove('bg-success');
    statusDot.classList.add('bg-danger');
    statusText.textContent = 'Real-time connection inactive';
    statusText.classList.remove('text-success');
    statusText.classList.add('text-danger');
  }
}

/**
 * Fetch sheet data from the server
 * @param {string} sheetId ID of the sheet to fetch
 * @returns {Promise<Object>} Sheet data
 */
// Update loadSheet function to handle Google Sheet IDs properly
async function loadSheet(sheetId) {
  try {
    showLoading(true);
    console.log(`Loading sheet: ${sheetId}`);
    
    const response = await fetch(`${API_URL}/api/sheets/${sheetId}`, {
      headers: {
        'x-auth-token': AuthState.getToken()
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load sheet');
    }
    
    const { sheet, data } = await response.json();
    
    // Store the current sheet info
    window.SheetState = {
      currentSheetId: sheet.googleSheetId,  // Use Google Sheet ID for API calls
      currentSheetMongoId: sheet._id,       // Store MongoDB ID for reference
      currentSheet: sheet,
      data: processSheetData(data)
    };
    
    // Render the sheet
    renderSheet(window.SheetState.data);
    updateSheetInfo(sheet);
    
    // Enable save button
    document.getElementById('save-changes-btn').disabled = false;
    
    // Load related content (e.g., recordings)
    if (window.loadRecordings) {
      window.loadRecordings(sheet.googleSheetId);
    }
    
    showLoading(false);
    return { sheet, data };
  } catch (error) {
    console.error('Error loading sheet:', error);
    showAlert(error.message || 'Failed to load sheet', 'error');
    showLoading(false);
    throw error;
  }
}

/**
 * Render sheet data to the DOM
 * @param {Object} sheetData Sheet data and HTML
 */
function renderSheetData(sheetData) {
  const { sheet, data, html } = sheetData;
  
  // Update sheet ID display
  const sheetIdDisplay = document.getElementById('sheet-id-display');
  if (sheetIdDisplay) {
    sheetIdDisplay.textContent = sheet.sheetId;
  }
  
  // Update last updated timestamp
  const lastUpdated = document.getElementById('last-updated');
  if (lastUpdated) {
    lastUpdated.textContent = new Date().toLocaleString();
  }
  
  // Render data as table
  const sheetContent = document.getElementById('sheet-content');
  if (!sheetContent) return;
  
  if (!data || !data.length) {
    sheetContent.innerHTML = '<div class="alert alert-warning">No data available</div>';
    return;
  }
  
  // Create table
  const table = document.createElement('table');
  table.className = 'table table-bordered sheet-table';
  
  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  data[0].forEach(cell => {
    const th = document.createElement('th');
    const cellValue = typeof cell === 'object' ? cell.value : cell;
    th.textContent = cellValue || '';
    th.setAttribute('contenteditable', 'true');
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Create body
  const tbody = document.createElement('tbody');
  
  for (let i = 1; i < data.length; i++) {
    const row = document.createElement('tr');
    
    data[i].forEach((cell, cellIndex) => {
      const td = document.createElement('td');
      
      // Set cell value
      if (typeof cell === 'object' && cell !== null) {
        // Format cell based on properties
        let cellContent = cell.value || '';
        
        // Apply formatting if specified
        if (cell.isHeader) {
          td.classList.add('table-secondary', 'fw-bold');
        }
        
        if (cell.isBold) {
          cellContent = `<strong>${cellContent}</strong>`;
        }
        
        if (cell.isItalic) {
          cellContent = `<i>${cellContent}</i>`;
        }
        
        if (cell.isUnderline) {
          cellContent = `<u>${cellContent}</u>`;
        }
        
        td.innerHTML = cellContent;
      } else {
        // Check for keywords to underline
        if (typeof cell === 'string') {
          const keywords = ['important', 'note', 'key', 'critical', 'warning'];
          let content = cell;
          
          keywords.forEach(keyword => {
            const regex = new RegExp(`(${keyword})`, 'gi');
            content = content.replace(regex, '<span class="keyword">$1</span>');
          });
          
          td.innerHTML = content;
        } else {
          td.textContent = cell || '';
        }
      }
      
      // Make cell editable
      td.setAttribute('contenteditable', 'true');
      row.appendChild(td);
    });
    
    tbody.appendChild(row);
  }
  
  table.appendChild(tbody);
  sheetContent.innerHTML = '';
  sheetContent.appendChild(table);
}

/**
 * Save changes to the sheet
 */
async function saveChanges() {
  if (!SheetState.currentSheetId || SheetState.cellChanges.length === 0) return;
  
  try {
    showLoading(true);
    
    const response = await fetch(`${PAGES_API_URL}/${SheetState.currentSheetId}/content`, {
      method: 'PUT',
      headers: window.AuthState.getAuthHeaders(),
      body: JSON.stringify({
        cellUpdates: SheetState.cellChanges
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to update sheet');
    }
    
    // Clear changes
    SheetState.cellChanges = [];
    
    // Hide save button
    const saveBtn = document.getElementById('save-changes-btn');
    if (saveBtn) saveBtn.classList.add('d-none');
    
    // Update last synced time
    SheetState.lastSynced = new Date();
    const lastUpdated = document.getElementById('last-updated');
    if (lastUpdated) {
      lastUpdated.textContent = new Date().toLocaleString();
    }
    
    // Show success notification
    showAlert('Sheet updated successfully', 'success');
    
    // Emit socket event
    if (socket) {
      socket.emit('sheetUpdated', { sheetId: SheetState.currentSheetId });
    }
  } catch (error) {
    console.error('Error saving changes:', error);
    showAlert('Failed to save changes: ' + error.message, 'danger');
  } finally {
    showLoading(false);
  }
}

/**
 * Register sheet handlers
 */
function registerSheetHandlers() {
  // Sheet form submission
  const sheetForm = document.getElementById('sheet-form');
  if (sheetForm) {
    sheetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const sheetId = document.getElementById('sheet-id').value;
      fetchSheetData(sheetId);
    });
  }
  
  // Save changes button
  const saveBtn = document.getElementById('save-changes-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveChanges);
  }
}

/**
 * Show loading indicator
 * @param {boolean} isLoading Loading state
 */
function showLoading(isLoading) {
  const spinner = document.getElementById('loading-spinner');
  if (spinner) {
    spinner.classList.toggle('d-none', !isLoading);
  }
}

/**
 * Show alert message
 * @param {string} message Alert message
 * @param {string} type Alert type (success, danger, warning, info)
 */
function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alert-container');
  if (!alertContainer) return;
  
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show`;
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  alertContainer.appendChild(alert);
  
  // Auto dismiss after 5 seconds
  setTimeout(() => {
    alert.classList.remove('show');
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}

/**
 * Show notification message
 * @param {string} message Notification message
 */
function showNotification(message) {
  const notification = document.getElementById('notification');
  if (!notification) return;
  
  notification.textContent = message;
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

/**
 * Load user's sheets
 */
async function loadUserSheets() {
  try {
    const response = await fetch(SHEETS_API_URL, {
      headers: window.AuthState.getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to load sheets');
    }
    
    const sheets = await response.json();
    renderSheetsList(sheets);
  } catch (error) {
    console.error('Error loading sheets:', error);
  }
}

/**
 * Render sheets list
 * @param {Array} sheets User's sheets
 */
function renderSheetsList(sheets) {
  const sheetsList = document.getElementById('sheets-list');
  if (!sheetsList) return;
  
  if (!sheets || sheets.length === 0) {
    sheetsList.innerHTML = '<li class="list-group-item">No sheets found</li>';
    return;
  }
  
  sheetsList.innerHTML = '';
  
  sheets.forEach(sheet => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    
    li.innerHTML = `
      <div>
        <span class="fw-bold">${sheet.name}</span>
        <small class="d-block text-muted">${sheet.description || ''}</small>
      </div>
      <div>
        <button class="btn btn-sm btn-primary load-sheet-btn" data-id="${sheet._id}">Load</button>
      </div>
    `;
    
    sheetsList.appendChild(li);
  });
  
  // Add event listeners for load buttons
  document.querySelectorAll('.load-sheet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sheetId = btn.dataset.id;
      fetchSheetData(sheetId);
    });
  });
}

/**
 * Initialize sheets module
 */
function initSheets() {
  // Initialize socket connection
  initializeSocket();
  
  // Register handlers
  registerSheetHandlers();
  
  // Load user's sheets if authenticated
  if (window.AuthState && window.AuthState.isAuthenticated) {
    loadUserSheets();
  }
  
  // Listen for authentication events
  document.addEventListener('auth:login', loadUserSheets);
  document.addEventListener('auth:register', loadUserSheets);
}

// Initialize on document load
document.addEventListener('DOMContentLoaded', initSheets);

// Expose for global use
window.SheetState = SheetState;
window.fetchSheetData = fetchSheetData;
window.saveSheetChanges = saveChanges;