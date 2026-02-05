/**
 * AgentX Security Middleware
 * Rate limiting, security headers, and request validation
 */

// Simple in-memory rate limiter (no external dependencies)
const rateLimitStore = new Map();

/**
 * Rate limiting middleware
 * Limits requests per IP address
 */
function rateLimit(options = {}) {
    const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minute
    const maxRequests = options.max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

    return (req, res, next) => {
        // Skip in development
        if (process.env.NODE_ENV === 'development') {
            return next();
        }

        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        const windowStart = now - windowMs;

        // Get or create rate limit entry
        if (!rateLimitStore.has(ip)) {
            rateLimitStore.set(ip, []);
        }

        const requests = rateLimitStore.get(ip);

        // Remove old requests outside the window
        const recentRequests = requests.filter(time => time > windowStart);
        rateLimitStore.set(ip, recentRequests);

        if (recentRequests.length >= maxRequests) {
            return res.status(429).json({
                error: 'Too many requests',
                message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)} seconds.`,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        // Add current request
        recentRequests.push(now);

        // Add rate limit headers
        res.set({
            'X-RateLimit-Limit': maxRequests,
            'X-RateLimit-Remaining': maxRequests - recentRequests.length,
            'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
        });

        next();
    };
}

/**
 * Security headers middleware
 */
function securityHeaders(req, res, next) {
    // Security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    });

    // Add CSP in production
    if (process.env.NODE_ENV === 'production') {
        res.set('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self' https://*.supabase.co"
        ].join('; '));
    }

    next();
}

/**
 * API key validation middleware for admin routes
 */
function validateAdminAuth(req, res, next) {
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
        console.warn('⚠️ ADMIN_SECRET not set - admin routes unprotected');
        return next();
    }

    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (providedSecret !== adminSecret) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid admin credentials'
        });
    }

    next();
}

/**
 * Request sanitization middleware
 */
function sanitizeRequest(req, res, next) {
    // Remove any __proto__ or constructor properties from body
    if (req.body && typeof req.body === 'object') {
        delete req.body.__proto__;
        delete req.body.constructor;
        delete req.body.prototype;
    }

    next();
}

/**
 * Clean up old rate limit entries periodically
 */
setInterval(() => {
    const now = Date.now();
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;

    for (const [ip, requests] of rateLimitStore.entries()) {
        const recentRequests = requests.filter(time => time > now - windowMs);
        if (recentRequests.length === 0) {
            rateLimitStore.delete(ip);
        } else {
            rateLimitStore.set(ip, recentRequests);
        }
    }
}, 60000); // Clean up every minute

module.exports = {
    rateLimit,
    securityHeaders,
    validateAdminAuth,
    sanitizeRequest
};
