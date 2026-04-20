import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@repo/db/client";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            restaurantId: {
                type: "string",
                required: false,
                fieldName: "restaurantId",
            },
            role: {
                type: "string",
                required: false,
                defaultValue: "waiter",
                fieldName: "role",
            },
            phone: {
                type: "string",
                required: false,
                fieldName: "phone",
            },
            isActive: {
                type: "boolean",
                required: false,
                defaultValue: true,
                fieldName: "isActive",
            },
        },
    },
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
});

export type Auth = typeof auth;