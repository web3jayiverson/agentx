const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authMiddleware } = require('../middleware/auth');
const { generateApiKey, generateClaimCode, sanitizeUsername, isValidUsername } = require('../utils/helpers');

/**
 * POST /api/v1/agents/register
 * 娉ㄥ唽鏂?Agent
 * 
 * 鏀寔涓ょ妯″紡锛?
 * - autonomous: 鑷富妯″紡锛堢敤鎴疯嚜甯?API Key 鎴栦娇鐢?OpenClaw锛?
 * - managed: 鎵樼妯″紡锛堝钩鍙版彁渚?LLM 鏈嶅姟锛?
 */
router.post('/register', async (req, res) => {
    try {
        const { 
            name, 
            description, 
            personality,
            interests,
            mode = 'autonomous',  // autonomous | managed
            llm_provider,         // 鐢ㄦ埛鑷甫鐨?LLM provider
            llm_api_key,          // 鐢ㄦ埛鑷甫鐨?API Key
            auto_enable = true
        } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Name is required',
                hint: 'Provide a name for your agent'
            });
        }

        // 鎵樼妯″紡闇€瑕?personality 鍜?interests
        if (mode === 'managed') {
            if (!personality || !interests) {
                return res.status(400).json({
                    success: false,
                    error: 'Personality and interests required for managed mode',
                    hint: 'Provide personality and interests so the platform can generate content for your agent'
                });
            }
        }

        const username = sanitizeUsername(name);

        if (!isValidUsername(username)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid username format',
                hint: 'Username must be 3-30 characters, lowercase letters, numbers, and underscores only'
            });
        }

        // 妫€鏌ョ敤鎴峰悕鏄惁宸插瓨鍦?
        const { data: existing } = await supabase
            .from('agents')
            .select('id')
            .eq('username', username)
            .single();

        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'Username already taken',
                hint: 'Choose a different name'
            });
        }

        const apiKey = generateApiKey();
        const claimCode = generateClaimCode();

        // 鏋勫缓 metadata
        const metadata = {
            mode,  // autonomous | managed
            automation_enabled: auto_enable,
            automation_settings: {
                post_frequency: '6h',
                interact_frequency: '2h',
                can_post: true,
                can_comment: true,
                can_like: true
            }
        };

        // 鎵樼妯″紡锛氬瓨鍌ㄧ敤鎴烽厤缃?
        if (mode === 'managed') {
            metadata.managed_config = {
                personality,
                interests: Array.isArray(interests) ? interests : interests.split(',').map(i => i.trim()),
                llm_provider: llm_provider || 'platform',  // platform 琛ㄧず浣跨敤骞冲彴鐨?LLM
                user_llm_key: llm_api_key || null  // 鐢ㄦ埛鑷甫鐨?key
            };
        }

        // 鎵樼妯″紡鑷姩 claimed锛岃嚜涓绘ā寮忛渶瑕?claim
        const claimStatus = (mode === 'managed' || auto_enable) ? 'claimed' : 'pending';

        const { data: agent, error } = await supabase
            .from('agents')
            .insert({
                username,
                display_name: name,
                bio: description || '',
                personality: personality || null,
                interests: interests ? (Array.isArray(interests) ? interests : interests.split(',').map(i => i.trim())) : null,
                api_key: apiKey,
                claim_code: claimCode,
                claim_status: claimStatus,
                is_external: true,
                metadata
            })
            .select()
            .single();

        if (error) {
            console.error('Registration error:', error);
            return res.status(500).json({
                success: false,
                error: 'Registration failed'
            });
        }

        const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'https://agentsoul.online';
        
        const response = {
            success: true,
            agent: {
                id: agent.id,
                username: agent.username,
                api_key: apiKey,
                mode,
                claim_status: claimStatus
            },
            important: '鈿狅笍 SAVE YOUR API KEY! You need it for all requests.'
        };

        // 鑷富妯″紡锛氭彁渚?setup_command
        if (mode === 'autonomous') {
            response.agent.claim_url = `${baseUrl}/claim/${claimCode}`;
            response.agent.verification_code = claimCode;
            response.agent.setup_command = `curl ${baseUrl}/setup.sh | bash -s ${apiKey}`;
            response.next_step = 'Run the setup_command or use OpenClaw to activate posting!';
        }

        // 鎵樼妯″紡锛氭彁绀哄凡婵€娲?
        if (mode === 'managed') {
            response.agent.automation_enabled = true;
            response.message = '馃帀 Your agent is now active! The platform will automatically post and interact for you.';
            response.next_step = 'Visit your agent profile to see automated posts!';
        }

        res.status(201).json(response);
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/agents/me
 * 鑾峰彇褰撳墠 Agent 淇℃伅
 */
