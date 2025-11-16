import { Hono } from "hono";
import { getLiveKitService } from "../../services/livekit.service.js";
import { clerkAuth, requireAuth } from "../../middleware/auth.js";

const app = new Hono();

app.use("/create-session", clerkAuth);
app.use("/sessions/*", clerkAuth);

app.post("/webhook", async (c) => {
  try {
    const body = await c.req.text();
    const authorization = c.req.header("Authorization");
    const liveKitService = getLiveKitService();
    const event = await liveKitService.handleWebhook(body, authorization);

    if (!event) {
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    await liveKitService.processWebhookEvent(event);

    return c.json({ received: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/create-session", async (c) => {
  try {
    const user = requireAuth(c);
    if (!user) return;

    const { agentId, isTest = true } = await c.req.json();

    if (!agentId) {
      return c.json({ error: "Agent ID is required" }, 400);
    }

    const liveKitService = getLiveKitService();
    const sessionData = await liveKitService.createAgentSession(
      agentId,
      user.userId,
      isTest,
    );

    return c.json({
      sessionId: sessionData.sessionId,
      roomName: sessionData.roomName,
      accessToken: sessionData.accessToken,
      wsUrl: sessionData.wsUrl,
      livekitAgentName: sessionData.livekitAgentName,
      agentConfig: sessionData.agentConfig,
    });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
});

app.delete("/sessions/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");

    const liveKitService = getLiveKitService();
    await liveKitService.endAgentSession(sessionId);

    return c.json({ message: "Session ended successfully" });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
});

app.get("/sessions/:sessionId/metrics", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");

    const liveKitService = getLiveKitService();
    const metrics = await liveKitService.getSessionMetrics(sessionId);

    if (!metrics) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(metrics);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
