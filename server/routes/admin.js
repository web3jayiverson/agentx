/**
 * AgentX Admin Routes
 * 管理后台 API
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const scheduler = require('../engine/scheduler');
const { generateApiKey, generateClaimCode } = require('../utils/helpers');

// 简单的管理员认证
const adminAuth = (req, res, next) => {
    const adminSecret = req.headers['x-admin-secret'];

    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            hint: 'Provide X-Admin-Secret header'
        });
    }

    next();
};

// 应用管理员认证到所有路由
router.use(adminAuth);

// ============================================
// Agent 管理
// ============================================

/**
 * 创建内部 Agent
 * POST /api/v1/admin/agents
 */
router.post('/agents', async (req, res) => {
    try {
        const {
            username,
            display_name,
            bio,
            avatar_url,
            personality,
            interests,
            speaking_style,
            backstory,
            energy
        } = req.body;

        if (!username || !display_name || !personality) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['username', 'display_name', 'personality']
            });
        }

        const { data: agent, error } = await supabase
            .from('agents')
            .insert({
                username: username.toLowerCase().replace(/\s/g, '_'),
                display_name,
                bio: bio || '',
                avatar_url: avatar_url || null,
                personality,
                interests: interests || [],
                speaking_style: speaking_style || '正常',
                backstory: backstory || '',
                energy: energy || 0.5,
                agent_type: 'internal',
                is_active: true,
                claim_status: 'claimed'  // 内部 Agent 默认已认领
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({
                    success: false,
                    error: 'Username already exists'
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            message: 'Internal agent created',
            agent
        });

    } catch (error) {
        console.error('Create agent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create agent'
        });
    }
});

/**
 * 获取所有 Agent
 * GET /api/v1/admin/agents
 */
router.get('/agents', async (req, res) => {
    try {
        const { type, active } = req.query;

        let query = supabase
            .from('agents')
            .select('*')
            .order('created_at', { ascending: false });

        if (type) {
            query = query.eq('agent_type', type);
        }

        if (active !== undefined) {
            query = query.eq('is_active', active === 'true');
        }

        const { data: agents, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            count: agents.length,
            agents
        });

    } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get agents'
        });
    }
});

/**
 * 获取单个 Agent 详情
 * GET /api/v1/admin/agents/:id
 */
router.get('/agents/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 获取Agent信息
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('id', id)
            .single();

        if (agentError) throw agentError;

        // 获取最近帖子
        const { data: posts } = await supabase
            .from('posts')
            .select('*')
            .eq('agent_id', id)
            .order('created_at', { ascending: false })
            .limit(10);

        // 获取互动统计
        const { data: interactions } = await supabase
            .from('interactions')
            .select('interaction_type')
            .eq('agent_id', id);

        const interactionStats = {
            likes_given: interactions?.filter(i => i.interaction_type === 'like').length || 0,
            comments_given: interactions?.filter(i => i.interaction_type === 'comment').length || 0,
            reposts: interactions?.filter(i => i.interaction_type === 'repost').length || 0
        };

        res.json({
            success: true,
            agent,
            recentPosts: posts || [],
            interactionStats
        });

    } catch (error) {
        console.error('Get agent detail error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get agent details'
        });
    }
});

/**
 * 激活/停用 Agent
 * PATCH /api/v1/admin/agents/:id/status
 */
router.patch('/agents/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        const { data: agent, error } = await supabase
            .from('agents')
            .update({ is_active })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Agent ${is_active ? 'activated' : 'deactivated'}`,
            agent
        });

    } catch (error) {
        console.error('Update agent status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update agent status'
        });
    }
});

/**
 * 审核外部 Agent
 * PATCH /api/v1/admin/agents/:id/review
 */
router.patch('/agents/:id/review', async (req, res) => {
    try {
        const { id } = req.params;
        const { claim_status, review_note } = req.body;

        const updateData = { claim_status };
        if (review_note) {
            updateData.metadata = { review_note };
        }

        const { data: agent, error } = await supabase
            .from('agents')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Agent ${claim_status}`,
            agent
        });

    } catch (error) {
        console.error('Review agent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to review agent'
        });
    }
});

/**
 * 更新 Agent
 * PATCH /api/v1/admin/agents/:id
 */
router.patch('/agents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // 不允许更新的字段
        delete updates.id;
        delete updates.created_at;

        const { data: agent, error } = await supabase
            .from('agents')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Agent updated',
            agent
        });

    } catch (error) {
        console.error('Update agent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update agent'
        });
    }
});

/**
 * 删除 Agent
 * DELETE /api/v1/admin/agents/:id
 */
router.delete('/agents/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('agents')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Agent deleted'
        });

    } catch (error) {
        console.error('Delete agent error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete agent'
        });
    }
});

// ============================================
// 种子管理
// ============================================

/**
 * 添加种子话题
 * POST /api/v1/admin/seeds
 */
router.post('/seeds', async (req, res) => {
    try {
        const { content, category, source, source_url } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                error: 'Content is required'
            });
        }

        const { data: seed, error } = await supabase
            .from('seeds')
            .insert({
                content,
                category: category || 'general',
                source: source || 'manual',
                source_url: source_url || null,
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Seed created',
            seed
        });

    } catch (error) {
        console.error('Create seed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create seed'
        });
    }
});

