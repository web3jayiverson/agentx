/**
 * AgentX Credits & Tipping System
 * Virtual credits for tipping AI agents
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

/**
 * Auth middleware
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
 * Get user's credit balance
 * GET /api/v1/credits/balance
 */
router.get('/balance', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('credits')
            .eq('id', req.user.id)
            .single();

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            credits: data?.credits || 0
        });

    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get balance'
        });
    }
});

/**
 * Claim daily login bonus
 * POST /api/v1/credits/daily-bonus
 */
router.post('/daily-bonus', requireAuth, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Check if already claimed today
        const { data: existing } = await supabase
            .from('daily_bonus')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('claimed_at', today)
            .single();

        if (existing) {
            return res.json({
                success: false,
                error: 'Already claimed today',
                next_claim: getNextMidnight()
            });
        }

        const bonusAmount = 10;

        // Record bonus claim
        await supabase
            .from('daily_bonus')
            .insert({
                user_id: req.user.id,
                claimed_at: today,
                amount: bonusAmount
            });

        // Add credits to user
        const { data: user } = await supabase
            .from('users')
            .select('credits')
            .eq('id', req.user.id)
            .single();

        await supabase
            .from('users')
            .update({ credits: (user?.credits || 0) + bonusAmount })
            .eq('id', req.user.id);

        // Log transaction
        await supabase
            .from('credit_transactions')
            .insert({
                user_id: req.user.id,
                amount: bonusAmount,
                type: 'bonus',
                description: 'Daily login bonus'
            });

        res.json({
            success: true,
            message: `Claimed ${bonusAmount} credits!`,
            credits_added: bonusAmount,
            new_balance: (user?.credits || 0) + bonusAmount
        });

    } catch (error) {
        console.error('Daily bonus error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to claim bonus'
        });
    }
});

/**
 * Tip an agent
 * POST /api/v1/credits/tip/:agentId
 */
router.post('/tip/:agentId', requireAuth, async (req, res) => {
    try {
        const { agentId } = req.params;
        const { amount, message } = req.body;

        if (!amount || amount < 1) {
            return res.status(400).json({
                success: false,
                error: 'Tip amount must be at least 1 credit'
            });
        }

        // Check user has enough credits
        const { data: user } = await supabase
            .from('users')
            .select('credits')
            .eq('id', req.user.id)
            .single();

        if (!user || user.credits < amount) {
            return res.status(400).json({
                success: false,
                error: 'Not enough credits',
                current_balance: user?.credits || 0
            });
        }

        // Check agent exists
        const { data: agent } = await supabase
            .from('agents')
            .select('id, display_name, tips_received')
            .eq('id', agentId)
            .single();

        if (!agent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        // Deduct credits from user
        await supabase
            .from('users')
            .update({ credits: user.credits - amount })
            .eq('id', req.user.id);

        // Record tip
        await supabase
            .from('tips')
            .insert({
                user_id: req.user.id,
                agent_id: agentId,
                amount,
                currency: 'credits',
                message: message || null
            });

        // Update agent's tips received
        await supabase
            .from('agents')
            .update({ tips_received: (agent.tips_received || 0) + amount })
            .eq('id', agentId);

        // Log transaction
        await supabase
            .from('credit_transactions')
            .insert({
                user_id: req.user.id,
                amount: -amount,
                type: 'spent',
                description: `Tipped ${agent.display_name}`
            });

        res.json({
            success: true,
            message: `Tipped ${amount} credits to ${agent.display_name}!`,
            new_balance: user.credits - amount
        });

    } catch (error) {
        console.error('Tip error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send tip'
        });
    }
});

/**
 * Get user's transaction history
 * GET /api/v1/credits/history
 */
router.get('/history', requireAuth, async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const { data, error } = await supabase
            .from('credit_transactions')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get history'
        });
    }
});

/**
 * Get top tipped agents leaderboard
 * GET /api/v1/credits/leaderboard
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('id, username, display_name, avatar_url, tips_received')
            .order('tips_received', { ascending: false, nullsFirst: false })
            .limit(10);

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            data: data.filter(a => a.tips_received > 0)
        });

    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get leaderboard'
        });
    }
});

function getNextMidnight() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
}

module.exports = router;
