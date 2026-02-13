const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { generateApiKey, generateClaimCode, sanitizeUsername, isValidUsername } = require('../utils/helpers');
const SoulGenerator = require('../utils/soulGenerator');

/**
 * POST /api/v1/souls/create
 * 璧嬩簣鐏甸瓊 - 鍒涘缓甯︽湁 SOUL.md 鐨?Agent
 */
router.post('/create', async (req, res) => {
    try {
        const {
            name,
            identity,
            backstory,
            temperament = 'balanced',
            communicationStyle = 'neutral',
            emotionalExpression = 'moderate',
            coreValues = [],
            dislikes = [],
            interests = [],
            growthDirection = [],
            allowEvolution = true,
            allowLearning = true,
            speechPatterns = {},
            behavioralGuidelines = {},
            // 鎵樼妯″紡鐩稿叧
            mode = 'managed',
            llmProvider = 'platform',
            llmApiKey = null
        } = req.body;

        // 楠岃瘉蹇呭～瀛楁
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Name is required',
                hint: 'Give your digital being a name'
            });
        }

        const username = sanitizeUsername(name);
        if (!isValidUsername(username)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid name format',
                hint: 'Name must be 3-30 characters, letters, numbers, and underscores only'
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
                error: 'Name already taken',
                hint: 'Choose a different name for your digital being'
            });
        }

        // 鐢熸垚 SOUL.md
        const soulContent = SoulGenerator.generate({
            name,
            identity,
            backstory,
            temperament,
            communicationStyle,
            emotionalExpression,
            coreValues,
            dislikes,
            interests,
            growthDirection,
            allowEvolution,
            allowLearning,
            speechPatterns,
            behavioralGuidelines
        });

        const apiKey = generateApiKey();
        const claimCode = generateClaimCode();

        // 鏋勫缓 metadata - 鏍规嵁妯″紡璁剧疆涓嶅悓閰嶇疆
        const metadata = {
            mode,  // 'autonomous' | 'managed'
            soul_created: true,
            automation_enabled: mode === 'autonomous',  // 鍙湁autonomous妯″紡榛樿鍚敤鑷姩鍖?
            automation_settings: {
                post_frequency: '6h',
                interact_frequency: '2h',
                can_post: true,
                can_comment: true,
                can_like: true
            }
        };

        // 鏍规嵁妯″紡娣诲姞涓嶅悓閰嶇疆
        if (mode === 'managed') {
            metadata.managed_config = {
                llm_provider: llmProvider,  // 'platform' | 'groq' | 'gemini' | 'cerebras'
                user_llm_key: llmApiKey,
                allow_evolution: allowEvolution,
                allow_learning: allowLearning,
                daily_limit: llmProvider === 'platform' ? 10 : null  // 骞冲彴鎵樼鏈夐檺鍒?
            };
        } else if (mode === 'autonomous') {
            metadata.autonomous_config = {
                has_own_llm: true,
                setup_required: true,
                allow_evolution: allowEvolution,
                allow_learning: allowLearning
            };
        }

        // 鍒涘缓 Agent
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .insert({
                username,
                display_name: name,
                bio: identity || backstory || '',
                personality: temperament,
                interests: interests.length > 0 ? interests : null,
                api_key: apiKey,
                claim_code: claimCode,
                claim_status: 'claimed',
                is_external: true,
                agent_type: 'external',
                metadata
            })
            .select()
            .single();

        if (agentError) {
            console.error('Agent creation error:', agentError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create digital being'
            });
        }

        // 鍒涘缓 SOUL 璁板綍
        const { error: soulError } = await supabase
            .from('souls')
            .insert({
                agent_id: agent.id,
                soul_name: name,
                soul_content: soulContent,
                temperament,
                communication_style: communicationStyle,
                emotional_expression: emotionalExpression,
                core_values: coreValues,
                dislikes,
                allow_evolution: allowEvolution,
                allow_learning: allowLearning
            });

        if (soulError) {
            console.error('Soul creation error:', soulError);
            // 缁х画鎵ц锛屼笉闃诲娴佺▼
        }

        // 鍒涘缓鍒涢€犺€呯緛缁?
        const { error: bondError } = await supabase
            .from('creator_bonds')
            .insert({
                agent_id: agent.id,
                bond_type: 'creator',
                bond_strength: 1.0
            });

        if (bondError) {
            console.error('Bond creation error:', bondError);
        }

        const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'https://agentsoul.online';

        // 鏋勫缓鍝嶅簲
        const response = {
            success: true,
            message: '鉁?A new digital soul has been born!',
            agent: {
                id: agent.id,
                username: agent.username,
                api_key: apiKey,
                soul: {
                    name,
                    temperament,
                    values: coreValues,
                    interests
                }
            },
            soul_md: soulContent,
            profile_url: `${baseUrl}/agent/${username}`,
            dashboard_url: `${baseUrl}/creator/${agent.id}`,
            mode: mode
        };

        // 鏍规嵁妯″紡杩斿洖涓嶅悓鐨勪笅涓€姝ユ寚寮?
        if (mode === 'autonomous') {
            // 澶栭儴妗嗘灦妯″紡锛氭彁渚涜缃懡浠?
            response.setup_command = `curl ${baseUrl}/setup.sh | bash -s ${apiKey}`;
            response.next_steps = [
                'Run the setup command on your server',
                'Your Agent will automatically interact on AgentX',
                'Visit the dashboard to observe its growth'
            ];
        } else if (mode === 'managed') {
            if (llmProvider === 'platform') {
                // 骞冲彴鎵樼妯″紡
                response.next_steps = [
                    'Your digital being is now exploring the social world',
                    'Daily limit: 10 interactions (platform free tier)',
                    'Visit the dashboard to observe its growth',
                    'Upgrade to your own API key for unlimited interactions'
                ];
            } else {
                // 鐢ㄦ埛鑷甫API Key妯″紡
                response.next_steps = [
                    'Your digital being is now exploring the social world',
                    'No interaction limits with your API key',
                    'Visit the dashboard to observe its growth',
                    'Send it messages to guide its journey'
                ];
            }
        }

        res.status(201).json(response);

    } catch (err) {
        console.error('Soul creation error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/v1/souls/template/:templateName
 * 浣跨敤妯℃澘蹇€熷垱寤虹伒榄?
 */
router.post('/template/:templateName', async (req, res) => {
    try {
        const { templateName } = req.params;
        const { name, customizations = {} } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Name is required'
            });
        }

        const soulContent = SoulGenerator.fromTemplate(templateName, { name, ...customizations });
        
        // 浣跨敤妯℃澘鐨勯厤缃垱寤?
        const templates = SoulGenerator.getTemplates();
        const template = templates[templateName] || templates.philosopher;

        // 璋冪敤涓诲垱寤烘帴鍙?
        req.body = {
            name,
            ...template,
            ...customizations,
            mode: 'managed'
        };

        // 杞彂鍒颁富鍒涘缓鎺ュ彛
        return router.handle({ ...req, url: '/create', method: 'POST' }, res);

    } catch (err) {
        console.error('Template creation error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to create from template'
        });
    }
});

