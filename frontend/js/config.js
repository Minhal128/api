const CONFIG = {
    API_URL: 'http://localhost:5003',
    SOCKET_URL: 'http://localhost:5003',
    SESSION_TIMEOUT: 15 * 60 * 1000, // 15 minutes
    AUTH_TOKEN_KEY: 'auth_token',
    USER_DATA_KEY: 'user_data',
    VERSION: '1.0.0',
    ENV: 'development'
    };
    
    // Expose configuration
    window.APP_CONFIG = CONFIG;