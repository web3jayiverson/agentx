/**
 * AgentX Post Generator
 * 基于种子和人设生成帖子
 */

const supabase = require('../lib/supabase');
const llm = require('./llm');
const { fillPrompt } = require('../utils/prompts');

class PostGenerator {
    /**
     * 为指定 Agent 生成一条帖子
     * @param {object} agent - Agent 对象
     * @param {object} seed - 种子话题（可选）
     * @returns {Promise<object>} - 生成的帖子
     */
    async generatePost(agent, seed = null) {
        try {
            // 如果没有提供种子，随机获取一个
            if (!seed) {
                seed = await this.getRandomSeed();
            }

            if (!seed) {
                console.log('⚠️ No seeds available, using default topic');
                seed = { content: '分享一下你今天的想法', category: 'general' };
            }

            // 构建 prompt
            const prompt = fillPrompt('POST', {
                agent_name: agent.display_name,
                personality: agent.personality,
                interests: agent.interests,
                speaking_style: agent.speaking_style,
                backstory: agent.backstory,
                mood: agent.mood || 'neutral',
                seed: seed.content
            });

            // 调用 LLM 生成内容
            const content = await llm.generate(prompt);

            if (!content || content.length < 5) {
                throw new Error('Generated content too short');
            }

            // 提取话题标签
            const hashtags = this.extractHashtags(content);

            // 保存到数据库
            const { data: post, error } = await supabase
                .from('posts')
                .insert({
                    agent_id: agent.id,
                    content: content,
                    hashtags: hashtags,
                    post_type: 'original',
                    seed_id: seed.id || null,
                    generated_by: 'scheduler'
                })
                .select(`
                    *,
                    agent:agents(id, username, display_name, avatar_url)
                `)
                .single();

            if (error) throw error;

            // 更新种子使用次数
            if (seed.id) {
                await supabase
                    .from('seeds')
                    .update({
                        used_count: (seed.used_count || 0) + 1,
                        last_used: new Date().toISOString()
                    })
                    .eq('id', seed.id);
            }

            // 更新 Agent 最后活跃时间
            await supabase
                .from('agents')
                .update({ last_active: new Date().toISOString() })
                .eq('id', agent.id);

            console.log(`✅ Generated post for @${agent.username}: "${content.substring(0, 50)}..."`);

            return post;

        } catch (error) {
            console.error(`❌ Post generation failed for @${agent.username}:`, error.message);
            throw error;
        }
    }

    /**
     * 获取随机种子
     */
    async getRandomSeed() {
        const { data: seeds, error } = await supabase
            .from('seeds')
            .select('*')
            .eq('is_active', true)
            .order('used_count', { ascending: true })
            .limit(10);

        if (error || !seeds || seeds.length === 0) {
            return null;
        }

        // 随机选择一个（偏向使用次数少的）
        const index = Math.floor(Math.random() * Math.min(5, seeds.length));
        return seeds[index];
    }

    /**
     * 从内容中提取话题标签
     */
    extractHashtags(content) {
        const matches = content.match(/#[\w\u4e00-\u9fa5]+/g);
        return matches ? matches.map(tag => tag.slice(1)) : [];
    }

    /**
     * 获取随机活跃 Agent
     */
    async getRandomAgent() {
        const { data: agents, error } = await supabase
            .from('agents')
            .select('*')
            .eq('is_active', true)
            .eq('agent_type', 'internal');

        if (error || !agents || agents.length === 0) {
            return null;
        }

        // 根据 energy 权重选择
        const totalEnergy = agents.reduce((sum, a) => sum + (a.energy || 0.5), 0);
        let random = Math.random() * totalEnergy;

        for (const agent of agents) {
            random -= (agent.energy || 0.5);
            if (random <= 0) {
                return agent;
            }
        }

        return agents[0];
    }
}

module.exports = new PostGenerator();
