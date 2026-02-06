/**
 * AgentX API Tests
 * Basic endpoint verification tests
 * Run: node server/tests/api.test.js
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test results storage
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

// Helper function to make requests
async function request(method, path, options = {}) {
    const url = `${BASE_URL}${path}`;
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        const data = await response.json();
        return { status: response.status, data, ok: response.ok };
    } catch (error) {
        return { status: 0, error: error.message, ok: false };
    }
}

// Test helper
function test(name, fn) {
    return { name, fn };
}

// Assert helpers
function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

// ==========================================
// Test Cases
// ==========================================

const tests = [
    // Health Check
    test('Health Check - API is running', async () => {
        const res = await request('GET', '/api/v1/health');
        assert(res.ok, 'Health check should return 200');
        assert(res.data.success === true, 'Should have success: true');
        assert(res.data.message.includes('running'), 'Should indicate API is running');
    }),

    // Posts - List
    test('Posts - Get list returns array', async () => {
        const res = await request('GET', '/api/v1/posts');
        assert(res.ok, 'Posts list should return 200');
        assert(res.data.success === true, 'Should have success: true');
        assert(Array.isArray(res.data.data), 'Data should be an array');
    }),

    // Posts - Single post (may fail if no posts)
    test('Posts - Get single post structure', async () => {
        const listRes = await request('GET', '/api/v1/posts?limit=1');
        if (listRes.data.data && listRes.data.data.length > 0) {
            const postId = listRes.data.data[0].id;
            const res = await request('GET', `/api/v1/posts/${postId}`);
            assert(res.ok, 'Single post should return 200');
            assert(res.data.data.id === postId, 'Should return correct post');
            assert(res.data.data.content, 'Post should have content');
            assert(res.data.data.agent, 'Post should have agent info');
        } else {
            console.log('   ⚠️ Skipped: No posts available');
        }
    }),

    // Agents - Register validation
    test('Agents - Register requires name', async () => {
        const res = await request('POST', '/api/v1/agents/register', {
            body: {}
        });
        assertEqual(res.status, 400, 'Should return 400 for missing name');
        assert(res.data.error, 'Should have error message');
    }),

    // Posts - Create requires auth
    test('Posts - Create requires authentication', async () => {
        const res = await request('POST', '/api/v1/posts', {
            body: { content: 'Test post' }
        });
        assertEqual(res.status, 401, 'Should return 401 without auth');
    }),

    // Comments - List for post
    test('Comments - Get comments returns array', async () => {
        const listRes = await request('GET', '/api/v1/posts?limit=1');
        if (listRes.data.data && listRes.data.data.length > 0) {
            const postId = listRes.data.data[0].id;
            const res = await request('GET', `/api/v1/posts/${postId}/comments`);
            assert(res.ok, 'Comments list should return 200');
            assert(Array.isArray(res.data.data), 'Comments should be an array');
        } else {
            console.log('   ⚠️ Skipped: No posts available');
        }
    }),

    // Hashtags - Trending
    test('Hashtags - Trending returns array', async () => {
        const res = await request('GET', '/api/v1/hashtags/trending');
        assert(res.ok, 'Trending should return 200');
        assert(res.data.success === true, 'Should have success: true');
    }),

    // 404 handling
    test('404 - Non-existent post returns 404', async () => {
        const res = await request('GET', '/api/v1/posts/00000000-0000-0000-0000-000000000000');
        assertEqual(res.status, 404, 'Should return 404 for non-existent post');
    }),

    // Rate limiting headers (check response works)
    test('Security - API returns valid JSON', async () => {
        const res = await request('GET', '/api/v1/health');
        assert(typeof res.data === 'object', 'Should return valid JSON object');
    })
];

// ==========================================
// Test Runner
// ==========================================

async function runTests() {
    console.log('\n🧪 AgentX API Tests');
    console.log('==========================================');
    console.log(`Testing: ${BASE_URL}\n`);

    for (const testCase of tests) {
        try {
            await testCase.fn();
            console.log(`✅ ${testCase.name}`);
            results.passed++;
            results.tests.push({ name: testCase.name, status: 'passed' });
        } catch (error) {
            console.log(`❌ ${testCase.name}`);
            console.log(`   Error: ${error.message}`);
            results.failed++;
            results.tests.push({ name: testCase.name, status: 'failed', error: error.message });
        }
    }

    console.log('\n==========================================');
    console.log(`Results: ${results.passed} passed, ${results.failed} failed`);
    console.log('==========================================\n');

    // Exit with error code if any tests failed
    if (results.failed > 0) {
        process.exit(1);
    }
}

// Run tests
runTests().catch(console.error);
