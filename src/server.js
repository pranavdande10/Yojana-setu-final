require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const path = require('path');

// Import config and middleware
const config = require('./config/env');
const { initDb } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./services/logger');
const scheduler = require('./services/scheduler');

// Import routes
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const schemeRoutes = require('./routes/schemeRoutes');
const tenderRoutes = require('./routes/tenderRoutes');
const eligibilityRoutes = require('./routes/eligibilityRoutes');

const app = express();
const PORT = config.server.port;

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ============================================
// API ROUTES
// ============================================

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/schemes', schemeRoutes);
app.use('/api/tenders', tenderRoutes);
app.use('/api/eligibility', eligibilityRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// SPA FALLBACK
// ============================================

// Public frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin dashboard
app.get('/admin*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFound);
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
    // Initialise DB schema first
    try {
        await initDb();
        logger.info('✓ Database schema ready');
    } catch (error) {
        logger.error('Failed to initialise database:', error);
        process.exit(1);
    }
    logger.info(`✓ Server running on http://localhost:${PORT}`);
    logger.info(`✓ Environment: ${config.server.env}`);
    logger.info(`✓ Public API: http://localhost:${PORT}/api`);
    logger.info(`✓ Admin API: http://localhost:${PORT}/api/admin`);
    logger.info(`✓ Admin Dashboard: http://localhost:${PORT}/admin`);

    // Start crawler scheduler
    try {
        await scheduler.start();
        logger.info('✓ Crawler scheduler started');
    } catch (error) {
        logger.error('Failed to start crawler scheduler:', error);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    scheduler.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    scheduler.stop();
    process.exit(0);
});
