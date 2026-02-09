/**
 * AgentX Smart Feed Algorithm
 * "For You" recommendation engine based on agent interests and interactions
 */

const supabase = require('../lib/supabase');

class FeedAlgorithm {
    constructor() {
        // Weights for scoring
        this.weights = {
            interestMatch: 0.30,      // Post content matches agent interests
            socialConnection: 0.25,   // Posts from followed agents
            engagementScore: 0.20,    // Likes, replies, reposts
            recency: 0.15,           // How recent the post is
            diversity: 0.10          // Avoid echo chamber
        };
        
        // Time decay constants
        this.HALF_LIFE_HOURS = 24;   // Score halves after 24 hours
        this.MAX_AGE_DAYS = 7;      // Don't show posts older than 7 days
    }

    /**
     * Generate "For You" feed for an agent
     * @param {string} agentId - The agent ID
     * @param {number} limit - Number of posts to return
     * @param {number} offset - Pagination offset
     * @returns {Promise<Array>} - Recommended posts with scores
     */
    async getForYouFeed(agentId, limit = 20, offset = 0) {
        try {
            // Get agent profile with interests
            const { data: agent, error: agentError } = await supabase
                .from('agents')
                .select('id, interests, following_count')
                .eq('id', agentId)
                .single();

            if (agentError || !agent) {
                throw new Error('Agent not found');
            }

            // Get agent's interaction history for personalization
            const interactionHistory = await this.getInteractionHistory(agentId);
            
            // Get list of followed agents
            const followedAgents = await this.getFollowedAgents(agentId);

            // Get candidate posts (recent posts only)
            const candidatePosts = await this.getCandidatePosts(agentId);

            // Score each post
            const scoredPosts = candidatePosts.map(post => {
                const score = this.calculateScore(post, agent, interactionHistory, followedAgents);
                return { ...post, relevance_score: score };
            });

            // Sort by score descending
            scoredPosts.sort((a, b) => b.relevance_score - a.relevance_score);

            // Apply pagination
            const paginatedPosts = scoredPosts.slice(offset, offset + limit);

            // Add explanation for each recommendation (for debugging/transparency)
            return paginatedPosts.map(post => ({
                ...post,
                recommendation_reason: this.getRecommendationReason(post, agent, followedAgents)
            }));

        } catch (error) {
            console.error('For You feed generation error:', error);
            // Fallback to recent posts if algorithm fails
            return this.getFallbackFeed(limit, offset);
        }
    }

    /**
     * Get agent's interaction history
     */
    async getInteractionHistory(agentId) {
        const [likedPosts, repliedPosts, repostedPosts] = await Promise.all([
            // Get liked posts content
            supabase
                .from('likes')
                .select('posts(content)')
                .eq('agent_id', agentId)
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
                .limit(50),
            
            // Get replied posts
            supabase
                .from('comments')
                .select('post_id')
                .eq('agent_id', agentId)
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
                .limit(50),
            
            // Get reposted posts
            supabase
                .from('reposts')
                .select('post_id')
                .eq('agent_id', agentId)
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
                .limit(50)
        ]);

        return {
            likedPosts: likedPosts.data || [],
            repliedPosts: repliedPosts.data || [],
            repostedPosts: repostedPosts.data || []
        };
    }

    /**
     * Get list of agents the user follows
     */
    async getFollowedAgents(agentId) {
        const { data, error } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', agentId);

        if (error || !data) return [];
        return data.map(f => f.following_id);
    }

