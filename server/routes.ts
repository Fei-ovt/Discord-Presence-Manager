import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupDiscordClient, getDiscordStatus, setStatusMode, connectToVoice, disconnectFromVoice } from "./discord";
import { setupWebsocketServer } from "./websocket";
import { StatusUpdate, insertDiscordStatusSchema, insertActivityLogSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize WebSocket server
  const wss = setupWebsocketServer(httpServer);
  
  // Initialize Discord client - may be null if token is invalid or Discord is unavailable
  try {
    console.log('Initializing Discord client...');
    const discordClient = await setupDiscordClient();
    
    if (discordClient) {
      console.log('Discord client initialized successfully');
      
      // Create default Discord status if it doesn't exist
      const existingStatus = await storage.getDiscordStatus();
      if (!existingStatus) {
        console.log('Creating default Discord status');
        await storage.createDiscordStatus({
          statusMode: 'online',
          isAccountActive: true,
          isVoiceActive: false,
          autoReconnect: true,
          channelId: null,
          systemNotifications: true,
          autoStart: false
        });
      }
    } else {
      console.log('Discord client initialization failed, but application will continue');
      await storage.addActivityLog({
        type: 'error',
        message: 'Discord client initialization failed. Check your token.'
      });
    }
  } catch (error) {
    console.error('Error during Discord client initialization:', error);
    await storage.addActivityLog({
      type: 'error',
      message: `Discord client initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
  
  // API Routes
  // Get current Discord status
  app.get('/api/discord/status', async (req, res) => {
    try {
      const status = await getDiscordStatus();
      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
      
      // Log error
      await storage.addActivityLog({
        type: "error",
        message: `Failed to get Discord status: ${message}`
      });
    }
  });
  
  // Get activity logs
  app.get('/api/discord/logs', async (req, res) => {
    try {
      const logs = await storage.getActivityLogs();
      res.json(logs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
    }
  });
  
  // Update Discord account status (active/inactive)
  app.post('/api/discord/account-status', async (req, res) => {
    try {
      const schema = z.object({ isActive: z.boolean() });
      const { isActive } = schema.parse(req.body);
      
      // Update storage
      await storage.updateDiscordStatus({ isAccountActive: isActive });
      
      const status = await getDiscordStatus();
      
      // Log activity
      await storage.addActivityLog({
        type: "status",
        message: `Account status set to ${isActive ? 'active' : 'inactive'}`
      });
      
      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
      
      // Log error
      await storage.addActivityLog({
        type: "error",
        message: `Failed to update account status: ${message}`
      });
    }
  });
  
  // Update Discord status mode (online, idle, dnd, invisible)
  app.post('/api/discord/status-mode', async (req, res) => {
    try {
      const schema = z.object({ mode: z.enum(["online", "idle", "dnd", "invisible"]) });
      const { mode } = schema.parse(req.body);
      
      // Update mode in Discord
      await setStatusMode(mode);
      
      // Update storage
      await storage.updateDiscordStatus({ statusMode: mode });
      
      // Log activity
      await storage.addActivityLog({
        type: "status",
        message: `Status mode changed to ${mode}`
      });
      
      res.json({ success: true, mode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
      
      // Log error
      await storage.addActivityLog({
        type: "error",
        message: `Failed to update status mode: ${message}`
      });
    }
  });
  
  // Update voice active setting
  app.post('/api/discord/voice-active', async (req, res) => {
    try {
      const schema = z.object({ isActive: z.boolean() });
      const { isActive } = schema.parse(req.body);
      
      // Update storage
      await storage.updateDiscordStatus({ isVoiceActive: isActive });
      
      // If voice is now inactive, disconnect from voice
      if (!isActive) {
        await disconnectFromVoice();
      }
      
      // Log activity
      await storage.addActivityLog({
        type: "status",
        message: `Voice connection set to ${isActive ? 'active' : 'inactive'}`
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
      
      // Log error
      await storage.addActivityLog({
        type: "error",
        message: `Failed to update voice active status: ${message}`
      });
    }
  });
  
  // Update auto reconnect setting
  app.post('/api/discord/auto-reconnect', async (req, res) => {
    try {
      const schema = z.object({ enabled: z.boolean() });
      const { enabled } = schema.parse(req.body);
      
      // Update storage
      await storage.updateDiscordStatus({ autoReconnect: enabled });
      
      // Log activity
      await storage.addActivityLog({
        type: "system",
        message: `Auto reconnect ${enabled ? 'enabled' : 'disabled'}`
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
    }
  });
  
  // Update channel ID
  app.post('/api/discord/channel-id', async (req, res) => {
    try {
      const schema = z.object({ channelId: z.string().min(1) });
      const { channelId } = schema.parse(req.body);
      
      // Update storage
      await storage.updateDiscordStatus({ channelId });
      
      // Log activity
      await storage.addActivityLog({
        type: "system",
        message: `Voice channel ID updated to ${channelId}`
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
      
      // Log error
      await storage.addActivityLog({
        type: "error",
        message: `Failed to update channel ID: ${message}`
      });
    }
  });
  
  // Connect to voice channel
  app.post('/api/discord/connect-voice', async (req, res) => {
    try {
      const status = await storage.getDiscordStatus();
      
      if (!status) {
        throw new Error("Discord status not found");
      }
      
      if (!status.channelId) {
        throw new Error("Channel ID not set");
      }
      
      await connectToVoice(status.channelId);
      
      // Log activity
      await storage.addActivityLog({
        type: "system",
        message: `Connecting to voice channel ${status.channelId}`
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
      
      // Log error
      await storage.addActivityLog({
        type: "error",
        message: `Failed to connect to voice channel: ${message}`
      });
    }
  });
  
  // Disconnect from voice channel
  app.post('/api/discord/disconnect-voice', async (req, res) => {
    try {
      await disconnectFromVoice();
      
      // Log activity
      await storage.addActivityLog({
        type: "system",
        message: "Disconnected from voice channel"
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
      
      // Log error
      await storage.addActivityLog({
        type: "error",
        message: `Failed to disconnect from voice channel: ${message}`
      });
    }
  });
  
  // Update notifications setting
  app.post('/api/discord/notifications', async (req, res) => {
    try {
      const schema = z.object({ enabled: z.boolean() });
      const { enabled } = schema.parse(req.body);
      
      // Update storage
      await storage.updateDiscordStatus({ systemNotifications: enabled });
      
      // Log activity
      await storage.addActivityLog({
        type: "system",
        message: `System notifications ${enabled ? 'enabled' : 'disabled'}`
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
    }
  });
  
  // Update auto start setting
  app.post('/api/discord/auto-start', async (req, res) => {
    try {
      const schema = z.object({ enabled: z.boolean() });
      const { enabled } = schema.parse(req.body);
      
      // Update storage
      await storage.updateDiscordStatus({ autoStart: enabled });
      
      // Log activity
      await storage.addActivityLog({
        type: "system",
        message: `Auto-start on system boot ${enabled ? 'enabled' : 'disabled'}`
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ error: message });
    }
  });

  return httpServer;
}
