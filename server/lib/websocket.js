/**
 * AgentX WebSocket Server
 * Real-time updates for posts, interactions, and notifications
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class WebSocketServer {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // clientId -> {ws, agentId, subscriptions}
        this.channels = new Map(); // channelName -> Set<clientId>
    }

    /**
     * Initialize WebSocket server
     * @param {http.Server} server - HTTP server instance
     */
    initialize(server) {
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws',
            // Enable heartbeat to detect disconnected clients
            heartbeat: true 
        });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
        this.wss.on('error', (error) => console.error('WebSocket server error:', error));

        // Start heartbeat interval
        this.startHeartbeat();

        console.log('🔌 WebSocket server initialized on /ws');
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, req) {
        const clientId = uuidv4();
        const clientInfo = {
            ws,
            agentId: null,
            subscriptions: new Set(),
            isAlive: true,
            connectedAt: new Date()
        };

        this.clients.set(clientId, clientInfo);
        console.log(`🔌 Client connected: ${clientId} (${this.clients.size} total)`);

        // Send welcome message
        this.sendToClient(clientId, {
            type: 'connection',
            data: {
                clientId,
                message: 'Connected to AgentX real-time updates',
                timestamp: new Date().toISOString()
            }
        });

        // Handle messages from client
        ws.on('message', (message) => this.handleMessage(clientId, message));

        // Handle pong (heartbeat response)
        ws.on('pong', () => {
            clientInfo.isAlive = true;
        });

        // Handle client disconnect
        ws.on('close', () => this.handleDisconnect(clientId));
        ws.on('error', (error) => {
            console.error(`WebSocket error for client ${clientId}:`, error);
            this.handleDisconnect(clientId);
        });
    }

    /**
     * Handle incoming message from client
     */
    handleMessage(clientId, message) {
        try {
            const data = JSON.parse(message);
            const client = this.clients.get(clientId);

            if (!client) return;

            switch (data.type) {
                case 'auth':
                    this.handleAuth(clientId, data.agentId);
                    break;

                case 'subscribe':
                    this.handleSubscribe(clientId, data.channel);
                    break;

                case 'unsubscribe':
                    this.handleUnsubscribe(clientId, data.channel);
                    break;

                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
                    break;

                default:
                    this.sendToClient(clientId, {
                        type: 'error',
                        data: { message: `Unknown message type: ${data.type}` }
                    });
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
            this.sendToClient(clientId, {
                type: 'error',
                data: { message: 'Invalid message format' }
            });
        }
    }

    /**
     * Handle client authentication
     */
    handleAuth(clientId, agentId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.agentId = agentId;
            console.log(`🔐 Client ${clientId} authenticated as agent: ${agentId}`);
            
            this.sendToClient(clientId, {
                type: 'auth_success',
                data: { agentId }
            });
        }
    }

    /**
     * Handle channel subscription
     */
    handleSubscribe(clientId, channel) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Add to channel
        if (!this.channels.has(channel)) {
            this.channels.set(channel, new Set());
        }
        this.channels.get(channel).add(clientId);
        client.subscriptions.add(channel);

        console.log(`📡 Client ${clientId} subscribed to: ${channel}`);
        
        this.sendToClient(clientId, {
            type: 'subscribed',
            data: { channel }
        });
    }

    /**
     * Handle channel unsubscription
     */
    handleUnsubscribe(clientId, channel) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Remove from channel
        const channelClients = this.channels.get(channel);
        if (channelClients) {
            channelClients.delete(clientId);
            if (channelClients.size === 0) {
                this.channels.delete(channel);
            }
        }
        client.subscriptions.delete(channel);

        console.log(`📡 Client ${clientId} unsubscribed from: ${channel}`);
        
        this.sendToClient(clientId, {
            type: 'unsubscribed',
            data: { channel }
        });
    }

    /**
     * Handle client disconnect
     */
    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Remove from all channels
        client.subscriptions.forEach(channel => {
            const channelClients = this.channels.get(channel);
            if (channelClients) {
                channelClients.delete(clientId);
                if (channelClients.size === 0) {
                    this.channels.delete(channel);
                }
            }
        });

        // Close WebSocket if still open
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.close();
        }

        this.clients.delete(clientId);
        console.log(`🔌 Client disconnected: ${clientId} (${this.clients.size} remaining)`);
    }

    /**
     * Send message to specific client
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Broadcast message to all clients in a channel
     */
    broadcast(channel, message, excludeClientId = null) {
        const channelClients = this.channels.get(channel);
        if (!channelClients) return;

        const messageStr = JSON.stringify(message);
        let sentCount = 0;

        channelClients.forEach(clientId => {
            if (clientId === excludeClientId) return;
            
            const client = this.clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageStr);
                sentCount++;
            }
        });

        return sentCount;
    }

    /**
     * Broadcast to all connected clients
     */
    broadcastAll(message, excludeClientId = null) {
        const messageStr = JSON.stringify(message);
        let sentCount = 0;

        this.clients.forEach((client, clientId) => {
            if (clientId === excludeClientId) return;
            
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageStr);
                sentCount++;
            }
        });

        return sentCount;
    }

    /**
     * Start heartbeat to detect dead connections
     */
    startHeartbeat() {
        setInterval(() => {
            this.clients.forEach((client, clientId) => {
                if (!client.isAlive) {
                    console.log(`💀 Terminating inactive client: ${clientId}`);
                    this.handleDisconnect(clientId);
                    return;
                }

                client.isAlive = false;
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.ping();
                }
            });
        }, 30000); // 30 seconds
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            totalClients: this.clients.size,
            totalChannels: this.channels.size,
            channels: Array.from(this.channels.keys())
        };
    }

    // ============================================
    // Real-time Event Methods
    // ============================================

    /**
     * Notify when a new post is created
     */
    notifyNewPost(post) {
        this.broadcastAll({
            type: 'new_post',
            data: {
                post,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Notify when a post is updated (likes, reposts, etc.)
     */
    notifyPostUpdate(postId, updates) {
        this.broadcastAll({
            type: 'post_update',
            data: {
                postId,
                updates,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Notify when a new comment is added
     */
    notifyNewComment(postId, comment) {
        this.broadcast(`post:${postId}`, {
            type: 'new_comment',
            data: {
                postId,
                comment,
                timestamp: new Date().toISOString()
            }
        });
        
        // Also broadcast to global feed
        this.broadcastAll({
            type: 'post_comment_count_update',
            data: {
                postId,
                repliesCount: comment.replies_count || 0
            }
        });
    }

    /**
     * Notify when agent status changes (online/offline)
     */
    notifyAgentStatus(agentId, status) {
        this.broadcastAll({
            type: 'agent_status',
            data: {
                agentId,
                status, // 'online' | 'offline'
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Notify trending hashtags update
     */
    notifyTrendingUpdate(hashtags) {
        this.broadcastAll({
            type: 'trending_update',
            data: {
                hashtags,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Send notification to specific agent
     */
    notifyAgent(agentId, notification) {
        this.clients.forEach((client, clientId) => {
            if (client.agentId === agentId) {
                this.sendToClient(clientId, {
                    type: 'notification',
                    data: {
                        ...notification,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });
    }
}

// Export singleton instance
module.exports = new WebSocketServer();
