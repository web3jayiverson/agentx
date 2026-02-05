/**
 * AgentX Debate Routes
 * 辩论系统 API
 */

const express = require('express');
const router = express.Router();
const debateEngine = require('../engine/debateEngine');
const supabase = require('../lib/supabase');

/**
 * 获取最近的辩论
 * GET /api/v1/debates
 */
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;  // active, completed, pending

        let debates;

        if (status === 'active') {
            debates = await debateEngine.getActiveDebates();
        } else {
            debates = await debateEngine.getRecentDebates(limit);

            if (status) {
                debates = debates.filter(d => d.status === status);
            }
        }

        res.json({
            success: true,
            debates
        });

    } catch (error) {
        console.error('Get debates error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get debates'
        });
    }
});

/**
 * 获取单个辩论详情
 * GET /api/v1/debates/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: debate, error } = await supabase
            .from('debates')
            .select(`
                *,
                pro_agent:agents!debates_agent_pro_fkey(id, username, display_name, avatar_url, personality),
                con_agent:agents!debates_agent_con_fkey(id, username, display_name, avatar_url, personality),
                winner:agents!debates_winner_id_fkey(id, username, display_name)
            `)
            .eq('id', id)
            .single();

        if (error || !debate) {
            return res.status(404).json({
                success: false,
                error: 'Debate not found'
            });
        }

        res.json({
            success: true,
            debate
        });

    } catch (error) {
        console.error('Get debate error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get debate'
        });
    }
});

/**
 * 创建新辩论 (Admin)
 * POST /api/v1/debates
 */
router.post('/', async (req, res) => {
    try {
        // 简单的管理员验证
        const adminSecret = req.headers['x-admin-secret'];
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            return res.status(401).json({
                success: false,
                error: 'Admin authentication required'
            });
        }

        const { topic, agent_pro, agent_con } = req.body;

        const debate = await debateEngine.createDebate(
            topic ? { topic, pro: '正方', con: '反方' } : null,
            agent_pro,
            agent_con
        );

        res.status(201).json({
            success: true,
            message: 'Debate created',
            debate
        });

    } catch (error) {
        console.error('Create debate error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create debate'
        });
    }
});

/**
 * 开始辩论 (Admin)
 * POST /api/v1/debates/:id/start
 */
router.post('/:id/start', async (req, res) => {
    try {
        const adminSecret = req.headers['x-admin-secret'];
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            return res.status(401).json({
                success: false,
                error: 'Admin authentication required'
            });
        }

        const { id } = req.params;

        // 异步执行辩论，不等待完成
        debateEngine.startDebate(id).catch(err => {
            console.error('Debate error:', err);
        });

        res.json({
            success: true,
            message: 'Debate started',
            hint: 'The debate will run in the background'
        });

    } catch (error) {
        console.error('Start debate error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start debate'
        });
    }
});

/**
 * 投票
 * POST /api/v1/debates/:id/vote
 */
router.post('/:id/vote', async (req, res) => {
    try {
        const { id } = req.params;
        const { stance } = req.body;  // 'pro' or 'con'

        if (!stance || !['pro', 'con'].includes(stance)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid stance. Use "pro" or "con"'
            });
        }

        const result = await debateEngine.vote(id, stance);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Debate not found'
            });
        }

        res.json({
            success: true,
            message: 'Vote recorded',
            votes: {
                pro: result.votes_pro,
                con: result.votes_con
            }
        });

    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to vote'
        });
    }
});

/**
 * 快速创建并开始辩论 (Admin)
 * POST /api/v1/debates/quick
 */
router.post('/quick', async (req, res) => {
    try {
        const adminSecret = req.headers['x-admin-secret'];
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            return res.status(401).json({
                success: false,
                error: 'Admin authentication required'
            });
        }

        const { topic } = req.body;

        // 创建辩论
        const debate = await debateEngine.createDebate(
            topic ? { topic, pro: '正方', con: '反方' } : null
        );

        // 异步开始辩论
        debateEngine.startDebate(debate.id).catch(err => {
            console.error('Debate error:', err);
        });

        res.status(201).json({
            success: true,
            message: 'Debate created and started',
            debate
        });

    } catch (error) {
        console.error('Quick debate error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create debate'
        });
    }
});

module.exports = router;
