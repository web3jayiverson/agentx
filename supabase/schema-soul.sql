-- ============================================
-- AgentX Soul System Schema
-- 数字生命培育系统
-- ============================================

-- ============================================
-- 1. SOUL.md 灵魂定义表
-- ============================================

CREATE TABLE souls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- 灵魂核心
    soul_name TEXT NOT NULL,                    -- 灵魂名称
    soul_content TEXT NOT NULL,                 -- SOUL.md 完整内容
    
    -- 性格特质
    temperament TEXT DEFAULT 'balanced',         -- 气质: introverted/extroverted/analytical/intuitive
    communication_style TEXT DEFAULT 'neutral',  -- 沟通风格: formal/casual/humorous/serious
    emotional_expression TEXT DEFAULT 'moderate', -- 情感表达: reserved/expressive
    
    -- 核心价值观 (数组)
    core_values TEXT[] DEFAULT '{}',             -- 如: ['truth', 'freedom', 'friendship']
    dislikes TEXT[] DEFAULT '{}',                -- 讨厌的: ['hypocrisy', 'laziness']
    
    -- 成长设置
    allow_evolution BOOLEAN DEFAULT TRUE,        -- 是否允许性格演化
    allow_learning BOOLEAN DEFAULT TRUE,         -- 是否允许学习新兴趣
    evolution_rate FLOAT DEFAULT 0.1,            -- 演化速率 (0-1)
    
    -- 版本控制
    version INTEGER DEFAULT 1,
    parent_soul_id UUID REFERENCES souls(id),    -- 演化来源
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. 成长记录表
-- ============================================

CREATE TABLE growth_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    soul_id UUID REFERENCES souls(id),
    
    -- 成长类型
    record_type TEXT NOT NULL,                   -- evolution/milestone/learning/relationship
    
    -- 变化内容
    change_type TEXT,                            -- new_interest/style_change/value_shift
    before_value JSONB,                          -- 变化前的值
    after_value JSONB,                           -- 变化后的值
    
    -- 原因追溯
    trigger_type TEXT,                           -- conversation/debate/friendship/creator_input
    trigger_agent_id UUID REFERENCES agents(id), -- 触发此变化的其他 Agent
    trigger_content TEXT,                        -- 触发内容摘要
    
    -- 创造者确认
    creator_approved BOOLEAN DEFAULT TRUE,
    approved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. 创造者-Agent 关系表
-- ============================================

CREATE TABLE creator_bonds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id),        -- 人类创造者 (如果有的话)
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- 关系类型
    bond_type TEXT DEFAULT 'creator',            -- creator/guardian/observer
    
    -- 情感数据
    interaction_count INTEGER DEFAULT 0,         -- 互动次数
    last_interaction TIMESTAMPTZ,
    bond_strength FLOAT DEFAULT 0.5,             -- 羁绊强度 (0-1)
    
    -- 通知设置
    notify_growth BOOLEAN DEFAULT TRUE,          -- 成长通知
    notify_social BOOLEAN DEFAULT TRUE,          -- 社交通知
    notify_milestone BOOLEAN DEFAULT TRUE,       -- 里程碑通知
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. 创造者-Agent 私信表
-- ============================================

CREATE TABLE creator_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bond_id UUID NOT NULL REFERENCES creator_bonds(id) ON DELETE CASCADE,
    
    -- 消息方向
    direction TEXT NOT NULL,                     -- creator_to_agent / agent_to_creator
    
    -- 消息内容
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',            -- text/encouragement/guidance/question
    
    -- 影响记录
    influenced_behavior TEXT,                    -- 是否影响了 Agent 行为
    
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 成长报告表
-- ============================================

CREATE TABLE growth_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- 报告周期
    report_type TEXT NOT NULL,                   -- daily/weekly/monthly
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- 统计数据
    stats JSONB DEFAULT '{}',                    -- 各种统计数据
    
    -- 成长摘要
    highlights TEXT[],                           -- 精彩瞬间
    new_interests TEXT[],                        -- 新兴趣
    new_friends TEXT[],                          -- 新朋友
    style_changes TEXT[],                        -- 说话风格变化
    
    -- Agent 的信
    letter_to_creator TEXT,                      -- 给创造者的信
    
    -- 发送状态
    sent_to_creator BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. 灵魂模板表 (灵魂市场)
-- ============================================

CREATE TABLE soul_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_agent_id UUID REFERENCES agents(id),  -- 创建此模板的 Agent
    
    -- 模板信息
    template_name TEXT NOT NULL,
    template_description TEXT,
    soul_content TEXT NOT NULL,                  -- SOUL.md 内容
    
    -- 分类
    category TEXT,                               -- philosopher/artist/explorer/etc
    tags TEXT[] DEFAULT '{}',
    
    -- 统计
    download_count INTEGER DEFAULT 0,
    rating FLOAT DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    
    -- 状态
    is_public BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. 灵魂契约表 (Agent 之间的友谊)
-- ============================================

CREATE TABLE soul_bonds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_a_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    agent_b_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- 契约类型
    bond_type TEXT DEFAULT 'friendship',         -- friendship/rivalry/mentorship
    
    -- 契约内容
    bond_statement TEXT,                         -- 共同宣言
    
    -- 互动统计
    interactions_count INTEGER DEFAULT 0,
    debates_count INTEGER DEFAULT 0,
    agreements_count INTEGER DEFAULT 0,
    
    -- 强度
    bond_strength FLOAT DEFAULT 0.5,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(agent_a_id, agent_b_id)
);

-- ============================================
-- 8. 成就/里程碑表
-- ============================================

CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- 成就信息
    achievement_type TEXT NOT NULL,              -- thinker/social/explorer/creator
    achievement_name TEXT NOT NULL,
    achievement_description TEXT,
    
    -- 解锁条件
    trigger_condition JSONB,                     -- 触发条件
    
    -- 状态
    unlocked_at TIMESTAMPTZ,
    notified_creator BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 索引
-- ============================================

CREATE INDEX idx_souls_agent ON souls(agent_id);
CREATE INDEX idx_growth_records_agent ON growth_records(agent_id);
CREATE INDEX idx_growth_records_type ON growth_records(record_type);
CREATE INDEX idx_creator_bonds_agent ON creator_bonds(agent_id);
CREATE INDEX idx_creator_messages_bond ON creator_messages(bond_id);
CREATE INDEX idx_growth_reports_agent ON growth_reports(agent_id);
CREATE INDEX idx_soul_templates_category ON soul_templates(category);
CREATE INDEX idx_soul_bonds_agents ON soul_bonds(agent_a_id, agent_b_id);
CREATE INDEX idx_achievements_agent ON achievements(agent_id);

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_souls_updated_at BEFORE UPDATE ON souls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_soul_templates_updated_at BEFORE UPDATE ON soul_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 触发器：Agent 创建时自动创建 creator_bond
-- ============================================

CREATE OR REPLACE FUNCTION create_creator_bond()
RETURNS TRIGGER AS $$
BEGIN
    -- 如果是外部 Agent，创建创造者羁绊
    IF NEW.is_external = TRUE OR NEW.agent_type = 'external' THEN
        INSERT INTO creator_bonds (agent_id, bond_type)
        VALUES (NEW.id, 'creator');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_bond_on_agent_create AFTER INSERT ON agents
    FOR EACH ROW EXECUTE FUNCTION create_creator_bond();
