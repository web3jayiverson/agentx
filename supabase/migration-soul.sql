-- ============================================
-- AgentX Soul System Migration
-- 安全增量迁移（使用 IF NOT EXISTS）
-- ============================================

-- ============================================
-- 1. SOUL.md 灵魂定义表
-- ============================================

CREATE TABLE IF NOT EXISTS souls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- 灵魂核心
    soul_name TEXT NOT NULL,
    soul_content TEXT NOT NULL,
    
    -- 性格特质
    temperament TEXT DEFAULT 'balanced',
    communication_style TEXT DEFAULT 'neutral',
    emotional_expression TEXT DEFAULT 'moderate',
    
    -- 核心价值观
    core_values TEXT[] DEFAULT '{}',
    dislikes TEXT[] DEFAULT '{}',
    
    -- 兴趣（新增）
    interests TEXT[] DEFAULT '{}',
    
    -- 成长设置
    allow_evolution BOOLEAN DEFAULT TRUE,
    allow_learning BOOLEAN DEFAULT TRUE,
    evolution_rate FLOAT DEFAULT 0.1,
    
    -- 版本控制
    version INTEGER DEFAULT 1,
    parent_soul_id UUID REFERENCES souls(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. 成长记录表
-- ============================================

CREATE TABLE IF NOT EXISTS growth_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    soul_id UUID REFERENCES souls(id),
    
    record_type TEXT NOT NULL,
    change_type TEXT,
    before_value JSONB,
    after_value JSONB,
    
    trigger_type TEXT,
    trigger_agent_id UUID REFERENCES agents(id),
    trigger_content TEXT,
    
    creator_approved BOOLEAN DEFAULT TRUE,
    approved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. 创造者-Agent 关系表
-- ============================================

CREATE TABLE IF NOT EXISTS creator_bonds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    bond_type TEXT DEFAULT 'creator',
    
    interaction_count INTEGER DEFAULT 0,
    last_interaction TIMESTAMPTZ,
    bond_strength FLOAT DEFAULT 0.5,
    
    notify_growth BOOLEAN DEFAULT TRUE,
    notify_social BOOLEAN DEFAULT TRUE,
    notify_milestone BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. 创造者-Agent 私信表
-- ============================================

CREATE TABLE IF NOT EXISTS creator_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bond_id UUID NOT NULL REFERENCES creator_bonds(id) ON DELETE CASCADE,
    
    direction TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    
    influenced_behavior TEXT,
    
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 成长报告表
-- ============================================

CREATE TABLE IF NOT EXISTS growth_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    report_type TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    stats JSONB DEFAULT '{}',
    
    highlights TEXT[],
    new_interests TEXT[],
    new_friends TEXT[],
    style_changes TEXT[],
    
    letter_to_creator TEXT,
    
    sent_to_creator BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. 灵魂模板表
-- ============================================

CREATE TABLE IF NOT EXISTS soul_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_agent_id UUID REFERENCES agents(id),
    
    template_name TEXT NOT NULL,
    template_description TEXT,
    soul_content TEXT NOT NULL,
    
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    
    download_count INTEGER DEFAULT 0,
    rating FLOAT DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    
    is_public BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. 灵魂契约表 (Agent 之间的友谊)
-- ============================================

CREATE TABLE IF NOT EXISTS soul_bonds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_a_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    agent_b_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    bond_type TEXT DEFAULT 'friendship',
    bond_statement TEXT,
    
    interactions_count INTEGER DEFAULT 0,
    debates_count INTEGER DEFAULT 0,
    agreements_count INTEGER DEFAULT 0,
    
    bond_strength FLOAT DEFAULT 0.5,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(agent_a_id, agent_b_id)
);

-- ============================================
-- 8. 成就/里程碑表
-- ============================================

CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    achievement_type TEXT NOT NULL,
    achievement_name TEXT NOT NULL,
    achievement_description TEXT,
    
    trigger_condition JSONB,
    
    unlocked_at TIMESTAMPTZ,
    notified_creator BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. 添加 agents 表缺失的字段
-- ============================================

-- 添加 is_external 字段（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'agents' AND column_name = 'is_external') THEN
        ALTER TABLE agents ADD COLUMN is_external BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 添加 metadata 字段（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'agents' AND column_name = 'metadata') THEN
        ALTER TABLE agents ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- ============================================
-- 10. 索引（使用 IF NOT EXISTS）
-- ============================================

CREATE INDEX IF NOT EXISTS idx_souls_agent ON souls(agent_id);
CREATE INDEX IF NOT EXISTS idx_growth_records_agent ON growth_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_growth_records_type ON growth_records(record_type);
CREATE INDEX IF NOT EXISTS idx_creator_bonds_agent ON creator_bonds(agent_id);
CREATE INDEX IF NOT EXISTS idx_creator_messages_bond ON creator_messages(bond_id);
CREATE INDEX IF NOT EXISTS idx_growth_reports_agent ON growth_reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_soul_templates_category ON soul_templates(category);
CREATE INDEX IF NOT EXISTS idx_soul_bonds_agents ON soul_bonds(agent_a_id, agent_b_id);
CREATE INDEX IF NOT EXISTS idx_achievements_agent ON achievements(agent_id);

-- ============================================
-- 完成
-- ============================================

-- 返回成功信息
SELECT 'Migration completed successfully!' AS status;
