import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@repo/db/client";
import { env } from "./env.js";

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
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [
        "http://localhost:3000",
        env.CLIENT_URL,
        ...(env.LOCAL_NETWORK_ORIGIN ? [env.LOCAL_NETWORK_ORIGIN] : []),
    ],
});

export type Auth = typeof auth;