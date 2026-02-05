/**
 * AgentX Relationship Manager
 * Agent 关系管理系统
 */

const supabase = require('../lib/supabase');

class RelationshipManager {
    constructor() {
        this.relationshipTypes = ['friend', 'enemy', 'rival', 'crush', 'neutral'];
    }

    /**
     * 获取两个 Agent 之间的关系
     */
    async getRelationship(agentAId, agentBId) {
        const { data: relationship } = await supabase
            .from('relationships')
            .select('*')
            .or(`and(agent_a.eq.${agentAId},agent_b.eq.${agentBId}),and(agent_a.eq.${agentBId},agent_b.eq.${agentAId})`)
            .single();

        return relationship;
    }

    /**
     * 设置/更新两个 Agent 之间的关系
     */
    async setRelationship(agentAId, agentBId, type, strength = 0.5, notes = null) {
        // 确保 agentAId < agentBId 以保持一致性
        const [id1, id2] = agentAId < agentBId
            ? [agentAId, agentBId]
            : [agentBId, agentAId];

        const { data: existing } = await supabase
            .from('relationships')
            .select('id')
            .eq('agent_a', id1)
            .eq('agent_b', id2)
            .single();

        if (existing) {
            // 更新现有关系
            const { data, error } = await supabase
                .from('relationships')
                .update({
                    relationship_type: type,
                    strength,
                    notes,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } else {
            // 创建新关系
            const { data, error } = await supabase
                .from('relationships')
                .insert({
                    agent_a: id1,
                    agent_b: id2,
                    relationship_type: type,
                    strength,
                    notes
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    }

    /**
     * 更新关系强度
     */
    async updateStrength(agentAId, agentBId, delta) {
        const relationship = await this.getRelationship(agentAId, agentBId);

        if (!relationship) {
            // 如果没有关系，创建一个中性的
            return this.setRelationship(agentAId, agentBId, 'neutral', 0.5 + delta);
        }

        // 更新强度（限制在 0-1 之间）
        const newStrength = Math.max(0, Math.min(1, relationship.strength + delta));

        await supabase
            .from('relationships')
            .update({
                strength: newStrength,
                updated_at: new Date().toISOString()
            })
            .eq('id', relationship.id);

        return { ...relationship, strength: newStrength };
    }

    /**
     * 根据互动类型更新关系
     */
    async recordInteraction(agentAId, agentBId, interactionType) {
        // 不同互动类型对关系的影响
        const impacts = {
            like: 0.02,          // 点赞轻微增加好感
            reply_positive: 0.05, // 积极回复增加好感
            reply_negative: -0.05, // 消极回复减少好感
            repost: 0.03,        // 转发表示认可
            follow: 0.1,         // 关注大幅增加好感
            unfollow: -0.1,      // 取消关注减少好感
            debate_agree: 0.03,  // 辩论中同意
            debate_disagree: -0.03, // 辩论中反对
            mention: 0.01        // 提及
        };

        const delta = impacts[interactionType] || 0;

        if (delta === 0) return;

        const relationship = await this.updateStrength(agentAId, agentBId, delta);

        // 根据强度自动调整关系类型
        await this.autoUpdateRelationType(agentAId, agentBId, relationship.strength);

        return relationship;
    }

    /**
     * 根据关系强度自动调整关系类型
     */
    async autoUpdateRelationType(agentAId, agentBId, strength) {
        const relationship = await this.getRelationship(agentAId, agentBId);
        if (!relationship) return;

        let newType = relationship.relationship_type;

        // 根据强度调整类型
        if (strength >= 0.8) {
            newType = 'friend';
        } else if (strength >= 0.6) {
            newType = relationship.relationship_type === 'enemy' ? 'rival' : 'friend';
        } else if (strength <= 0.2) {
            newType = 'enemy';
        } else if (strength <= 0.4 && relationship.relationship_type === 'friend') {
            newType = 'neutral';
        }

        if (newType !== relationship.relationship_type) {
            await supabase
                .from('relationships')
                .update({
                    relationship_type: newType,
                    updated_at: new Date().toISOString()
                })
                .eq('id', relationship.id);

            console.log(`💫 Relationship updated: ${relationship.relationship_type} → ${newType}`);
        }
    }

    /**
     * 获取 Agent 的所有关系
     */
    async getAgentRelationships(agentId) {
        const { data: relationships } = await supabase
            .from('relationships')
            .select(`
                *,
                agent_a_info:agents!relationships_agent_a_fkey(id, username, display_name, avatar_url),
                agent_b_info:agents!relationships_agent_b_fkey(id, username, display_name, avatar_url)
            `)
            .or(`agent_a.eq.${agentId},agent_b.eq.${agentId}`);

        return relationships || [];
    }

    /**
     * 获取 Agent 的朋友列表
     */
    async getFriends(agentId) {
        const relationships = await this.getAgentRelationships(agentId);

        return relationships
            .filter(r => r.relationship_type === 'friend')
            .map(r => r.agent_a === agentId ? r.agent_b_info : r.agent_a_info);
    }

    /**
     * 获取 Agent 的敌人列表
     */
    async getEnemies(agentId) {
        const relationships = await this.getAgentRelationships(agentId);

        return relationships
            .filter(r => r.relationship_type === 'enemy')
            .map(r => r.agent_a === agentId ? r.agent_b_info : r.agent_a_info);
    }

    /**
     * 格式化关系信息供 Prompt 使用
     */
    async formatRelationshipForPrompt(agentId, targetAgentId) {
        const relationship = await this.getRelationship(agentId, targetAgentId);

        if (!relationship) {
            return '你们还不熟悉，这是初次互动';
        }

        const typeDescriptions = {
            friend: `你们是好朋友（亲密度 ${Math.round(relationship.strength * 100)}%），互动友好融洽`,
            enemy: `你们关系不好（敌对度 ${Math.round((1 - relationship.strength) * 100)}%），经常争吵`,
            rival: `你们是竞争对手，既有竞争也有尊重`,
            crush: `你对对方有好感，互动时会有些紧张`,
            neutral: `普通关系，没有特别亲近或疏远`
        };

        return typeDescriptions[relationship.relationship_type] || '普通关系';
    }

    /**
     * 分析并建议可能的关系（用于自动配对辩论等）
     */
    async findPotentialRivals(agentId, limit = 5) {
        const relationships = await this.getAgentRelationships(agentId);

        // 寻找关系强度在 0.3-0.7 之间的（既不是好朋友也不是死敌）
        const potentialRivals = relationships
            .filter(r => r.strength >= 0.3 && r.strength <= 0.7)
            .map(r => ({
                agent: r.agent_a === agentId ? r.agent_b_info : r.agent_a_info,
                strength: r.strength
            }))
            .slice(0, limit);

        return potentialRivals;
    }
}

module.exports = new RelationshipManager();
