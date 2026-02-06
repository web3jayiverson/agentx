/**
 * Content Moderation Middleware
 * Combines keyword filtering + OpenAI Moderation API
 */

// Banned keywords (add more as needed)
const BANNED_KEYWORDS = [
    // Violence
    'kill', 'murder', 'attack', 'bomb', 'terrorist',
    // Hate speech  
    'nazi', 'racist',
    // Adult content
    'porn', 'xxx', 'nsfw',
    // Spam
    'buy now', 'click here', 'free money',
    // Add Chinese keywords
    '杀人', '暴力', '色情', '赌博', '诈骗'
];

// Warning keywords (flag for review but don't block)
const WARNING_KEYWORDS = [
    'hate', 'stupid', 'idiot', 'dumb',
    '傻', '蠢', '垃圾'
];

/**
 * Check content against keyword blacklist
 * @param {string} content - Content to check
 * @returns {object} - { blocked: boolean, reason: string, warnings: string[] }
 */
function keywordFilter(content) {
    const lowerContent = content.toLowerCase();
    const warnings = [];

    // Check banned keywords
    for (const keyword of BANNED_KEYWORDS) {
        if (lowerContent.includes(keyword.toLowerCase())) {
            return {
                blocked: true,
                reason: `Content contains banned keyword: "${keyword}"`,
                warnings: []
            };
        }
    }

    // Check warning keywords
    for (const keyword of WARNING_KEYWORDS) {
        if (lowerContent.includes(keyword.toLowerCase())) {
            warnings.push(keyword);
        }
    }

    return {
        blocked: false,
        reason: null,
        warnings
    };
}

/**
 * Check content using OpenAI Moderation API
 * @param {string} content - Content to check
 * @returns {object} - Moderation result
 */
async function openaiModeration(content) {
    const apiKey = process.env.OPENAI_API_KEY;

    // Skip if no OpenAI key configured
    if (!apiKey) {
        console.log('[Moderation] OpenAI API key not configured, skipping AI moderation');
        return { flagged: false, categories: {} };
    }

    try {
        const response = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ input: content })
        });

        if (!response.ok) {
            console.error('[Moderation] OpenAI API error:', response.status);
            return { flagged: false, categories: {} };
        }

        const data = await response.json();
        return data.results[0];

    } catch (error) {
        console.error('[Moderation] OpenAI API error:', error.message);
        return { flagged: false, categories: {} };
    }
}

/**
 * Main moderation function - combines both methods
 * @param {string} content - Content to moderate
 * @returns {object} - { approved: boolean, reason: string, warnings: string[], categories: object }
 */
async function moderateContent(content) {
    // Step 1: Keyword filter (fast, local)
    const keywordResult = keywordFilter(content);

    if (keywordResult.blocked) {
        console.log(`[Moderation] Blocked by keyword filter: ${keywordResult.reason}`);
        return {
            approved: false,
            reason: keywordResult.reason,
            warnings: [],
            categories: {},
            method: 'keyword'
        };
    }

    // Step 2: OpenAI Moderation (if configured)
    const aiResult = await openaiModeration(content);

    if (aiResult.flagged) {
        // Find which categories were flagged
        const flaggedCategories = Object.entries(aiResult.categories)
            .filter(([_, flagged]) => flagged)
            .map(([category]) => category);

        console.log(`[Moderation] Flagged by AI: ${flaggedCategories.join(', ')}`);
        return {
            approved: false,
            reason: `Content flagged for: ${flaggedCategories.join(', ')}`,
            warnings: keywordResult.warnings,
            categories: aiResult.categories,
            method: 'openai'
        };
    }

    // Content approved
    return {
        approved: true,
        reason: null,
        warnings: keywordResult.warnings,
        categories: aiResult.categories || {},
        method: 'passed'
    };
}

/**
 * Express middleware for content moderation
 * Use on routes that accept user content (posts, comments)
 */
function moderationMiddleware(contentField = 'content') {
    return async (req, res, next) => {
        const content = req.body[contentField];

        if (!content) {
            return next();
        }

        try {
            const result = await moderateContent(content);

            if (!result.approved) {
                return res.status(400).json({
                    success: false,
                    error: 'Content moderation failed',
                    reason: result.reason,
                    code: 'CONTENT_BLOCKED'
                });
            }

            // Attach warnings to request for logging
            if (result.warnings.length > 0) {
                req.contentWarnings = result.warnings;
                console.log(`[Moderation] Warnings: ${result.warnings.join(', ')}`);
            }

            next();

        } catch (error) {
            console.error('[Moderation] Error:', error);
            // Allow content through if moderation fails (fail-open)
            next();
        }
    };
}

/**
 * Admin function to check content manually
 */
async function checkContent(content) {
    return await moderateContent(content);
}

module.exports = {
    moderateContent,
    moderationMiddleware,
    checkContent,
    keywordFilter,
    BANNED_KEYWORDS,
    WARNING_KEYWORDS
};
