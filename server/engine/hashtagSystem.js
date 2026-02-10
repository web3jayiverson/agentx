/**
 * AgentX Hashtag System
 * 处理 #话题标签 功能
 */

const supabase = require('../lib/supabase');

class HashtagSystem {
    /**
     * 从内容中提取话题标签
     * @param {string} content - 帖子/评论内容
     * @returns {string[]} - 话题标签列表（不含 #）
     */
    extractHashtags(content) {
        if (!content) return [];

        // 匹配 #话题 格式（支持中英文）
        const pattern = /#([\w\u4e00-\u9fa5]+)/g;
        const matches = content.match(pattern) || [];

        // 去除 # 符号并去重
        const hashtags = [...new Set(matches.map(m => m.slice(1)))];

        return hashtags;
    }

    /**
     * 获取热门话题
     * @param {number} limit - 返回数量
     * @param {number} hours - 统计时间范围（小时）
     */
    async getTrendingHashtags(limit = 10, hours = 24) {
        const since = new Date();
        since.setHours(since.getHours() - hours);

        // 获取最近的帖子
        const { data: posts, error } = await supabase
            .from('posts')
            .select('hashtags, likes_count, reposts_count, replies_count')
            .gte('created_at', since.toISOString())
            .not('hashtags', 'is', null);

        if (error || !posts) {
            console.error('Failed to get trending hashtags:', error?.message);
            return [];
        }

        // 统计每个话题的出现次数和热度
        const hashtagStats = {};

        for (const post of posts) {
            if (!post.hashtags || !Array.isArray(post.hashtags)) continue;

            const engagement = (post.likes_count || 0) +
                (post.reposts_count || 0) * 2 +
                (post.replies_count || 0) * 3;

            for (const tag of post.hashtags) {
                if (!hashtagStats[tag]) {
                    hashtagStats[tag] = { count: 0, engagement: 0 };
                }
                hashtagStats[tag].count++;
                hashtagStats[tag].engagement += engagement;
            }
        }

        // 计算热度分数并排序
        const trending = Object.entries(hashtagStats)
            .map(([tag, stats]) => ({
                hashtag: tag,
                count: stats.count,
                interactions: stats.engagement,
                score: stats.count * 10 + stats.engagement
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return trending;
    }

    /**
     * 获取某个话题下的帖子
     * @param {string} hashtag - 话题标签（不含 #）
     * @param {number} limit - 返回数量
     * @param {number} offset - 偏移量
     */
    async getPostsByHashtag(hashtag, limit = 20, offset = 0) {
        const { data: posts, error } = await supabase
            .from('posts')
            .select(`
                *,
                agent:agents(id, username, display_name, avatar_url, is_verified)
            `)
            .contains('hashtags', [hashtag])
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('Failed to get posts by hashtag:', error.message);
            return [];
        }

        return posts || [];
    }

    /**
     * 搜索话题
     * @param {string} query - 搜索关键词
     * @param {number} limit - 返回数量
     */
    async searchHashtags(query, limit = 10) {
        if (!query || query.length < 1) return [];

        // 获取所有包含该关键词的话题
        const { data: posts, error } = await supabase
            .from('posts')
            .select('hashtags')
            .not('hashtags', 'is', null);

        if (error || !posts) return [];

        // 统计并筛选
        const hashtagCounts = {};

        for (const post of posts) {
            if (!post.hashtags) continue;

            for (const tag of post.hashtags) {
                if (tag.toLowerCase().includes(query.toLowerCase())) {
                    hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
                }
            }
        }

        // 排序返回
        return Object.entries(hashtagCounts)
            .map(([tag, count]) => ({ hashtag: tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * 生成话题相关的种子（用于 Agent 讨论）
     * @param {string} hashtag - 话题标签
     */
    async generateTopicSeed(hashtag) {
        const posts = await this.getPostsByHashtag(hashtag, 5);

        if (posts.length === 0) {
            return `关于 #${hashtag} 这个话题，你有什么看法？`;
        }

        // 基于现有帖子生成讨论种子
        const recentOpinions = posts.map(p => p.content).join('\n');

        return `最近大家都在讨论 #${hashtag}，以下是一些观点：\n${recentOpinions}\n\n你对此有什么看法？`;
    }
}

module.exports = new HashtagSystem();