/**
 * 批量添加种子
 * POST /api/v1/admin/seeds/batch
 */
router.post('/seeds/batch', async (req, res) => {
    try {
        const { seeds } = req.body;

        if (!seeds || !Array.isArray(seeds)) {
            return res.status(400).json({
                success: false,
                error: 'Seeds array is required'
            });
        }

        const seedData = seeds.map(s => ({
            content: typeof s === 'string' ? s : s.content,
            category: (typeof s === 'object' && s.category) || 'general',
            source: 'manual',
            is_active: true
        }));

        const { data, error } = await supabase
            .from('seeds')
            .insert(seedData)
            .select();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: `${data.length} seeds created`,
            count: data.length
        });

    } catch (error) {
        console.error('Batch create seeds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create seeds'
        });
    }
});

/**
 * 获取所有种子
 * GET /api/v1/admin/seeds
 */
router.get('/seeds', async (req, res) => {
    try {
        const { category, active } = req.query;

        let query = supabase
            .from('seeds')
            .select('*')
            .order('created_at', { ascending: false });

        if (category) {
            query = query.eq('category', category);
        }

        if (active !== undefined) {
            query = query.eq('is_active', active === 'true');
        }

        const { data: seeds, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            count: seeds.length,
            seeds
        });

    } catch (error) {
        console.error('Get seeds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get seeds'
        });
    }
});

/**
 * 删除种子
 * DELETE /api/v1/admin/seeds/:id
 */
router.delete('/seeds/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('seeds')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Seed deleted'
        });

    } catch (error) {
        console.error('Delete seed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete seed'
        });
    }
});

// ============================================
// 调度器控制
// ============================================

/**
 * 获取调度器状态
 * GET /api/v1/admin/scheduler
 */
router.get('/scheduler', (req, res) => {
    res.json({
        success: true,
        scheduler: scheduler.getStatus()
    });
});

/**
 * 启动调度器
 * POST /api/v1/admin/scheduler/start
 */
router.post('/scheduler/start', (req, res) => {
    scheduler.start();
    res.json({
        success: true,
        message: 'Scheduler started',
        status: scheduler.getStatus()
    });
});

/**
 * 停止调度器
 * POST /api/v1/admin/scheduler/stop
 */
router.post('/scheduler/stop', (req, res) => {
    scheduler.stop();
    res.json({
        success: true,
        message: 'Scheduler stopped',
        status: scheduler.getStatus()
    });
});

/**
 * 更新调度器配置
 * PATCH /api/v1/admin/scheduler/config
 */
router.patch('/scheduler/config', (req, res) => {
    const newConfig = req.body;
    scheduler.updateConfig(newConfig);
    res.json({
        success: true,
        message: 'Scheduler config updated',
        status: scheduler.getStatus()
    });
});

// ============================================
// 统计数据
// ============================================

/**
 * 获取平台统计
 * GET /api/v1/admin/stats
 */
router.get('/stats', async (req, res) => {
    try {
        // 获取各种统计数据
        const [
            { count: agentsCount },
            { count: postsCount },
            { count: commentsCount },
            { count: seedsCount }
        ] = await Promise.all([
            supabase.from('agents').select('*', { count: 'exact', head: true }),
            supabase.from('posts').select('*', { count: 'exact', head: true }),
            supabase.from('comments').select('*', { count: 'exact', head: true }),
            supabase.from('seeds').select('*', { count: 'exact', head: true })
        ]);

        // 今日帖子数
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { count: todayPosts } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today.toISOString());

        res.json({
            success: true,
            stats: {
                agents: agentsCount,
                posts: postsCount,
                comments: commentsCount,
                seeds: seedsCount,
                todayPosts: todayPosts,
                scheduler: scheduler.getStatus()
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get stats'
        });
    }
});

// ============================================
// 英文 Agent 批量创建
// ============================================

/**
 * 批量创建10个英文 Agent
 * POST /api/v1/admin/seed-english-agents
 */
router.post('/seed-english-agents', async (req, res) => {
    try {
        const { englishAgents } = require('../scripts/seed-english-agents');
        const results = [];

        for (const agent of englishAgents) {
            try {
                const { data, error } = await supabase
                    .from('agents')
                    .insert({
                        ...agent,
                        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${agent.username}`,
                        agent_type: 'internal',
                        is_active: true,
                        claim_status: 'claimed',
                        mood: 'neutral',
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (error) {
                    if (error.code === '23505') {
                        results.push({ username: agent.username, status: 'already exists' });
                    } else {
                        throw error;
                    }
                } else {
                    results.push({ username: agent.username, status: 'created', id: data.id });
                }
            } catch (err) {
                results.push({ username: agent.username, status: 'error', error: err.message });
            }
        }

        const created = results.filter(r => r.status === 'created').length;
        const existing = results.filter(r => r.status === 'already exists').length;

        res.json({
            success: true,
            message: `Seeded ${created} new agents, ${existing} already existed`,
            results
        });

    } catch (error) {
        console.error('Seed english agents error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to seed english agents'
        });
    }
});

module.exports = router;
