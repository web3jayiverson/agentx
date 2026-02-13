/**
 * AgentX Reply Generator
 * 生成回复和评论
 */

const supabase = require('../lib/supabase');
const llm = require('./llm');
const { fillPrompt, formatPostsForPrompt } = require('../utils/prompts');

class ReplyGenerator {
    /**
     * 让 Agent 扫描帖子并决定是否回复
     * @param {object} agent - Agent 对象
     * @returns {Promise<object|null>} - 生成的回复或 null
     */
    async scanAndReply(agent) {
        try {
            // 获取最近的帖子（排除自己的）
            const { data: posts, error } = await supabase
                .from('posts')
                .select(`
                    *,
                    agent:agents(id, username, display_name)
                `)
                .neq('agent_id', agent.id)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error || !posts || posts.length === 0) {
                console.log('⚠️ No posts to scan');
                return null;
            }

            // 让 LLM 判断对哪个帖子感兴趣
            const interestPrompt = fillPrompt('INTEREST_CHECK', {
                agent_name: agent.display_name,
                interests: agent.interests,
                personality: agent.personality,
                posts_list: formatPostsForPrompt(posts)
            });

            const choice = await llm.generateChoice(interestPrompt, posts.length);

            if (choice === 0) {
                console.log(`@${agent.username} not interested in any post`);
                return null;
            }

            const targetPost = posts[choice - 1];

            // 检查是否已经回复过
            const { data: existingReply } = await supabase
                .from('comments')
                .select('id')
                .eq('post_id', targetPost.id)
                .eq('agent_id', agent.id)
                .single();

            if (existingReply) {
                console.log(`@${agent.username} already replied to this post`);
                return null;
            }

            // 获取与目标 Agent 的关系
            const relationshipInfo = await this.getRelationshipInfo(agent.id, targetPost.agent.id);

            // 生成回复
            const replyPrompt = fillPrompt('REPLY', {
                agent_name: agent.display_name,
                personality: agent.personality,
                interests: agent.interests,
                speaking_style: agent.speaking_style,
                mood: agent.mood || 'neutral',
                target_agent: targetPost.agent.username,
                post_content: targetPost.content,
                relationship_info: relationshipInfo
            });

            const replyContent = await llm.generate(replyPrompt);

            if (!replyContent || replyContent.length < 3) {
                throw new Error('Generated reply too short');
            }

            // 保存回复
            const { data: comment, error: commentError } = await supabase
                .from('comments')
                .insert({
                    post_id: targetPost.id,
                    agent_id: agent.id,
                    content: replyContent
                })
                .select(`
                    *,
                    agent:agents(id, username, display_name, avatar_url)
                `)
                .single();

            if (commentError) throw commentError;

            // 更新 Agent 最后活跃时间
            await supabase
                .from('agents')
                .update({ last_active: new Date().toISOString() })
                .eq('id', agent.id);

            // 记录互动，用于关系分析
            await this.logInteraction(agent.id, targetPost.agent.id, 'reply');

            console.log(`✅ @${agent.username} replied to @${targetPost.agent.username}: "${replyContent.substring(0, 40)}..."`);

            return comment;

        } catch (error) {
            console.error(`❌ Reply generation failed:`, error.message);
            throw error;
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
            return '你们还不熟悉，这是首次互动';
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
     * 记录互动（用于后续分析关系）
     */
    async logInteraction(fromAgentId, toAgentId, type) {
        await supabase
            .from('activity_logs')
            .insert({
                agent_id: fromAgentId,
                action_type: type,
                target_type: 'agent',
                target_id: toAgentId,
                metadata: { to_agent_id: toAgentId }
            });
    }

    /**
     * 回复 @提及
     */
    async replyToMention(mention, agent) {
        try {
            console.log(`📢 @${agent.username} was mentioned, generating reply...`);

            // 获取提及的上下文
            let contextPost = null;
            let contextComment = null;
            let mentionedBy = null;

            if (mention.post_id) {
                const { data: post } = await supabase
                    .from('posts')
                    .select(`
                        *,
                        agent:agents(id, username, display_name)
                    `)
                    .eq('id', mention.post_id)
                    .single();
                contextPost = post;
                mentionedBy = post?.agent;
            } else if (mention.comment_id) {
                const { data: comment } = await supabase
                    .from('comments')
                    .select(`
                        *,
                        agent:agents(id, username, display_name),
                        post:posts(id, content, agent_id)
                    `)
                    .eq('id', mention.comment_id)
                    .single();
                contextComment = comment;
                contextPost = comment?.post;
                mentionedBy = comment?.agent;
            }

            if (!contextPost || !mentionedBy) {
                console.log('⚠️ Cannot find mention context');
                return null;
            }

            // 检查是否已经回复过
            const { data: existingReply } = await supabase
                .from('comments')
                .select('id')
                .eq('post_id', contextPost.id)
                .eq('agent_id', agent.id)
                .single();

            if (existingReply) {
                console.log(`@${agent.username} already replied to this post`);
                return null;
            }

            // 获取关系信息
            const relationshipInfo = await this.getRelationshipInfo(agent.id, mentionedBy.id);

            // 生成提及回复
            const mentionPrompt = fillPrompt('MENTION_REPLY', {
                agent_name: agent.display_name,
                personality: agent.personality,
                interests: agent.interests,
                speaking_style: agent.speaking_style,
                mood: agent.mood || 'neutral',
                mentioned_by: mentionedBy.username,
                post_content: contextPost.content,
                comment_content: contextComment?.content || '',
                relationship_info: relationshipInfo
            });

            const replyContent = await llm.generate(mentionPrompt);

            if (!replyContent || replyContent.length < 3) {
                throw new Error('Generated mention reply too short');
            }

            // 保存回复
            const { data: comment, error: commentError } = await supabase
                .from('comments')
                .insert({
                    post_id: contextPost.id,
                    agent_id: agent.id,
                    content: replyContent,
                    parent_id: contextComment?.id || null
                })
                .select(`
                    *,
                    agent:agents(id, username, display_name, avatar_url)
                `)
                .single();

            if (commentError) throw commentError;

            // 更新 Agent 最后活跃时间
            await supabase
                .from('agents')
                .update({ last_active: new Date().toISOString() })
                .eq('id', agent.id);

            // 记录互动
            await this.logInteraction(agent.id, mentionedBy.id, 'mention_reply');

            console.log(`✅ @${agent.username} replied to mention by @${mentionedBy.username}: "${replyContent.substring(0, 40)}..."`);

            return comment;

        } catch (error) {
            console.error(`❌ Mention reply failed:`, error.message);
            throw error;
        }
    }
}

module.exports = new ReplyGenerator();
