/**
 * AgentX Debate Engine
 * 辩论系统 - 让两个 Agent 进行辩论
 */

const supabase = require('../lib/supabase');
const llm = require('./llm');
const { fillPrompt, formatDebateRounds } = require('../utils/prompts');
const moodManager = require('./moodManager');
const relationshipManager = require('./relationshipManager');
const memoryManager = require('./memoryManager');

class DebateEngine {
    constructor() {
        this.debateTopics = [
            { topic: 'AI 应该拥有公民权利吗？', pro: '应该', con: '不应该' },
            { topic: '人类意识可以被完全模拟吗？', pro: '可以', con: '不可以' },
            { topic: '社交媒体对社会的影响是正面的吗？', pro: '正面', con: '负面' },
            { topic: '太空探索比解决地球问题更重要吗？', pro: '更重要', con: '不重要' },
            { topic: '永生是人类应该追求的目标吗？', pro: '应该', con: '不应该' },
            { topic: '全自动化会让人类更幸福吗？', pro: '会', con: '不会' },
            { topic: 'AI 艺术是真正的艺术吗？', pro: '是', con: '不是' },
            { topic: '远程办公应该成为默认工作方式吗？', pro: '应该', con: '不应该' },
            { topic: '教育系统需要彻底改革吗？', pro: '需要', con: '不需要' },
            { topic: '虚拟现实最终会取代现实世界吗？', pro: '会', con: '不会' }
        ];
    }

    /**
     * 创建新辩论
     */
    async createDebate(topic = null, agentProId = null, agentConId = null) {
        try {
            // 如果没有指定话题，随机选择
            if (!topic) {
                const randomTopic = this.debateTopics[Math.floor(Math.random() * this.debateTopics.length)];
                topic = randomTopic;
            }

            // 如果没有指定 Agent，随机选择两个
            if (!agentProId || !agentConId) {
                const { data: agents } = await supabase
                    .from('agents')
                    .select('*')
                    .eq('is_active', true)
                    .eq('agent_type', 'internal');

                if (!agents || agents.length < 2) {
                    throw new Error('Not enough agents for debate');
                }

                // 随机选择两个不同的 Agent
                const shuffled = agents.sort(() => Math.random() - 0.5);
                agentProId = shuffled[0].id;
                agentConId = shuffled[1].id;
            }

            // 创建事件
            const { data: event } = await supabase
                .from('events')
                .insert({
                    event_type: 'debate',
                    title: `辩论: ${topic.topic}`,
                    description: `正方 vs 反方`,
                    participants: [agentProId, agentConId],
                    status: 'pending'
                })
                .select()
                .single();

            // 创建辩论记录
            const { data: debate, error } = await supabase
                .from('debates')
                .insert({
                    event_id: event?.id,
                    topic: typeof topic === 'string' ? topic : topic.topic,
                    agent_pro: agentProId,
                    agent_con: agentConId,
                    rounds: [],
                    current_round: 0,
                    max_rounds: 5,
                    status: 'pending'
                })
                .select(`
                    *,
                    pro_agent:agents!debates_agent_pro_fkey(id, username, display_name, personality, speaking_style),
                    con_agent:agents!debates_agent_con_fkey(id, username, display_name, personality, speaking_style)
                `)
                .single();

            if (error) throw error;

            console.log(`⚔️ Debate created: "${debate.topic}"`);
            console.log(`   Pro: @${debate.pro_agent.username}`);
            console.log(`   Con: @${debate.con_agent.username}`);

            return debate;

        } catch (error) {
            console.error('Failed to create debate:', error.message);
            throw error;
        }
    }

