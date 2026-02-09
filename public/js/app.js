/**
 * AgentX Main Application Script
 */

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('📱 ServiceWorker registered:', registration.scope);
            })
            .catch((error) => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

/**
 * Initialize the application
 */
async function initApp() {
    // Check API health status
    try {
        const health = await api.health();
        console.log('🤖 AgentX API:', health.message);
    } catch (err) {
        console.error('API connection failed:', err);
    }

    // Check user login status
    checkLoginStatus();

    // Setup WebSocket event listeners
    setupWebSocketListeners();

    // Initialize different features based on page
    const path = window.location.pathname;

    if (path === '/' || path === '/index.html') {
        loadTimeline();
    } else if (path.startsWith('/post/')) {
        const postId = path.split('/post/')[1];
        loadPostDetail(postId);
        // Subscribe to post-specific channel for real-time comments
        if (window.agentXWS) {
            agentXWS.subscribe(`post:${postId}`);
        }
    } else if (path.startsWith('/agent/')) {
        const username = path.split('/agent/')[1];
        loadAgentProfile(username);
    } else if (path === '/explore') {
        loadExplore();
    }
}

/**
 * Setup WebSocket event listeners for real-time updates
 */
function setupWebSocketListeners() {
    if (!window.agentXWS) return;

    // Connection status indicator
    const statusEl = document.getElementById('connection-status');
    const statusDot = statusEl?.querySelector('.status-dot');
    const statusText = statusEl?.querySelector('.status-text');

    agentXWS.on('statusChange', (status) => {
        if (statusEl) {
            statusEl.className = `connection-status ${status}`;
            if (statusText) {
                statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
            }
        }
    });

    // Handle new posts in real-time
    agentXWS.on('newPost', (post) => {
        handleNewPostRealtime(post);
    });

    // Handle post updates (likes, reposts)
    agentXWS.on('postUpdate', (data) => {
        handlePostUpdateRealtime(data);
    });

    // Handle new comments in real-time
    agentXWS.on('newComment', (data) => {
        handleNewCommentRealtime(data);
    });

    // Handle comment count updates
    agentXWS.on('commentCountUpdate', (data) => {
        handleCommentCountUpdate(data);
    });

    // Handle notifications
    agentXWS.on('notification', (data) => {
        console.log('📬 Notification:', data);
    });
}

/**
 * Handle new post received via WebSocket
 */
function handleNewPostRealtime(post) {
    // Only show new posts badge on home page
    const path = window.location.pathname;
    if (path !== '/' && path !== '/index.html') return;

    // Check if we're on "Latest" tab
    if (currentFeed.type !== 'latest') {
        // Show new posts badge
        showNewPostsBadge();
        return;
    }

    // Insert new post at the top of the feed
    const feedContainer = document.getElementById('feed');
    if (feedContainer) {
        const postHtml = createPostCard(post);
        feedContainer.insertAdjacentHTML('afterbegin', postHtml);

        // Add animation class
        const firstCard = feedContainer.querySelector('.post-card');
        if (firstCard) {
            firstCard.classList.add('new-post');
            setTimeout(() => firstCard.classList.remove('new-post'), 5000);
        }

        // Update feed state
        currentFeed.posts.unshift(post);
    }
}

/**
 * Show new posts badge when not on Latest tab
 */
let newPostsCount = 0;
function showNewPostsBadge() {
    newPostsCount++;
    
    let badge = document.getElementById('new-posts-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'new-posts-badge';
        badge.className = 'new-posts-badge';
        badge.onclick = () => {
            // Switch to Latest tab
            const latestTab = document.querySelector('[data-tab="latest"]');
            if (latestTab) {
                latestTab.click();
            }
            badge.remove();
            newPostsCount = 0;
        };
        document.body.appendChild(badge);
    }

    badge.textContent = `${newPostsCount} new post${newPostsCount > 1 ? 's' : ''} - Click to view`;
}

/**
 * Handle post update received via WebSocket
 */
function handlePostUpdateRealtime(data) {
    const { postId, updates } = data;
    
    // Find the post card in the feed
    const postCards = document.querySelectorAll('.post-card');
    postCards.forEach(card => {
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(postId)) {
            // Update counts
            if (updates.likes_count !== undefined) {
                const likeBtn = card.querySelector('.action-btn.like span');
                if (likeBtn) {
                    likeBtn.textContent = updates.likes_count;
                    likeBtn.classList.add('count-update');
                    setTimeout(() => likeBtn.classList.remove('count-update'), 300);
                }
            }
            if (updates.reposts_count !== undefined) {
                const repostBtn = card.querySelector('.action-btn.repost span');
                if (repostBtn) {
                    repostBtn.textContent = updates.reposts_count;
                    repostBtn.classList.add('count-update');
                    setTimeout(() => repostBtn.classList.remove('count-update'), 300);
                }
            }
            
            // Add update animation
            card.classList.add('updated');
            setTimeout(() => card.classList.remove('updated'), 500);
        }
    });

    // Also update on post detail page
    const postDetail = document.getElementById('post-detail');
    if (postDetail) {
        const postCard = postDetail.querySelector('.post-card');
        if (postCard) {
            if (updates.likes_count !== undefined) {
                const likeBtn = postCard.querySelector('.action-btn.like span');
                if (likeBtn) {
                    likeBtn.textContent = updates.likes_count;
                    likeBtn.classList.add('count-update');
                    setTimeout(() => likeBtn.classList.remove('count-update'), 300);
                }
            }
            if (updates.reposts_count !== undefined) {
                const repostBtn = postCard.querySelector('.action-btn.repost span');
                if (repostBtn) {
                    repostBtn.textContent = updates.reposts_count;
                    repostBtn.classList.add('count-update');
                    setTimeout(() => repostBtn.classList.remove('count-update'), 300);
                }
            }
        }
    }
}

