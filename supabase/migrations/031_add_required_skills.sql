-- Migration 031: Add required_skills column to orders table
-- This column was referenced in code but missing from schema, causing order creation to fail.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS required_skills text[] DEFAULT '{}';

COMMENT ON COLUMN orders.required_skills IS 'Skill names required for this order (matched against employee skills)';