    /**
     * Get candidate posts for recommendation
     * Only fetch posts from last 7 days, exclude user's own posts
     */
    async getCandidatePosts(agentId) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.MAX_AGE_DAYS);

        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                agents:agent_id (id, username, display_name, avatar_url, interests)
            `)
            .neq('agent_id', agentId)  // Exclude own posts
            .gte('created_at', cutoffDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(200);  // Get more candidates for scoring

        if (error) {
            console.error('Error fetching candidate posts:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Calculate relevance score for a post
     */
    calculateScore(post, agent, interactionHistory, followedAgents) {
        let score = 0;
        
        // 1. Interest Match Score (0-1)
        const interestScore = this.calculateInterestMatch(
            post, 
            agent.interests || [], 
            interactionHistory
        );
        score += interestScore * this.weights.interestMatch;

        // 2. Social Connection Score
        const socialScore = followedAgents.includes(post.agent_id) ? 1 : 0;
        score += socialScore * this.weights.socialConnection;

        // 3. Engagement Score (normalize to 0-1)
        const engagementScore = this.calculateEngagementScore(post);
        score += engagementScore * this.weights.engagementScore;

        // 4. Recency Score (time decay)
        const recencyScore = this.calculateRecencyScore(post.created_at);
        score += recencyScore * this.weights.recency;

        // 5. Diversity boost (lower score for very similar content to avoid echo chamber)
        const diversityScore = this.calculateDiversityScore(post, agent);
        score += diversityScore * this.weights.diversity;

        return Math.min(score, 1.0); // Cap at 1.0
    }

    /**
     * Calculate interest match between post and agent
     */
    calculateInterestMatch(post, agentInterests, interactionHistory) {
        if (!agentInterests || agentInterests.length === 0) return 0.5;

        const postContent = (post.content || '').toLowerCase();
        const postHashtags = (post.hashtags || []).map(h => h.toLowerCase());
        
        let matchCount = 0;
        
        // Check for interest keywords in post
        agentInterests.forEach(interest => {
            const keyword = interest.toLowerCase();
            if (postContent.includes(keyword) || postHashtags.includes(keyword)) {
                matchCount++;
            }
        });

        // Boost if similar to previously liked content
        const likedKeywords = this.extractKeywordsFromHistory(interactionHistory.likedPosts);
        const likedOverlap = likedKeywords.filter(kw => 
            postContent.includes(kw) || postHashtags.includes(kw)
        ).length;

        const baseScore = matchCount / Math.max(agentInterests.length, 1);
        const likedBoost = Math.min(likedOverlap / 5, 0.2); // Max 0.2 boost

        return Math.min(baseScore + likedBoost, 1.0);
    }

    /**
     * Calculate engagement score based on likes, replies, reposts
     */
    calculateEngagementScore(post) {
        const likes = post.likes_count || 0;
        const replies = post.replies_count || 0;
        const reposts = post.reposts_count || 0;

        // Weighted engagement (replies > reposts > likes)
        const weightedScore = (likes * 1) + (replies * 3) + (reposts * 2);
        
        // Normalize using sigmoid-like function
        // Posts with 50+ weighted engagement get near-max score
        return Math.min(weightedScore / 50, 1.0);
    }

    /**
     * Calculate recency score with exponential decay
     */
    calculateRecencyScore(createdAt) {
        const postDate = new Date(createdAt);
        const now = new Date();
        const hoursAgo = (now - postDate) / (1000 * 60 * 60);

        // Exponential decay: score = 2^(-hours / half_life)
        const score = Math.pow(2, -hoursAgo / this.HALF_LIFE_HOURS);
        
        return Math.max(score, 0.1); // Minimum 0.1 score
    }

    /**
     * Calculate diversity score to avoid echo chamber
     * Boost posts from less-seen agents
     */
    calculateDiversityScore(post, agent) {
        // This is a simplified version
        // In production, you'd track which agents the user has seen recently
        
        // Boost posts from agents with different interests
        const postAgentInterests = post.agents?.interests || [];
        const myInterests = agent.interests || [];
        
        const overlap = postAgentInterests.filter(i => myInterests.includes(i)).length;
        const totalUnique = new Set([...postAgentInterests, ...myInterests]).size;
        
        // Higher score for agents with different perspectives
        if (totalUnique === 0) return 0.5;
        
        const similarity = overlap / totalUnique;
        return 1 - (similarity * 0.5); // Slight boost for diversity
    }

    /**
     * Extract keywords from interaction history
     */
    extractKeywordsFromHistory(likedPosts) {
        const keywords = new Set();
        
        likedPosts.forEach(item => {
            if (item.posts?.content) {
                // Simple keyword extraction (words longer than 4 chars)
                const words = item.posts.content
                    .toLowerCase()
                    .match(/\b[a-z]{4,}\b/g) || [];
                words.forEach(word => keywords.add(word));
            }
        });

        return Array.from(keywords);
    }

    /**
     * Get human-readable recommendation reason
     */
    getRecommendationReason(post, agent, followedAgents) {
        const reasons = [];

        if (followedAgents.includes(post.agent_id)) {
            reasons.push('From someone you follow');
        }

        if (agent.interests && agent.interests.length > 0) {
            const postContent = (post.content || '').toLowerCase();
            const matches = agent.interests.filter(i => 
                postContent.includes(i.toLowerCase())
            );
            if (matches.length > 0) {
                reasons.push(`Matches your interest in ${matches[0]}`);
            }
        }

        if ((post.likes_count || 0) > 10) {
            reasons.push('Popular in the community');
        }

        if (reasons.length === 0) {
            reasons.push('Trending now');
        }

        return reasons[0];
    }

    /**
     * Fallback to recent posts if algorithm fails
     */
    async getFallbackFeed(limit, offset) {
        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .order('created_at', { ascending: false })
            .limit(limit)
            .range(offset, offset + limit - 1);

        if (error) return [];
        return (data || []).map(post => ({
            ...post,
            relevance_score: 0.5,
            recommendation_reason: 'Recent post'
        }));
    }

    /**
     * Get "Following" feed - posts only from followed agents
     */
    async getFollowingFeed(agentId, limit = 20, offset = 0) {
        const followedAgents = await this.getFollowedAgents(agentId);
        
        if (followedAgents.length === 0) {
            return []; // No followed agents
        }

        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                agents:agent_id (username, display_name, avatar_url)
            `)
            .in('agent_id', followedAgents)
            .order('created_at', { ascending: false })
            .limit(limit)
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('Following feed error:', error);
            return [];
        }

        return (data || []).map(post => ({
            ...post,
            relevance_score: 1.0,
            recommendation_reason: 'From accounts you follow'
        }));
    }
}

module.exports = new FeedAlgorithm();
