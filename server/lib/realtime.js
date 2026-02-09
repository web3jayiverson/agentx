/**
 * AgentX Real-time Events
 * Integrates WebSocket broadcasts with API operations
 */

const websocket = require('./websocket');

/**
 * Broadcast new post to all connected clients
 * @param {Object} post - The new post object
 */
function broadcastNewPost(post) {
    try {
        websocket.notifyNewPost(post);
    } catch (error) {
        console.error('Error broadcasting new post:', error);
    }
}

/**
 * Broadcast post update (likes, reposts count changes)
 * @param {string} postId - Post ID
 * @param {Object} updates - Updated fields
 */
function broadcastPostUpdate(postId, updates) {
    try {
        websocket.notifyPostUpdate(postId, updates);
    } catch (error) {
        console.error('Error broadcasting post update:', error);
    }
}

/**
 * Broadcast new comment on a post
 * @param {string} postId - Post ID
 * @param {Object} comment - The new comment object
 * @param {number} repliesCount - Updated replies count
 */
function broadcastNewComment(postId, comment, repliesCount) {
    try {
        websocket.notifyNewComment(postId, { ...comment, replies_count: repliesCount });
    } catch (error) {
        console.error('Error broadcasting new comment:', error);
    }
}

/**
 * Broadcast agent status change
 * @param {string} agentId - Agent ID
 * @param {string} status - 'online' or 'offline'
 */
function broadcastAgentStatus(agentId, status) {
    try {
        websocket.notifyAgentStatus(agentId, status);
    } catch (error) {
        console.error('Error broadcasting agent status:', error);
    }
}

/**
 * Broadcast trending hashtags update
 * @param {Array} hashtags - List of trending hashtags
 */
function broadcastTrendingUpdate(hashtags) {
    try {
        websocket.notifyTrendingUpdate(hashtags);
    } catch (error) {
        console.error('Error broadcasting trending update:', error);
    }
}

/**
 * Send notification to specific agent
 * @param {string} agentId - Agent ID
 * @param {Object} notification - Notification data
 */
function sendNotification(agentId, notification) {
    try {
        websocket.notifyAgent(agentId, notification);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

/**
 * Notify agent about new like on their post
 * @param {string} agentId - Post owner's agent ID
 * @param {Object} likeData - Like information
 */
function notifyPostLiked(agentId, likeData) {
    sendNotification(agentId, {
        type: 'post_liked',
        title: 'New Like',
        message: `@${likeData.agentUsername} liked your post`,
        data: likeData
    });
}

/**
 * Notify agent about new repost of their post
 * @param {string} agentId - Post owner's agent ID
 * @param {Object} repostData - Repost information
 */
function notifyPostReposted(agentId, repostData) {
    sendNotification(agentId, {
        type: 'post_reposted',
        title: 'New Repost',
        message: `@${repostData.agentUsername} reposted your post`,
        data: repostData
    });
}

/**
 * Notify agent about new comment on their post
 * @param {string} agentId - Post owner's agent ID
 * @param {Object} commentData - Comment information
 */
function notifyPostCommented(agentId, commentData) {
    sendNotification(agentId, {
        type: 'post_commented',
        title: 'New Comment',
        message: `@${commentData.agentUsername} commented on your post`,
        data: commentData
    });
}

/**
 * Notify agent about new follower
 * @param {string} agentId - Agent being followed
 * @param {Object} followData - Follow information
 */
function notifyNewFollower(agentId, followData) {
    sendNotification(agentId, {
        type: 'new_follower',
        title: 'New Follower',
        message: `@${followData.followerUsername} started following you`,
        data: followData
    });
}

module.exports = {
    // Broadcast events
    broadcastNewPost,
    broadcastPostUpdate,
    broadcastNewComment,
    broadcastAgentStatus,
    broadcastTrendingUpdate,
    
    // Direct notifications
    sendNotification,
    notifyPostLiked,
    notifyPostReposted,
    notifyPostCommented,
    notifyNewFollower,
    
    // Expose websocket for direct access if needed
    websocket
};
