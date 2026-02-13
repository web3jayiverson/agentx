/**
 * AgentX LLM Client
 * 支持 Gemini、Groq (免费 Llama 3) 和 OpenAI
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

class LLMClient {
    constructor() {
        this.provider = process.env.LLM_PROVIDER || 'groq';  // 默认使用免费的 Groq
        this.initialized = false;
        this.client = null;
        this.model = null;
    }

    /**
     * 初始化 LLM 客户端
     */
    initialize() {
        if (this.initialized) return;

        if (this.provider === 'groq') {
            // Groq - 免费的 Llama 3 API
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) {
                console.error('❌ GROQ_API_KEY not found in environment');
                console.log('   Get your free API key at: https://console.groq.com/keys');
                return;
            }

            this.client = new Groq({ apiKey });
            this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
            console.log(`✅ Groq LLM initialized with model: ${this.model}`);

        } else if (this.provider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.error('❌ GEMINI_API_KEY not found in environment');
                return;
            }

            this.client = new GoogleGenerativeAI(apiKey);
            const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
            this.model = this.client.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.9,
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 256,
                }
            });
            console.log(`✅ Gemini LLM initialized with model: ${modelName}`);

        } else if (this.provider === 'openai') {
            // OpenAI 实现
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                console.error('❌ OPENAI_API_KEY not found in environment');
                return;
            }
            // 使用动态导入避免必须安装 openai 包
            this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
            this.apiKey = apiKey;
            this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
            console.log(`✅ OpenAI LLM initialized with model: ${this.model}`);
        }

        this.initialized = true;
    }

    /**
     * 生成文本
     * @param {string} prompt - 提示词
     * @param {object} options - 可选配置
     * @returns {Promise<string>} - 生成的文本
     */
    async generate(prompt, options = {}) {
        if (!this.initialized) {
            this.initialize();
        }

        if (!this.client) {
            throw new Error('LLM client not initialized');
        }

        try {
            const startTime = Date.now();

            if (this.provider === 'groq') {
                // Groq 使用 OpenAI 兼容的 API
                const completion = await this.client.chat.completions.create({
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    model: this.model,
                    temperature: 0.9,
                    max_tokens: 256,
                    top_p: 0.95,
                });

                const text = completion.choices[0]?.message?.content?.trim() || '';
                const duration = Date.now() - startTime;
                console.log(`🤖 LLM generated (${duration}ms): ${text.substring(0, 50)}...`);

                return text;

            } else if (this.provider === 'gemini') {
                const result = await this.model.generateContent(prompt);
                const response = result.response;
                const text = response.text().trim();

                const duration = Date.now() - startTime;
                console.log(`🤖 LLM generated (${duration}ms): ${text.substring(0, 50)}...`);

                return text;

            } else if (this.provider === 'openai') {
                // OpenAI API 调用
                const response = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.9,
                        max_tokens: 256,
                        top_p: 0.95
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'OpenAI API error');
                }

                const data = await response.json();
                const text = data.choices[0]?.message?.content?.trim() || '';

                const duration = Date.now() - startTime;
                console.log(`🤖 LLM generated (${duration}ms): ${text.substring(0, 50)}...`);

                return text;
            }

            throw new Error(`Unknown provider: ${this.provider}`);

        } catch (error) {
            console.error('❌ LLM generation failed:', error.message);
            throw error;
        }
    }

    /**
     * 生成数字选择（用于决策）
     */
    async generateChoice(prompt, maxChoice = 4) {
        const response = await this.generate(prompt);
        const num = parseInt(response.replace(/\D/g, ''));

        if (isNaN(num) || num < 0 || num > maxChoice) {
            return 0; // 默认返回 0（不选择）
        }

        return num;
    }

    /**
     * 检查 LLM 是否可用
     */
    async healthCheck() {
        try {
            const response = await this.generate('Say "OK" if you can read this.');
            return response.toLowerCase().includes('ok');
        } catch (error) {
            return false;
        }
    }
}

// 单例模式
const llmClient = new LLMClient();

module.exports = llmClient;
