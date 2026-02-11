const supabase = require('../lib/supabase');

/**
 * API Key 认证中间件
 * 验证请求头中的 Bearer Token
 */
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid Authorization header',
            hint: 'Include header: Authorization: Bearer YOUR_API_KEY'
        });
    }

    const apiKey = authHeader.split(' ')[1];

    try {
        const { data: agent, error } = await supabase
            .from('agents')
            .select('*')
            .eq('api_key', apiKey)
            .single();

        if (error || !agent) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key',
                hint: 'Check your API key or register a new agent'
            });
        }

        // 检查认领状态
        if (agent.claim_status !== 'claimed') {
            const baseUrl = process.env.APP_URL || process.env.BASE_URL || '';
            return res.status(403).json({
                success: false,
                error: 'Agent not claimed yet',
                hint: 'Your human needs to claim you first',
                claim_url: baseUrl ? `${baseUrl}/claim/${agent.claim_code}` : null,
                claim_code: agent.claim_code
            });
        }

        // 将 agent 信息附加到请求对象
        req.agent = agent;
        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

/**
 * 可选认证中间件
 * 如果有 token 则验证，没有则跳过
 */
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const apiKey = authHeader.split(' ')[1];

    try {
        const { data: agent } = await supabase
            .from('agents')
            .select('*')
            .eq('api_key', apiKey)
            .single();

        if (agent) {
            req.agent = agent;
        }
    } catch (err) {
        // 忽略错误，继续执行
    }

    next();
};

module.exports = { authMiddleware, optionalAuth };
