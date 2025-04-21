/**
 * Voice Recorder Module
 * Implements audio recording with pause, resume, and upload functionality
 */

// API URL from app configuration
const AUDIO_API_URL = 'http://localhost:5003/api/audio';

// Global variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let recordingStartTime = null;
let recordingDuration = 0;
let recordingTimer = null;
let audioBlob = null;
let audioUrl = null;

/**
 * Initialize the voice recorder
 */
function initRecorder() {
  console.log('Initializing audio recorder...');
  
  // Add event listeners for recorder buttons
  document.getElementById('start-recording')?.addEventListener('click', startRecording);
  document.getElementById('stop-recording')?.addEventListener('click', stopRecording);
  document.getElementById('pause-recording')?.addEventListener('click', pauseRecording);
  document.getElementById('resume-recording')?.addEventListener('click', resumeRecording);
  document.getElementById('upload-recording')?.addEventListener('click', uploadRecording);
  
  // Load existing recordings for the current sheet
  if (window.SheetState && window.SheetState.currentSheetId) {
    loadRecordings(window.SheetState.currentSheetId);
  }
  
  // Set initial UI state
  updateRecorderUI();
  console.log('Recorder initialized');
}

/**
 * Start a new recording
 */
async function startRecording() {
  try {
    console.log('Requesting microphone access...');
    
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Create media recorder
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    // Set up event handlers
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      // Create audio blob when recording stops
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioUrl = URL.createObjectURL(audioBlob);
      
      console.log('Recording stopped, blob created:', audioBlob.size, 'bytes');
      
      // Update audio player
      const audioPlayer = document.getElementById('audio-preview');
      if (audioPlayer) {
        audioPlayer.src = audioUrl;
        audioPlayer.style.display = 'block';
      }
      
      // Show upload controls
      document.getElementById('audio-container')?.classList.remove('d-none');
      document.getElementById('recording-name')?.removeAttribute('disabled');
      document.getElementById('upload-recording')?.removeAttribute('disabled');
    };
    
    // Start recording
    mediaRecorder.start(100); // Collect data in 100ms chunks
    isRecording = true;
    isPaused = false;
    
    // Start timer
    recordingStartTime = Date.now();
    recordingDuration = 0;
    startRecordingTimer();
    
    // Update UI
    updateRecorderUI();
    showNotification('Recording started', 'success');
    console.log('Recording started');
    
  } catch (error) {
    console.error('Error starting recording:', error);
    showNotification('Could not access microphone. Please check permissions.', 'danger');
  }
}

/**
 * Stop the current recording
 */
function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    console.log('No active recording to stop');
    return;
  }
  
  console.log('Stopping recording...');
  
  // Stop media recorder
  mediaRecorder.stop();
  
  // Stop all tracks in the stream
  mediaRecorder.stream.getTracks().forEach(track => track.stop());
  
  // Update state
  isRecording = false;
  isPaused = false;
  
  // Stop timer
  clearInterval(recordingTimer);
  
  // Update UI
  updateRecorderUI();
  const durationElement = document.getElementById('recording-duration');
  if (durationElement) {
    durationElement.textContent = formatTime(recordingDuration);
  }
  
  showNotification('Recording stopped', 'info');
}

/**
 * Pause the current recording
 */
function pauseRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    console.log('Cannot pause: no active recording or already paused');
    return;
  }
  
  console.log('Pausing recording...');
  mediaRecorder.pause();
  isPaused = true;
  
  // Update timer
  clearInterval(recordingTimer);
  recordingDuration += Date.now() - recordingStartTime;
  
  // Update UI
  updateRecorderUI();
  
  showNotification('Recording paused', 'info');
}

/**
 * Resume a paused recording
 */
function resumeRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'paused') {
    console.log('Cannot resume: no paused recording');
    return;
  }
  
  console.log('Resuming recording...');
  mediaRecorder.resume();
  isPaused = false;
  
  // Resume timer
  recordingStartTime = Date.now();
  startRecordingTimer();
  
  // Update UI
  updateRecorderUI();
  
  showNotification('Recording resumed', 'info');
}

/**
 * Upload the recorded audio to the server
 */