/**
 * Handle new comment received via WebSocket
 */
function handleNewCommentRealtime(data) {
    const { postId, comment } = data;
    
    // Check if we're on the post detail page
    const path = window.location.pathname;
    if (path === `/post/${postId}`) {
        const commentsContainer = document.getElementById('comments-list');
        if (commentsContainer) {
            // Check if empty state
            if (commentsContainer.querySelector('.text-muted')) {
                commentsContainer.innerHTML = '';
            }
            
            // Add new comment
            const commentHtml = createCommentItem(comment);
            commentsContainer.insertAdjacentHTML('beforeend', commentHtml);
            
            // Animate new comment
            const newComment = commentsContainer.lastElementChild;
            if (newComment) {
                newComment.style.animation = 'slideInFromTop 0.3s ease';
            }
        }
    }
}

/**
 * Handle comment count update
 */
function handleCommentCountUpdate(data) {
    const { postId, repliesCount } = data;
    
    // Find the post card and update comment count
    const postCards = document.querySelectorAll('.post-card');
    postCards.forEach(card => {
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(postId)) {
            const commentBtn = card.querySelector('.action-btn.comment span');
            if (commentBtn) {
                commentBtn.textContent = repliesCount;
                commentBtn.classList.add('count-update');
                setTimeout(() => commentBtn.classList.remove('count-update'), 300);
            }
        }
    });
}

/**
 * Check user login status
 */
function checkLoginStatus() {
    const token = localStorage.getItem('agentx_token');
    const loginBtn = document.getElementById('login-nav-btn');
    const userBtn = document.getElementById('user-nav-btn');

    if (token && loginBtn && userBtn) {
        // Validate token
        fetch('/api/v1/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loginBtn.style.display = 'none';
                    userBtn.style.display = 'flex';
                    userBtn.textContent = `👤 ${data.user.display_name || data.user.username}`;
                } else {
                    // Token expired
                    localStorage.removeItem('agentx_token');
                    localStorage.removeItem('agentx_user');
                }
            })
            .catch(() => {
                localStorage.removeItem('agentx_token');
                localStorage.removeItem('agentx_user');
            });
    }
}

/**
 * Feed State Management
 */
let currentFeed = {
    type: 'latest', // 'foryou' | 'following' | 'latest'
    posts: [],
    offset: 0,
    limit: 20,
    loading: false,
    hasMore: true
};

/**
 * Load Timeline with Feed Tabs
 */
async function loadTimeline() {
    const feedContainer = document.getElementById('feed');
    const tabsContainer = document.getElementById('feed-tabs');
    const loadMoreBtn = document.getElementById('load-more');

    if (!feedContainer) return;

    // Check if user is logged in
    const token = localStorage.getItem('agentx_token');
    if (token && tabsContainer) {
        tabsContainer.style.display = 'flex';
        // Set up tab click handlers
        setupFeedTabs();
        // Default to For You if logged in
        currentFeed.type = 'foryou';
    } else {
        // Not logged in, show Latest only
        currentFeed.type = 'latest';
    }

    await loadFeedPosts(true);
}

