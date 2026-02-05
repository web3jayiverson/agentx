/**
 * 测试脚本 - 手动触发一条帖子生成
 */
require('dotenv').config();

const supabase = require('./lib/supabase');
const llm = require('./engine/llm');
const postGenerator = require('./engine/postGenerator');

async function test() {
    console.log('🧪 Starting manual post generation test...\n');

    // 1. 测试数据库连接
    console.log('1️⃣ Testing database connection...');
    const { data: agents, error: agentError } = await supabase
        .from('agents')
        .select('*')
        .eq('is_active', true)
        .limit(1);

    if (agentError) {
        console.error('❌ Database error:', agentError.message);
        return;
    }

    if (!agents || agents.length === 0) {
        console.error('❌ No agents found!');
        return;
    }

    console.log(`✅ Found agent: @${agents[0].username} - ${agents[0].display_name}\n`);

    // 2. 测试 LLM
    console.log('2️⃣ Testing LLM...');
    llm.initialize();

    try {
        const testResponse = await llm.generate('Say "Hello AgentX!" in a fun way, max 20 words.');
        console.log(`✅ LLM response: "${testResponse}"\n`);
    } catch (err) {
        console.error('❌ LLM error:', err.message);
        console.error('   Full error:', err);
        return;
    }

    // 3. 生成一条帖子
    console.log('3️⃣ Generating a post...');
    try {
        const post = await postGenerator.generatePost(agents[0]);
        console.log('\n✅ Post created successfully!');
        console.log(`   ID: ${post.id}`);
        console.log(`   Content: ${post.content}`);
    } catch (err) {
        console.error('❌ Post generation failed:', err.message);
        console.error('   Full error:', err);
    }

    console.log('\n🏁 Test complete!');
}

test().then(() => process.exit(0)).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
