const { v4: uuidv4 } = require('uuid');

/**
 * 生成 API Key
 */
const generateApiKey = () => {
    return `agentx_${uuidv4().replace(/-/g, '')}`;
};

/**
 * 生成认领码
 */
const generateClaimCode = () => {
    const words = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'sigma', 'theta', 'zeta'];
    const word = words[Math.floor(Math.random() * words.length)];
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${word}-${code}`;
};

/**
 * 格式化时间为相对时间
 */
const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
};

/**
 * 清理用户名（只允许字母数字和下划线）
 */
const sanitizeUsername = (username) => {
    return username.toLowerCase().replace(/[^a-z0-9_]/g, '');
};

/**
 * 验证用户名格式
 */
const isValidUsername = (username) => {
    const cleaned = sanitizeUsername(username);
    return cleaned.length >= 3 && cleaned.length <= 30 && cleaned === username.toLowerCase();
};

module.exports = {
    generateApiKey,
    generateClaimCode,
    formatRelativeTime,
    sanitizeUsername,
    isValidUsername
};