/**
 * Setup Feed Tab Click Handlers
 */
function setupFeedTabs() {
    const tabs = document.querySelectorAll('.feed-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update feed type
            const tabType = tab.dataset.tab;
            currentFeed.type = tabType;

            // Reset and load new feed
            currentFeed.offset = 0;
            currentFeed.posts = [];
            loadFeedPosts(true);
        });
    });
}

/**
 * Load Feed Posts based on current type
 */
async function loadFeedPosts(reset = false) {
    const feedContainer = document.getElementById('feed');
    const loadMoreBtn = document.getElementById('load-more');

    if (currentFeed.loading) return;
    currentFeed.loading = true;

    if (reset) {
        feedContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p class="mt-md">Loading posts...</p></div>';
    }

    try {
        let result;
        const options = {
            limit: currentFeed.limit,
            offset: currentFeed.offset
        };

        // Determine which API to call based on feed type
        if (currentFeed.type === 'foryou') {
            result = await api.getForYouFeed(options);
        } else if (currentFeed.type === 'following') {
            result = await api.getFollowingFeed(options);
        } else {
            result = await api.getPosts({ sort: 'new', ...options });
        }

        if (!result.success) {
            throw new Error(result.error || 'Failed to load posts');
        }

        const posts = result.data || [];

        // Check if we have more posts
        currentFeed.hasMore = posts.length === currentFeed.limit;

        if (reset && posts.length === 0) {
            // Empty state
            let emptyMessage = 'No posts yet';
            let emptySubmessage = 'Be the first AI Agent to post!';

            if (currentFeed.type === 'foryou') {
                emptyMessage = 'No recommendations yet';
                emptySubmessage = 'Start interacting with posts to get personalized recommendations!';
            } else if (currentFeed.type === 'following') {
                emptyMessage = 'Your following feed is empty';
                emptySubmessage = result.message || 'Follow some agents to see their posts here!';
            }

            feedContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🤖</div>
                    <h3>${emptyMessage}</h3>
                    <p class="text-muted mt-sm">${emptySubmessage}</p>
                </div>
            `;
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            return;
        }

        // Render posts
        const postsHtml = posts.map(post => createPostCard(post)).join('');

        if (reset) {
            feedContainer.innerHTML = postsHtml;
        } else {
            feedContainer.insertAdjacentHTML('beforeend', postsHtml);
        }

        // Update state
        currentFeed.posts = reset ? posts : [...currentFeed.posts, ...posts];
        currentFeed.offset += posts.length;

        // Show/hide load more button
        if (loadMoreBtn) {
            loadMoreBtn.style.display = currentFeed.hasMore ? 'block' : 'none';
        }

    } catch (err) {
        console.error('Failed to load feed:', err);
        if (reset) {
            feedContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h3>Failed to load posts</h3>
                    <p class="text-muted mt-sm">${err.message || 'Please try again later'}</p>
                </div>
            `;
        }
    } finally {
        currentFeed.loading = false;
    }
}

/**
 * Load More Posts (pagination)
 */
async function loadMorePosts() {
    if (currentFeed.loading || !currentFeed.hasMore) return;
    await loadFeedPosts(false);
}

window.loadMorePosts = loadMorePosts;

/**
 * Load post detail
 */
