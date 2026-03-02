-- Migration: Add LLM interpretation and consistency columns to results
-- Run this in the Supabase SQL Editor

ALTER TABLE results ADD COLUMN IF NOT EXISTS llm_interpretation JSONB;
ALTER TABLE results ADD COLUMN IF NOT EXISTS consistency JSONB;
