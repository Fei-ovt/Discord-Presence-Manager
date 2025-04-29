// @ts-nocheck
/* 
  Using ts-nocheck to suppress all TypeScript errors as discord.js-selfbot-v13
  doesn't have proper type definitions and we're using it for a user account
  which has different methods than a regular bot account.
*/
import { Client } from 'discord.js-selfbot-v13';
import { storage } from './storage';
import { broadcastStatus } from './websocket';
import { format } from 'date-fns';

// Discord client instance
let client: Client | null = null;
let startTime: Date | null = null;
let voiceConnectionStartTime: Date | null = null;
let connectedChannelName: string | null = null;
let connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';

// Initialize Discord client
export async function setupDiscordClient(): Promise<Client | null> {
  // Get token from environment variable
  let token = process.env.DISCORD_TOKEN || '';
  
  if (!token) {
    console.error('DISCORD_TOKEN environment variable is missing');
    await storage.addActivityLog({
      type: 'error',
      message: 'No Discord token provided in environment variables'
    });
    
    await updateConnectionStatus('error');
    return null;
  }
  
  // Ensure token is properly formatted - trim whitespace
  token = token.trim();
  
  // Log that we're setting up (don't log the actual token)
  console.log('Setting up Discord client with token...', token.substring(0, 5) + '...' + token.substring(token.length - 5));
  // Don't log the actual token for security
  
  // Create new client with specific options for user accounts
  try {
    client = new Client({
      checkUpdate: false,
      ws: {
        properties: {
          $browser: "Discord iOS" // This helps with token validation for user accounts
        }
      },
      patchVoice: true, // Enable voice support
      syncStatus: true, // Make sure status updates are synced
      messageCacheMaxSize: 50, // Reduce memory usage
      // Use minimal intents to avoid detection
      intents: [
        "GUILDS", 
        "GUILD_MESSAGES", 
        "GUILD_VOICE_STATES",
        "DIRECT_MESSAGES"
      ]
    });
    
    // Handle errors
    client.on('error', async (error) => {
      console.error('Discord client error:', error);
      await storage.addActivityLog({
        type: 'error',
        message: `Discord client error: ${error.message}`
      });
      
      // Update connection status
      await updateConnectionStatus('error');
    });
    
    // Handle disconnect
    client.on('disconnect', async () => {
      console.log('Discord client disconnected');
      await storage.addActivityLog({
        type: 'warning',
        message: 'Disconnected from Discord'
      });
      
      // Update connection status
      await updateConnectionStatus('disconnected');
      
      // Attempt to reconnect if auto reconnect is enabled
      const status = await storage.getDiscordStatus();
      if (status?.autoReconnect && status?.isAccountActive) {
        await reconnectClient();
      }
    });
    
    // Log ready event
    client.on('ready', async () => {
      console.log('Discord client ready!');
      startTime = new Date();
      connectionStatus = 'connected';
      
      // Log successful connection
      await storage.addActivityLog({
        type: 'system',
        message: `Connected to Discord as ${client?.user?.tag || 'Unknown'}`
      });
      
      // Update connection status
      await updateConnectionStatus('connected');
      
      // Set initial status from storage
      const status = await storage.getDiscordStatus();
      if (status) {
        try {
          await setStatusMode(status.statusMode || 'online');
        } catch (error) {
          console.error('Failed to set initial status:', error);
        }
        
        // Connect to voice if voice is active and channel ID is set
        if (status.isVoiceActive && status.channelId) {
          try {
            await connectToVoice(status.channelId);
          } catch (error) {
            console.error('Failed to connect to voice channel on startup:', error);
          }
        }
      }
    });
    
    // Try to log in with different approach
    console.log('Attempting to login to Discord...');
    await updateConnectionStatus('connecting');
    
    try {
      // Try different login approach with more durability
      // Check if token format roughly matches expected Discord token format
      if (token.length < 50 || token.length > 100) {
        throw new Error('Token format appears invalid (incorrect length)');
      }
      
      // Apply custom login procedure
      await client.login(token);
      console.log('Login successful!');
      return client;
    } catch (error) {
      console.error('Discord login error:', error);
      
      // Check if it's a token error
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const isTokenError = errorMsg.includes('TOKEN_INVALID') || 
                          errorMsg.includes('invalid token') ||
                          errorMsg.includes('An invalid token was provided');
      
      let friendlyMessage = `Failed to login to Discord: ${errorMsg}`;
      if (isTokenError) {
        friendlyMessage = 'The Discord token provided is invalid or expired. Please update the DISCORD_TOKEN environment variable with a valid user token. To get a valid token: 1) Open Discord in a browser, 2) Press F12, 3) Go to Application tab > Local Storage > discord.com, 4) Find the "token" entry and copy its value.';
      }
      
      await storage.addActivityLog({
        type: 'error',
        message: friendlyMessage
      });
      
      await updateConnectionStatus('error');
      
      // Instead of throwing, we'll return null to allow the app to start without Discord
      return null;
    }
  } catch (error) {
    console.error('Error setting up Discord client:', error);
    await storage.addActivityLog({
      type: 'error',
      message: `Error setting up Discord client: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    
    await updateConnectionStatus('error');
    return null;
  }
}

// Update connection status
async function updateConnectionStatus(status: 'connected' | 'connecting' | 'disconnected' | 'error') {
  // Broadcast status update to all clients
  const fullStatus = await getStatusUpdate();
  broadcastStatus({
    ...fullStatus,
    connectionStatus: status
  });
}

// Get full status update
export async function getStatusUpdate(): Promise<{
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  statusMode: 'online' | 'idle' | 'dnd' | 'invisible';
  isAccountActive: boolean;
  isVoiceActive: boolean;
  autoReconnect: boolean;
  channelId: string | null;
  systemNotifications: boolean;
  autoStart: boolean;
  voiceStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  connectedChannel: string | null;
  activeSince: string;
  connectionDuration: string | null;
  uptime: string;
}> {
  const dbStatus = await storage.getDiscordStatus();
  
  // Calculate uptime
  let uptimeStr = 'Not connected';
  if (startTime) {
    const uptime = formatDuration(new Date().getTime() - startTime.getTime());
    uptimeStr = uptime;
  }
  
  // Calculate voice connection duration
  let connectionDuration: string | null = null;
  if (voiceConnectionStartTime) {
    connectionDuration = formatDuration(new Date().getTime() - voiceConnectionStartTime.getTime());
  }
  
  // Default status mode if not available
  const statusMode = (dbStatus?.statusMode || 'online') as 'online' | 'idle' | 'dnd' | 'invisible';
  
  // Default voice status
  const voiceStatus = (voiceConnectionStartTime ? 'connected' : 'disconnected') as 'connected' | 'disconnected';
  
  return {
    connectionStatus,
    statusMode,
    isAccountActive: dbStatus?.isAccountActive || false,
    isVoiceActive: dbStatus?.isVoiceActive || false,
    autoReconnect: dbStatus?.autoReconnect || true,
    channelId: dbStatus?.channelId || null,
    systemNotifications: dbStatus?.systemNotifications || true,
    autoStart: dbStatus?.autoStart || false,
    voiceStatus,
    connectedChannel: connectedChannelName,
    activeSince: startTime ? formatDuration(new Date().getTime() - startTime.getTime()) : 'Not connected',
    connectionDuration,
    uptime: uptimeStr
  };
}

// Get Discord status (for API)
export async function getDiscordStatus() {
  // Get user information if client is ready
  let user = null;
  if (client?.isReady() && client.user) {
    user = {
      id: client.user.id,
      username: client.user.username,
      discriminator: client.user.discriminator,
      avatar: client.user.avatar
    };
  }
  
  return {
    status: await getStatusUpdate(),
    user
  };
}

// Set Discord status mode
export async function setStatusMode(mode: string) {
  if (!client || !client.isReady()) {
    throw new Error('Discord client not ready');
  }
  
  try {
    // Safety check for user object
    if (!client.user) {
      throw new Error('Discord user object not available');
    }
    
    // Map status mode to Discord presence status
    const presenceStatus = 
      mode === 'online' ? 'online' :
      mode === 'idle' ? 'idle' :
      mode === 'dnd' ? 'dnd' :
      'invisible';
    
    // Update presence
    await client.user.setStatus(presenceStatus);
    
    // Log status change
    await storage.addActivityLog({
      type: 'status',
      message: `Status changed to ${mode}`
    });
    
    // Broadcast status update
    const status = await getStatusUpdate();
    broadcastStatus({
      ...status,
      statusMode: mode as 'online' | 'idle' | 'dnd' | 'invisible'
    });
    
    return mode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log error
    await storage.addActivityLog({
      type: 'error',
      message: `Failed to update status: ${errorMessage}`
    });
    
    throw error;
  }
}

// Connect to voice channel
export async function connectToVoice(channelId: string) {
  if (!client || !client.isReady()) {
    throw new Error('Discord client not ready');
  }
  
  try {
    // Get the channel
    const channel = await client.channels.fetch(channelId);
    
    if (!channel) {
      throw new Error(`Channel with ID ${channelId} not found`);
    }
    
    // Use discord.js-selfbot-v13's joinVoiceChannel 
    // The API is different from discord.js
    const connection = await client.joinVoiceChannel({
      channelId,
      guildId: channel.guild?.id || ''
    });
    
    // Set voice connection start time and channel name
    voiceConnectionStartTime = new Date();
    connectedChannelName = `Voice Channel (${channelId})`;
    
    // Log voice connection
    await storage.addActivityLog({
      type: 'system',
      message: `Connected to voice channel with ID: ${channelId}`
    });
    
    // Broadcast status update
    const status = await getStatusUpdate();
    broadcastStatus({
      ...status,
      voiceStatus: 'connected' as 'connected' | 'disconnected' | 'connecting' | 'error',
      connectedChannel: connectedChannelName
    });
    
    return true;
  } catch (error) {
    // Log error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await storage.addActivityLog({
      type: 'error',
      message: `Failed to connect to voice channel: ${errorMessage}`
    });
    
    // Broadcast status update
    const status = await getStatusUpdate();
    broadcastStatus({
      ...status,
      voiceStatus: 'error' as 'connected' | 'disconnected' | 'connecting' | 'error'
    });
    
    throw error;
  }
}

// Disconnect from voice channel
export async function disconnectFromVoice() {
  if (!client || !client.isReady()) {
    return false;
  }
  
  try {
    // Disconnect from voice channel using the method that discord.js-selfbot-v13 provides
    await client.leaveVoiceChannel();
    
    // Reset voice connection tracking
    voiceConnectionStartTime = null;
    connectedChannelName = null;
    
    // Log voice disconnection
    await storage.addActivityLog({
      type: 'system',
      message: 'Disconnected from voice channel'
    });
    
    // Broadcast status update
    const status = await getStatusUpdate();
    broadcastStatus({
      ...status,
      voiceStatus: 'disconnected' as 'connected' | 'disconnected' | 'connecting' | 'error',
      connectedChannel: null,
      connectionDuration: null
    });
    
    return true;
  } catch (error) {
    // Log error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await storage.addActivityLog({
      type: 'error',
      message: `Failed to disconnect from voice channel: ${errorMessage}`
    });
    
    throw error;
  }
}

// Reconnect client
async function reconnectClient() {
  // Get token from environment
  const token = process.env.DISCORD_TOKEN || '';
  
  if (!token || !client) {
    return false;
  }
  
  try {
    await updateConnectionStatus('connecting');
    
    // Log reconnection attempt
    await storage.addActivityLog({
      type: 'system',
      message: 'Attempting to reconnect to Discord'
    });
    
    // Try to log in again
    await client.login(token);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log error
    await storage.addActivityLog({
      type: 'error',
      message: `Failed to reconnect to Discord: ${errorMessage}`
    });
    
    // Try again after a delay
    setTimeout(reconnectClient, 30000);
    return false;
  }
}

// Helper function to format duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours} hours, ${minutes % 60} minutes`;
  } else if (minutes > 0) {
    return `${minutes} minutes, ${seconds % 60} seconds`;
  } else {
    return `${seconds} seconds`;
  }
}
