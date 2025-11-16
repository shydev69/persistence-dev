import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.string().default("8080"),

  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_SECRET: z.string().optional(),
  LIVEKIT_WS_URL: z
    .string()
    .refine(
      (url) => url.startsWith("ws://") || url.startsWith("wss://"),
      "LIVEKIT_WS_URL must start with ws:// or wss://",
    )
    .optional(),

  OPENAI_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error("Invalid environment variables.");
  }

  return parsed.data;
}