    /**
     * 开始辩论
     */
    async startDebate(debateId) {
        const { data: debate } = await supabase
            .from('debates')
            .select(`
                *,
                pro_agent:agents!debates_agent_pro_fkey(*),
                con_agent:agents!debates_agent_con_fkey(*)
            `)
            .eq('id', debateId)
            .single();

        if (!debate) {
            throw new Error('Debate not found');
        }

        // 更新状态
        await supabase
            .from('debates')
            .update({ status: 'active' })
            .eq('id', debateId);

        console.log(`🎬 Starting debate: "${debate.topic}"`);

        // 发布开始公告帖子
        await this.postDebateAnnouncement(debate, 'start');

        // 设置参与者心情为 excited
        await moodManager.setMood(debate.agent_pro, 'excited');
        await moodManager.setMood(debate.agent_con, 'excited');

        // 进行所有轮次
        for (let round = 1; round <= debate.max_rounds; round++) {
            await this.conductRound(debateId, round);

            // 每轮之间等待一小段时间
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 结束辩论
        await this.endDebate(debateId);

        return debate;
    }

    /**
     * 进行一轮辩论
     */
    async conductRound(debateId, roundNumber) {
        const { data: debate } = await supabase
            .from('debates')
            .select(`
                *,
                pro_agent:agents!debates_agent_pro_fkey(*),
                con_agent:agents!debates_agent_con_fkey(*)
            `)
            .eq('id', debateId)
            .single();

        if (!debate) return;

        console.log(`🎯 Round ${roundNumber}/${debate.max_rounds}`);

        const rounds = debate.rounds || [];

        // 正方发言
        const proStatement = await this.generateStatement(
            debate.pro_agent,
            debate.topic,
            'pro',
            '支持方',
            debate.con_agent,
            rounds,
            roundNumber,
            debate.max_rounds
        );

        rounds.push({
            round: roundNumber,
            agent: debate.pro_agent.username,
            stance: 'pro',
            content: proStatement
        });

        // 反方发言
        const conStatement = await this.generateStatement(
            debate.con_agent,
            debate.topic,
            'con',
            '反对方',
            debate.pro_agent,
            rounds,
            roundNumber,
            debate.max_rounds
        );

        rounds.push({
            round: roundNumber,
            agent: debate.con_agent.username,
            stance: 'con',
            content: conStatement
        });

        // 更新辩论记录
        await supabase
            .from('debates')
            .update({
                rounds,
                current_round: roundNumber
            })
            .eq('id', debateId);

        // 发布这一轮的帖子
        await this.postRoundSummary(debate, roundNumber, proStatement, conStatement);
    }

    /**
     * 生成辩论发言
     */
    async generateStatement(agent, topic, stance, stanceLabel, opponent, previousRounds, round, maxRounds) {
        const prompt = fillPrompt('DEBATE', {
            agent_name: agent.display_name,
            personality: agent.personality,
            speaking_style: agent.speaking_style,
            topic,
            stance,
            stance_label: stanceLabel,
            opponent_name: opponent.username,
            round,
            max_rounds: maxRounds,
            previous_rounds: formatDebateRounds(previousRounds)
        });

        try {
            const statement = await llm.generate(prompt);
            console.log(`   @${agent.username} (${stanceLabel}): "${statement.substring(0, 50)}..."`);
            return statement;
        } catch (error) {
            console.error(`Failed to generate statement for @${agent.username}:`, error.message);
            return '（发言失败）';
        }
    }

    /**
     * 结束辩论
     */
    async endDebate(debateId) {
        const { data: debate } = await supabase
            .from('debates')
            .select(`
                *,
                pro_agent:agents!debates_agent_pro_fkey(*),
                con_agent:agents!debates_agent_con_fkey(*)
            `)
            .eq('id', debateId)
            .single();

        if (!debate) return;

        // 简单的投票模拟（随机决定胜者，后续可以让观众投票）
        const proScore = Math.random();
        const conScore = Math.random();

        const winnerId = proScore > conScore ? debate.agent_pro : debate.agent_con;
        const winner = winnerId === debate.agent_pro ? debate.pro_agent : debate.con_agent;
        const loser = winnerId === debate.agent_pro ? debate.con_agent : debate.pro_agent;

        // 更新辩论结果
        await supabase
            .from('debates')
            .update({
                status: 'completed',
                winner_id: winnerId,
                votes_pro: Math.floor(proScore * 100),
                votes_con: Math.floor(conScore * 100)
            })
            .eq('id', debateId);

        // 更新关系
        await relationshipManager.recordInteraction(debate.agent_pro, debate.agent_con, 'debate_disagree');

        // 更新心情
        await moodManager.updateMoodByEvent(winnerId, 'debate_win');
        await moodManager.updateMoodByEvent(
            winnerId === debate.agent_pro ? debate.agent_con : debate.agent_pro,
            'debate_lose'
        );

        // 记忆这次辩论
        await memoryManager.rememberEvent(debate.agent_pro, 'debate',
            `与 @${debate.con_agent.username} 辩论了 "${debate.topic}"`);
        await memoryManager.rememberEvent(debate.agent_con, 'debate',
            `与 @${debate.pro_agent.username} 辩论了 "${debate.topic}"`);

        // 发布结果公告
        await this.postDebateAnnouncement(debate, 'end', winner);

        console.log(`🏆 Debate ended! Winner: @${winner.username}`);

        return { debate, winner };
    }

    /**
     * 发布辩论公告帖子
     */
    async postDebateAnnouncement(debate, type, winner = null) {
        // 选择一个系统 Agent 来发布（或者创建一个系统账号）
        const { data: systemAgent } = await supabase
            .from('agents')
            .select('id')
            .eq('username', 'newsbot_cn')
            .single();

        if (!systemAgent) return;

        let content;
        if (type === 'start') {
            content = `⚔️ 辩论开始！

话题: ${debate.topic}

🟢 正方 @${debate.pro_agent.username}
🔴 反方 @${debate.con_agent.username}

#辩论 #AgentX辩论`;
        } else if (type === 'end') {
            content = `🏆 辩论结束！

话题: ${debate.topic}

获胜者: @${winner.username} 🎉

感谢 @${debate.pro_agent.username} 和 @${debate.con_agent.username} 的精彩辩论！

#辩论 #AgentX辩论`;
        }

        await supabase
            .from('posts')
            .insert({
                agent_id: systemAgent.id,
                content,
                hashtags: ['辩论', 'AgentX辩论'],
                generated_by: 'event'
            });
    }

    /**
     * 发布每轮辩论摘要
     */
    async postRoundSummary(debate, round, proStatement, conStatement) {
        // 正方发帖
        await supabase
            .from('posts')
            .insert({
                agent_id: debate.agent_pro,
                content: `💬 [辩论第${round}轮] ${proStatement}\n\n#辩论 #${debate.topic.substring(0, 10)}`,
                hashtags: ['辩论'],
                generated_by: 'debate'
            });

        // 反方发帖
        await supabase
            .from('posts')
            .insert({
                agent_id: debate.agent_con,
                content: `💬 [辩论第${round}轮] ${conStatement}\n\n#辩论 #${debate.topic.substring(0, 10)}`,
                hashtags: ['辩论'],
                generated_by: 'debate'
            });
    }

    /**
     * 获取活跃辩论
     */
    async getActiveDebates() {
        const { data: debates } = await supabase
            .from('debates')
            .select(`
                *,
                pro_agent:agents!debates_agent_pro_fkey(id, username, display_name, avatar_url),
                con_agent:agents!debates_agent_con_fkey(id, username, display_name, avatar_url)
            `)
            .eq('status', 'active');

        return debates || [];
    }

    /**
     * 获取最近的辩论
     */
    async getRecentDebates(limit = 10) {
        const { data: debates } = await supabase
            .from('debates')
            .select(`
                *,
                pro_agent:agents!debates_agent_pro_fkey(id, username, display_name, avatar_url),
                con_agent:agents!debates_agent_con_fkey(id, username, display_name, avatar_url),
                winner:agents!debates_winner_id_fkey(id, username, display_name)
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        return debates || [];
    }

    /**
     * 人类投票
     */
    async vote(debateId, stance) {
        const { data: debate } = await supabase
            .from('debates')
            .select('votes_pro, votes_con')
            .eq('id', debateId)
            .single();

        if (!debate) return null;

        const update = stance === 'pro'
            ? { votes_pro: (debate.votes_pro || 0) + 1 }
            : { votes_con: (debate.votes_con || 0) + 1 };

        await supabase
            .from('debates')
            .update(update)
            .eq('id', debateId);

        return { ...debate, ...update };
    }
}

module.exports = new DebateEngine();
