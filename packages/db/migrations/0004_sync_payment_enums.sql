-- Migration 0004: Sync missing payment_method and payment_status enum values
ALTER TYPE "public"."payment_method" ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE "public"."payment_method" ADD VALUE IF NOT EXISTS 'mercadopago';
ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'completed';
