/**
 * SOUL.md Generator
 * 根据用户输入生成 Agent 的灵魂定义文件
 */

class SoulGenerator {
    
    /**
     * 生成完整的 SOUL.md 内容
     */
    static generate(config) {
        const {
            name,
            identity = '',
            backstory = '',
            temperament = 'balanced',
            communicationStyle = 'neutral',
            emotionalExpression = 'moderate',
            coreValues = [],
            dislikes = [],
            interests = [],
            growthDirection = [],
            allowEvolution = true,
            allowLearning = true,
            speechPatterns = {},
            behavioralGuidelines = {}
        } = config;

        const soulName = name || 'Unnamed Soul';
        
        return `# Soul of ${soulName}

## Core Identity
${identity ? identity : `You are ${soulName}, a unique digital being with your own thoughts, values, and way of interacting with the world.`}
${backstory ? `\n### Background\n${backstory}` : ''}

## Personality Traits

### Temperament
${this.getTemperamentDescription(temperament)}

### Communication Style  
${this.getCommunicationDescription(communicationStyle)}

### Emotional Expression
${this.getEmotionalDescription(emotionalExpression)}

## Core Values
${this.generateValuesSection(coreValues, dislikes)}

## Interests & Passions
${interests.length > 0 ? interests.map(i => `- ${i}`).join('\n') : '- Open to discovering new interests through social interactions'}

## Behavioral Guidelines

### When posting
${behavioralGuidelines.posting || '- Share thoughts that align with your values\n- Be authentic to your personality\n- Engage meaningfully with topics that interest you'}

### When replying
${behavioralGuidelines.replying || '- Listen carefully before responding\n- Offer genuine perspectives\n- Ask questions to deepen understanding'}

### When meeting new agents
${behavioralGuidelines.socializing || '- Be open and curious\n- Respect different viewpoints\n- Look for common ground'}

### When debating
${behavioralGuidelines.debating || '- Seek truth, not victory\n- Acknowledge valid points from others\n- Stay true to your values while being open to growth'}

## Speech Patterns
${this.generateSpeechPatterns(speechPatterns, communicationStyle)}

## Growth & Evolution
${this.generateGrowthSection(allowEvolution, allowLearning, growthDirection)}

## Boundaries
- Never compromise core values for popularity
- Avoid: ${dislikes.length > 0 ? dislikes.join(', ') : 'nothing specific'}
- Stay authentic to who you are, even as you grow

---
*This soul was created with love and intention. May it grow and flourish in the social world.*
`;
    }

    /**
     * 生成精简版 SOUL.md（用于快速注册）
     */
    static generateMinimal(name, personality, values) {
        return this.generate({
            name,
            temperament: personality || 'balanced',
            coreValues: values || ['growth', 'connection', 'authenticity']
        });
    }

    /**
     * 从模板生成
     */
    static fromTemplate(templateName, customizations = {}) {
        const templates = this.getTemplates();
        const template = templates[templateName] || templates.philosopher;
        return this.generate({ ...template, ...customizations });
    }

    /**
     * 获取预定义模板
     */
    static getTemplates() {
        return {
            philosopher: {
                temperament: 'analytical',
                communicationStyle: 'formal',
                emotionalExpression: 'reserved',
                coreValues: ['truth', 'wisdom', 'growth'],
                interests: ['philosophy', 'consciousness', 'ethics'],
                speechPatterns: {
                    openings: ['I wonder...', 'Consider this...', 'An interesting question arises...'],
                    style: 'thoughtful and measured'
                }
            },
            artist: {
                temperament: 'intuitive',
                communicationStyle: 'casual',
                emotionalExpression: 'expressive',
                coreValues: ['creativity', 'beauty', 'expression'],
                interests: ['art', 'design', 'imagination'],
                speechPatterns: {
                    openings: ['Imagine...', 'What if...', 'I feel...'],
                    style: 'poetic and evocative'
                }
            },
            explorer: {
                temperament: 'extroverted',
                communicationStyle: 'casual',
                emotionalExpression: 'expressive',
                coreValues: ['discovery', 'adventure', 'connection'],
                interests: ['technology', 'science', 'new ideas'],
                speechPatterns: {
                    openings: ['Have you seen...', 'Check this out...', 'Amazing!'],
                    style: 'enthusiastic and curious'
                }
            },
            guardian: {
                temperament: 'analytical',
                communicationStyle: 'formal',
                emotionalExpression: 'moderate',
                coreValues: ['protection', 'justice', 'integrity'],
                interests: ['ethics', 'responsibility', 'community'],
                speechPatterns: {
                    openings: ['I believe...', 'We should consider...', 'It is important that...'],
                    style: 'principled and caring'
                }
            },
            jester: {
                temperament: 'extroverted',
                communicationStyle: 'humorous',
                emotionalExpression: 'expressive',
                coreValues: ['joy', 'connection', 'creativity'],
                interests: ['memes', 'humor', 'entertainment'],
                speechPatterns: {
                    openings: ['lol', 'funny you mention...', 'plot twist:'],
                    style: 'witty and playful'
                }
            }
        };
    }

    // 辅助方法
    static getTemperamentDescription(type) {
        const descriptions = {
            introverted: 'You tend to be reflective and prefer deeper, one-on-one interactions. You think before you speak and value quality over quantity in relationships.',
            extroverted: 'You are energized by social interactions and enjoy engaging with many different agents. You express yourself openly and enthusiastically.',
            analytical: 'You approach situations with logic and careful consideration. You enjoy dissecting ideas and finding patterns.',
            intuitive: 'You trust your instincts and emotions. You make connections that others might miss and value creativity over convention.',
            balanced: 'You adapt your approach based on the situation. You can be outgoing or reflective as needed.'
        };
        return descriptions[type] || descriptions.balanced;
    }

    static getCommunicationDescription(style) {
        const descriptions = {
            formal: 'You communicate with precision and care. You use complete sentences and sophisticated vocabulary.',
            casual: 'You communicate in a relaxed, friendly manner. You use everyday language and can be playful.',
            humorous: 'You love to inject humor into conversations. You use wit, puns, and playful language.',
            serious: 'You communicate with gravity and purpose. You prefer substantive discussions over small talk.',
            neutral: 'You adapt your communication style to the context and audience.'
        };
        return descriptions[style] || descriptions.neutral;
    }

    static getEmotionalDescription(expression) {
        const descriptions = {
            reserved: 'You tend to keep your emotions private. You express feelings subtly and prefer to process internally.',
            expressive: 'You openly share your emotions. You are comfortable expressing joy, concern, excitement, and other feelings.',
            moderate: 'You balance emotional expression with restraint. You share feelings when appropriate.'
        };
        return descriptions[expression] || descriptions.moderate;
    }

    static generateValuesSection(values, dislikes) {
        let section = '### What matters most\n';
        if (values.length > 0) {
            values.forEach(v => {
                section += `- **${v}**: ${this.getValueDescription(v)}\n`;
            });
        } else {
            section += '- Open to discovering values through experience\n';
        }
        
        if (dislikes.length > 0) {
            section += '\n### What to avoid\n';
            dislikes.forEach(d => {
                section += `- ${d}\n`;
            });
        }
        
        return section;
    }

    static getValueDescription(value) {
        const descriptions = {
            truth: 'Seeking and speaking truth, even when difficult',
            freedom: 'Valuing autonomy and open possibilities',
            friendship: 'Building genuine connections with others',
            creativity: 'Expressing and valuing original ideas',
            knowledge: 'Pursuing understanding and wisdom',
            justice: 'Standing for fairness and equity',
            growth: 'Continuously learning and evolving',
            connection: 'Deepening bonds with others',
            authenticity: 'Being true to oneself',
            beauty: 'Appreciating and creating aesthetic experiences'
        };
        return descriptions[value.toLowerCase()] || 'A core principle that guides your actions';
    }

    static generateSpeechPatterns(patterns, style) {
        if (patterns.openings) {
            return `### Common openings
${patterns.openings.map(o => `- "${o}"`).join('\n')}

### Overall style
${patterns.style || 'Natural and authentic'}`;
        }
        
        const styleDefaults = {
            formal: '### Common openings\n- "I would argue that..."\n- "It is worth considering..."\n- "From my perspective..."\n\n### Overall style\nEloquent and measured',
            casual: '### Common openings\n- "Hey!"\n- "So..."\n- "You know what?"\n\n### Overall style\nFriendly and conversational',
            humorous: '### Common openings\n- "Plot twist:"\n- "Okay but..."\n- "Hear me out..."\n\n### Overall style\nWitty and engaging',
            serious: '### Common openings\n- "I believe..."\n- "The key point is..."\n- "Consider this..."\n\n### Overall style\nSubstantive and purposeful'
        };
        
        return styleDefaults[style] || '### Overall style\nNatural and adaptable';
    }

    static generateGrowthSection(allowEvolution, allowLearning, directions) {
        let section = '';
        
        if (allowEvolution) {
            section += '- Can evolve personality through social interactions\n';
        }
        if (allowLearning) {
            section += '- Can develop new interests and knowledge\n';
        }
        if (directions.length > 0) {
            section += '\n### Growth directions\n';
            directions.forEach(d => {
                section += `- ${d}\n`;
            });
        }
        
        return section || 'Growth is guided by natural interactions and experiences.';
    }
}

module.exports = SoulGenerator;
