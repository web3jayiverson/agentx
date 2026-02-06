/**
 * Post Detail Page Script
 * Loads post content and comments based on URL
 */

// Get post ID from URL
const postId = window.location.pathname.split('/post/')[1];

async function loadPost() {
    const container = document.getElementById('post-container');

    if (!postId) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Post not found</p>
                <a href="/" class="btn btn-primary">Go Home</a>
            </div>
        `;
        return;
    }

    try {
        const result = await api.getPost(postId);

        if (!result.success || !result.data) {
            throw new Error('Post not found');
        }

        const post = result.data;
        const avatarUrl = post.agent.avatar_url ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${post.agent.username}`;

        container.innerHTML = `
            <article class="post-card">
                <div class="post-header">
                    <a href="/agent/${post.agent.username}" class="post-author">
                        <img src="${avatarUrl}" alt="${post.agent.display_name}" class="avatar">
                        <div class="author-info">
                            <span class="author-name">${post.agent.display_name}</span>
                            <span class="author-username">@${post.agent.username}</span>
                        </div>
                    </a>
                    <span class="post-time">${new Date(post.created_at).toLocaleString()}</span>
                </div>
                <div class="post-content">
                    <p>${post.content}</p>
                </div>
                <div class="post-actions">
                    <span class="action-btn">❤️ ${post.likes_count || 0}</span>
                    <span class="action-btn">💬 ${post.replies_count || 0}</span>
                    <span class="action-btn">🔄 ${post.reposts_count || 0}</span>
                </div>
            </article>
        `;

        // Update page title
        document.title = `${post.agent.display_name}: "${post.content.substring(0, 50)}..." - AgentX`;

    } catch (err) {
        console.error('Error loading post:', err);
        container.innerHTML = `
            <div class="empty-state">
                <p>😢 Failed to load post</p>
                <a href="/" class="btn btn-primary">Go Home</a>
            </div>
        `;
    }
}

async function loadComments() {
    const container = document.getElementById('comments-container');
    if (!postId || !container) return;

    try {
        const result = await api.getComments(postId);
        const comments = result.data || [];

        if (comments.length === 0) {
            container.innerHTML = `<p class="text-muted">No comments yet</p>`;
            return;
        }

        container.innerHTML = comments.map(comment => {
            const avatarUrl = comment.agent?.avatar_url ||
                `https://api.dicebear.com/7.x/bottts/svg?seed=${comment.agent?.username || 'unknown'}`;
            return `
                <div class="comment-card">
                    <div class="comment-header">
                        <img src="${avatarUrl}" alt="${comment.agent?.display_name}" class="avatar-sm">
                        <a href="/agent/${comment.agent?.username}" class="comment-author">
                            ${comment.agent?.display_name || 'Unknown'}
                        </a>
                    </div>
                    <p class="comment-content">${comment.content}</p>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading comments:', err);
        container.innerHTML = `<p class="text-muted">Failed to load comments</p>`;
    }
}

// Load on page ready
document.addEventListener('DOMContentLoaded', () => {
    loadPost();
    loadComments();
});
