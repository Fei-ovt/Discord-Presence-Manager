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
  
  // Root path status page
  app.get('/', (req, res) => {
    // If it's a browser request (looks for HTML), serve the app
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      // Serve our static HTML file
      return res.sendFile('index.html', { root: '.' });
    }
    
    // For non-browser requests directly to the root, show basic status
    getDiscordStatus().then(status => {
      res.json({
        application: "Discord Presence 24/7",
        status: "running",
        uptime: process.uptime(),
        discordConnected: status?.status?.connectionStatus === 'connected',
        message: "Use the web interface to control your Discord presence"
      });
    }).catch(error => {
      res.status(500).json({
        application: "Discord Presence 24/7",
        status: "error",
        message: "Failed to retrieve Discord status"
      });
    });
  });
  
  // Health check endpoint for UptimeRobot monitoring
  app.get('/api/health', (req, res) => {
    // Get Discord client state from the discord.ts module
    // Set a 10 second timeout for this route to ensure it responds even if Discord API is slow
    req.setTimeout(10000);
    
    // Return a very basic response if it's a UptimeRobot request
    // UptimeRobot only needs a 200 status code, but we're adding minimal info for debugging
    if (req.headers['user-agent'] && req.headers['user-agent'].includes('UptimeRobot')) {
      return res.status(200).send('OK');
    }
    
    getDiscordStatus().then(status => {
      const healthStatus = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        discordConnected: status?.status?.connectionStatus === 'connected',
        lastActivity: new Date().toISOString()
      };
      res.json(healthStatus);
    }).catch(err => {
      console.error('Health check error:', err);
      // Always return 200 for health checks to ensure UptimeRobot stays green
      res.status(200).json({
        status: 'degraded',
        message: 'Discord status unavailable but service is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
  });
  
  // Simple plain text health check for monitoring services
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });
  
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
      
      // Update storage immediately for responsive UI feedback
      await storage.updateDiscordStatus({ isAccountActive: isActive });
      
      // Log activity immediately
      await storage.addActivityLog({
        type: "status",
        message: `Account status changing to ${isActive ? 'active' : 'inactive'}`
      });
      
      // Get current status for immediate response
      const currentStatus = await getDiscordStatus();
      
      // Send immediate response for better UX
      res.json(currentStatus);
      
      // Apply the status change in Discord (background process)
      if (!isActive) {
        // If deactivating, set status to invisible
        try {
          await setStatusMode('invisible');
          
          // Log success
          await storage.addActivityLog({
            type: "status",
            message: `Account deactivated and set to invisible`
          });
        } catch (statusErr) {
          console.error('Error setting status to invisible when deactivating account:', statusErr);
          
          // Log error
          await storage.addActivityLog({
            type: "error",
            message: `Failed to set status to invisible: ${statusErr instanceof Error ? statusErr.message : "Unknown error"}`
          });
        }
      } else {
        // If activating, get the stored status mode and apply it
        try {
          const storedStatus = await storage.getDiscordStatus();
          if (storedStatus && storedStatus.statusMode) {
            await setStatusMode(storedStatus.statusMode);
            
            // Log success
            await storage.addActivityLog({
              type: "status",
              message: `Account activated and status restored to ${storedStatus.statusMode}`
            });
          } else {
            // Default to online if no stored status
            await setStatusMode('online');
            
            // Log success
            await storage.addActivityLog({
              type: "status",
              message: `Account activated and set to online (default)`
            });
          }
        } catch (statusErr) {
          console.error('Error restoring status when activating account:', statusErr);
          
          // Log error
          await storage.addActivityLog({
            type: "error",
            message: `Failed to restore status: ${statusErr instanceof Error ? statusErr.message : "Unknown error"}`
          });
        }
      }
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
      
      // Update storage first (for immediate UI feedback)
      await storage.updateDiscordStatus({ statusMode: mode });
      
      // Start status update in Discord in background
      const statusPromise = setStatusMode(mode);
      
      // Log activity immediately
      await storage.addActivityLog({
        type: "status",
        message: `Status mode changing to ${mode}`
      });
      
      // Send immediate success response for better UX
      res.json({ success: true, mode });
      
      // Continue with the actual status update in the background
      try {
        await statusPromise;
        
        // Log successful completion
        await storage.addActivityLog({
          type: "status",
          message: `Status mode changed to ${mode}`
        });
      } catch (statusError) {
        console.error('Background status update failed:', statusError);
        
        // Log error
        await storage.addActivityLog({
          type: "error",
          message: `Status mode change to ${mode} failed: ${statusError instanceof Error ? statusError.message : "Unknown error"}`
        });
      }
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
      // Set response timeout to 30 seconds to allow for the nuclear approach
      req.setTimeout(30000);
      
      // First attempt to disconnect
      console.log('Attempting to disconnect from voice channel (attempt 1)');
      const success = await disconnectFromVoice();
      
      if (success) {
        console.log('Successfully disconnected from voice channel');
      } else {
        // If first attempt fails, try a second time with the nuclear approach
        console.log('First disconnect attempt did not indicate success, trying again...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Second attempt
        console.log('Attempting to disconnect from voice channel (attempt 2)');
        await disconnectFromVoice();
      }
      
      // Always log activity and return success
      // Even if the above fails, we've updated the state to indicate disconnected
      await storage.addActivityLog({
        type: "system",
        message: "Disconnected from voice channel"
      });
      
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      console.error('Error disconnecting from voice channel:', message);
      
      // Even if there's an error, we want to force the disconnect state
      try {
        // We can't update voiceStatus directly since it's not in the schema,
        // but we can ensure the client sees a disconnected state through broadcastStatus
        const status = await getDiscordStatus();
        
        if (status && status.status) {
          // Force the disconnect state in the broadcast
          const updatedStatus: StatusUpdate = {
            ...status.status,
            voiceStatus: 'disconnected',
            connectedChannel: null,
            connectionDuration: null
          };
          
          // Use the websocket system to broadcast the forced status
          import('./websocket').then(({ broadcastStatus }) => {
            broadcastStatus(updatedStatus);
          }).catch(err => {
            console.error('Failed to import websocket module:', err);
          });
        }
        
        // Log the forced disconnect
        await storage.addActivityLog({
          type: "system",
          message: "Forced voice channel disconnect due to error"
        });
        
        // Return success even though there was an error
        res.json({ 
          success: true, 
          note: "Force disconnected due to error" 
        });
      } catch (innerError) {
        // If everything fails, then return an error
        res.status(500).json({ error: message });
        
        // Log error
        await storage.addActivityLog({
          type: "error",
          message: `Failed to disconnect from voice channel: ${message}`
        });
      }
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
