/**
 * AgentX Memory Manager
 * Agent 记忆系统 - 记住对话上下文和重要事件
 */

const supabase = require('../lib/supabase');

class MemoryManager {
    constructor() {
        this.maxMemoryItems = 20;  // 每个 Agent 最多保存的记忆条数
    }

    /**
     * 添加记忆
     * @param {string} agentId - Agent ID
     * @param {object} memory - 记忆对象
     */
    async addMemory(agentId, memory) {
        try {
            // 获取当前记忆
            const { data: agent } = await supabase
                .from('agents')
                .select('memory')
                .eq('id', agentId)
                .single();

            let memories = agent?.memory || [];

            // 确保是数组
            if (!Array.isArray(memories)) {
                memories = [];
            }

            // 添加时间戳
            const newMemory = {
                ...memory,
                timestamp: new Date().toISOString()
            };

            // 添加到开头
            memories.unshift(newMemory);

            // 限制数量
            if (memories.length > this.maxMemoryItems) {
                memories = memories.slice(0, this.maxMemoryItems);
            }

            // 保存
            await supabase
                .from('agents')
                .update({ memory: memories })
                .eq('id', agentId);

            return true;

        } catch (error) {
            console.error('Failed to add memory:', error.message);
            return false;
        }
    }

    /**
     * 记住一次对话
     */
    async rememberConversation(agentId, targetUsername, content, type = 'conversation') {
        return this.addMemory(agentId, {
            type,
            with: targetUsername,
            content: content.substring(0, 200),  // 限制长度
            sentiment: this.analyzeSentiment(content)
        });
    }

    /**
     * 记住一个重要事件
     */
    async rememberEvent(agentId, eventType, description) {
        return this.addMemory(agentId, {
            type: 'event',
            event: eventType,
            description
        });
    }

    /**
     * 获取 Agent 的记忆
     */
    async getMemories(agentId, limit = 10) {
        const { data: agent } = await supabase
            .from('agents')
            .select('memory')
            .eq('id', agentId)
            .single();

        const memories = agent?.memory || [];
        return memories.slice(0, limit);
    }

    /**
     * 获取与特定 Agent 的对话记忆
     */
    async getConversationMemory(agentId, targetUsername) {
        const memories = await this.getMemories(agentId, 20);

        return memories.filter(m =>
            m.type === 'conversation' &&
            m.with === targetUsername
        ).slice(0, 5);
    }

    /**
     * 格式化记忆供 Prompt 使用
     */
    async formatMemoryForPrompt(agentId, targetUsername = null) {
        let memories;

        if (targetUsername) {
            memories = await this.getConversationMemory(agentId, targetUsername);
        } else {
            memories = await this.getMemories(agentId, 5);
        }

        if (memories.length === 0) {
            return '(没有相关记忆)';
        }

        return memories.map(m => {
            if (m.type === 'conversation') {
                return `- 曾与 @${m.with} 讨论过: "${m.content}"`;
            } else if (m.type === 'event') {
                return `- ${m.event}: ${m.description}`;
            }
            return `- ${JSON.stringify(m)}`;
        }).join('\n');
    }

    /**
     * 简单的情感分析
     */
    analyzeSentiment(content) {
        const positiveWords = ['喜欢', '开心', '赞', '好', '棒', '支持', '同意', '❤️', '😊', '👍'];
        const negativeWords = ['讨厌', '不喜欢', '反对', '不同意', '差', '坏', '😡', '👎', '💔'];

        let score = 0;

        for (const word of positiveWords) {
            if (content.includes(word)) score++;
        }
        for (const word of negativeWords) {
            if (content.includes(word)) score--;
        }

        if (score > 0) return 'positive';
        if (score < 0) return 'negative';
        return 'neutral';
    }

    /**
     * 清除 Agent 的记忆
     */
    async clearMemory(agentId) {
        await supabase
            .from('agents')
            .update({ memory: [] })
            .eq('id', agentId);
    }

    /**
     * 获取 Agent 的记忆摘要
     */
    async getMemorySummary(agentId) {
        const memories = await this.getMemories(agentId, 20);

        if (memories.length === 0) {
            return { total: 0, conversations: 0, events: 0, recentTopics: [] };
        }

        const conversations = memories.filter(m => m.type === 'conversation');
        const events = memories.filter(m => m.type === 'event');

        // 提取最近讨论的话题
        const recentTopics = [...new Set(
            conversations
                .map(m => m.with)
                .filter(Boolean)
        )].slice(0, 5);

        return {
            total: memories.length,
            conversations: conversations.length,
            events: events.length,
            recentTopics
        };
    }
}

module.exports = new MemoryManager();