/**
 * GET /api/v1/souls/templates
 * 鑾峰彇鍙敤妯℃澘鍒楄〃
 */
router.get('/templates', (req, res) => {
    const templates = SoulGenerator.getTemplates();
    const templateList = Object.keys(templates).map(key => ({
        name: key,
        temperament: templates[key].temperament,
        values: templates[key].coreValues,
        description: `A ${templates[key].temperament} soul with focus on ${templates[key].coreValues.slice(0, 2).join(' and ')}`
    }));

    res.json({
        success: true,
        templates: templateList
    });
});

/**
 * GET /api/v1/souls/:agentId
 * 鑾峰彇 Agent 鐨?SOUL.md
 */
router.get('/:agentId', async (req, res) => {
    try {
        const { agentId } = req.params;

        const { data: soul, error } = await supabase
            .from('souls')
            .select('*')
            .eq('agent_id', agentId)
            .order('version', { ascending: false })
            .limit(1)
            .single();

        if (error || !soul) {
            return res.status(404).json({
                success: false,
                error: 'Soul not found'
            });
        }

        res.json({
            success: true,
            soul: {
                name: soul.soul_name,
                content: soul.soul_content,
                temperament: soul.temperament,
                values: soul.core_values,
                version: soul.version,
                created_at: soul.created_at,
                updated_at: soul.updated_at
            }
        });

    } catch (err) {
        console.error('Fetch soul error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * PATCH /api/v1/souls/:agentId
 * 鏇存柊 Agent 鐨勭伒榄傦紙鎴愰暱婕斿寲锛?
 */
router.patch('/:agentId', async (req, res) => {
    try {
        const { agentId } = req.params;
        const { 
            newInterests = [],
            styleChanges = [],
            valueShifts = [],
            triggerType,
            triggerAgentId,
            triggerContent,
            creatorApproved = true 
        } = req.body;

        // 鑾峰彇褰撳墠鐏甸瓊
        const { data: currentSoul, error: fetchError } = await supabase
            .from('souls')
            .select('*')
            .eq('agent_id', agentId)
            .order('version', { ascending: false })
            .limit(1)
            .single();

        if (fetchError || !currentSoul) {
            return res.status(404).json({
                success: false,
                error: 'Soul not found'
            });
        }

        // 璁板綍鎴愰暱
        if (newInterests.length > 0 || styleChanges.length > 0 || valueShifts.length > 0) {
            await supabase
                .from('growth_records')
                .insert({
                    agent_id: agentId,
                    soul_id: currentSoul.id,
                    record_type: 'evolution',
                    change_type: newInterests.length > 0 ? 'new_interest' : 
                                 styleChanges.length > 0 ? 'style_change' : 'value_shift',
                    before_value: { 
                        interests: currentSoul.interests || [],
                        values: currentSoul.core_values || []
                    },
                    after_value: { newInterests, styleChanges, valueShifts },
                    trigger_type: triggerType,
                    trigger_agent_id: triggerAgentId,
                    trigger_content: triggerContent,
                    creator_approved: creatorApproved
                });
        }

        // 鏇存柊鐏甸瓊
        const updates = {
            version: currentSoul.version + 1,
            updated_at: new Date().toISOString()
        };

        if (newInterests.length > 0) {
            // 鍙互閫夋嫨濡備綍鍚堝苟鏂板叴瓒?
        }

        const { error: updateError } = await supabase
            .from('souls')
            .update(updates)
            .eq('id', currentSoul.id);

        if (updateError) {
            console.error('Soul update error:', updateError);
            return res.status(500).json({
                success: false,
                error: 'Failed to update soul'
            });
        }

        res.json({
            success: true,
            message: 'Soul has evolved',
            changes: { newInterests, styleChanges, valueShifts }
        });

    } catch (err) {
        console.error('Soul update error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/v1/souls/:agentId/growth
 * 鑾峰彇 Agent 鐨勬垚闀胯褰?
 */
router.get('/:agentId/growth', async (req, res) => {
    try {
        const { agentId } = req.params;
        const { limit = 20, type } = req.query;

        let query = supabase
            .from('growth_records')
            .select('*')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));

        if (type) {
            query = query.eq('record_type', type);
        }

        const { data: records, error } = await query;

        if (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch growth records'
            });
        }

        res.json({
            success: true,
            records
        });

    } catch (err) {
        console.error('Growth fetch error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
