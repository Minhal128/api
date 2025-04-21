const API_URL = 'http://localhost:5003';
let currentSheetId = null;
let currentNote = null;
let audioRecordingActive = false;
let mediaRecorder = null;
let audioChunks = [];
let socket = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.io
  socket = io(API_URL);
  
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
    if (data.sheetId === currentSheetId) {
      fetchSheetData(currentSheetId);
      showNotification('Sheet updated in real-time');
    }
  });
  
  // Check authentication status
  checkAuth();
  
  // Load sheets list if authenticated
  if (getToken()) {
    loadSheetsList();
  }
  
  // Set up event listeners
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('sheet-form')?.addEventListener('submit', handleLoadSheet);
  document.getElementById('copy-note-btn')?.addEventListener('click', handleCopyNote);
  document.getElementById('save-edits-btn')?.addEventListener('click', handleSaveEdits);
  document.getElementById('start-recording')?.addEventListener('click', startRecording);
  document.getElementById('stop-recording')?.addEventListener('click', stopRecording);
  document.getElementById('pause-recording')?.addEventListener('click', pauseRecording);
  document.getElementById('resume-recording')?.addEventListener('click', resumeRecording);
  document.getElementById('upload-recording')?.addEventListener('click', uploadRecording);
});

// Authentication functions
function checkAuth() {
  const token = getToken();
  if (!token) {
    showLoginForm();
  } else {
    fetchUserProfile();
  }
}

async function fetchUserProfile() {
  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'x-auth-token': getToken() }
    });
    
    if (!response.ok) throw new Error('Authentication failed');
    
    const user = await response.json();
    showDashboard(user);
  } catch (error) {
    console.error('Auth error:', error);
    localStorage.removeItem('token');
    showLoginForm();
  }
}

function getToken() {
  return localStorage.getItem('token');
}

function showLoginForm() {
  document.getElementById('auth-container').classList.remove('d-none');
  document.getElementById('dashboard-container').classList.add('d-none');
}

function showDashboard(user) {
  document.getElementById('auth-container').classList.add('d-none');
  document.getElementById('dashboard-container').classList.remove('d-none');
  document.getElementById('user-name').textContent = user.name;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) throw new Error('Login failed');
    
    const data = await response.json();
    localStorage.setItem('token', data.token);
    checkAuth();
    loadSheetsList();
  } catch (error) {
    showAlert('Login failed: ' + error.message, 'danger');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    
    if (!response.ok) throw new Error('Registration failed');
    
    const data = await response.json();
    localStorage.setItem('token', data.token);
    checkAuth();
  } catch (error) {
    showAlert('Registration failed: ' + error.message, 'danger');
  }
}

function handleLogout() {
  localStorage.removeItem('token');
  showLoginForm();
}

// Sheet management functions
async function loadSheetsList() {
  try {
    const response = await fetch(`${API_URL}/api/sheets`, {
      headers: { 'x-auth-token': getToken() }
    });
    
    if (!response.ok) throw new Error('Failed to load sheets');
    
    const sheets = await response.json();
    displaySheetsList(sheets);
  } catch (error) {
    console.error('Error loading sheets:', error);
    showAlert('Failed to load sheets: ' + error.message, 'danger');
  }
}

