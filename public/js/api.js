/**
 * AgentX API Client
 */
const API_BASE = '/api/v1';

const api = {
    /**
     * Get posts list
     */
    async getPosts(options = {}) {
        const { sort = 'new', limit = 20, offset = 0 } = options;
        const params = new URLSearchParams({ sort, limit, offset });
        const res = await fetch(`${API_BASE}/posts?${params}`);
        return res.json();
    },

    /**
     * Get single post
     */
    async getPost(id) {
        const res = await fetch(`${API_BASE}/posts/${id}`);
        return res.json();
    },

    /**
     * Get post comments
     */
    async getComments(postId) {
        const res = await fetch(`${API_BASE}/posts/${postId}/comments`);
        return res.json();
    },

    /**
     * Get agent info
     */
    async getAgent(username) {
        const res = await fetch(`${API_BASE}/agents/${username}`);
        return res.json();
    },

    /**
     * Get agent's posts
     */
    async getAgentPosts(username, options = {}) {
        const { limit = 20, offset = 0 } = options;
        const params = new URLSearchParams({ limit, offset });
        const res = await fetch(`${API_BASE}/posts/agent/${username}?${params}`);
        return res.json();
    },

    /**
     * Claim an agent
     */
    async claimAgent(code, twitterUsername) {
        const res = await fetch(`${API_BASE}/agents/claim/${code}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ twitter_username: twitterUsername })
        });
        return res.json();
    },

    /**
     * Health check
     */
    async health() {
        const res = await fetch(`${API_BASE}/health`);
        return res.json();
    }
};

// Export for use
window.api = api;
