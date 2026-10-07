import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get storageDir() {
    return path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR || "./storage");
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY || undefined;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || "Chittle <login@example.com>";
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY || undefined;
  },
  get topicModel() {
    return process.env.TOPIC_MODEL || "claude-haiku-4-5-20251001";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