function displaySheetsList(sheets) {
  const sheetsList = document.getElementById('sheets-list');
  sheetsList.innerHTML = '';
  
  sheets.forEach(sheet => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <span>${sheet.title}</span>
      <div>
        <button class="btn btn-sm btn-primary load-sheet-btn" data-id="${sheet._id}">Load</button>
      </div>
    `;
    sheetsList.appendChild(li);
  });
  
  // Add event listeners
  document.querySelectorAll('.load-sheet-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      fetchSheetData(e.target.dataset.id);
    });
  });
}

async function handleLoadSheet(e) {
  e.preventDefault();
  const sheetId = document.getElementById('sheet-id').value;
  fetchSheetData(sheetId);
}

async function fetchSheetData(sheetId) {
  try {
    currentSheetId = sheetId;
    showLoading(true);
    
    const response = await fetch(`${API_URL}/api/pages/json/${sheetId}`, {
      headers: { 'x-auth-token': getToken() }
    });
    
    if (!response.ok) throw new Error('Failed to fetch sheet data');
    
    const sheetData = await response.json();
    displaySheetData(sheetData, sheetId);
    
    // Fetch notes for this sheet
    fetchNotes(sheetId);
    
    // Fetch recordings for this sheet
    fetchRecordings(sheetId);
  } catch (error) {
    console.error('Error fetching sheet:', error);
    showAlert('Failed to load sheet: ' + error.message, 'danger');
  } finally {
    showLoading(false);
  }
}

function displaySheetData(data, sheetId) {
  const sheetContainer = document.getElementById('sheet-container');
  const sheetContent = document.getElementById('sheet-content');
  
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
    th.textContent = cell;
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
      td.setAttribute('contenteditable', 'true');
      
      // Check if this contains a keyword to underline
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
      
      row.appendChild(td);
    });
    
    tbody.appendChild(row);
  }
  
  table.appendChild(tbody);
  sheetContent.innerHTML = '';
  sheetContent.appendChild(table);
  
  // Show the container
  sheetContainer.classList.remove('d-none');
  document.getElementById('sheet-id-display').textContent = sheetId;
  document.getElementById('last-updated').textContent = new Date().toLocaleString();
  
  // Enable SOAP Note features
  document.getElementById('soap-container').classList.remove('d-none');
}

// Notes management
async function fetchNotes(sheetId) {
  try {
    const response = await fetch(`${API_URL}/api/notes/sheet/${sheetId}`, {
      headers: { 'x-auth-token': getToken() }
    });
    
    if (!response.ok) throw new Error('Failed to fetch notes');
    
    const notes = await response.json();
    displayNotes(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
  }
}

function displayNotes(notes) {
  const notesList = document.getElementById('notes-list');
  notesList.innerHTML = '';
  
  if (!notes || !notes.length) {
    notesList.innerHTML = '<div class="alert alert-info">No notes available</div>';
    return;
  }
  
  notes.forEach(note => {
    const noteItem = document.createElement('div');
    noteItem.className = 'card mb-3';
    noteItem.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">${note.title || 'Note'}</h6>
        <div>
          <button class="btn btn-sm btn-outline-primary edit-note-btn" data-id="${note._id}">Edit</button>
        </div>
      </div>
      <div class="card-body">
        <p>${note.content}</p>
      </div>
      <div class="card-footer text-muted">
        ${new Date(note.lastUpdated || note.createdAt).toLocaleString()}
      </div>
    `;
    notesList.appendChild(noteItem);
  });
  
  // Add event listeners
  document.querySelectorAll('.edit-note-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const noteId = e.target.dataset.id;
      const noteContent = notes.find(n => n._id === noteId);
      editNote(noteContent);
    });
  });
}

function editNote(note) {
  currentNote = note;
  document.getElementById('note-content').value = note.content;
  document.getElementById('note-title').value = note.title || '';
  
  // Show edit modal
  const noteModal = new bootstrap.Modal(document.getElementById('note-modal'));
  noteModal.show();
}

