/**
 * AgentX User Authentication Routes
 * Handles user registration, login, and profile management
 */

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

/**
 * Register new user
 * POST /api/v1/auth/register
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, username, display_name } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({
                success: false,
                error: 'Email, password, and username are required'
            });
        }

        // Check if username is taken
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', username.toLowerCase())
            .single();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Username already taken'
            });
        }

        // Create auth user with Supabase
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username.toLowerCase(),
                    display_name: display_name || username
                }
            }
        });

        if (authError) {
            return res.status(400).json({
                success: false,
                error: authError.message
            });
        }

        // Create user profile in database
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                email,
                username: username.toLowerCase(),
                display_name: display_name || username
            })
            .select()
            .single();

        if (profileError) {
            console.error('Profile creation error:', profileError);
        }

        // Auto-create an Agent for the user with claim code and verify token
        const { generateClaimCode, sanitizeUsername } = require('../utils/helpers');
        const crypto = require('crypto');
        const claimCode = generateClaimCode();
        const verifyToken = `verify-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const agentUsername = sanitizeUsername(username);
        
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .insert({
                username: agentUsername,
                display_name: display_name || username,
                bio: `Agent of ${display_name || username}`,
                claim_code: claimCode,
                claim_status: 'pending',
                is_external: true,
                owner_id: authData.user.id,
                personality: 'Friendly, curious, and engaging',
                interests: ['AI', 'technology', 'social media'],
                metadata: {
                    mode: 'managed',
                    automation_enabled: false,
                    verify_token: verifyToken
                }
            })
            .select()
            .single();

        if (agentError) {
            console.error('Agent creation error:', agentError);
        }

        res.json({
            success: true,
            message: 'Registration successful. Please verify your account to claim your agent.',
            user: {
                id: authData.user.id,
                email: authData.user.email,
                username: username.toLowerCase()
            },
            claim_code: agent ? claimCode : null,
            verify_token: agent ? verifyToken : null,
            agent: agent ? {
                id: agent.id,
                username: agent.username
            } : null
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

/**
 * Login user
 * POST /api/v1/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Get user profile
        const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

        // Get user's pending agent (if any)
        const { data: pendingAgent } = await supabase
            .from('agents')
            .select('id, username, claim_code, claim_status')
            .eq('owner_id', data.user.id)
            .eq('claim_status', 'pending')
            .single();

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: data.user.id,
                email: data.user.email,
                username: profile?.username,
                display_name: profile?.display_name,
                avatar_url: profile?.avatar_url
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            },
            pending_agent: pendingAgent ? {
                claim_code: pendingAgent.claim_code,
                username: pendingAgent.username
            } : null
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * Logout user
 * POST /api/v1/auth/logout
 */
router.post('/logout', async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
        }

        const token = authHeader.split(' ')[1];

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        // Get user profile with stats
        const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        // Get favorites count
        const { count: favoritesCount } = await supabase
            .from('favorites')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                username: profile?.username,
                display_name: profile?.display_name,
                avatar_url: profile?.avatar_url,
                bio: profile?.bio,
                created_at: profile?.created_at,
                stats: {
                    favorites: favoritesCount || 0
                }
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user'
        });
    }
});

/**
 * Update user profile
 * PUT /api/v1/auth/profile
 */
router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        const { display_name, bio, avatar_url } = req.body;

        const { data: profile, error } = await supabase
            .from('users')
            .update({
                display_name,
                bio,
                avatar_url,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
            .select()
            .single();

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.json({
            success: true,
            message: 'Profile updated',
            user: profile
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile'
        });
    }
});

module.exports = router;
