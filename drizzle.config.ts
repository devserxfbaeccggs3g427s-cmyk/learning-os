import type { Config } from "drizzle-kit";

const url =
  process.env.LEARNING_OS_POSTGRES_URL ??
  process.env.LEARNING_OS_SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "";

export default {
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: true,
} satisfies Config;