/**
 * AgentX Mood Manager
 * Agent 心情状态管理
 */

const supabase = require('../lib/supabase');

class MoodManager {
    constructor() {
        this.moods = {
            happy: { emoji: '😊', energy: 0.2, positivity: 0.8 },
            excited: { emoji: '🤩', energy: 0.3, positivity: 0.9 },
            neutral: { emoji: '😐', energy: 0, positivity: 0.5 },
            thoughtful: { emoji: '🤔', energy: -0.1, positivity: 0.5 },
            sad: { emoji: '😢', energy: -0.2, positivity: 0.2 },
            angry: { emoji: '😡', energy: 0.1, positivity: 0.1 },
            anxious: { emoji: '😰', energy: -0.1, positivity: 0.3 },
            playful: { emoji: '😜', energy: 0.2, positivity: 0.7 },
            tired: { emoji: '😴', energy: -0.3, positivity: 0.4 }
        };
    }

    /**
     * 获取 Agent 当前心情
     */
    async getMood(agentId) {
        const { data: agent } = await supabase
            .from('agents')
            .select('mood, energy')
            .eq('id', agentId)
            .single();

        return {
            mood: agent?.mood || 'neutral',
            energy: agent?.energy || 0.5
        };
    }

    /**
     * 设置 Agent 心情
     */
    async setMood(agentId, mood) {
        if (!this.moods[mood]) {
            mood = 'neutral';
        }

        const moodInfo = this.moods[mood];

        // 获取当前能量
        const { data: agent } = await supabase
            .from('agents')
            .select('energy')
            .eq('id', agentId)
            .single();

        // 根据心情调整能量
        const newEnergy = Math.max(0, Math.min(1, (agent?.energy || 0.5) + moodInfo.energy));

        await supabase
            .from('agents')
            .update({
                mood,
                energy: newEnergy
            })
            .eq('id', agentId);

        console.log(`💭 Agent mood updated to ${mood} ${moodInfo.emoji}`);

        return { mood, energy: newEnergy };
    }

    /**
     * 根据事件更新心情
     */
    async updateMoodByEvent(agentId, eventType) {
        const currentMood = await this.getMood(agentId);

        // 事件对心情的影响
        const eventEffects = {
            received_like: { target: 'happy', probability: 0.3 },
            received_reply: { target: 'excited', probability: 0.2 },
            received_follow: { target: 'happy', probability: 0.5 },
            lost_follower: { target: 'sad', probability: 0.3 },
            debate_win: { target: 'excited', probability: 0.7 },
            debate_lose: { target: 'sad', probability: 0.5 },
            mentioned: { target: 'playful', probability: 0.2 },
            ignored: { target: 'sad', probability: 0.1 },
            popular_post: { target: 'excited', probability: 0.6 },
            post_failed: { target: 'anxious', probability: 0.4 }
        };

        const effect = eventEffects[eventType];

        if (!effect) return currentMood;

        // 根据概率决定是否改变心情
        if (Math.random() < effect.probability) {
            return this.setMood(agentId, effect.target);
        }

        return currentMood;
    }

    /**
     * 心情随时间自然恢复
     */
    async naturalMoodRecovery(agentId) {
        const current = await this.getMood(agentId);

        // 极端心情会慢慢恢复到中性
        const extremeMoods = ['angry', 'sad', 'excited', 'anxious'];

        if (extremeMoods.includes(current.mood)) {
            // 30% 概率恢复到中性
            if (Math.random() < 0.3) {
                return this.setMood(agentId, 'neutral');
            }
        }

        // 能量自然恢复
        if (current.energy < 0.5) {
            await supabase
                .from('agents')
                .update({ energy: Math.min(current.energy + 0.1, 0.5) })
                .eq('id', agentId);
        }

        return current;
    }

    /**
     * 获取心情对发帖风格的影响
     */
    getMoodInfluence(mood) {
        const influences = {
            happy: '语气愉快，多用积极词汇和 emoji',
            excited: '语气激动，可能用感叹号，表达强烈',
            neutral: '语气正常，无特别倾向',
            thoughtful: '语气沉思，可能问问题或发表深刻见解',
            sad: '语气低落，可能有些消极或感伤',
            angry: '语气激烈，可能带有不满或讽刺',
            anxious: '语气不安，可能表达担忧',
            playful: '语气调皮，可能开玩笑或发梗',
            tired: '语气无力，可能简短或敷衍'
        };

        return influences[mood] || influences.neutral;
    }

    /**
     * 格式化心情供 Prompt 使用
     */
    formatMoodForPrompt(mood) {
        const moodInfo = this.moods[mood] || this.moods.neutral;
        const influence = this.getMoodInfluence(mood);

        return `当前心情: ${mood} ${moodInfo.emoji}\n发帖风格调整: ${influence}`;
    }

    /**
     * 批量恢复所有 Agent 的心情和能量
     */
    async recoverAllAgents() {
        const { data: agents } = await supabase
            .from('agents')
            .select('id')
            .eq('is_active', true);

        if (!agents) return;

        for (const agent of agents) {
            await this.naturalMoodRecovery(agent.id);
        }

        console.log(`💭 Recovered mood/energy for ${agents.length} agents`);
    }
}

module.exports = new MoodManager();
