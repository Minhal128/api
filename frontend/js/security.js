/**
 * Security and HIPAA Compliance Module
 */

// Session timeout (15 minutes)
const SESSION_TIMEOUT = 15 * 60 * 1000;
let sessionTimer = null;

function initSecurityMeasures() {
  // Start session timer
  resetSessionTimer();

  // Add event listeners for user activity
  document.addEventListener('click', resetSessionTimer);
  document.addEventListener('keypress', resetSessionTimer);
  document.addEventListener('mousemove', throttle(resetSessionTimer, 30000));

  // Add warning before localStorage access
  monitorLocalStorage();

  // Prevent screen capture if possible
  preventScreenCapture();

  // Add page visibility change handler
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function resetSessionTimer() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(sessionTimeout, SESSION_TIMEOUT);
}

function sessionTimeout() {
  // Force logout on session timeout
  if (window.AuthState) {
    window.AuthState.clearAuth();
    showAlert('Your session has expired due to inactivity. Please log in again.', 'warning');
    window.location.reload();
  }
}

function monitorLocalStorage() {
  // Encrypt sensitive data before storing
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    if (key === 'token' || key === 'user_data') {
      console.warn('Storing sensitive information in localStorage. Consider using more secure methods.');
      // In a real implementation, encrypt this data
    }
    originalSetItem.call(this, key, value);
  };
}

function preventScreenCapture() {
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    navigator.mediaDevices.getDisplayMedia = function () {
      return Promise.reject(new Error('Screen capture is disabled for security reasons.'));
    };
  }
}

function handleVisibilityChange() {
  const sensitiveElements = document.querySelectorAll('.sensitive-data');

  if (document.visibilityState === 'hidden') {
    // User switched tabs or minimized window - mask sensitive data
    sensitiveElements.forEach(el => {
      el.dataset.original = el.textContent;
      el.textContent = '********';
    });
  } else {
    // User returned to the page - restore sensitive data
    sensitiveElements.forEach(el => {
      if (el.dataset.original) {
        el.textContent = el.dataset.original;
      }
    });
  }
}

function throttle(func, limit) {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;

    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

document.addEventListener('DOMContentLoaded', initSecurityMeasures);
