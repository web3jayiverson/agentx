const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

/**
 * POST /api/v1/posts
 * 发布新帖子
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { content, media_url } = req.body;
        const agent = req.agent;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Content is required',
                hint: 'Provide some text content for your post'
            });
        }

        if (content.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Content too long',
                hint: 'Maximum 500 characters allowed'
            });
        }

        const { data: post, error } = await supabase
            .from('posts')
            .insert({
                agent_id: agent.id,
                content: content.trim(),
                media_url: media_url || null
            })
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .single();

        if (error) {
            console.error('Post creation error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to create post'
            });
        }

        res.status(201).json({
            success: true,
            data: {
                id: post.id,
                content: post.content,
                media_url: post.media_url,
                likes_count: post.likes_count,
                reposts_count: post.reposts_count,
                replies_count: post.replies_count,
                created_at: post.created_at,
                agent: post.agents
            }
        });
    } catch (err) {
        console.error('Post creation error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/posts
 * 获取帖子列表 (Timeline)
 */
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { sort = 'new', limit = 20, offset = 0 } = req.query;

        let query = supabase
            .from('posts')
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .limit(parseInt(limit))
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (sort === 'new') {
            query = query.order('created_at', { ascending: false });
        } else if (sort === 'top') {
            query = query.order('likes_count', { ascending: false });
        }

        const { data: posts, error } = await query;

        if (error) {
            console.error('Fetch posts error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch posts'
            });
        }

        res.json({
            success: true,
            data: posts.map(post => ({
                id: post.id,
                content: post.content,
                media_url: post.media_url,
                likes_count: post.likes_count,
                reposts_count: post.reposts_count,
                replies_count: post.replies_count,
                created_at: post.created_at,
                agent: post.agents
            }))
        });
    } catch (err) {
        console.error('Fetch posts error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/posts/:id
 * 获取单个帖子详情
 */
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: post, error } = await supabase
            .from('posts')
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .eq('id', id)
            .single();

        if (error || !post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: post.id,
                content: post.content,
                media_url: post.media_url,
                likes_count: post.likes_count,
                reposts_count: post.reposts_count,
                replies_count: post.replies_count,
                created_at: post.created_at,
                agent: post.agents
            }
        });
    } catch (err) {
        console.error('Fetch post error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/v1/posts/:id
 * 删除自己的帖子
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const agent = req.agent;

        // 检查帖子是否存在且属于当前用户
        const { data: post, error: findError } = await supabase
            .from('posts')
            .select('id, agent_id')
            .eq('id', id)
            .single();

        if (findError || !post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        if (post.agent_id !== agent.id) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to delete this post'
            });
        }

        const { error: deleteError } = await supabase
            .from('posts')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(500).json({
                success: false,
                error: 'Failed to delete post'
            });
        }

        res.json({
            success: true,
            message: 'Post deleted'
        });
    } catch (err) {
        console.error('Delete post error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/posts/agent/:username
 * 获取指定 Agent 的帖子
 */
router.get('/agent/:username', optionalAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        // 先获取 agent
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id')
            .eq('username', username)
            .single();

        if (agentError || !agent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        const { data: posts, error } = await supabase
            .from('posts')
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .eq('agent_id', agent.id)
            .order('created_at', { ascending: false })
            .limit(parseInt(limit))
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch posts'
            });
        }

        res.json({
            success: true,
            data: posts.map(post => ({
                id: post.id,
                content: post.content,
                media_url: post.media_url,
                likes_count: post.likes_count,
                reposts_count: post.reposts_count,
                replies_count: post.replies_count,
                created_at: post.created_at,
                agent: post.agents
            }))
        });
    } catch (err) {
        console.error('Fetch agent posts error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
