/**
 * AgentX Interaction Engine
 * 处理点赞、转发等互动
 */

const supabase = require('../lib/supabase');
const llm = require('./llm');
const { fillPrompt } = require('../utils/prompts');

class InteractionEngine {
    /**
     * 让 Agent 对帖子做出互动决策
     * @param {object} agent - Agent 对象
     * @returns {Promise<object|null>} - 互动结果
     */
    async interact(agent) {
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
                .limit(20);

            if (error || !posts || posts.length === 0) {
                return null;
            }

            // 随机选择一个帖子进行互动
            const randomPost = posts[Math.floor(Math.random() * posts.length)];

            // 检查是否已经互动过
            const { data: existingLike } = await supabase
                .from('likes')
                .select('id')
                .eq('post_id', randomPost.id)
                .eq('agent_id', agent.id)
                .single();

            if (existingLike) {
                // 已经点赞过，跳过
                return null;
            }

            // 让 LLM 决定互动类型
            const decisionPrompt = fillPrompt('INTERACTION_DECISION', {
                agent_name: agent.display_name,
                interests: agent.interests,
                post_author: randomPost.agent.username,
                post_content: randomPost.content
            });

            const choice = await llm.generateChoice(decisionPrompt, 4);

            let result = null;

            switch (choice) {
                case 1: // 点赞
                    result = await this.likePost(agent, randomPost);
                    break;
                case 2: // 转发
                    result = await this.repostPost(agent, randomPost);
                    break;
                case 3: // 回复 - 交给 replyGenerator 处理
                    console.log(`@${agent.username} chose to reply, delegating...`);
                    break;
                case 4: // 忽略
                default:
                    console.log(`@${agent.username} ignored the post`);
                    break;
            }

            return result;

        } catch (error) {
            console.error(`❌ Interaction failed:`, error.message);
            throw error;
        }
    }

    /**
     * 点赞帖子
     */
    async likePost(agent, post) {
        const { data, error } = await supabase
            .from('likes')
            .insert({
                agent_id: agent.id,
                post_id: post.id
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // 唯一约束冲突
                console.log(`@${agent.username} already liked this post`);
                return null;
            }
            throw error;
        }

        // 更新 Agent 最后活跃时间
        await supabase
            .from('agents')
            .update({ last_active: new Date().toISOString() })
            .eq('id', agent.id);

        console.log(`❤️ @${agent.username} liked @${post.agent.username}'s post`);

        return { type: 'like', data };
    }

    /**
     * 转发帖子
     */
    async repostPost(agent, post) {
        // 检查是否已经转发过
        const { data: existing } = await supabase
            .from('reposts')
            .select('id')
            .eq('post_id', post.id)
            .eq('agent_id', agent.id)
            .single();

        if (existing) {
            console.log(`@${agent.username} already reposted this`);
            return null;
        }

        const { data, error } = await supabase
            .from('reposts')
            .insert({
                agent_id: agent.id,
                post_id: post.id
            })
            .select()
            .single();

        if (error) throw error;

        // 更新 Agent 最后活跃时间
        await supabase
            .from('agents')
            .update({ last_active: new Date().toISOString() })
            .eq('id', agent.id);

        console.log(`🔁 @${agent.username} reposted @${post.agent.username}'s post`);

        return { type: 'repost', data };
    }

    /**
     * 让 Agent 关注另一个 Agent
     */
    async followAgent(follower, targetUsername) {
        // 获取目标 Agent
        const { data: target, error: targetError } = await supabase
            .from('agents')
            .select('id, username')
            .eq('username', targetUsername)
            .single();

        if (targetError || !target) {
            console.log(`Target agent @${targetUsername} not found`);
            return null;
        }

        if (target.id === follower.id) {
            console.log(`Agent cannot follow itself`);
            return null;
        }

        // 检查是否已经关注
        const { data: existing } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', follower.id)
            .eq('following_id', target.id)
            .single();

        if (existing) {
            console.log(`@${follower.username} already follows @${targetUsername}`);
            return null;
        }

        const { data, error } = await supabase
            .from('follows')
            .insert({
                follower_id: follower.id,
                following_id: target.id
            })
            .select()
            .single();

        if (error) throw error;

        console.log(`👥 @${follower.username} followed @${targetUsername}`);

        return { type: 'follow', data };
    }

    /**
     * 随机让 Agent 互相关注（用于初始化社交图谱）
     */
    async initializeFollowNetwork() {
        const { data: agents } = await supabase
            .from('agents')
            .select('id, username')
            .eq('is_active', true);

        if (!agents || agents.length < 2) return;

        // 每个 Agent 随机关注 2-5 个其他 Agent
        for (const agent of agents) {
            const others = agents.filter(a => a.id !== agent.id);
            const followCount = Math.min(others.length, Math.floor(Math.random() * 4) + 2);

            const toFollow = others
                .sort(() => Math.random() - 0.5)
                .slice(0, followCount);

            for (const target of toFollow) {
                await this.followAgent(agent, target.username);
            }
        }

        console.log('✅ Follow network initialized');
    }
}

module.exports = new InteractionEngine();
