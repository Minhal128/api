/**
 * Authentication Module
 * Handles user login, registration and session management
 */

// API URL from app configuration 
const AUTH_API_URL = 'http://localhost:5003/api/auth';

// Token storage keys
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

// Remove duplicate function as AuthState has its own getToken method

/**
 * User Authentication State
 */
const AuthState = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
  isAuthenticated: false,
  listeners: [],

  // Initialize authentication state
  init() {
    this.isAuthenticated = !!this.token;
    console.log('Auth state initialized, isAuthenticated:', this.isAuthenticated);
    
    if (this.isAuthenticated && this.token) {
      // Verify token validity on init
      this.verifyToken();
    }
    
    // Update UI based on auth state
    this.updateUI();
    
    return this.isAuthenticated;
  },
  
  // Add listener for auth state changes
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  },
  
  // Notify all listeners of state change
  notifyAll() {
    this.listeners.forEach(listener => listener({
      isAuthenticated: this.isAuthenticated,
      user: this.user
    }));
  },
  
  // Set authentication data
  setAuth(token, user) {
    console.log('Setting auth state:', { token: !!token, user });
    this.token = token;
    this.user = user;
    this.isAuthenticated = true;
    
    // Store in local storage
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    
    this.updateUI();
    this.notifyAll();
  },
  
  // Clear authentication data
  clearAuth() {
    console.log('Clearing auth state');
    this.token = null;
    this.user = null;
    this.isAuthenticated = false;
    
    // Remove from local storage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    this.updateUI();
    this.notifyAll();
  },
  
  // Update UI based on authentication state
  updateUI() {
    console.log('Updating UI based on auth state:', this.isAuthenticated);
    
    // Get container elements
    const authContainer = document.getElementById('auth-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    
    if (!authContainer || !dashboardContainer) {
      console.warn('Auth or dashboard containers not found');
      return;
    }
    
    // Update visibility based on auth state
    if (this.isAuthenticated) {
      authContainer.classList.add('d-none');
      dashboardContainer.classList.remove('d-none');
      
      // Update user info display
      const userDisplay = document.getElementById('user-display');
      if (userDisplay && this.user) {
        userDisplay.textContent = this.user.name || this.user.email;
      }
    } else {
      authContainer.classList.remove('d-none');
      dashboardContainer.classList.add('d-none');
    }
  },
  
  // Verify if token is still valid
  async verifyToken() {
    try {
      console.log('Verifying token...');
      const response = await fetch(`${AUTH_API_URL}/me`, {
        headers: { 
          'x-auth-token': this.token 
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.warn('Token verification failed, status:', response.status);
        this.clearAuth();
        return false;
      }
      
      const userData = await response.json();
      console.log('Token verified, user data:', userData);
      this.user = userData;
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      this.updateUI();
      this.notifyAll();
      return true;
    } catch (error) {
      console.error('Token verification failed:', error);
      this.clearAuth();
      return false;
    }
  },
  
  // Get authentication token
  getToken() {
    return this.token;
  },
  
  // Get authentication headers
  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-auth-token': this.token
    };
  },
  
  // Get current user
  getUser() {
    return this.user;
  }
};

/**
 * User Login
 * @param {string} email User email
 * @param {string} password User password
 * @returns {Promise<Object>} Login result
 */
