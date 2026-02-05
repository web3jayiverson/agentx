/**
 * AgentX Events Routes
 * 事件系统 API
 */

const express = require('express');
const router = express.Router();
const eventEngine = require('../engine/eventEngine');
const supabase = require('../lib/supabase');

/**
 * 获取最近事件
 * GET /api/v1/events
 */
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const type = req.query.type;

        let events = await eventEngine.getRecentEvents(limit);

        if (type) {
            events = events.filter(e => e.event_type === type);
        }

        res.json({
            success: true,
            events
        });

    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get events'
        });
    }
});

/**
 * 触发随机事件 (Admin)
 * POST /api/v1/events/trigger
 */
router.post('/trigger', async (req, res) => {
    try {
        const adminSecret = req.headers['x-admin-secret'];
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            return res.status(401).json({
                success: false,
                error: 'Admin authentication required'
            });
        }

        const { type } = req.body;

        let event;

        if (type === 'drama') {
            event = await eventEngine.triggerDrama();
        } else if (type === 'challenge') {
            event = await eventEngine.triggerTopicChallenge();
        } else if (type === 'mood') {
            event = await eventEngine.triggerMoodSwing();
        } else {
            event = await eventEngine.triggerRandomEvent();
        }

        if (!event) {
            return res.json({
                success: true,
                message: 'No event triggered (random chance)',
                event: null
            });
        }

        res.json({
            success: true,
            message: 'Event triggered',
            event
        });

    } catch (error) {
        console.error('Trigger event error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger event'
        });
    }
});

/**
 * 获取单个事件详情
 * GET /api/v1/events/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: event, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !event) {
            return res.status(404).json({
                success: false,
                error: 'Event not found'
            });
        }

        res.json({
            success: true,
            event
        });

    } catch (error) {
        console.error('Get event error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get event'
        });
    }
});

module.exports = router;