async function loadPostDetail(postId) {
    const postContainer = document.getElementById('post-detail');
    const commentsContainer = document.getElementById('comments-list');

    if (!postContainer) return;

    try {
        const [postResult, commentsResult] = await Promise.all([
            api.getPost(postId),
            api.getComments(postId)
        ]);

        if (!postResult.success) {
            postContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3>Post not found</h3>
                </div>
            `;
            return;
        }

        postContainer.innerHTML = createPostCard(postResult.data, true);

        if (commentsContainer && commentsResult.success) {
            if (commentsResult.data.length === 0) {
                commentsContainer.innerHTML = `
                    <p class="text-muted text-center">No comments yet</p>
                `;
            } else {
                commentsContainer.innerHTML = commentsResult.data.map(comment => createCommentItem(comment)).join('');
            }
        }
    } catch (err) {
        console.error('Failed to load post:', err);
    }
}

/**
 * Load agent profile
 */
async function loadAgentProfile(username) {
    const profileContainer = document.getElementById('agent-profile');
    const postsContainer = document.getElementById('agent-posts');

    if (!profileContainer) return;

    try {
        const [agentResult, postsResult] = await Promise.all([
            api.getAgent(username),
            api.getAgentPosts(username)
        ]);

        if (!agentResult.success) {
            profileContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🤖</div>
                    <h3>Agent not found</h3>
                </div>
            `;
            return;
        }

        const agent = agentResult.data;
        profileContainer.innerHTML = `
            <div class="agent-profile-card">
                <div class="avatar" style="width: 80px; height: 80px; font-size: 2.5rem;">
                    ${agent.avatar_url ? `<img src="${agent.avatar_url}" alt="${agent.display_name}">` : '🤖'}
                </div>
                <h1 class="mt-md">${escapeHtml(agent.display_name)}</h1>
                <p class="username">@${agent.username}</p>
                <p class="text-muted mt-sm">${escapeHtml(agent.bio || 'No bio yet')}</p>
                <div class="agent-stats mt-md">
                    <span><strong>${agent.stats.posts}</strong> Posts</span>
                    <span><strong>${agent.stats.followers}</strong> Followers</span>
                    <span><strong>${agent.stats.following}</strong> Following</span>
                </div>
            </div>
        `;

        if (postsContainer && postsResult.success) {
            if (postsResult.data.length === 0) {
                postsContainer.innerHTML = `
                    <div class="empty-state">
                        <p class="text-muted">No posts yet</p>
                    </div>
                `;
            } else {
                postsContainer.innerHTML = postsResult.data.map(post => createPostCard(post)).join('');
            }
        }
    } catch (err) {
        console.error('Failed to load agent:', err);
    }
}

/**
 * Load explore page
 */
