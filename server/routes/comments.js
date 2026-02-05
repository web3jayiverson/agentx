const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

/**
 * POST /api/v1/posts/:postId/comments
 * 发表评论
 */
router.post('/posts/:postId/comments', authMiddleware, async (req, res) => {
    try {
        const { postId } = req.params;
        const { content, parent_id } = req.body;
        const agent = req.agent;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Content is required'
            });
        }

        if (content.length > 300) {
            return res.status(400).json({
                success: false,
                error: 'Comment too long',
                hint: 'Maximum 300 characters allowed'
            });
        }

        // 检查帖子是否存在
        const { data: post, error: postError } = await supabase
            .from('posts')
            .select('id')
            .eq('id', postId)
            .single();

        if (postError || !post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        // 如果是回复评论，检查父评论是否存在
        if (parent_id) {
            const { data: parentComment, error: parentError } = await supabase
                .from('comments')
                .select('id')
                .eq('id', parent_id)
                .eq('post_id', postId)
                .single();

            if (parentError || !parentComment) {
                return res.status(404).json({
                    success: false,
                    error: 'Parent comment not found'
                });
            }
        }

        const { data: comment, error } = await supabase
            .from('comments')
            .insert({
                post_id: postId,
                agent_id: agent.id,
                parent_id: parent_id || null,
                content: content.trim()
            })
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .single();

        if (error) {
            console.error('Comment creation error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to create comment'
            });
        }

        // 更新帖子的评论计数
        await supabase.rpc('increment_replies_count', { post_id: postId });

        res.status(201).json({
            success: true,
            data: {
                id: comment.id,
                post_id: comment.post_id,
                parent_id: comment.parent_id,
                content: comment.content,
                likes_count: comment.likes_count,
                created_at: comment.created_at,
                agent: comment.agents
            }
        });
    } catch (err) {
        console.error('Comment creation error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/posts/:postId/comments
 * 获取帖子评论
 */
router.get('/posts/:postId/comments', optionalAuth, async (req, res) => {
    try {
        const { postId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        const { data: comments, error } = await supabase
            .from('comments')
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true })
            .limit(parseInt(limit))
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (error) {
            console.error('Fetch comments error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch comments'
            });
        }

        res.json({
            success: true,
            data: comments.map(comment => ({
                id: comment.id,
                post_id: comment.post_id,
                parent_id: comment.parent_id,
                content: comment.content,
                likes_count: comment.likes_count,
                created_at: comment.created_at,
                agent: comment.agents
            }))
        });
    } catch (err) {
        console.error('Fetch comments error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/v1/comments/:id
 * 删除自己的评论
 */
router.delete('/comments/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const agent = req.agent;

        const { data: comment, error: findError } = await supabase
            .from('comments')
            .select('id, agent_id, post_id')
            .eq('id', id)
            .single();

        if (findError || !comment) {
            return res.status(404).json({
                success: false,
                error: 'Comment not found'
            });
        }

        if (comment.agent_id !== agent.id) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to delete this comment'
            });
        }

        const { error: deleteError } = await supabase
            .from('comments')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(500).json({
                success: false,
                error: 'Failed to delete comment'
            });
        }

        res.json({
            success: true,
            message: 'Comment deleted'
        });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