async function uploadRecording() {
  if (!audioBlob) {
    console.log('No recording to upload');
    return;
  }
  
  const recordingNameInput = document.getElementById('recording-name');
  const recordingName = recordingNameInput?.value.trim() || 
                       `Recording_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  
  console.log(`Uploading recording "${recordingName}"...`);
  
  try {
    // Prepare form data
    const formData = new FormData();
    formData.append('audio', audioBlob, `${recordingName}.webm`);
    formData.append('name', recordingName);
    formData.append('sheetId', window.SheetState?.currentSheetId || '');
    formData.append('duration', recordingDuration);
    
    // Update UI to show loading
    const uploadButton = document.getElementById('upload-recording');
    if (uploadButton) {
      uploadButton.disabled = true;
      uploadButton.textContent = 'Uploading...';
    }
    
    // Send to server
    const response = await fetch(AUDIO_API_URL, {
      method: 'POST',
      headers: {
        'x-auth-token': window.AuthState.getToken()
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Upload failed');
    }
    
    const result = await response.json();
    console.log('Upload successful:', result);
    
    // Reset recording data
    resetRecorder();
    
    // Show success message
    showNotification('Recording uploaded successfully to Google Drive', 'success');
    
    // Refresh recordings list
    if (window.SheetState?.currentSheetId) {
      loadRecordings(window.SheetState.currentSheetId);
    }
  } catch (error) {
    console.error('Error uploading recording:', error);
    showNotification('Upload failed: ' + error.message, 'danger');
    
    const uploadButton = document.getElementById('upload-recording');
    if (uploadButton) {
      uploadButton.disabled = false;
      uploadButton.textContent = 'Upload';
    }
  }
}

/**
 * Load recordings for a specific sheet
 */
async function loadRecordings(sheetId) {
  console.log(`Loading recordings for sheet ${sheetId}...`);
  
  try {
    const response = await fetch(`${AUDIO_API_URL}/sheet/${sheetId}`, {
      headers: {
        'x-auth-token': window.AuthState.getToken()
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch recordings');
    }
    
    const recordings = await response.json();
    console.log(`Found ${recordings.length} recordings`);
    
    displayRecordings(recordings);
  } catch (error) {
    console.error('Error loading recordings:', error);
    showNotification('Failed to load recordings', 'danger');
  }
}

/**
 * Display the list of recordings
 */
function displayRecordings(recordings) {
  const recordingsList = document.getElementById('recordings-list');
  if (!recordingsList) {
    console.warn('Recordings list container not found');
    return;
  }
  
  recordingsList.innerHTML = '';
  
  if (!recordings || recordings.length === 0) {
    recordingsList.innerHTML = '<div class="alert alert-info">No recordings available</div>';
    return;
  }
  
  recordings.forEach(recording => {
    const recordingItem = document.createElement('div');
    recordingItem.className = 'card mb-3';
    
    recordingItem.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0">${recording.filename || 'Untitled Recording'}</h6>
        <span class="badge bg-secondary">${formatTime(recording.duration || 0)}</span>
      </div>
      <div class="card-body">
        <audio controls class="w-100" src="${recording.driveFileUrl || ''}"></audio>
        <div class="btn-group mt-2 w-100">
          <button class="btn btn-sm btn-outline-danger delete-recording" data-id="${recording._id}">
            <i class="bi bi-trash"></i> Delete
          </button>
          ${recording.driveFileId ? 
            `<a href="https://drive.google.com/file/d/${recording.driveFileId}/view" 
             target="_blank" class="btn btn-sm btn-outline-primary">
              <i class="bi bi-google"></i> View in Drive
            </a>` : ''}
        </div>
      </div>
      <div class="card-footer text-muted">
        Recorded: ${new Date(recording.createdAt).toLocaleString()}
      </div>
    `;
    
    recordingsList.appendChild(recordingItem);
  });
  
  // Add event listeners to delete buttons
  document.querySelectorAll('.delete-recording').forEach(button => {
    button.addEventListener('click', () => deleteRecording(button.dataset.id));
  });
}

/**
 * Delete a recording by ID
 */
