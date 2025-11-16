import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../../db/connection.js";
import { voiceAgents, agentSessions } from "../../db/schema/index.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { clerkAuth, requireAuth } from "../../middleware/auth.js";

const app = new Hono();

app.use("*", clerkAuth);

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  instructions: z.string().min(1),
  llmTemperature: z.number().min(0).max(2).optional(),
  llmMaxTokens: z.number().min(1).max(10000).optional(),
  sttLanguage: z.string().optional(),
});

const updateAgentSchema = createAgentSchema.partial();

const querySchema = z.object({
  page: z.string().transform(Number).pipe(z.number().min(1)).default(1),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(100))
    .default(20),
  search: z.string().optional(),
  provider: z.enum(["openai"]).optional(),
});

app.get("/", zValidator("query", querySchema), async (c) => {
  try {
    const user = requireAuth(c);
    if (!user) return;

    const { page, limit, provider } = c.req.valid("query");
    const db = getDb();
    const userId = user.userId;

    let whereConditions = [eq(voiceAgents.userId, userId)];

    if (provider) {
      whereConditions.push(eq(voiceAgents.llmProvider, provider));
    }

    const offset = (page - 1) * limit;
    const agents = await db
      .select({
        id: voiceAgents.id,
        name: voiceAgents.name,
        description: voiceAgents.description,
        llmProvider: voiceAgents.llmProvider,
        llmModel: voiceAgents.llmModel,
        sttProvider: voiceAgents.sttProvider,
        sttModel: voiceAgents.sttModel,
        ttsProvider: voiceAgents.ttsProvider,
        ttsModel: voiceAgents.ttsModel,
        targetLatency: voiceAgents.targetLatency,
        createdAt: voiceAgents.createdAt,
        updatedAt: voiceAgents.updatedAt,
        sessionCount: sql<number>`(
          SELECT COUNT(*) FROM agent_sessions
          WHERE agent_sessions.agent_id = voice_agents.id
        )`,
      })
      .from(voiceAgents)
      .where(and(...whereConditions))
      .orderBy(desc(voiceAgents.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(voiceAgents)
      .where(and(...whereConditions));

    return c.json({
      data: agents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const user = requireAuth(c);
    if (!user) return;

    const id = c.req.param("id");
    const db = getDb();
    const userId = user.userId;

    const [agent] = await db
      .select()
      .from(voiceAgents)
      .where(and(eq(voiceAgents.id, id), eq(voiceAgents.userId, userId)));

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const recentSessions = await db
      .select({
        id: agentSessions.id,
        status: agentSessions.status,
        totalDuration: agentSessions.totalDuration,
        avgLatency: agentSessions.avgLatency,
        messageCount: agentSessions.messageCount,
        startedAt: agentSessions.startedAt,
        endedAt: agentSessions.endedAt,
      })
      .from(agentSessions)
      .where(eq(agentSessions.agentId, id))
      .orderBy(desc(agentSessions.startedAt))
      .limit(10);

    return c.json({
      ...agent,
      recentSessions,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/", zValidator("json", createAgentSchema), async (c) => {
  try {
    const user = requireAuth(c);
    if (!user) return;

    const agentData = c.req.valid("json");
    const db = getDb();
    const userId = user.userId;

    const [newAgent] = await db
      .insert(voiceAgents)
      .values({
        name: agentData.name,
        description: agentData.description,
        instructions: agentData.instructions,
        llmProvider: "openai",
        llmModel: "gpt-4o-mini",
        llmTemperature: agentData.llmTemperature ?? 0.7,
        llmMaxTokens: agentData.llmMaxTokens ?? 1000,
        sttProvider: "deepgram",
        sttModel: "nova-3",
        sttLanguage: agentData.sttLanguage ?? "en",
        ttsProvider: "elevenlabs",
        ttsVoice: "rachel",
        ttsModel: "eleven_turbo_v2_5",
        targetLatency: 1000,
        livekitAgentName: "CA_E2Fk4oUhfSGD",
        userId,
      })
      .returning();

    return c.json(newAgent, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.put("/:id", zValidator("json", updateAgentSchema), async (c) => {
  try {
    const user = requireAuth(c);
    if (!user) return;

    const id = c.req.param("id");
    const updateData = c.req.valid("json");
    const db = getDb();
    const userId = user.userId;

    const [updatedAgent] = await db
      .update(voiceAgents)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(eq(voiceAgents.id, id), eq(voiceAgents.userId, userId)))
      .returning();

    if (!updatedAgent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json(updatedAgent);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.delete("/:id", async (c) => {
  try {
    const user = requireAuth(c);
    if (!user) return;

    const id = c.req.param("id");
    const db = getDb();
    const userId = user.userId;

    const [deletedAgent] = await db
      .delete(voiceAgents)
      .where(and(eq(voiceAgents.id, id), eq(voiceAgents.userId, userId)))
      .returning();

    if (!deletedAgent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json({ message: "Agent deleted successfully" });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/:id/test", async (c) => {
  try {
    const user = requireAuth(c);
    if (!user) return;

    const id = c.req.param("id");
    const db = getDb();
    const userId = user.userId;

    const [agent] = await db
      .select()
      .from(voiceAgents)
      .where(and(eq(voiceAgents.id, id), eq(voiceAgents.userId, userId)));

    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const [session] = await db
      .insert(agentSessions)
      .values({
        agentId: id,
        sessionId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        roomName: `test-room-${id}-${Date.now()}`,
        userId,
        status: "active",
        metadata: { isTest: true },
      })
      .returning();

    return c.json({
      sessionId: session.id,
      roomName: session.roomName,
      agentConfig: {
        llmProvider: agent.llmProvider,
        llmModel: agent.llmModel,
        sttProvider: agent.sttProvider,
        ttsProvider: agent.ttsProvider,
        instructions: agent.instructions,
      },
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