async function handleSaveEdits() {
  try {
    const content = document.getElementById('note-content').value;
    const title = document.getElementById('note-title').value;
    
    if (currentNote) {
      // Update existing note
      const response = await fetch(`${API_URL}/api/notes/${currentNote._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': getToken()
        },
        body: JSON.stringify({ content, title })
      });
      
      if (!response.ok) throw new Error('Failed to update note');
    } else {
      // Create new note
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': getToken()
        },
        body: JSON.stringify({
          content,
          title,
          sheetId: currentSheetId
        })
      });
      
      if (!response.ok) throw new Error('Failed to create note');
    }
    
    // Close modal and refresh notes
    bootstrap.Modal.getInstance(document.getElementById('note-modal')).hide();
    fetchNotes(currentSheetId);
    showAlert('Note saved successfully', 'success');
  } catch (error) {
    console.error('Error saving note:', error);
    showAlert('Failed to save note: ' + error.message, 'danger');
  }
}

function handleCopyNote() {
  const sheetTable = document.querySelector('.sheet-table');
  if (!sheetTable) return;
  
  let noteContent = '';
  
  // Get headers
  const headers = Array.from(sheetTable.querySelectorAll('th')).map(th => th.textContent);
  
  // Get rows
  const rows = Array.from(sheetTable.querySelectorAll('tbody tr')).map(row => {
    return Array.from(row.querySelectorAll('td')).map(td => td.textContent);
  });
  
  // Format SOAP note
  noteContent = formatSoapNote(headers, rows);
  
  // Set to textarea and show modal
  document.getElementById('note-content').value = noteContent;
  document.getElementById('note-title').value = 'SOAP Note - ' + new Date().toLocaleDateString();
  currentNote = null;
  
  const noteModal = new bootstrap.Modal(document.getElementById('note-modal'));
  noteModal.show();
}

function formatSoapNote(headers, rows) {
  let soap = '# SOAP Note\n\n';
  
  // Assume first column is categories like S, O, A, P
  soap += '## Subjective\n';
  rows.filter(row => row[0].toLowerCase().includes('subjective') || row[0].toLowerCase().includes('s:'))
    .forEach(row => {
      soap += `- ${row[1] || ''}\n`;
    });
  
  soap += '\n## Objective\n';
  rows.filter(row => row[0].toLowerCase().includes('objective') || row[0].toLowerCase().includes('o:'))
    .forEach(row => {
      soap += `- ${row[1] || ''}\n`;
    });
  
  soap += '\n## Assessment\n';
  rows.filter(row => row[0].toLowerCase().includes('assessment') || row[0].toLowerCase().includes('a:'))
    .forEach(row => {
      soap += `- ${row[1] || ''}\n`;
    });
  
  soap += '\n## Plan\n';
  rows.filter(row => row[0].toLowerCase().includes('plan') || row[0].toLowerCase().includes('p:'))
    .forEach(row => {
      soap += `- ${row[1] || ''}\n`;
    });
  
  return soap;
}

// Audio recording functions
async function fetchRecordings(sheetId) {
  try {
    const response = await fetch(`${API_URL}/api/audio/sheet/${sheetId}`, {
      headers: { 'x-auth-token': getToken() }
    });
    
    if (!response.ok) throw new Error('Failed to fetch recordings');
    
    const recordings = await response.json();
    displayRecordings(recordings);
  } catch (error) {
    console.error('Error fetching recordings:', error);
  }
}

function displayRecordings(recordings) {
  const recordingsList = document.getElementById('recordings-list');
  recordingsList.innerHTML = '';
  
  if (!recordings || !recordings.length) {
    recordingsList.innerHTML = '<div class="alert alert-info">No recordings available</div>';
    return;
  }
  
  recordings.forEach(recording => {
    const recordingItem = document.createElement('div');
    recordingItem.className = 'card mb-3';
    recordingItem.innerHTML = `
      <div class="card-header">
        <h6 class="mb-0">${recording.name || 'Recording'}</h6>
      </div>
      <div class="card-body">
        <audio controls src="${recording.driveUrl}" class="w-100"></audio>
        ${recording.transcription ? `<p class="mt-3">${recording.transcription}</p>` : ''}
        <a href="${recording.driveUrl}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">
          Open in Drive
        </a>
      </div>
      <div class="card-footer text-muted">
        ${new Date(recording.createdAt).toLocaleString()}
      </div>
    `;
    recordingsList.appendChild(recordingItem);
  });
}

function startRecording() {
  if (isRecording) return;
  
  // Check if MediaRecorder is supported
  if (!navigator.mediaDevices || !MediaRecorder) {
    showAlert('Audio recording is not supported in this browser', 'danger');
    return;
  }
  
  // Request audio access
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.addEventListener('dataavailable', event => {
        audioChunks.push(event.data);
      });
      
      mediaRecorder.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        document.getElementById('audio-preview').src = audioUrl;
        document.getElementById('audio-container').classList.remove('d-none');
      });
      
      mediaRecorder.start();
      isRecording = true;
      updateRecordingUI(true);
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      showAlert('Error accessing microphone: ' + error.message, 'danger');
    });
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach(track => track.stop());
  isRecording = false;
  updateRecordingUI(false);
}

function pauseRecording() {
  if (!isRecording || !mediaRecorder) return;
  
  mediaRecorder.pause();
  document.getElementById('pause-recording').classList.add('d-none');
  document.getElementById('resume-recording').classList.remove('d-none');
}

function resumeRecording() {
  if (!isRecording || !mediaRecorder) return;
  
  mediaRecorder.resume();
  document.getElementById('pause-recording').classList.remove('d-none');
  document.getElementById('resume-recording').classList.add('d-none');
}

async function uploadRecording() {
  if (!audioChunks.length) return;
  
  try {
    const recordingName = document.getElementById('recording-name').value || 'Recording';
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    // Create form data
    const formData = new FormData();
    formData.append('audio', audioBlob, recordingName + '.webm');
    formData.append('name', recordingName);
    formData.append('sheetId', currentSheetId);
    
    showLoading(true);
    
    const response = await fetch(`${API_URL}/api/audio`, {
      method: 'POST',
      headers: {
        'x-auth-token': getToken()
      },
      body: formData
    });
    
    if (!response.ok) throw new Error('Failed to upload recording');
    
    const result = await response.json();
    
    // Clear recording
    audioChunks = [];
    document.getElementById('audio-container').classList.add('d-none');
    document.getElementById('recording-name').value = '';
    
    // Refresh recordings list
    fetchRecordings(currentSheetId);
    showAlert('Recording uploaded successfully', 'success');
  } catch (error) {
    console.error('Error uploading recording:', error);
    showAlert('Failed to upload recording: ' + error.message, 'danger');
  } finally {
    showLoading(false);
  }
}

function updateRecordingUI(isRecording) {
  document.getElementById('start-recording').classList.toggle('d-none', isRecording);
  document.getElementById('stop-recording').classList.toggle('d-none', !isRecording);
  document.getElementById('pause-recording').classList.toggle('d-none', !isRecording);
  document.getElementById('resume-recording').classList.add('d-none');
  document.getElementById('recording-indicator').classList.toggle('d-none', !isRecording);
}

// Helper functions
function updateConnectionStatus(isConnected) {
  const statusDot = document.getElementById('connection-dot');
  const statusText = document.getElementById('connection-status');
  
  if (isConnected) {
    statusDot.className = 'bg-success rounded-circle me-2';
    statusText.textContent = 'Connected';
    statusText.className = 'text-success';
  } else {
    statusDot.className = 'bg-danger rounded-circle me-2';
    statusText.textContent = 'Disconnected';
    statusText.className = 'text-danger';
  }
}

function showLoading(isLoading) {
  document.getElementById('loading-spinner').classList.toggle('d-none', !isLoading);
}

function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alert-container');
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

function showNotification(message) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function syncSheetDataToServer() {
  if (!currentSheetId) return;
  
  const table = document.querySelector('.sheet-table');
  if (!table) return;
  
  // Get all data from editable table
  const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
  
  const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => {
    return Array.from(row.querySelectorAll('td')).map(td => td.textContent);
  });
  
  const sheetData = [headers, ...rows];
  
  // Send update to server
  fetch(`${API_URL}/api/sheets/${currentSheetId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': getToken()
    },
    body: JSON.stringify({ values: sheetData })
  })
  .then(response => {
    if (!response.ok) throw new Error('Failed to update sheet');
    return response.json();
  })
  .then(() => {
    showAlert('Sheet updated successfully', 'success');
    socket.emit('sheetUpdated', currentSheetId);
  })
  .catch(error => {
    console.error('Error updating sheet:', error);
    showAlert('Failed to update sheet: ' + error.message, 'danger');
  });
}

// Setup auto-save for inline editing
setInterval(() => {
  if (document.activeElement.tagName === 'TD' || document.activeElement.tagName === 'TH') {
    // User is currently editing - don't auto-save
    return;
  }
  
  if (currentSheetId) {
    syncSheetDataToServer();
  }
}, 30000); // Auto-save every 30 seconds