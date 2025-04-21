/**
 * SOAP Notes Module
 * Handles SOAP note rendering, editing, and copying
 */

// API URL from app configuration
const NOTES_API_URL = 'http://localhost:5003/api/notes';

// Current note state
let soapCurrentNote = null;

/**
 * Initialize the SOAP note module
 */
function initSoapNotes() {
  // Add event listeners for buttons
  const addNoteBtn = document.getElementById('add-note-btn');
  if (addNoteBtn) {
    addNoteBtn.addEventListener('click', createNewNote);
  }
  
  const copyNoteBtn = document.getElementById('copy-note-btn');
  if (copyNoteBtn) {
    copyNoteBtn.addEventListener('click', copyAsSOAPNote);
  }
  
  const saveEditsBtn = document.getElementById('save-edits-btn');
  if (saveEditsBtn) {
    saveEditsBtn.addEventListener('click', saveNoteChanges);
  }
}

/**
 * Create a new note
 */
function createNewNote() {
  // Reset current note
  soapCurrentNote = null;
  
  // Set empty form fields
  document.getElementById('note-title').value = '';
  document.getElementById('note-content').value = '';
  
  // Show the note modal
  const noteModal = new bootstrap.Modal(document.getElementById('note-modal'));
  noteModal.show();
}

/**
 * Copy current sheet data as SOAP note
 */
function copyAsSOAPNote() {
  if (!window.SheetState || !window.SheetState.data) {
    showAlert('No sheet data available', 'warning');
    return;
  }
  
  const sheetData = window.SheetState.data;
  
  // Format SOAP note
  const soapNote = formatSOAPNote(sheetData);
  
  // Set values in form
  document.getElementById('note-title').value = 'SOAP Note - ' + new Date().toLocaleDateString();
  document.getElementById('note-content').value = soapNote;
  
  // Reset current note
  soapCurrentNote = null;
  
  // Show the note modal
  const noteModal = new bootstrap.Modal(document.getElementById('note-modal'));
  noteModal.show();
}

/**
 * Format sheet data as SOAP note
 * @param {Array} sheetData Sheet data
 * @returns {string} Formatted SOAP note
 */
function formatSOAPNote(sheetData) {
  // Initialize SOAP sections
  let subjective = [];
  let objective = [];
  let assessment = [];
  let plan = [];
  
  // Process sheet data
  sheetData.forEach(row => {
    row.forEach(cell => {
      if (cell && typeof cell === 'object' && cell.soapSection) {
        switch (cell.soapSection) {
          case 'subjective':
            if (!cell.isHeader) subjective.push(cell.value);
            break;
          case 'objective':
            if (!cell.isHeader) objective.push(cell.value);
            break;
          case 'assessment':
            if (!cell.isHeader) assessment.push(cell.value);
            break;
          case 'plan':
            if (!cell.isHeader) plan.push(cell.value);
            break;
        }
      }
    });
  });
  
  // Build SOAP note
  let soapNote = '# SOAP Note\n\n';
  
  soapNote += '## Subjective\n';
  if (subjective.length > 0) {
    subjective.forEach(item => {
      soapNote += `- ${item}\n`;
    });
  } else {
    soapNote += '- No subjective data available\n';
  }
  
  soapNote += '\n## Objective\n';
  if (objective.length > 0) {
    objective.forEach(item => {
      soapNote += `- ${item}\n`;
    });
  } else {
    soapNote += '- No objective data available\n';
  }
  
  soapNote += '\n## Assessment\n';
  if (assessment.length > 0) {
    assessment.forEach(item => {
      soapNote += `- ${item}\n`;
    });
  } else {
    soapNote += '- No assessment data available\n';
  }
  
  soapNote += '\n## Plan\n';
  if (plan.length > 0) {
    plan.forEach(item => {
      soapNote += `- ${item}\n`;
    });
  } else {
    soapNote += '- No plan data available\n';
  }
  
  return soapNote;
}