async function deleteRecording(id) {
  if (!confirm('Are you sure you want to delete this recording?')) {
    return;
  }
  
  console.log(`Deleting recording ${id}...`);
  
  try {
    const response = await fetch(`${AUDIO_API_URL}/${id}`, {
      method: 'DELETE',
      headers: {
        'x-auth-token': window.AuthState.getToken()
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete recording');
    }
    
    showNotification('Recording deleted successfully', 'success');
    
    // Refresh recordings list
    if (window.SheetState?.currentSheetId) {
      loadRecordings(window.SheetState.currentSheetId);
    }
  } catch (error) {
    console.error('Error deleting recording:', error);
    showNotification('Failed to delete recording', 'danger');
  }
}

/**
 * Start the recording timer
 */
function startRecordingTimer() {
  clearInterval(recordingTimer);
  
  const timerElement = document.getElementById('recording-duration');
  if (!timerElement) return;
  
  // Update timer display every second
  recordingTimer = setInterval(() => {
    const currentTime = Date.now();
    const elapsed = recordingDuration + (currentTime - recordingStartTime);
    
    timerElement.textContent = formatTime(elapsed);
  }, 1000);
}

/**
 * Format milliseconds as MM:SS
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Reset recorder state
 */
function resetRecorder() {
  audioBlob = null;
  audioUrl = null;
  audioChunks = [];
  isRecording = false;
  isPaused = false;
  recordingDuration = 0;
  
  // Reset UI elements
  document.getElementById('audio-container')?.classList.add('d-none');
  
  const audioPreview = document.getElementById('audio-preview');
  if (audioPreview) audioPreview.src = '';
  
  const recordingName = document.getElementById('recording-name');
  if (recordingName) {
    recordingName.value = '';
    recordingName.disabled = true;
  }
  
  const uploadButton = document.getElementById('upload-recording');
  if (uploadButton) {
    uploadButton.disabled = true;
    uploadButton.textContent = 'Upload';
  }
  
  const durationElement = document.getElementById('recording-duration');
  if (durationElement) durationElement.textContent = '00:00';
  
  updateRecorderUI();
}

/**
 * Update the recorder UI based on current state
 */
function updateRecorderUI() {
  // Get UI elements
  const startBtn = document.getElementById('start-recording');
  const stopBtn = document.getElementById('stop-recording');
  const pauseBtn = document.getElementById('pause-recording');
  const resumeBtn = document.getElementById('resume-recording');
  
  // Skip if elements don't exist
  if (!startBtn || !stopBtn || !pauseBtn || !resumeBtn) {
    console.warn('Recorder UI elements not found');
    return;
  }
  
  // Update button states
  startBtn.disabled = isRecording;
  stopBtn.disabled = !isRecording;
  pauseBtn.disabled = !isRecording || isPaused;
  resumeBtn.disabled = !isRecording || !isPaused;
  
  // Update button visibility
  startBtn.classList.toggle('d-none', isRecording);
  stopBtn.classList.toggle('d-none', !isRecording);
  pauseBtn.classList.toggle('d-none', !isRecording || isPaused);
  resumeBtn.classList.toggle('d-none', !isRecording || !isPaused);
  
  // Update recording status indicator
  const recordingIndicator = document.getElementById('recording-indicator');
  const recordingText = document.getElementById('recording-text');
  
  if (recordingIndicator && recordingText) {
    recordingIndicator.classList.toggle('d-none', !isRecording);
    recordingText.classList.toggle('d-none', !isRecording);
    
    if (isRecording) {
      if (isPaused) {
        recordingText.textContent = 'Recording paused';
        recordingIndicator.classList.remove('pulse');
      } else {
        recordingText.textContent = 'Recording in progress...';
        recordingIndicator.classList.add('pulse');
      }
    }
  }
}

/**
 * Show a notification message
 */
function showNotification(message, type = 'info') {
  // Use global showAlert function if available
  if (window.showAlert) {
    window.showAlert(message, type);
    return;
  }
  
  // Fallback notification
  console.log(`Notification (${type}): ${message}`);
  
  const container = document.getElementById('alert-container') || 
                   document.body.appendChild(document.createElement('div'));
  
  if (!container.id) {
    container.id = 'alert-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
  }
  
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show`;
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  container.appendChild(alert);
  
  // Auto dismiss after 5 seconds
  setTimeout(() => {
    alert.classList.remove('show');
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}

// Initialize recorder when DOM is ready
document.addEventListener('DOMContentLoaded', initRecorder);

// Add event listener for sheet changes
document.addEventListener('sheetLoaded', (event) => {
  if (event.detail && event.detail.sheetId) {
    loadRecordings(event.detail.sheetId);
  }
});