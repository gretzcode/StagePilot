import { z } from "zod";

const environmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_WS_URL: z.string().default("ws://localhost:8787"),
  ENVIRONMENT: z.enum(["development", "preview", "production", "test"]).default("development"),
  JWT_SECRET: z.string().default("stagepilot_default_development_jwt_secret_32chars"),
});

export function getEnvironmentConfig() {
  return environmentSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8787",
    ENVIRONMENT: process.env.NODE_ENV === "test" ? "test" : (process.env.ENVIRONMENT || "development"),
    JWT_SECRET: process.env.JWT_SECRET || "stagepilot_default_development_jwt_secret_32chars",
  });
}

export const env = getEnvironmentConfig();