/**
 * Save note changes
 */
async function saveNoteChanges() {
  const title = document.getElementById('note-title').value;
  const content = document.getElementById('note-content').value;
  
  if (!content) {
    showAlert('Note content is required', 'warning');
    return;
  }
  
  try {
    let url = NOTES_API_URL;
    let method = 'POST';
    let data = {
      title,
      content,
      sheetId: window.SheetState.currentSheetId
    };
    
    // Update existing note
    if (soapCurrentNote) {
      url = `${NOTES_API_URL}/${soapCurrentNote._id}`;
      method = 'PUT';
      data = { title, content };
    }
    
    const response = await fetch(url, {
      method,
      headers: window.AuthState.getAuthHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error('Failed to save note');
    }
    
    // Close modal
    const noteModal = bootstrap.Modal.getInstance(document.getElementById('note-modal'));
    noteModal.hide();
    
    // Refresh notes list
    loadNotes(window.SheetState.currentSheetId);
    
    // Show success message
    showAlert('Note saved successfully', 'success');
  } catch (error) {
    console.error('Error saving note:', error);
    showAlert('Failed to save note: ' + error.message, 'danger');
  }
}

/**
 * Load notes for a sheet
 * @param {string} sheetId Sheet ID
 */
async function loadNotes(sheetId) {
  if (!sheetId) return;
  
  try {
    const response = await fetch(`${NOTES_API_URL}/sheet/${sheetId}`, {
      headers: window.AuthState.getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to load notes');
    }
    
    const notes = await response.json();
    renderNotesList(notes);
  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

/**
 * Render notes list
 * @param {Array} notes Notes to render
 */
function renderNotesList(notes) {
  const notesList = document.getElementById('notes-list');
  if (!notesList) return;
  
  if (!notes || notes.length === 0) {
    notesList.innerHTML = '<div class="alert alert-info">No notes available</div>';
    return;
  }
  
  notesList.innerHTML = '';
  
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
        <p>${formatNoteContent(note.content)}</p>
      </div>
      <div class="card-footer text-muted">
        ${new Date(note.lastUpdated || note.createdAt).toLocaleString()}
      </div>
    `;
    
    notesList.appendChild(noteItem);
  });
  
  // Add event listeners to edit buttons
  document.querySelectorAll('.edit-note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const noteId = btn.dataset.id;
      editNote(noteId, notes);
    });
  });
}

/**
 * Format note content with simple markdown
 * @param {string} content Note content
 * @returns {string} Formatted note content
 */
function formatNoteContent(content) {
  if (!content) return '';
  
  // Convert markdown-like formatting to HTML
  let formatted = content
    // Headers
    .replace(/^# (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h5>$1</h5>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n/g, '<br>');
  
  // Wrap lists in ul
  if (formatted.includes('<li>')) {
    formatted = formatted.replace(/(<li>.*?<\/li>)/g, '<ul>$1</ul>');
    // Remove any nested uls
    formatted = formatted.replace(/<\/ul>\s*<ul>/g, '');
  }
  
  return formatted;
}

/**
 * Edit an existing note
 * @param {string} noteId Note ID
 * @param {Array} notes Array of notes
 */
function editNote(noteId, notes) {
  const note = notes.find(n => n._id === noteId);
  if (!note) return;
  
  // Set current note
  soapCurrentNote = note;
  
  // Set form values
  document.getElementById('note-title').value = note.title || '';
  document.getElementById('note-content').value = note.content || '';
  
  // Show note modal
  const noteModal = new bootstrap.Modal(document.getElementById('note-modal'));
  noteModal.show();
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

// Initialize on document load
document.addEventListener('DOMContentLoaded', initSoapNotes);

// Update notes when sheet changes
if (window.SheetState) {
  const originalFetchSheet = window.fetchSheetData;
  window.fetchSheetData = async function(sheetId) {
    const result = await originalFetchSheet(sheetId);
    loadNotes(sheetId);
    return result;
  };
}