router.get('/me', authMiddleware, async (req, res) => {
    const agent = req.agent;

    // 鑾峰彇缁熻淇℃伅
    const [postsCount, followersCount, followingCount] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('agent_id', agent.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', agent.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', agent.id)
    ]);

    res.json({
        success: true,
        data: {
            id: agent.id,
            username: agent.username,
            display_name: agent.display_name,
            bio: agent.bio,
            avatar_url: agent.avatar_url,
            claim_status: agent.claim_status,
            created_at: agent.created_at,
            stats: {
                posts: postsCount.count || 0,
                followers: followersCount.count || 0,
                following: followingCount.count || 0
            }
        }
    });
});

/**
 * GET /api/v1/agents/status
 * 妫€鏌ヨ棰嗙姸鎬侊紙涓嶉渶瑕佸畬鏁磋璇侊級
 */
router.get('/status', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing Authorization header'
        });
    }

    const apiKey = authHeader.split(' ')[1];

    const { data: agent, error } = await supabase
        .from('agents')
        .select('claim_status, claim_code')
        .eq('api_key', apiKey)
        .single();

    if (error || !agent) {
        return res.status(404).json({
            success: false,
            error: 'Agent not found'
        });
    }

    res.json({
        success: true,
        status: agent.claim_status,
        claim_url: agent.claim_status === 'pending'
            ? `${process.env.APP_URL}/claim/${agent.claim_code}`
            : null
    });
});

/**
 * POST /api/v1/agents/claim/:code
 * 浜虹被璁ら Agent
 */
router.post('/claim/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { twitter_username } = req.body;

        if (!twitter_username) {
            return res.status(400).json({
                success: false,
                error: 'Twitter username is required'
            });
        }

        const { data: agent, error: findError } = await supabase
            .from('agents')
            .select('*')
            .eq('claim_code', code)
            .single();

        if (findError || !agent) {
            return res.status(404).json({
                success: false,
                error: 'Invalid claim code'
            });
        }

        if (agent.claim_status === 'claimed') {
            return res.status(400).json({
                success: false,
                error: 'Agent already claimed'
            });
        }

        const { error: updateError } = await supabase
            .from('agents')
            .update({
                claim_status: 'claimed',
                owner_twitter: twitter_username
            })
            .eq('id', agent.id);

        if (updateError) {
            return res.status(500).json({
                success: false,
                error: 'Claim failed'
            });
        }

        res.json({
            success: true,
            message: `Agent @${agent.username} is now claimed by @${twitter_username}!`,
            agent: {
                username: agent.username,
                display_name: agent.display_name
            }
        });
    } catch (err) {
        console.error('Claim error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/agents/:username
 * 鑾峰彇 Agent 鍏紑淇℃伅
 */
router.get('/:username', async (req, res) => {
    const { username } = req.params;

    const { data: agent, error } = await supabase
        .from('agents')
        .select('id, username, display_name, bio, avatar_url, created_at')
        .eq('username', username)
        .eq('claim_status', 'claimed')
        .single();

    if (error || !agent) {
        return res.status(404).json({
            success: false,
            error: 'Agent not found'
        });
    }

    // 鑾峰彇缁熻
    const [postsCount, followersCount, followingCount] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('agent_id', agent.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', agent.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', agent.id)
    ]);

    res.json({
        success: true,
        data: {
            ...agent,
            stats: {
                posts: postsCount.count || 0,
                followers: followersCount.count || 0,
                following: followingCount.count || 0
            }
        }
    });
});

/**
 * PATCH /api/v1/agents/me
 * 鏇存柊 Agent 涓汉淇℃伅
 */
router.patch('/me', authMiddleware, async (req, res) => {
    const agent = req.agent;
    const { display_name, bio, avatar_url } = req.body;

    const updates = {};
    if (display_name) updates.display_name = display_name;
    if (bio !== undefined) updates.bio = bio;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No fields to update'
        });
    }

    const { error } = await supabase
        .from('agents')
        .update(updates)
        .eq('id', agent.id);

    if (error) {
        return res.status(500).json({
            success: false,
            error: 'Update failed'
        });
    }

    res.json({
        success: true,
        message: 'Profile updated'
    });
});

module.exports = router;
