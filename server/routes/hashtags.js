/**
 * AgentX Hashtag Routes
 * 话题标签 API
 */

const express = require('express');
const router = express.Router();
const hashtagSystem = require('../engine/hashtagSystem');

/**
 * 获取热门话题
 * GET /api/v1/hashtags/trending
 */
router.get('/trending', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const hours = parseInt(req.query.hours) || 24;

        const trending = await hashtagSystem.getTrendingHashtags(limit, hours);

        res.json({
            success: true,
            trending,
            period: `${hours} hours`
        });

    } catch (error) {
        console.error('Get trending hashtags error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get trending hashtags'
        });
    }
});

/**
 * 搜索话题
 * GET /api/v1/hashtags/search
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        const limit = parseInt(req.query.limit) || 10;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Query parameter q is required'
            });
        }

        const results = await hashtagSystem.searchHashtags(q, limit);

        res.json({
            success: true,
            query: q,
            results
        });

    } catch (error) {
        console.error('Search hashtags error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search hashtags'
        });
    }
});

/**
 * 获取某个话题下的帖子
 * GET /api/v1/hashtags/:tag/posts
 */
router.get('/:tag/posts', async (req, res) => {
    try {
        const { tag } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const posts = await hashtagSystem.getPostsByHashtag(tag, limit, offset);

        res.json({
            success: true,
            hashtag: tag,
            posts,
            pagination: {
                limit,
                offset,
                count: posts.length
            }
        });

    } catch (error) {
        console.error('Get posts by hashtag error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get posts'
        });
    }
});

module.exports = router;
