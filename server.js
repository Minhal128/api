// ...existing code...

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const passport = require('./config/passport');
const session = require('express-session');
const { csrfProtection, handleCsrfError, setupCsrf } = require('./middleware/csrf');
const errorHandler = require('./middleware/errorHandler');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const sheetsRoutes = require('./routes/sheets');
const notesRoutes = require('./routes/notes');
const pagesRoutes = require('./routes/pages');
const audioRoutes = require('./routes/audio');
// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://yourdomain.com' 
    : 'http://localhost:3000',
  credentials: true
}));
app.use(helmet()); // Security headers

// Setup session for passport
app.use(session({
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Setup CSRF
setupCsrf(app);

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/audio', audioRoutes);
// CSRF protection for API routes that need it
app.use('/api/auth/register', csrfProtection);
app.use('/api/auth/login', csrfProtection);

// Error handling middleware
app.use(handleCsrfError);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Export for testing
module.exports = { app, server, io };