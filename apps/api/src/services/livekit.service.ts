import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  DataPacket_Kind,
  type Room,
  type WebhookEvent,
} from "livekit-server-sdk";
import { RoomConfiguration, RoomAgentDispatch } from "@livekit/protocol";
import { getEnv } from "../config/env.js";
import { getDb } from "../db/connection.js";
import { agentSessions, voiceAgents } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

export class LiveKitService {
  private roomClient: RoomServiceClient;
  private webhookReceiver: WebhookReceiver;
  private apiKey: string;
  private secret: string;
  private wsUrl: string;

  constructor() {
    const env = getEnv();

    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new Error("LiveKit credentials not configured");
    }

    this.apiKey = env.LIVEKIT_API_KEY;
    this.secret = env.LIVEKIT_API_SECRET;
    this.wsUrl = env.LIVEKIT_URL || "ws://localhost:7880";

    const httpUrl = this.wsUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    this.roomClient = new RoomServiceClient(httpUrl, this.apiKey, this.secret);
    this.webhookReceiver = new WebhookReceiver(this.apiKey, this.secret);
  }

  // Generate access token for a participant to join a room
  async generateAccessToken(
    identity: string,
    roomName: string,
    metadata?: string,
    roomConfig?: RoomConfiguration
  ): Promise<string> {
    const token = new AccessToken(this.apiKey, this.secret, {
      identity,
      metadata: metadata || JSON.stringify({ isVoiceAgent: true }),
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
    });

    // Add room configuration if provided
    if (roomConfig) {
      token.roomConfig = roomConfig;
    }

    return await token.toJwt();
  }

  // Create a new room for voice agent session
  async createRoom(roomName: string, agentConfig: any): Promise<Room> {
    return await this.roomClient.createRoom({
      name: roomName,
      emptyTimeout: 300,
      maxParticipants: 5,
      metadata: JSON.stringify({
        agentConfig,
        createdAt: new Date().toISOString(),
        isVoiceAgent: true,
      }),
    });
  }

  // Delete a room by name
  async deleteRoom(roomName: string): Promise<void> {
    await this.roomClient.deleteRoom(roomName);
  }

  // Get room information by name
  async getRoom(roomName: string): Promise<Room | null> {
    try {
      const rooms = await this.roomClient.listRooms([roomName]);
      return rooms.length > 0 ? rooms[0] : null;
    } catch (error) {
      return null;
    }
  }

  // List all participants in a room
  async listParticipants(roomName: string): Promise<any[]> {
    return await this.roomClient.listParticipants(roomName);
  }

  // Remove a participant from the room
  async removeParticipant(roomName: string, identity: string): Promise<void> {
    await this.roomClient.removeParticipant(roomName, identity);
  }

  /**
   * Send data to participants in a room
   * @param roomName - The name of the room
   * @param data - The data to send (string will be converted to Uint8Array)
   * @param options - Send options including destination participant IDs and delivery mode
   */
  async sendData(
    roomName: string,
    data: string | Uint8Array,
    options?: {
      destinationSids?: string[];
      reliable?: boolean; // true for RELIABLE, false for LOSSY
      topic?: string;
    }
  ): Promise<void> {
    try {
      // Convert string data to Uint8Array
      const dataArray =
        typeof data === "string" ? new TextEncoder().encode(data) : data;

      // Choose delivery mode based on options
      const kind =
        options?.reliable !== false
          ? DataPacket_Kind.RELIABLE
          : DataPacket_Kind.LOSSY;

      // Send data using the proper LiveKit SDK method
      await this.roomClient.sendData(roomName, dataArray, kind, {
        destinationSids: options?.destinationSids,
        topic: options?.topic,
      });

      console.log(`Successfully sent data to room ${roomName}`, {
        size: dataArray.length,
        kind: kind === DataPacket_Kind.RELIABLE ? "RELIABLE" : "LOSSY",
        destinations: options?.destinationSids || "all participants",
        topic: options?.topic || "default",
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  // Update participant metadata
  async updateParticipantMetadata(
    roomName: string,
    identity: string,
    metadata: string
  ): Promise<void> {
    await this.roomClient.updateParticipant(roomName, identity, {
      metadata,
    });
  }

  // Handle webhook events from LiveKit
  async handleWebhook(
    body: string,
    authorization?: string
  ): Promise<WebhookEvent | null> {
    try {
      return this.webhookReceiver.receive(body, authorization);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  // Process webhook events and update database
  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    switch (event.event) {
      case "room_started":
        // Update session when room starts
        if (event.room) {
          await this.updateSessionFromRoom(event.room);
        }
        break;

      case "room_finished":
        // Finalize session when room ends
        if (event.room) {
          await this.finalizeSessionFromRoom(event.room);
        }
        break;

      case "participant_joined":
        // Track participant join
        if (event.participant && event.room) {
          console.log(
            `Participant ${event.participant.identity} joined room ${event.room.name}`
          );
        }
        break;

      case "participant_left":
        // Track participant leave
        if (event.participant && event.room) {
          console.log(
            `Participant ${event.participant.identity} left room ${event.room.name}`
          );
        }
        break;

      case "track_published":
        // Handle audio track published
        break;

      case "track_unpublished":
        // Handle audio track unpublished
        break;

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }
  }

  // Update session status from room data
  private async updateSessionFromRoom(room: Room): Promise<void> {
    const db = getDb();

    try {
      await db
        .update(agentSessions)
        .set({
          status: "active",
          metadata: room.metadata ? JSON.parse(room.metadata) : {},
        })
        .where(eq(agentSessions.roomName, room.name));
    } catch (error) {
      console.error(error);
    }
  }

  // Finalize session when room ends
  private async finalizeSessionFromRoom(room: Room): Promise<void> {
    const db = getDb();

    try {
      const duration = room.creationTime
        ? Math.floor((Date.now() - Number(room.creationTime)) / 1000)
        : 0;

      await db
        .update(agentSessions)
        .set({
          status: "completed",
          totalDuration: duration,
          endedAt: new Date(),
        })
        .where(eq(agentSessions.roomName, room.name));
    } catch (error) {
      console.error(error);
    }
  }

  // Create agent session with LiveKit Cloud agents
  async createAgentSession(
    agentId: string,
    userId: string,
    isTest: boolean = false
  ): Promise<{
    sessionId: string;
    roomName: string;
    accessToken: string;
    wsUrl: string;
    livekitAgentName?: string;
    agentConfig: any;
  }> {
    const db = getDb();

    // Get agent configuration
    const [agent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.id, agentId));

    if (!agent) {
      throw new Error("Agent not found");
    }

    // Generate unique room name
    const roomName = `agent-${agentId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Create LiveKit room with minimal metadata
    await this.createRoom(roomName, {
      agentId,
      instructions: agent.instructions,
      isTest,
    });

    // Create database session
    const [session] = await db
      .insert(agentSessions)
      .values({
        agentId,
        sessionId: roomName,
        roomName,
        userId,
        status: "active",
        metadata: { isTest },
      })
      .returning();

    // Configure room with agent dispatch if livekitAgentName is set
    const roomConfig = agent.livekitAgentName
      ? new RoomConfiguration({
          agents: [
            new RoomAgentDispatch({
              agentName: agent.livekitAgentName,
              metadata: JSON.stringify({
                agentConfig: {
                  instructions: agent.instructions,
                },
              }),
            }),
          ],
        })
      : undefined;

    // Generate access token for the user with agent dispatch
    const accessToken = await this.generateAccessToken(
      `user-${userId}`,
      roomName,
      JSON.stringify({ userId, isTest }),
      roomConfig
    );

    return {
      sessionId: session.id,
      roomName,
      accessToken,
      wsUrl: this.wsUrl,
      livekitAgentName: agent.livekitAgentName || undefined,
      agentConfig: {
        instructions: agent.instructions,
      },
    };
  }

  // End agent session
  async endAgentSession(sessionId: string): Promise<void> {
    const db = getDb();

    const [session] = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId));

    if (!session || !session.roomName) {
      throw new Error("Session not found");
    }

    // Remove room
    await this.deleteRoom(session.roomName);

    // Update session status
    await db
      .update(agentSessions)
      .set({
        status: "completed",
        endedAt: new Date(),
      })
      .where(eq(agentSessions.id, sessionId));
  }

  // Get session metrics
  async getSessionMetrics(sessionId: string): Promise<any> {
    const db = getDb();

    const [session] = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId));

    if (!session || !session.roomName) {
      return null;
    }

    const room = await this.getRoom(session.roomName);
    const participants = room
      ? await this.listParticipants(session.roomName)
      : [];

    return {
      session,
      room,
      participants,
      metrics: {
        duration: session.totalDuration || 0,
        avgLatency: session.avgLatency || 0,
        messageCount: session.messageCount || 0,
        participantCount: participants.length,
      },
    };
  }
}

// Singleton instance
let liveKitService: LiveKitService | null = null;

export function getLiveKitService(): LiveKitService {
  if (!liveKitService) {
    liveKitService = new LiveKitService();
  }
  return liveKitService;
}
