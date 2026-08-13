-- Migration 0003: Add bartender value to user_role enum
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'bartender';
