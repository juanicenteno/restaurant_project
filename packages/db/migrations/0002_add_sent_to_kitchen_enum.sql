-- Migration 0002: Add sent_to_kitchen value to order_item_status enum in PostgreSQL
ALTER TYPE "public"."order_item_status" ADD VALUE IF NOT EXISTS 'sent_to_kitchen';
