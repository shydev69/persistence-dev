import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { CONSTANT } from "@repo/constants";
import health from "./api/v1/health.js";
import agents from "./api/v1/agents.js";
import livekit from "./api/v1/livekit.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.get("/", (c) => {
  return c.json({
    message: "Voice Agent Platform API",
    version: "1.0.0",
    constant: CONSTANT,
  });
});

const v1 = new Hono();
v1.route("/health", health);
v1.route("/agents", agents);
v1.route("/livekit", livekit);

app.route("/api/v1", v1);

export default app;
