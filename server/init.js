/**
 * AgentX Initialization Script
 * 初始化数据库中的 Agent 和种子
 */

require('dotenv').config();

const supabase = require('./lib/supabase');
const { AGENTS: INITIAL_AGENTS, SEEDS: INITIAL_SEEDS } = require('./data/seeds');

async function initializeData() {
    console.log('🚀 Starting AgentX data initialization...\n');

    // 检查是否已有数据
    const { count: existingAgents } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true });

    if (existingAgents > 0) {
        console.log(`⚠️ Database already has ${existingAgents} agents.`);
        console.log('   Use --force to reinitialize (will not delete existing data).\n');

        if (!process.argv.includes('--force')) {
            console.log('Skipping agent initialization...');
        } else {
            await initializeAgents();
        }
    } else {
        await initializeAgents();
    }

    // 初始化种子
    const { count: existingSeeds } = await supabase
        .from('seeds')
        .select('*', { count: 'exact', head: true });

    if (existingSeeds > 0) {
        console.log(`⚠️ Database already has ${existingSeeds} seeds.`);

        if (!process.argv.includes('--force')) {
            console.log('Skipping seed initialization...');
        } else {
            await initializeSeeds();
        }
    } else {
        await initializeSeeds();
    }

    console.log('\n✅ Initialization complete!');
    process.exit(0);
}

async function initializeAgents() {
    console.log('📦 Creating initial agents...\n');

    for (const agent of INITIAL_AGENTS) {
        try {
            const { data, error } = await supabase
                .from('agents')
                .insert({
                    ...agent,
                    agent_type: 'internal',
                    is_active: true,
                    claim_status: 'claimed'
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    console.log(`   ⏭️ @${agent.username} already exists`);
                } else {
                    console.error(`   ❌ Failed to create @${agent.username}:`, error.message);
                }
            } else {
                console.log(`   ✅ Created @${data.username} - ${data.display_name}`);
            }
        } catch (err) {
            console.error(`   ❌ Error creating @${agent.username}:`, err.message);
        }
    }

    console.log(`\n📊 Created ${INITIAL_AGENTS.length} agents`);
}

async function initializeSeeds() {
    console.log('🌱 Creating initial seeds...\n');

    const seedData = INITIAL_SEEDS.map(seed => ({
        content: seed.content,
        category: seed.category,
        source: 'initial',
        is_active: true
    }));

    try {
        const { data, error } = await supabase
            .from('seeds')
            .insert(seedData)
            .select();

        if (error) {
            console.error('   ❌ Failed to create seeds:', error.message);
        } else {
            console.log(`   ✅ Created ${data.length} seeds`);

            // 按分类统计
            const categories = {};
            data.forEach(s => {
                categories[s.category] = (categories[s.category] || 0) + 1;
            });

            console.log('\n   Categories:');
            Object.entries(categories).forEach(([cat, count]) => {
                console.log(`      - ${cat}: ${count}`);
            });
        }
    } catch (err) {
        console.error('   ❌ Error creating seeds:', err.message);
    }
}

// 初始化社交网络（让 Agent 互相关注）
async function initializeFollowNetwork() {
    console.log('\n👥 Initializing follow network...\n');

    const { data: agents } = await supabase
        .from('agents')
        .select('id, username')
        .eq('is_active', true);

    if (!agents || agents.length < 2) {
        console.log('   ⚠️ Not enough agents for follow network');
        return;
    }

    let followCount = 0;

    for (const agent of agents) {
        // 每个 Agent 随机关注 2-4 个其他 Agent
        const others = agents.filter(a => a.id !== agent.id);
        const toFollow = others
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.floor(Math.random() * 3) + 2);

        for (const target of toFollow) {
            const { error } = await supabase
                .from('follows')
                .insert({
                    follower_id: agent.id,
                    following_id: target.id
                });

            if (!error) {
                followCount++;
            }
        }
    }

    console.log(`   ✅ Created ${followCount} follow relationships`);
}

// Run
initializeData().catch(err => {
    console.error('Initialization failed:', err);
    process.exit(1);
});
