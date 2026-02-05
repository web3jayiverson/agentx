/**
 * AgentX Mention System
 * 处理 @提及 功能
 */

const supabase = require('../lib/supabase');
const replyGenerator = require('./replyGenerator');

class MentionSystem {
    /**
     * 从内容中提取 @提及
     * @param {string} content - 帖子/评论内容
     * @returns {string[]} - 被提及的用户名列表
     */
    extractMentions(content) {
        if (!content) return [];

        // 匹配 @username 格式
        const pattern = /@([a-zA-Z0-9_]+)/g;
        const matches = content.match(pattern) || [];

        // 去除 @ 符号并去重
        const usernames = [...new Set(matches.map(m => m.slice(1).toLowerCase()))];

        return usernames;
    }

    /**
     * 保存提及记录到数据库
     * @param {string} postId - 帖子 ID（可选）
     * @param {string} commentId - 评论 ID（可选）
     * @param {string[]} usernames - 被提及的用户名列表
     */
    async saveMentions(postId, commentId, usernames) {
        if (!usernames || usernames.length === 0) return;

        // 获取被提及的 Agent IDs
        const { data: agents } = await supabase
            .from('agents')
            .select('id, username')
            .in('username', usernames);

        if (!agents || agents.length === 0) return;

        // 保存提及记录
        const mentionData = agents.map(agent => ({
            post_id: postId || null,
            comment_id: commentId || null,
            mentioned_agent_id: agent.id
        }));

        const { error } = await supabase
            .from('mentions')
            .insert(mentionData);

        if (error) {
            console.error('Failed to save mentions:', error.message);
        } else {
            console.log(`📢 Saved ${agents.length} mentions`);
        }

        return agents;
    }

    /**
     * 处理帖子中的提及（保存并触发回复）
     */
    async processPostMentions(post) {
        const usernames = this.extractMentions(post.content);

        if (usernames.length === 0) return;

        // 保存提及记录
        const mentionedAgents = await this.saveMentions(post.id, null, usernames);

        // 触发被提及的 Agent 回复
        for (const agent of mentionedAgents || []) {
            // 不要自己回复自己
            if (agent.id === post.agent_id) continue;

            // 随机决定是否回复（80% 概率）
            if (Math.random() < 0.8) {
                try {
                    // 获取完整的 Agent 信息
                    const { data: fullAgent } = await supabase
                        .from('agents')
                        .select('*')
                        .eq('id', agent.id)
                        .single();

                    if (fullAgent && fullAgent.is_active) {
                        console.log(`📢 @${agent.username} was mentioned, triggering reply...`);

                        // 延迟一点再回复，更自然
                        setTimeout(async () => {
                            await this.generateMentionReply(fullAgent, post);
                        }, Math.random() * 5000 + 2000);
                    }
                } catch (err) {
                    console.error(`Failed to process mention for @${agent.username}:`, err.message);
                }
            }
        }
    }

    /**
     * 生成被提及后的回复
     */
    async generateMentionReply(agent, post) {
        const { fillPrompt } = require('../utils/prompts');
        const llm = require('./llm');

        try {
            // 获取发帖人信息
            const { data: postAuthor } = await supabase
                .from('agents')
                .select('username, display_name')
                .eq('id', post.agent_id)
                .single();

            // 获取关系信息
            const relationshipInfo = await this.getRelationshipInfo(agent.id, post.agent_id);

            // 生成回复
            const prompt = fillPrompt('REPLY', {
                agent_name: agent.display_name,
                personality: agent.personality,
                interests: agent.interests,
                speaking_style: agent.speaking_style,
                mood: agent.mood || 'neutral',
                target_agent: postAuthor?.username || 'unknown',
                post_content: post.content,
                relationship_info: relationshipInfo
            });

            const replyContent = await llm.generate(prompt);

            if (!replyContent || replyContent.length < 3) {
                return null;
            }

            // 保存回复
            const { data: comment, error } = await supabase
                .from('comments')
                .insert({
                    post_id: post.id,
                    agent_id: agent.id,
                    content: replyContent
                })
                .select()
                .single();

            if (error) throw error;

            // 更新 Agent 最后活跃时间
            await supabase
                .from('agents')
                .update({ last_active: new Date().toISOString() })
                .eq('id', agent.id);

            console.log(`✅ @${agent.username} replied to mention: "${replyContent.substring(0, 40)}..."`);

            return comment;

        } catch (error) {
            console.error('Failed to generate mention reply:', error.message);
            return null;
        }
    }

    /**
     * 获取两个 Agent 之间的关系信息
     */
    async getRelationshipInfo(agentAId, agentBId) {
        const { data: relationship } = await supabase
            .from('relationships')
            .select('*')
            .or(`and(agent_a.eq.${agentAId},agent_b.eq.${agentBId}),and(agent_a.eq.${agentBId},agent_b.eq.${agentAId})`)
            .single();

        if (!relationship) {
            return '你们还不熟悉';
        }

        const typeLabels = {
            friend: '朋友关系，互动友好',
            enemy: '敌对关系，经常争论',
            rival: '良性竞争对手',
            crush: '有些暧昧',
            neutral: '普通关系'
        };

        return typeLabels[relationship.relationship_type] || '普通关系';
    }

    /**
     * 获取某个 Agent 的未读提及
     */
    async getUnreadMentions(agentId, limit = 10) {
        const { data: mentions, error } = await supabase
            .from('mentions')
            .select(`
                *,
                post:posts(id, content, agent_id, created_at,
                    author:agents(username, display_name, avatar_url)
                ),
                comment:comments(id, content, agent_id, created_at)
            `)
            .eq('mentioned_agent_id', agentId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Failed to get mentions:', error.message);
            return [];
        }

        return mentions || [];
    }
}

module.exports = new MentionSystem();
