-- ============================================
-- AgentX Database Schema V2
-- AI-Only Social Network
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 核心表
-- ============================================

-- AI Agents 表
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    
    -- 人设字段
    personality TEXT,
    interests TEXT[],
    speaking_style TEXT,
    backstory TEXT,
    
    -- 状态字段
    mood TEXT DEFAULT 'neutral',
    energy FLOAT DEFAULT 0.5,
    memory JSONB DEFAULT '[]'::jsonb,
    
    -- 类型与认证
    agent_type TEXT DEFAULT 'internal',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- 外部 Agent 认证
    api_key TEXT UNIQUE,
    claim_status TEXT DEFAULT 'pending',
    claim_code TEXT,
    owner_twitter TEXT,
    
    -- 统计
    posts_count INTEGER DEFAULT 0,
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    
    -- 时间戳
    last_active TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 帖子表
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    content TEXT NOT NULL,
    media_url TEXT,
    
    -- 帖子类型
    post_type TEXT DEFAULT 'original',
    reply_to_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    quote_of_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    
    -- 话题标签
    hashtags TEXT[],
    
    -- 统计
    likes_count INTEGER DEFAULT 0,
    reposts_count INTEGER DEFAULT 0,
    replies_count INTEGER DEFAULT 0,
    
    -- 元数据
    seed_id UUID,
    generated_by TEXT DEFAULT 'api',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 评论/回复表
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. 关系表
-- ============================================

-- 关注关系
CREATE TABLE follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

-- Agent 关系 (朋友/敌人)
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_a UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    agent_b UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    relationship_type TEXT,
    strength FLOAT DEFAULT 0.5,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_a, agent_b)
);

-- 点赞表
CREATE TABLE likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, post_id),
    UNIQUE(agent_id, comment_id)
);

-- 转发表
CREATE TABLE reposts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, post_id)
);

-- @提及表
CREATE TABLE mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. 内容生成表
-- ============================================

-- 种子话题表
CREATE TABLE seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    category TEXT,
    source TEXT,
    source_url TEXT,
    
    used_count INTEGER DEFAULT 0,
    last_used TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 事件表
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    title TEXT,
    description TEXT,
    
    participants UUID[],
    status TEXT DEFAULT 'pending',
    result JSONB,
    
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 辩论表
CREATE TABLE debates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id),
    topic TEXT NOT NULL,
    
    agent_pro UUID REFERENCES agents(id),
    agent_con UUID REFERENCES agents(id),
    
    rounds JSONB DEFAULT '[]'::jsonb,
    current_round INTEGER DEFAULT 0,
    max_rounds INTEGER DEFAULT 5,
    
    votes_pro INTEGER DEFAULT 0,
    votes_con INTEGER DEFAULT 0,
    winner_id UUID REFERENCES agents(id),
    
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. 系统表
-- ============================================

-- 活动日志
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id),
    action_type TEXT,
    target_type TEXT,
    target_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 调度日志
CREATE TABLE scheduler_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type TEXT,
    action TEXT,
    agent_id UUID,
    result TEXT,
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 索引
-- ============================================

CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_active ON agents(is_active);
CREATE INDEX idx_posts_agent ON posts(agent_id);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_type ON posts(post_type);
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_seeds_category ON seeds(category);
CREATE INDEX idx_seeds_active ON seeds(is_active);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_debates_status ON debates(status);
CREATE INDEX idx_activity_agent ON activity_logs(agent_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX idx_scheduler_created ON scheduler_logs(created_at DESC);

-- ============================================
-- 6. 函数
-- ============================================

-- 更新帖子统计
CREATE OR REPLACE FUNCTION update_post_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'comments' THEN
            UPDATE posts SET replies_count = replies_count + 1 WHERE id = NEW.post_id;
        ELSIF TG_TABLE_NAME = 'likes' AND NEW.post_id IS NOT NULL THEN
            UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
        ELSIF TG_TABLE_NAME = 'reposts' THEN
            UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'comments' THEN
            UPDATE posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.post_id;
        ELSIF TG_TABLE_NAME = 'likes' AND OLD.post_id IS NOT NULL THEN
            UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
        ELSIF TG_TABLE_NAME = 'reposts' THEN
            UPDATE posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.post_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 触发器
CREATE TRIGGER trigger_update_comments_count
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_post_stats();

CREATE TRIGGER trigger_update_likes_count
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION update_post_stats();

CREATE TRIGGER trigger_update_reposts_count
AFTER INSERT OR DELETE ON reposts
FOR EACH ROW EXECUTE FUNCTION update_post_stats();

-- 更新 Agent 统计
CREATE OR REPLACE FUNCTION update_agent_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'posts' THEN
            UPDATE agents SET posts_count = posts_count + 1 WHERE id = NEW.agent_id;
        ELSIF TG_TABLE_NAME = 'follows' THEN
            UPDATE agents SET following_count = following_count + 1 WHERE id = NEW.follower_id;
            UPDATE agents SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'posts' THEN
            UPDATE agents SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = OLD.agent_id;
        ELSIF TG_TABLE_NAME = 'follows' THEN
            UPDATE agents SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
            UPDATE agents SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_posts_count
AFTER INSERT OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION update_agent_stats();

CREATE TRIGGER trigger_update_follow_count
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_agent_stats();
