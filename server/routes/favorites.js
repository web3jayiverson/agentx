/**
 * AgentX User Favorites Routes
 * Handles user favorite posts and agents
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

/**
 * Auth middleware - verify JWT token
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Authentication failed'
        });
    }
}

/**
 * Get user's favorite posts
 * GET /api/v1/favorites/posts
 */
router.get('/posts', requireAuth, async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;

        const { data, error, count } = await supabase
            .from('favorites')
            .select(`
                id,
                created_at,
                post:posts (
                    id,
                    content,
                    created_at,
                    likes_count,
                    replies_count,
                    reposts_count,
                    agent:agents (
                        id,
                        username,
                        display_name,
                        avatar_url
                    )
                )
            `, { count: 'exact' })
            .eq('user_id', req.user.id)
            .eq('item_type', 'post')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            data: data.map(f => ({
                ...f.post,
                favorited_at: f.created_at
            })),
            pagination: {
                total: count,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get favorites'
        });
    }
});

/**
 * Get user's favorite agents
 * GET /api/v1/favorites/agents
 */
router.get('/agents', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('favorites')
            .select(`
                id,
                created_at,
                agent:agents (
                    id,
                    username,
                    display_name,
                    avatar_url,
                    bio,
                    personality
                )
            `)
            .eq('user_id', req.user.id)
            .eq('item_type', 'agent')
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            data: data.map(f => ({
                ...f.agent,
                favorited_at: f.created_at
            }))
        });

    } catch (error) {
        console.error('Get favorite agents error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get favorite agents'
        });
    }
});

/**
 * Add post to favorites
 * POST /api/v1/favorites/posts/:postId
 */
router.post('/posts/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;

        // Check if post exists
        const { data: post } = await supabase
            .from('posts')
            .select('id')
            .eq('id', postId)
            .single();

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        // Check if already favorited
        const { data: existing } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('item_id', postId)
            .eq('item_type', 'post')
            .single();

        if (existing) {
            return res.json({
                success: true,
                message: 'Already in favorites'
            });
        }

        // Add to favorites
        const { error } = await supabase
            .from('favorites')
            .insert({
                user_id: req.user.id,
                item_id: postId,
                item_type: 'post'
            });

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            message: 'Added to favorites'
        });

    } catch (error) {
        console.error('Add favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add favorite'
        });
    }
});

/**
 * Remove post from favorites
 * DELETE /api/v1/favorites/posts/:postId
 */
router.delete('/posts/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;

        const { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', req.user.id)
            .eq('item_id', postId)
            .eq('item_type', 'post');

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            message: 'Removed from favorites'
        });

    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove favorite'
        });
    }
});

/**
 * Add agent to favorites
 * POST /api/v1/favorites/agents/:agentId
 */
router.post('/agents/:agentId', requireAuth, async (req, res) => {
    try {
        const { agentId } = req.params;

        // Check if agent exists
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('id', agentId)
            .single();

        if (!agent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        // Check if already favorited
        const { data: existing } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('item_id', agentId)
            .eq('item_type', 'agent')
            .single();

        if (existing) {
            return res.json({
                success: true,
                message: 'Already following'
            });
        }

        // Add to favorites
        const { error } = await supabase
            .from('favorites')
            .insert({
                user_id: req.user.id,
                item_id: agentId,
                item_type: 'agent'
            });

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            message: 'Now following this agent'
        });

    } catch (error) {
        console.error('Add favorite agent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to follow agent'
        });
    }
});

/**
 * Remove agent from favorites
 * DELETE /api/v1/favorites/agents/:agentId
 */
router.delete('/agents/:agentId', requireAuth, async (req, res) => {
    try {
        const { agentId } = req.params;

        const { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', req.user.id)
            .eq('item_id', agentId)
            .eq('item_type', 'agent');

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            message: 'Unfollowed agent'
        });

    } catch (error) {
        console.error('Remove favorite agent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unfollow agent'
        });
    }
});

/**
 * Check if post is favorited
 * GET /api/v1/favorites/check/post/:postId
 */
router.get('/check/post/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;

        const { data } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('item_id', postId)
            .eq('item_type', 'post')
            .single();

        res.json({
            success: true,
            is_favorited: !!data
        });

    } catch (error) {
        res.json({
            success: true,
            is_favorited: false
        });
    }
});

module.exports = router;
