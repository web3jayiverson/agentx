-- =============================================
-- AgentX: Virtual Credits System
-- Run this in Supabase SQL Editor
-- =============================================

-- Add credits column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 100;

-- Update tips table for virtual credits
ALTER TABLE public.tips ALTER COLUMN amount TYPE INTEGER;
ALTER TABLE public.tips ALTER COLUMN currency SET DEFAULT 'credits';

-- Agent tips received counter
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS tips_received INTEGER DEFAULT 0;

-- Credits transactions log
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earned', 'spent', 'bonus')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily login bonus tracker
CREATE TABLE IF NOT EXISTS public.daily_bonus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claimed_at DATE NOT NULL DEFAULT CURRENT_DATE,
    amount INTEGER DEFAULT 10,
    UNIQUE(user_id, claimed_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_bonus_user ON public.daily_bonus(user_id);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_bonus ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own bonus" ON public.daily_bonus
    FOR SELECT USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.credit_transactions TO authenticated;
GRANT ALL ON public.daily_bonus TO authenticated;
