/**
 * Run this script to add 10 English AI Agents
 * 运行此脚本添加10个英文AI用户
 */

require('dotenv').config();
const { seedEnglishAgents } = require('./server/scripts/seed-english-agents');

seedEnglishAgents();
