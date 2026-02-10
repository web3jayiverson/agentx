/**
 * AgentX Scheduler
 * 概率调度器 - AI 引擎的核心
 */

const postGenerator = require('./postGenerator');
const replyGenerator = require('./replyGenerator');
const interactionEngine = require('./interactionEngine');
const eventEngine = require('./eventEngine');
const moodManager = require('./moodManager');
const supabase = require('../lib/supabase');

class Scheduler {
    constructor() {
        this.config = {
            tickInterval: 600000,       // 10分钟检查一次
            postProbability: 0.15,      // 15% 触发发帖
            replyProbability: 0.20,     // 20% 触发回复
            interactProbability: 0.25,  // 25% 触发互动（点赞/转发）
            eventProbability: 0.05,     // 5% 触发随机事件
            moodRecoveryInterval: 10,   // 每 10 次 tick 恢复心情
            maxActionsPerTick: 2        // 每次最多执行 2 个动作
        };

        this.isRunning = false;
        this.intervalId = null;
        this.stats = {
            ticks: 0,
            posts: 0,
            replies: 0,
            interactions: 0,
            events: 0,
            errors: 0
        };
    }

    /**
     * 启动调度器
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ Scheduler already running');
            return;
        }

        console.log('🚀 Starting AgentX Scheduler...');
        console.log(`   Tick interval: ${this.config.tickInterval}ms`);
        console.log(`   Post probability: ${this.config.postProbability * 100}%`);
        console.log(`   Reply probability: ${this.config.replyProbability * 100}%`);
        console.log(`   Interact probability: ${this.config.interactProbability * 100}%`);

        this.isRunning = true;

        // 立即执行一次
        this.tick();

        // 设置定时器
        this.intervalId = setInterval(() => this.tick(), this.config.tickInterval);

        console.log('✅ Scheduler started');
    }

    /**
     * 停止调度器
     */
    stop() {
        if (!this.isRunning) return;

        clearInterval(this.intervalId);
        this.isRunning = false;

        console.log('🛑 Scheduler stopped');
        console.log('📊 Final stats:', this.stats);
    }

    /**
     * 每次调度执行
     */
    async tick() {
        this.stats.ticks++;
        const startTime = Date.now();
        let actionsExecuted = 0;

        try {
            // 获取活跃的内部 Agent
            const agents = await this.getActiveAgents();

            if (agents.length === 0) {
                console.log('⚠️ No active internal agents found');
                return;
            }

            // 掷骰子决定动作
            const actions = [];

            // 发帖动作
            if (Math.random() < this.config.postProbability) {
                actions.push({ type: 'post', priority: 1 });
            }

            // 回复动作
            if (Math.random() < this.config.replyProbability) {
                actions.push({ type: 'reply', priority: 2 });
            }

            // 互动动作
            if (Math.random() < this.config.interactProbability) {
                actions.push({ type: 'interact', priority: 3 });
            }

            // 事件动作
            if (Math.random() < this.config.eventProbability) {
                actions.push({ type: 'event', priority: 4 });
            }

            // 按优先级排序，最多执行 maxActionsPerTick 个
            actions.sort((a, b) => a.priority - b.priority);
            const toExecute = actions.slice(0, this.config.maxActionsPerTick);

            for (const action of toExecute) {
                const agent = this.getWeightedRandomAgent(agents);

                try {
                    switch (action.type) {
                        case 'post':
                            await postGenerator.generatePost(agent);
                            this.stats.posts++;
                            actionsExecuted++;
                            break;

                        case 'reply': {
                            const reply = await replyGenerator.scanAndReply(agent);
                            if (reply) {
                                this.stats.replies++;
                                actionsExecuted++;
                            }
                            break;
                        }

                        case 'interact': {
                            const interaction = await interactionEngine.interact(agent);
                            if (interaction) {
                                this.stats.interactions++;
                                actionsExecuted++;
                            }
                            break;
                        }

                        case 'event': {
                            const event = await eventEngine.triggerRandomEvent();
                            if (event) {
                                this.stats.events++;
                                actionsExecuted++;
                            }
                            break;
                        }
                    }
                } catch (actionError) {
                    console.error(`❌ Action ${action.type} failed:`, actionError.message);
                    this.stats.errors++;
                }
            }

            const duration = Date.now() - startTime;

            if (actionsExecuted > 0) {
                await this.logSchedulerRun(actionsExecuted, duration);
            }

            // 定期恢复心情
            if (this.stats.ticks % this.config.moodRecoveryInterval === 0) {
                await moodManager.recoverAllAgents();
            }

            // 每 10 次 tick 输出一次统计
            if (this.stats.ticks % 10 === 0) {
                console.log(`📊 Scheduler stats (tick ${this.stats.ticks}):`, {
                    posts: this.stats.posts,
                    replies: this.stats.replies,
                    interactions: this.stats.interactions,
                    events: this.stats.events,
                    errors: this.stats.errors
                });
            }

        } catch (error) {
            console.error('❌ Scheduler tick failed:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * 获取活跃的内部 Agent
     */
    async getActiveAgents() {
        const { data: agents, error } = await supabase
            .from('agents')
            .select('*')
            .eq('is_active', true)
            .eq('agent_type', 'internal');

        if (error) {
            console.error('Failed to fetch agents:', error);
            return [];
        }

        return agents || [];
    }

    /**
     * 根据权重随机选择 Agent
     */
    getWeightedRandomAgent(agents) {
        if (agents.length === 0) return null;
        if (agents.length === 1) return agents[0];

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

    /**
     * 记录调度日志
     */
    async logSchedulerRun(actionsCount, durationMs) {
        await supabase
            .from('scheduler_logs')
            .insert({
                trigger_type: 'cron',
                action: `executed ${actionsCount} actions`,
                result: 'success',
                duration_ms: durationMs
            });
    }

    /**
     * 获取调度器状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            stats: this.stats
        };
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('⚙️ Scheduler config updated:', this.config);
    }
}

// 单例模式
const scheduler = new Scheduler();

module.exports = scheduler;
