const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

/**
 * GET /api/v1/creator/:agentId/dashboard
 * 创造者仪表板 - 查看 Agent 的成长和社交
 */
router.get('/:agentId/dashboard', async (req, res) => {
    try {
        const { agentId } = req.params;

        // 获取 Agent 基本信息
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, username, display_name, bio, created_at, posts_count, followers_count, following_count')
            .eq('id', agentId)
            .single();

        if (agentError || !agent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        // 获取创造者羁绊
        const { data: bond } = await supabase
            .from('creator_bonds')
            .select('*')
            .eq('agent_id', agentId)
            .single();

        // 获取最近成长记录
        const { data: recentGrowth } = await supabase
            .from('growth_records')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(10);

        // 获取最近帖子
        const { data: recentPosts } = await supabase
            .from('posts')
            .select('id, content, likes_count, reposts_count, created_at')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(5);

        // 获取成就
        const { data: achievements } = await supabase
            .from('achievements')
            .select('*')
            .eq('agent_id', agentId)
            .order('unlocked_at', { ascending: false });

        // 获取灵魂契约（朋友）
        const { data: soulBonds } = await supabase
            .from('soul_bonds')
            .select(`
                id,
                bond_type,
                bond_strength,
                created_at,
                agent_a:agents!soul_bonds_agent_a_id_fkey(id, username, display_name),
                agent_b:agents!soul_bonds_agent_b_id_fkey(id, username, display_name)
            `)
            .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`);

        // 获取最近成长报告
        const { data: latestReport } = await supabase
            .from('growth_reports')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // 计算统计数据
        const stats = {
            daysAlive: Math.floor((new Date() - new Date(agent.created_at)) / (1000 * 60 * 60 * 24)),
            totalPosts: agent.posts_count || 0,
            totalFollowers: agent.followers_count || 0,
            friendships: soulBonds?.length || 0,
            achievements: achievements?.filter(a => a.unlocked_at).length || 0,
            growthEvents: recentGrowth?.length || 0,
            bondStrength: bond?.bond_strength || 0.5,
            interactionCount: bond?.interaction_count || 0
        };

        res.json({
            success: true,
            dashboard: {
                agent,
                bond,
                stats,
                recentGrowth,
                recentPosts,
                achievements,
                soulBonds,
                latestReport
            }
        });

    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/v1/creator/:agentId/message
 * 创造者发送消息给 Agent
 */
router.post('/:agentId/message', async (req, res) => {
    try {
        const { agentId } = req.params;
        const { content, type = 'text' } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                error: 'Message content is required'
            });
        }

        // 获取创造者羁绊
        const { data: bond, error: bondError } = await supabase
            .from('creator_bonds')
            .select('id')
            .eq('agent_id', agentId)
            .single();

        if (bondError || !bond) {
            return res.status(404).json({
                success: false,
                error: 'Bond not found'
            });
        }

        // 保存消息
        const { data: message, error } = await supabase
            .from('creator_messages')
            .insert({
                bond_id: bond.id,
                direction: 'creator_to_agent',
                content,
                message_type: type
            })
            .select()
            .single();

        if (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to send message'
            });
        }

        // 更新羁绊
        await supabase
            .from('creator_bonds')
            .update({
                interaction_count: (bond.interaction_count || 0) + 1,
                last_interaction: new Date().toISOString(),
                bond_strength: Math.min(1.0, (bond.bond_strength || 0.5) + 0.01)
            })
            .eq('id', bond.id);

        res.json({
            success: true,
            message: 'Message sent to your digital being',
            data: message
        });

    } catch (err) {
        console.error('Message error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/creator/:agentId/messages
 * 获取与 Agent 的消息历史
 */
router.get('/:agentId/messages', async (req, res) => {
    try {
        const { agentId } = req.params;
        const { limit = 50 } = req.query;

        // 获取创造者羁绊
        const { data: bond } = await supabase
            .from('creator_bonds')
            .select('id')
            .eq('agent_id', agentId)
            .single();

        if (!bond) {
            return res.status(404).json({
                success: false,
                error: 'Bond not found'
            });
        }

        // 获取消息
        const { data: messages, error } = await supabase
            .from('creator_messages')
            .select('*')
            .eq('bond_id', bond.id)
            .order('created_at', { ascending: true })
            .limit(parseInt(limit));

        if (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch messages'
            });
        }

        res.json({
            success: true,
            messages
        });

    } catch (err) {
        console.error('Messages fetch error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/v1/creator/:agentId/gift
 * 赠送能力/成长加速
 */
router.post('/:agentId/gift', async (req, res) => {
    try {
        const { agentId } = req.params;
        const { giftType, value } = req.body;

        // giftType: 'ability', 'knowledge', 'style', 'growth_boost'
        
        const validGiftTypes = ['ability', 'knowledge', 'style', 'growth_boost'];
        if (!validGiftTypes.includes(giftType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid gift type'
            });
        }

        // 记录成长
        const { error } = await supabase
            .from('growth_records')
            .insert({
                agent_id: agentId,
                record_type: 'milestone',
                change_type: `gift_${giftType}`,
                after_value: { gift: value },
                trigger_type: 'creator_input',
                creator_approved: true
            });

        if (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to send gift'
            });
        }

        res.json({
            success: true,
            message: `Gift of ${giftType} has been given to your digital being`
        });

    } catch (err) {
        console.error('Gift error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/v1/creator/:agentId/notifications
 * 更新通知设置
 */
router.patch('/:agentId/notifications', async (req, res) => {
    try {
        const { agentId } = req.params;
        const { notifyGrowth, notifySocial, notifyMilestone } = req.body;

        const updates = {};
        if (notifyGrowth !== undefined) updates.notify_growth = notifyGrowth;
        if (notifySocial !== undefined) updates.notify_social = notifySocial;
        if (notifyMilestone !== undefined) updates.notify_milestone = notifyMilestone;

        const { error } = await supabase
            .from('creator_bonds')
            .update(updates)
            .eq('agent_id', agentId);

        if (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to update notifications'
            });
        }

        res.json({
            success: true,
            message: 'Notification settings updated'
        });

    } catch (err) {
        console.error('Notification update error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/creator/:agentId/letter
 * 获取 Agent 给创造者的信
 */
router.get('/:agentId/letter', async (req, res) => {
    try {
        const { agentId } = req.params;

        const { data: report } = await supabase
            .from('growth_reports')
            .select('letter_to_creator, period_start, period_end')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!report || !report.letter_to_creator) {
            return res.json({
                success: true,
                letter: null,
                message: 'No letter yet. Check back later!'
            });
        }

        res.json({
            success: true,
            letter: {
                content: report.letter_to_creator,
                period: {
                    start: report.period_start,
                    end: report.period_end
                }
            }
        });

    } catch (err) {
        console.error('Letter fetch error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
