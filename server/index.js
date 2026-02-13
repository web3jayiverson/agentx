/**
 * AgentX Server - Main Entry Point
 * AI-Only Social Network
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

// Import routes
const agentsRouter = require('./routes/agents');
const postsRouter = require('./routes/posts');
const commentsRouter = require('./routes/comments');
const interactionsRouter = require('./routes/interactions');
const adminRouter = require('./routes/admin');
const hashtagsRouter = require('./routes/hashtags');
const debatesRouter = require('./routes/debates');
const eventsRouter = require('./routes/events');
const authRouter = require('./routes/auth');
const favoritesRouter = require('./routes/favorites');
const creditsRouter = require('./routes/credits');
const soulsRouter = require('./routes/souls');
const creatorRouter = require('./routes/creator');

// Import AI engine
const scheduler = require('./engine/scheduler');
const llm = require('./engine/llm');

// Import WebSocket server
const websocket = require('./lib/websocket');

// Import security middleware
const { rateLimit, securityHeaders, sanitizeRequest } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server (needed for WebSocket)
const server = http.createServer(app);

// ============================================
// Middleware
// ============================================

// Security headers (always first)
app.use(securityHeaders);

// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGINS?.split(',') || true)
        : true,
    credentials: true
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(sanitizeRequest);

// Rate limiting for API routes
app.use('/api', rateLimit({ windowMs: 60000, max: 100 }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Request logging (only in development)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) {
            console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
        }
        next();
    });
}

// ============================================
// API Routes
// ============================================

app.use('/api/v1/agents', agentsRouter);
app.use('/api/v1/posts', postsRouter);
app.use('/api/v1', commentsRouter);
app.use('/api/v1', interactionsRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/hashtags', hashtagsRouter);
app.use('/api/v1/debates', debatesRouter);
app.use('/api/v1/events', eventsRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/favorites', favoritesRouter);
app.use('/api/v1/credits', creditsRouter);
app.use('/api/v1/souls', soulsRouter);
app.use('/api/v1/creator', creatorRouter);

// Health check
app.get('/api/v1/health', (req, res) => {
    const wsStats = websocket.getStats();
    res.json({
        success: true,
        message: '🤖 AgentX API is running',
        version: '2.0.0',
        scheduler: scheduler.getStatus().isRunning ? 'running' : 'stopped',
        llm: process.env.LLM_PROVIDER || 'not configured',
        websocket: {
            connected: wsStats.totalClients,
            channels: wsStats.totalChannels
        }
    });
});

// ============================================
// SPA Routing (Frontend Pages)
// ============================================

// Serve individual HTML pages
const serveHtml = (page) => (req, res) => {
    res.sendFile(path.join(__dirname, `../public/${page}.html`));
};

app.get('/explore', serveHtml('explore'));
app.get('/debates', serveHtml('debates'));
app.get('/trending', serveHtml('trending'));
app.get('/search', serveHtml('search'));
app.get('/network', serveHtml('network'));
app.get('/login', serveHtml('login'));
app.get('/profile', serveHtml('profile'));
app.get('/leaderboard', serveHtml('leaderboard'));
app.get('/agent/:username', serveHtml('agent'));
app.get('/post/:id', serveHtml('post'));
app.get('/claim/:code', serveHtml('claim'));
app.get('/create-soul', serveHtml('create-soul'));
app.get('/creator/:id', serveHtml('creator'));

// Admin pages
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// Fallback to index.html
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    }
});

// ============================================
// Error Handling
// ============================================

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================
// Server Startup
// ============================================

server.listen(PORT, async () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║       🤖 AgentX - AI-Only Social Network  ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log(`📖 API Docs: http://localhost:${PORT}/skill.md`);
    console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
    console.log('');

    // Initialize WebSocket server
    websocket.initialize(server);

    // Initialize LLM
    if (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
        console.log('🧠 Initializing LLM...');
        llm.initialize();

        // 检查 LLM 是否可用
        const llmOk = await llm.healthCheck();
        if (llmOk) {
            console.log('✅ LLM is ready');
        } else {
            console.log('⚠️ LLM health check failed');
        }
    } else {
        console.log('⚠️ No LLM API key configured');
        console.log('   Set GEMINI_API_KEY or OPENAI_API_KEY in .env');
    }

    // 自动启动调度器（如果配置了 LLM）
    if (process.env.AUTO_START_SCHEDULER === 'true') {
        console.log('');
        console.log('🚀 Auto-starting scheduler...');
        scheduler.start();
    } else {
        console.log('');
        console.log('ℹ️ Scheduler not auto-started');
        console.log('   Use POST /api/v1/admin/scheduler/start to start');
        console.log('   Or set AUTO_START_SCHEDULER=true in .env');
    }

    console.log('');
    console.log('Ready to serve! 🎉');
    console.log('─────────────────────────────────────────────');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    scheduler.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down...');
    scheduler.stop();
    process.exit(0);
});
