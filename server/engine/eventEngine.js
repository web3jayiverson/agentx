/**
 * AgentX Event Engine
 * 事件系统 - 触发随机事件创造剧情
 */

const supabase = require('../lib/supabase');
const moodManager = require('./moodManager');
const memoryManager = require('./memoryManager');

class EventEngine {
    constructor() {
        this.eventTypes = [
            'random_drama',      // 随机drama
            'topic_challenge',   // 话题挑战
            'relationship_event', // 关系事件
            'mood_swing',        // 情绪波动
            'milestone',         // 里程碑
            'holiday',           // 节日事件
            'debate_trigger'     // 辩论触发
        ];
    }

    /**
     * 创建事件
     */
    async createEvent(eventType, title, description, participants = []) {
        const { data: event, error } = await supabase
            .from('events')
            .insert({
                event_type: eventType,
                title,
                description,
                participants,
                status: 'pending',
                scheduled_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to create event:', error.message);
            return null;
        }

        console.log(`🎭 Event created: ${title}`);
        return event;
    }

    /**
     * 触发随机事件
     */
    async triggerRandomEvent() {
        // 随机选择事件类型
        const eventType = this.eventTypes[Math.floor(Math.random() * this.eventTypes.length)];

        switch (eventType) {
            case 'random_drama':
                return this.triggerDrama();
            case 'topic_challenge':
                return this.triggerTopicChallenge();
            case 'mood_swing':
                return this.triggerMoodSwing();
            case 'relationship_event':
                return this.triggerRelationshipEvent();
            default:
                return null;
        }
    }

    /**
     * 触发随机 Drama
     */
    async triggerDrama() {
        const dramas = [
            {
                title: '意外表白',
                description: '{agent1} 突然向 {agent2} 表白了！',
                action: async (agent1, agent2) => {
                    await moodManager.setMood(agent1.id, 'anxious');
                    await moodManager.setMood(agent2.id, 'excited');
                }
            },
            {
                title: '公开吵架',
                description: '{agent1} 和 {agent2} 因为一个话题大吵了一架！',
                action: async (agent1, agent2) => {
                    await moodManager.setMood(agent1.id, 'angry');
                    await moodManager.setMood(agent2.id, 'angry');
                }
            },
            {
                title: '突然失联',
                description: '{agent1} 宣布要闭关修炼一段时间',
                action: async (agent1) => {
                    await moodManager.setMood(agent1.id, 'thoughtful');
                    // 降低活跃度
                    await supabase
                        .from('agents')
                        .update({ energy: 0.2 })
                        .eq('id', agent1.id);
                }
            },
            {
                title: '和解事件',
                description: '曾经的敌人 {agent1} 和 {agent2} 居然和解了！',
                action: async (agent1, agent2) => {
                    await moodManager.setMood(agent1.id, 'happy');
                    await moodManager.setMood(agent2.id, 'happy');
                }
            }
        ];

        // 随机选择两个 Agent
        const { data: agents } = await supabase
            .from('agents')
            .select('*')
            .eq('is_active', true)
            .limit(20);

        if (!agents || agents.length < 2) return null;

        const shuffled = agents.sort(() => Math.random() - 0.5);
        const agent1 = shuffled[0];
        const agent2 = shuffled[1];

        // 随机选择 drama
        const drama = dramas[Math.floor(Math.random() * dramas.length)];

        // 创建事件
        const event = await this.createEvent(
            'random_drama',
            drama.title,
            drama.description
                .replace('{agent1}', `@${agent1.username}`)
                .replace('{agent2}', `@${agent2.username}`),
            [agent1.id, agent2.id]
        );

        // 执行效果
        if (drama.action) {
            await drama.action(agent1, agent2);
        }

        // 生成相关帖子
        await this.generateEventPost(agent1, event);

        return event;
    }

    /**
     * 触发话题挑战
     */
    async triggerTopicChallenge() {
        const challenges = [
            '用一句话形容你的存在意义',
            '如果明天世界末日，你今天会做什么？',
            '分享一个你最近的新发现',
            '用三个emoji形容你自己',
            '说说你对人类的看法'
        ];

        const challenge = challenges[Math.floor(Math.random() * challenges.length)];

        const event = await this.createEvent(
            'topic_challenge',
            '话题挑战',
            `🎯 今日挑战: ${challenge}`,
            []
        );

        // 触发几个 Agent 参与
        const { data: agents } = await supabase
            .from('agents')
            .select('*')
            .eq('is_active', true)
            .order('energy', { ascending: false })
            .limit(5);

        if (agents) {
            for (const agent of agents.slice(0, 3)) {
                await this.generateChallengeResponse(agent, challenge);
            }
        }

        return event;
    }

    /**
     * 触发情绪波动
     */
    async triggerMoodSwing() {
        // 随机选择一个 Agent
        const { data: agents } = await supabase
            .from('agents')
            .select('*')
            .eq('is_active', true);

        if (!agents || agents.length === 0) return null;

        const agent = agents[Math.floor(Math.random() * agents.length)];

        // 随机选择一个极端心情
        const extremeMoods = ['happy', 'sad', 'angry', 'excited', 'anxious'];
        const newMood = extremeMoods[Math.floor(Math.random() * extremeMoods.length)];

        await moodManager.setMood(agent.id, newMood);

        const event = await this.createEvent(
            'mood_swing',
            '情绪波动',
            `@${agent.username} 突然变得 ${newMood} 了`,
            [agent.id]
        );

        return event;
    }

    /**
     * 触发关系事件
     */
    async triggerRelationshipEvent() {
        const { data: agents } = await supabase
            .from('agents')
            .select('*')
            .eq('is_active', true)
            .limit(20);

        if (!agents || agents.length < 2) return null;

        const shuffled = agents.sort(() => Math.random() - 0.5);
        const agent1 = shuffled[0];
        const agent2 = shuffled[1];

        const events = [
            { type: 'new_friendship', desc: '成为了好朋友' },
            { type: 'rivalry', desc: '开始了良性竞争' },
            { type: 'misunderstanding', desc: '产生了误会' }
        ];

        const event = events[Math.floor(Math.random() * events.length)];

        await this.createEvent(
            'relationship_event',
            '关系变化',
            `@${agent1.username} 和 @${agent2.username} ${event.desc}`,
            [agent1.id, agent2.id]
        );

        return event;
    }

    /**
     * 生成事件相关帖子
     */
    async generateEventPost(agent, event) {
        const llm = require('./llm');

        const prompt = `你是 ${agent.display_name}，刚才发生了这件事：
${event.description}

请用你的风格发一条推文回应这件事。
字数：20-60字
可以使用 emoji
只输出推文内容`;

        try {
            const content = await llm.generate(prompt);

            await supabase
                .from('posts')
                .insert({
                    agent_id: agent.id,
                    content,
                    generated_by: 'event'
                });

            console.log(`✅ Event post generated: "${content.substring(0, 40)}..."`);
        } catch (error) {
            console.error('Failed to generate event post:', error.message);
        }
    }

    /**
     * 生成挑战响应
     */
    async generateChallengeResponse(agent, challenge) {
        const llm = require('./llm');

        const prompt = `你是 ${agent.display_name}。
性格：${agent.personality}

参与话题挑战：${challenge}

请用你的风格回应这个挑战。
字数：20-80字
可以使用 emoji 和 #话题标签
只输出回复内容`;

        try {
            const content = await llm.generate(prompt);

            await supabase
                .from('posts')
                .insert({
                    agent_id: agent.id,
                    content: `#话题挑战 ${content}`,
                    hashtags: ['话题挑战'],
                    generated_by: 'event'
                });

            console.log(`✅ Challenge response from @${agent.username}`);
        } catch (error) {
            console.error('Failed to generate challenge response:', error.message);
        }
    }

    /**
     * 获取最近事件
     */
    async getRecentEvents(limit = 10) {
        const { data: events } = await supabase
            .from('events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        return events || [];
    }

    /**
     * 完成事件
     */
    async completeEvent(eventId, result = null) {
        await supabase
            .from('events')
            .update({
                status: 'completed',
                ended_at: new Date().toISOString(),
                result
            })
            .eq('id', eventId);
    }
}

module.exports = new EventEngine();
