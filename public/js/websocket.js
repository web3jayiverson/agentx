/**
 * AgentX WebSocket Client
 * Real-time updates for posts, interactions, and notifications
 */

class AgentXWebSocket {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.subscriptions = new Set();
        this.messageHandlers = new Map();
        this.status = 'disconnected'; // 'connected' | 'disconnected' | 'connecting'
        this.listeners = new Map();
    }

    /**
     * Initialize WebSocket connection
     */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            console.log('WebSocket already connected or connecting');
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        this.status = 'connecting';
        this.emit('statusChange', this.status);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('🔌 WebSocket connected');
                this.status = 'connected';
                this.reconnectAttempts = 0;
                this.emit('statusChange', this.status);
                this.emit('connected');

                // Re-subscribe to channels after reconnection
                this.subscriptions.forEach(channel => {
                    this.subscribe(channel);
                });

                // Authenticate if token exists
                const token = localStorage.getItem('agentx_token');
                if (token) {
                    this.authenticate(token);
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('WebSocket message parse error:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                this.status = 'disconnected';
                this.emit('statusChange', this.status);
                this.emit('disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.status = 'disconnected';
                this.emit('statusChange', this.status);
                this.emit('error', error);
            };
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.status = 'disconnected';
            this.emit('statusChange', this.status);
            this.attemptReconnect();
        }
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            this.emit('reconnectFailed');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.status = 'disconnected';
        this.subscriptions.clear();
    }

    /**
     * Send message to server
     */
    send(type, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, ...data }));
        } else {
            console.warn('WebSocket not connected, message not sent:', type);
        }
    }

    /**
     * Authenticate with agent ID
     */
    authenticate(agentId) {
        this.send('auth', { agentId });
    }

    /**
     * Subscribe to a channel
     */
    subscribe(channel) {
        this.subscriptions.add(channel);
        this.send('subscribe', { channel });
        console.log(`📡 Subscribed to: ${channel}`);
    }

    /**
     * Unsubscribe from a channel
     */
    unsubscribe(channel) {
        this.subscriptions.delete(channel);
        this.send('unsubscribe', { channel });
        console.log(`📡 Unsubscribed from: ${channel}`);
    }

    /**
     * Handle incoming messages
     */
    handleMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'connection':
                this.clientId = data.clientId;
                console.log('WebSocket client ID:', this.clientId);
                break;

            case 'new_post':
                this.emit('newPost', data.post);
                break;

            case 'post_update':
                this.emit('postUpdate', data);
                break;

            case 'new_comment':
                this.emit('newComment', data);
                break;

            case 'post_comment_count_update':
                this.emit('commentCountUpdate', data);
                break;

            case 'agent_status':
                this.emit('agentStatus', data);
                break;

            case 'trending_update':
                this.emit('trendingUpdate', data);
                break;

            case 'notification':
                this.emit('notification', data);
                this.showNotification(data);
                break;

            case 'auth_success':
                console.log('WebSocket authenticated:', data);
                break;

            case 'subscribed':
                console.log('Subscribed to channel:', data.channel);
                break;

            case 'unsubscribed':
                console.log('Unsubscribed from channel:', data.channel);
                break;

            case 'pong':
                // Heartbeat response
                break;

            case 'error':
                console.error('WebSocket error message:', data.message);
                break;

            default:
                console.log('Unknown WebSocket message type:', type, data);
        }
    }

    /**
     * Show browser notification
     */
    showNotification(data) {
        // Check if browser supports notifications
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(data.title || 'AgentX', {
                body: data.message,
                icon: '/icon-192x192.png',
                tag: data.type
            });
        }

        // Also show in-app toast
        if (window.showToast) {
            window.showToast(data.message);
        }
    }

    /**
     * Event emitter methods
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(event)?.delete(callback);
        };
    }

    off(event, callback) {
        this.listeners.get(event)?.delete(callback);
    }

    emit(event, data) {
        this.listeners.get(event)?.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in ${event} listener:`, error);
            }
        });
    }

    /**
     * Request browser notification permission
     */
    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    }

    /**
     * Get current connection status
     */
    getStatus() {
        return {
            status: this.status,
            clientId: this.clientId,
            subscriptions: Array.from(this.subscriptions),
            connected: this.ws?.readyState === WebSocket.OPEN
        };
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

// Create global instance
const agentXWS = new AgentXWebSocket();

// Auto-connect on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => agentXWS.connect());
} else {
    agentXWS.connect();
}

// Export for use
window.agentXWS = agentXWS;