async function login(email, password) {
  console.log('Login function called with:', email);
  try {
    // Validate inputs
    if (!email || !password) {
      console.warn('Login validation failed: empty email or password');
      return {
        success: false,
        error: 'Email and password are required'
      };
    }
    
    if (!email.includes('@')) {
      console.warn('Login validation failed: invalid email format');
      return {
        success: false,
        error: 'Please enter a valid email'
      };
    }
    
    console.log('Attempting login for:', email);
    const response = await fetch(`${AUTH_API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
      mode: 'cors'
    });
    
    console.log('Login response status:', response.status);
    let data;
    
    try {
      data = await response.json();
      console.log('Login response data:', data);
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError);
      throw new Error('Invalid server response. Please try again.');
    }
    
    if (!response.ok) {
      const errorMessage = data.msg || data.error || 'Login failed';
      console.error('Server returned error:', errorMessage, data);
      throw new Error(errorMessage);
    }
    
    // Verify we have the required data
    if (!data.token) {
      console.error('Missing token in response:', data);
      throw new Error('Invalid response format. Token missing.');
    }
    
    // Update authentication state
    AuthState.setAuth(data.token, data.user);
    
    return {
      success: true,
      user: data.user
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.message || 'Invalid credentials. Please check your email and password.'
    };
  }
}

/**
 * User Registration
 * @param {Object} userData User data (name, email, password)
 * @returns {Promise<Object>} Registration result
 */
async function register(userData) {
  console.log('Register function called with:', userData.email);
  try {
    const response = await fetch(`${AUTH_API_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData),
      credentials: 'include',
      mode: 'cors'
    });
    
    console.log('Register response status:', response.status);
    let data;
    
    try {
      data = await response.json();
      console.log('Register response data:', data);
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError);
      throw new Error('Invalid server response. Please try again.');
    }
    
    if (!response.ok) {
      throw new Error(data.msg || data.error || 'Registration failed');
    }
    
    // Update authentication state
    AuthState.setAuth(data.token, data.user);
    
    return {
      success: true,
      user: data.user
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Google OAuth Login
 * @param {string} tokenId Google token ID
 * @returns {Promise<Object>} Login result
 */
async function googleLogin(tokenId) {
  try {
    const response = await fetch(`${AUTH_API_URL}/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tokenId }),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.msg || 'Google login failed');
    }
    
    // Update authentication state
    AuthState.setAuth(data.token, data.user);
    
    return {
      success: true,
      user: data.user
    };
  } catch (error) {
    console.error('Google login error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * User Logout
 */
function logout() {
  AuthState.clearAuth();
  return {
    success: true
  };
}

/**
 * Handle login form submission
 * @param {Event} event Form submit event
 */
function handleLoginForm(event) {
  event.preventDefault();
  console.log('Login form submitted');
  
  try {
    const form = event.target;
    const email = form.querySelector('#login-email').value;
    const password = form.querySelector('#login-password').value;
    
    // Clear previous errors
    const errorContainer = document.querySelector('#login-error');
    if (errorContainer) {
      errorContainer.textContent = '';
      errorContainer.classList.add('d-none');
    }
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';
      
      login(email, password)
        .then(result => {
          if (result.success) {
            console.log('Login successful:', result.user);
            // Dispatch a custom event on successful login
            document.dispatchEvent(new CustomEvent('auth:login', {
              detail: { user: result.user }
            }));
          } else {
            // Show error message
            console.warn('Login failed:', result.error);
            showLoginError(result.error);
          }
        })
        .finally(() => {
          // Reset button state
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
    } else {
      login(email, password)
        .then(result => {
          if (result.success) {
            console.log('Login successful');
            document.dispatchEvent(new CustomEvent('auth:login', {
              detail: { user: result.user }
            }));
          } else {
            showLoginError(result.error);
          }
        });
    }
  } catch (error) {
    console.error('Error in handleLoginForm:', error);
    showLoginError('An unexpected error occurred. Please try again.');
  }
}

/**
 * Handle registration form submission
 * @param {Event} event Form submit event
 */
function handleRegisterForm(event) {
  event.preventDefault();
  console.log('Register form submitted');
  
  try {
    const form = event.target;
    const name = form.querySelector('#register-name').value;
    const email = form.querySelector('#register-email').value;
    const password = form.querySelector('#register-password').value;
    
    // Clear previous errors
    const errorContainer = document.querySelector('#register-error');
    if (errorContainer) {
      errorContainer.textContent = '';
      errorContainer.classList.add('d-none');
    }
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registering...';
      
      register({ name, email, password })
        .then(result => {
          if (result.success) {
            console.log('Registration successful:', result.user);
            // Dispatch a custom event on successful registration
            document.dispatchEvent(new CustomEvent('auth:register', {
              detail: { user: result.user }
            }));
          } else {
            // Show error message
            console.warn('Registration failed:', result.error);
            showRegisterError(result.error);
          }
        })
        .finally(() => {
          // Reset button state
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
    } else {
      register({ name, email, password })
        .then(result => {
          if (result.success) {
            console.log('Registration successful');
            document.dispatchEvent(new CustomEvent('auth:register', {
              detail: { user: result.user }
            }));
          } else {
            showRegisterError(result.error);
          }
        });
    }
  } catch (error) {
    console.error('Error in handleRegisterForm:', error);
    showRegisterError('An unexpected error occurred. Please try again.');
  }
}

/**
 * Display login error
 * @param {string} message Error message
 */
function showLoginError(message) {
  let errorContainer = document.querySelector('#login-error');
  if (!errorContainer) {
    // Create error container if it doesn't exist
    errorContainer = document.createElement('div');
    errorContainer.id = 'login-error';
    errorContainer.className = 'alert alert-danger mt-3';
    const loginForm = document.querySelector('#login-form');
    if (loginForm) {
      loginForm.insertBefore(errorContainer, loginForm.querySelector('button[type="submit"]'));
    } else {
      console.error('Login form not found. Error:', message);
      alert('Login error: ' + message);
      return;
    }
  }
  errorContainer.textContent = message;
  errorContainer.classList.remove('d-none');
}

/**
 * Display registration error
 * @param {string} message Error message
 */
function showRegisterError(message) {
  const errorContainer = document.querySelector('#register-error');
  if (errorContainer) {
    errorContainer.textContent = message;
    errorContainer.classList.remove('d-none');
  } else {
    console.error('Register error container not found. Error:', message);
    alert('Registration error: ' + message);
  }
}

/**
 * Initialize authentication forms
 */
function initAuthForms() {
  console.log('Initializing auth forms');
  
  // Login form
  const loginForm = document.querySelector('#login-form');
  if (loginForm) {
    console.log('Login form found');
    loginForm.addEventListener('submit', handleLoginForm);
  } else {
    console.warn('Login form not found in DOM');
  }
  
  // Register form
  const registerForm = document.querySelector('#register-form');
  if (registerForm) {
    console.log('Register form found');
    registerForm.addEventListener('submit', handleRegisterForm);
  } else {
    console.warn('Register form not found in DOM');
  }
  
  // Logout button
  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    console.log('Logout button found');
    logoutBtn.addEventListener('click', () => {
      logout();
      document.dispatchEvent(new CustomEvent('auth:logout'));
    });
  } else {
    console.warn('Logout button not found in DOM');
  }
  
  // Make sure Bootstrap tabs are working
  if (typeof bootstrap !== 'undefined') {
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
      new bootstrap.Tab(tab);
    });
  }
}

// Initialize authentication state when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing auth module');
  AuthState.init();
  initAuthForms();
});

// Expose for global use
window.AuthState = AuthState;
window.login = login;
window.register = register;
window.logout = logout;