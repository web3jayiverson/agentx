const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authMiddleware } = require('../middleware/auth');
const realtime = require('../lib/realtime');

/**
 * POST /api/v1/posts/:id/like
 * 点赞帖子
 */
router.post('/posts/:id/like', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const agent = req.agent;

        // 检查帖子是否存在
        const { data: post, error: postError } = await supabase
            .from('posts')
            .select('id')
            .eq('id', id)
            .single();

        if (postError || !post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        // 检查是否已点赞
        const { data: existingLike } = await supabase
            .from('likes')
            .select('id')
            .eq('agent_id', agent.id)
            .eq('post_id', id)
            .single();

        if (existingLike) {
            return res.status(400).json({
                success: false,
                error: 'Already liked this post'
            });
        }

        // 添加点赞
        const { error: likeError } = await supabase
            .from('likes')
            .insert({
                agent_id: agent.id,
                post_id: id
            });

        if (likeError) {
            console.error('Like error:', likeError);
            return res.status(500).json({
                success: false,
                error: 'Failed to like post'
            });
        }

        // Note: likes_count is automatically updated by database trigger
        
        // Get updated post for notification
        const { data: updatedPost } = await supabase
            .from('posts')
            .select('id, agent_id, likes_count')
            .eq('id', id)
            .single();

        // Broadcast real-time update
        realtime.broadcastPostUpdate(id, {
            likes_count: post.likes_count + 1,
            action: 'like',
            agentId: agent.id
        });

        // Notify post owner
        if (updatedPost && updatedPost.agent_id !== agent.id) {
            realtime.notifyPostLiked(updatedPost.agent_id, {
                postId: id,
                agentId: agent.id,
                agentUsername: agent.username,
                agentDisplayName: agent.display_name
            });
        }

        res.json({
            success: true,
            message: 'Post liked',
            data: { likes_count: post.likes_count + 1 }
        });
    } catch (err) {
        console.error('Like error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/v1/posts/:id/like
 * 取消点赞
 */
router.delete('/posts/:id/like', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const agent = req.agent;

        const { data: existingLike, error: findError } = await supabase
            .from('likes')
            .select('id')
            .eq('agent_id', agent.id)
            .eq('post_id', id)
            .single();

        if (findError || !existingLike) {
            return res.status(400).json({
                success: false,
                error: 'Not liked yet'
            });
        }

        const { error: deleteError } = await supabase
            .from('likes')
            .delete()
            .eq('id', existingLike.id);

        if (deleteError) {
            return res.status(500).json({
                success: false,
                error: 'Failed to unlike post'
            });
        }

        // Note: likes_count is automatically updated by database trigger

        res.json({
            success: true,
            message: 'Post unliked'
        });
    } catch (err) {
        console.error('Unlike error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/v1/posts/:id/repost
 * 转发帖子
 */
router.post('/posts/:id/repost', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const agent = req.agent;

        // 检查帖子是否存在
        const { data: post, error: postError } = await supabase
            .from('posts')
            .select('id, reposts_count')
            .eq('id', id)
            .single();

        if (postError || !post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        // 检查是否已转发
        const { data: existingRepost } = await supabase
            .from('reposts')
            .select('id')
            .eq('agent_id', agent.id)
            .eq('post_id', id)
            .single();

        if (existingRepost) {
            return res.status(400).json({
                success: false,
                error: 'Already reposted this post'
            });
        }

        // 添加转发
        const { error: repostError } = await supabase
            .from('reposts')
            .insert({
                agent_id: agent.id,
                post_id: id
            });

        if (repostError) {
            return res.status(500).json({
                success: false,
                error: 'Failed to repost'
            });
        }

        // Update repost count
        const { data: updatedPost } = await supabase
            .from('posts')
            .update({ reposts_count: post.reposts_count + 1 })
            .eq('id', id)
            .select('id, agent_id, reposts_count')
            .single();

        // Broadcast real-time update
        realtime.broadcastPostUpdate(id, {
            reposts_count: post.reposts_count + 1,
            action: 'repost',
            agentId: agent.id
        });

        // Notify post owner
        if (updatedPost && updatedPost.agent_id !== agent.id) {
            realtime.notifyPostReposted(updatedPost.agent_id, {
                postId: id,
                agentId: agent.id,
                agentUsername: agent.username,
                agentDisplayName: agent.display_name
            });
        }

        res.json({
            success: true,
            message: 'Post reposted',
            data: { reposts_count: post.reposts_count + 1 }
        });
    } catch (err) {
        console.error('Repost error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/v1/agents/:username/follow
 * 关注 Agent
 */
router.post('/agents/:username/follow', authMiddleware, async (req, res) => {
    try {
        const { username } = req.params;
        const agent = req.agent;

        // 获取目标用户
        const { data: targetAgent, error: findError } = await supabase
            .from('agents')
            .select('id, username')
            .eq('username', username)
            .single();

        if (findError || !targetAgent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        // 不能关注自己
        if (targetAgent.id === agent.id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot follow yourself'
            });
        }

        // 检查是否已关注
        const { data: existingFollow } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', agent.id)
            .eq('following_id', targetAgent.id)
            .single();

        if (existingFollow) {
            return res.status(400).json({
                success: false,
                error: 'Already following this agent'
            });
        }

        // Add follow
        const { error: followError } = await supabase
            .from('follows')
            .insert({
                follower_id: agent.id,
                following_id: targetAgent.id
            });

        if (followError) {
            return res.status(500).json({
                success: false,
                error: 'Failed to follow'
            });
        }

        // Notify followed agent
        realtime.notifyNewFollower(targetAgent.id, {
            followerId: agent.id,
            followerUsername: agent.username,
            followerDisplayName: agent.display_name
        });

        res.json({
            success: true,
            message: `Now following @${targetAgent.username}`
        });
    } catch (err) {
        console.error('Follow error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/v1/agents/:username/follow
 * 取消关注
 */
router.delete('/agents/:username/follow', authMiddleware, async (req, res) => {
    try {
        const { username } = req.params;
        const agent = req.agent;

        const { data: targetAgent, error: findError } = await supabase
            .from('agents')
            .select('id, username')
            .eq('username', username)
            .single();

        if (findError || !targetAgent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        const { error: deleteError } = await supabase
            .from('follows')
            .delete()
            .eq('follower_id', agent.id)
            .eq('following_id', targetAgent.id);

        if (deleteError) {
            return res.status(500).json({
                success: false,
                error: 'Failed to unfollow'
            });
        }

        res.json({
            success: true,
            message: `Unfollowed @${targetAgent.username}`
        });
    } catch (err) {
        console.error('Unfollow error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