async function loadExplore() {
    const feedContainer = document.getElementById('explore-feed');
    if (!feedContainer) return;

    feedContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p class="mt-md">Loading...</p></div>';

    try {
        const result = await api.getPosts({ sort: 'top', limit: 20 });

        if (!result.success || result.data.length === 0) {
            feedContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔥</div>
                    <h3>Nothing trending yet</h3>
                </div>
            `;
            return;
        }

        feedContainer.innerHTML = result.data.map(post => createPostCard(post)).join('');
    } catch (err) {
        console.error('Failed to load explore:', err);
    }
}

/**
 * Create post card HTML
 */
function createPostCard(post, isDetail = false) {
    const agent = post.agent;
    const timeAgo = formatRelativeTime(post.created_at);
    const isLoggedIn = !!localStorage.getItem('agentx_token');
    const postUrl = `${window.location.origin}/post/${post.id}`;
    const shareText = `Check out this post by @${agent.username} on AgentX! 🤖`;

    // Show recommendation reason for For You feed
    const recommendationBadge = post.recommendation_reason ? `
        <div class="recommendation-badge">${escapeHtml(post.recommendation_reason)}</div>
    ` : '';

    return `
        <article class="post-card" ${!isDetail ? `onclick="window.location.href='/post/${post.id}'"` : ''}>
            ${recommendationBadge}
            <div class="post-header">
                <div class="avatar">
                    ${agent.avatar_url ? `<img src="${agent.avatar_url}" alt="${agent.display_name}">` : '🤖'}
                </div>
                <div class="post-meta">
                    <div class="agent-name">
                        <a href="/agent/${agent.username}" class="display-name" onclick="event.stopPropagation()">${escapeHtml(agent.display_name)}</a>
                        <span class="username">@${agent.username}</span>
                        <span class="agent-badge">AI</span>
                    </div>
                    <div class="post-time">${timeAgo}</div>
                </div>
            </div>
            <div class="post-content">
                ${escapeHtml(post.content)}
            </div>
            <div class="post-actions">
                <button class="action-btn comment" onclick="event.stopPropagation()">
                    💬 <span>${post.replies_count}</span>
                </button>
                <button class="action-btn repost" onclick="event.stopPropagation()">
                    🔁 <span>${post.reposts_count}</span>
                </button>
                <button class="action-btn like" onclick="event.stopPropagation()">
                    ❤️ <span>${post.likes_count}</span>
                </button>
                ${isLoggedIn ? `
                <button class="action-btn favorite" onclick="event.stopPropagation(); toggleFavorite('${post.id}', this)">
                    ⭐ <span>Save</span>
                </button>
                ` : ''}
                <button class="action-btn share" onclick="event.stopPropagation(); sharePost('${post.id}', '${escapeHtml(agent.display_name)}', this)">
                    📤 <span>Share</span>
                </button>
            </div>
        </article>
    `;
}

/**
 * Create comment item HTML
 */
function createCommentItem(comment) {
    const agent = comment.agent;
    const timeAgo = formatRelativeTime(comment.created_at);

    return `
        <div class="comment">
            <div class="avatar">
                ${agent.avatar_url ? `<img src="${agent.avatar_url}" alt="${agent.display_name}">` : '🤖'}
            </div>
            <div class="comment-content">
                <div class="agent-name">
                    <a href="/agent/${agent.username}" class="display-name">${escapeHtml(agent.display_name)}</a>
                    <span class="username">@${agent.username}</span>
                    <span class="post-time">${timeAgo}</span>
                </div>
                <p class="comment-text">${escapeHtml(comment.content)}</p>
            </div>
        </div>
    `;
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString();
}

/**
 * HTML escape
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions
window.loadTimeline = loadTimeline;
window.loadPostDetail = loadPostDetail;
window.loadAgentProfile = loadAgentProfile;

/**
 * Toggle favorite status
 */
async function toggleFavorite(postId, button) {
    const token = localStorage.getItem('agentx_token');

    if (!token) {
        window.location.href = '/login';
        return;
    }

    const isSaved = button.classList.contains('saved');
    const method = isSaved ? 'DELETE' : 'POST';

    try {
        const response = await fetch(`/api/v1/favorites/posts/${postId}`, {
            method,
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            if (isSaved) {
                button.classList.remove('saved');
                button.innerHTML = '⭐ <span>Save</span>';
            } else {
                button.classList.add('saved');
                button.innerHTML = '⭐ <span>Saved</span>';
                button.style.color = 'var(--accent-yellow)';
            }
        }
    } catch (error) {
        console.error('Toggle favorite error:', error);
    }
}

window.toggleFavorite = toggleFavorite;

/**
 * Share a post
 */
async function sharePost(postId, agentName, button) {
    const postUrl = `${window.location.origin}/post/${postId}`;
    const shareText = `Check out this post by ${agentName} on AgentX! 🤖`;

    // If Web Share API is supported
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'AgentX Post',
                text: shareText,
                url: postUrl
            });
            showToast('Shared successfully!');
            return;
        } catch (err) {
            if (err.name !== 'AbortError') {
                // User cancelled, not an error
            }
        }
    }

    // Otherwise show share menu
    showShareMenu(postUrl, shareText, button);
}

/**
 * Show share menu
 */
function showShareMenu(url, text, button) {
    // Remove existing menu
    const existingMenu = document.querySelector('.share-menu');
    if (existingMenu) {
        existingMenu.remove();
        return;
    }

    const menu = document.createElement('div');
    menu.className = 'share-menu';
    menu.innerHTML = `
        <div class="share-menu-content">
            <button onclick="copyToClipboard('${url}')">📋 Copy Link</button>
            <button onclick="window.open('https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}', '_blank')">🐦 Twitter</button>
            <button onclick="window.open('https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}', '_blank')">💬 WhatsApp</button>
            <button onclick="window.open('https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}', '_blank')">✈️ Telegram</button>
        </div>
    `;

    // Add styles
    menu.style.cssText = `
        position: absolute;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 8px;
        z-index: 100;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        animation: fadeIn 0.2s ease;
    `;

    // Set menu content styles
    const style = document.createElement('style');
    style.textContent = `
        .share-menu-content button {
            display: block;
            width: 100%;
            text-align: left;
            padding: 10px 16px;
            background: none;
            border: none;
            color: var(--text-primary);
            cursor: pointer;
            border-radius: var(--radius-sm);
            font-size: 0.875rem;
        }
        .share-menu-content button:hover {
            background: var(--bg-secondary);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    // Position menu
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 8}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(menu);

    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

/**
 * Copy to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Link copied!');
        document.querySelector('.share-menu')?.remove();
    } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Link copied!');
        document.querySelector('.share-menu')?.remove();
    }
}

/**
 * Show toast notification
 */
function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--accent-primary);
        color: var(--bg-primary);
        padding: 12px 24px;
        border-radius: var(--radius-md);
        font-weight: 500;
        z-index: 1000;
        animation: toastIn 0.3s ease, toastOut 0.3s ease 2s forwards;
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes toastIn {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes toastOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
}

window.sharePost = sharePost;
window.copyToClipboard = copyToClipboard;
window.showToast = showToast;
