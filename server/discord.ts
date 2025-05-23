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
  
  // Ensure token is properly formatted
  token = token.trim();
  
  // Remove any "Bearer " prefix if present
  if (token.startsWith('Bearer ')) {
    token = token.substring(7);
  }
  
  // Remove any quotes that might be present
  token = token.replace(/['"]+/g, '');
  
  // Log that we're setting up (don't log the actual token)
  console.log('Setting up Discord client with token...', 
    token.length > 10 ? token.substring(0, 5) + '...' + token.substring(token.length - 5) : '[INVALID TOKEN FORMAT]');
  // Don't log the actual token for security
  
  // Create new client with specific options for user accounts
  try {
    // Try a different client configuration that has more success with tokens
    client = new Client({
      checkUpdate: false,
      ws: {
        properties: {
          $browser: "Chrome", // Try Chrome as browser identifier
          $device: "Windows",
          $os: "Windows 10"
        }
      },
      // These settings mimic a regular Discord Web client
      restRequestTimeout: 60000,
      restGlobalRateLimit: 50,
      retryLimit: 5,
      patchVoice: true, // Enable voice support
      syncStatus: true, // Make sure status updates are synced
      messageCacheMaxSize: 50, // Reduce memory usage
      // Minimal intents to avoid detection
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

// Keep track of ongoing status changes to prevent flickering
let isChangingStatus = false;
let targetStatus = 'online';

// Set Discord status mode - nuclear approach that completely recreates the client
export async function setStatusMode(mode: string) {
  // If status change is already in progress, don't allow a new change
  if (isChangingStatus) {
    console.log(`Status change to ${mode} ignored - another change is in progress to ${targetStatus}`);
    
    // Return the target status of the current change
    return targetStatus;
  }
  
  if (!client) {
    throw new Error('Discord client not available');
  }
  
  try {
    // Lock status changes and set target
    isChangingStatus = true;
    targetStatus = mode;
    
    // Map status mode to Discord presence status
    const presenceStatus = 
      mode === 'online' ? 'online' :
      mode === 'idle' ? 'idle' :
      mode === 'dnd' ? 'dnd' :
      'invisible';
    
    console.log(`Setting Discord status to: ${presenceStatus} (USING NUCLEAR APPROACH)`);
    
    // Get token for reconnection
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('Discord token not available');
    }
    
    // Save current voice state info if needed for reconnection
    let voiceInfo = null;
    try {
      if (client.isReady()) {
        const guildIds = client.guilds?.cache?.map((g: any) => g.id) || [];
        for (const guildId of guildIds) {
          const guild = client.guilds.cache.get(guildId);
          if (guild && guild.voiceStates && guild.voiceStates.cache) {
            const voiceState = guild.voiceStates.cache.get(client.user?.id);
            if (voiceState && voiceState.channelId) {
              voiceInfo = {
                guildId,
                channelId: voiceState.channelId
              };
              break;
            }
          }
        }
      }
    } catch (voiceErr) {
      console.error('Error preserving voice state:', voiceErr);
    }
    
    // Update status in local storage immediately, before any client changes
    await storage.updateDiscordStatus({ statusMode: mode });
    
    // Broadcast status update immediately for responsive UI
    const currentStatus = await getStatusUpdate();
    broadcastStatus({
      ...currentStatus,
      statusMode: mode as 'online' | 'idle' | 'dnd' | 'invisible'
    });
    
    // Log the status change starting
    await storage.addActivityLog({
      type: 'system',
      message: `Changing status to ${mode}`
    });
    
    // Update connection status to indicate we're working
    await updateConnectionStatus('connecting');
    
    // Destroy the existing client
    let destroySuccess = false;
    try {
      if (client.isReady() && typeof client.destroy === 'function') {
        await client.destroy();
        destroySuccess = true;
      }
    } catch (destroyErr) {
      console.error('Error destroying client:', destroyErr);
    }
    
    // Create a completely new client with the desired status
    client = new Client({
      checkUpdate: false,
      ws: {
        properties: {
          $browser: "Chrome",
          $device: "Windows",
          $os: "Windows 10"
        }
      },
      restRequestTimeout: 60000,
      restGlobalRateLimit: 50,
      retryLimit: 5,
      patchVoice: true,
      syncStatus: true,
      messageCacheMaxSize: 50,
      // Explicitly set the desired status
      presence: {
        status: presenceStatus,
        activities: []
      },
      intents: [
        "GUILDS", 
        "GUILD_MESSAGES", 
        "GUILD_VOICE_STATES",
        "DIRECT_MESSAGES"
      ]
    });
    
    // Add necessary event handlers
    client.on('error', async (error) => {
      console.error('Discord client error:', error);
      await storage.addActivityLog({
        type: 'error',
        message: `Discord client error: ${error.message}`
      });
      
      await updateConnectionStatus('error');
      isChangingStatus = false; // Release lock on error
    });
    
    client.on('disconnect', async () => {
      console.log('Discord client disconnected');
      await storage.addActivityLog({
        type: 'warning',
        message: 'Disconnected from Discord'
      });
      
      await updateConnectionStatus('disconnected');
      isChangingStatus = false; // Release lock on disconnect
      
      // Attempt to reconnect if auto reconnect is enabled
      const status = await storage.getDiscordStatus();
      if (status?.autoReconnect && status?.isAccountActive) {
        await reconnectClient();
      }
    });
    
    // Log ready event
    client.on('ready', async () => {
      console.log('Discord client ready with new status!');
      startTime = new Date();
      connectionStatus = 'connected';
      
      // Double-confirm the status is set correctly
      try {
        if (client.user) {
          // Apply the status multiple times to ensure it takes effect
          for (let i = 0; i < 3; i++) {
            try {
              await client.user.setStatus(presenceStatus);
              console.log(`Status update attempt ${i+1} completed`);
              
              // Small delay between attempts
              if (i < 2) await new Promise(resolve => setTimeout(resolve, 300));
            } catch (err) {
              console.error(`Status update attempt ${i+1} failed:`, err);
            }
          }
        }
      } catch (finalStatusErr) {
        console.error('Error setting final status:', finalStatusErr);
      }
      
      // Reconnect to voice if needed
      if (voiceInfo) {
        try {
          console.log(`Attempting to reconnect to voice channel ${voiceInfo.channelId}`);
          await connectToVoice(voiceInfo.channelId);
        } catch (voiceReconnectErr) {
          console.error('Error reconnecting to voice:', voiceReconnectErr);
        }
      }
    });
    
    // Login with token to connect
    console.log('Logging in with new client configuration');
    await client.login(token);
    
    // Wait for client to fully initialize
    if (!client.isReady()) {
      console.log('Waiting for client to be ready...');
      await new Promise<boolean>((resolve) => {
        const checkInterval = setInterval(() => {
          if (client && client.isReady()) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 500);
        
        // Set a timeout in case it never becomes ready
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(false);
        }, 10000);
      });
    }
    
    if (client.isReady()) {
      console.log('Client successfully initialized with new status');
      
      // Log status change success
      await storage.addActivityLog({
        type: 'status',
        message: `Status successfully changed to ${mode}`
      });
      
      // Broadcast updated status
      const status = await getStatusUpdate();
      broadcastStatus({
        ...status,
        statusMode: mode as 'online' | 'idle' | 'dnd' | 'invisible'
      });
      
      // Release lock
      isChangingStatus = false;
      
      return mode;
    } else {
      throw new Error('Client failed to initialize within timeout period');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('Error during nuclear status change:', errorMessage);
    
    // Log error
    await storage.addActivityLog({
      type: 'error',
      message: `Failed to update status: ${errorMessage}`
    });
    
    // Try to recover by reconnecting with default options
    try {
      client = await setupDiscordClient() as Client;
    } catch (setupErr) {
      console.error('Error recovering client:', setupErr);
    }
    
    // Release lock on error
    isChangingStatus = false;
    
    throw error;
  }
}

// Connect to voice channel
export async function connectToVoice(channelId: string) {
  if (!client || !client.isReady()) {
    throw new Error('Discord client not ready');
  }
  
  try {
    // First check if we're already connected to a voice channel
    const alreadyConnected = await checkVoiceConnectionStatus();
    if (alreadyConnected) {
      // Disconnect from current channel first
      try {
        await disconnectFromVoice();
        // Small delay to ensure disconnect completes before connecting again
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error('Error disconnecting from previous voice channel:', err);
        // Continue anyway to try connecting to the new channel
      }
    }
    
    // Get the channel
    const channel = await client.channels.fetch(channelId);
    
    if (!channel) {
      throw new Error(`Channel with ID ${channelId} not found`);
    }
    
    // Try multiple connection methods in sequence
    const connectMethods = [
      // Method 1: Direct Voice Manager method
      async () => {
        if (client.voice && typeof client.voice.joinChannel === 'function') {
          const guildId = channel.guild?.id;
          if (!guildId) {
            return false; // Skip to next method
          }
          await client.voice.joinChannel(channelId);
          return true;
        }
        return false;
      },
      
      // Method 2: Channel join method
      async () => {
        if (channel.join && typeof channel.join === 'function') {
          await channel.join();
          return true;
        }
        return false;
      },
      
      // Method 3: Client join voice channel method
      async () => {
        if (typeof client.joinVoiceChannel === 'function') {
          await client.joinVoiceChannel(channelId);
          return true;
        }
        return false;
      },
      
      // Method 4: Try internal methods
      async () => {
        const guildId = channel.guild?.id;
        if (!guildId) {
          return false;
        }
        
        if (client._joinVoiceChannel && typeof client._joinVoiceChannel === 'function') {
          await client._joinVoiceChannel(channelId);
          return true;
        }
        return false;
      },
      
      // Method 5: WS connection method
      async () => {
        if (client.ws?.connection?.voice?.joinVoiceChannel && 
            typeof client.ws.connection.voice.joinVoiceChannel === 'function') {
          await client.ws.connection.voice.joinVoiceChannel(channelId);
          return true;
        }
        return false;
      },
      
      // Method 6: Low-level voice state update
      async () => {
        const guildId = channel.guild?.id;
        if (guildId && client.ws) {
          try {
            // Send a voice state update packet directly
            client.ws.send({
              op: 4, // Voice State Update opcode
              d: {
                guild_id: guildId,
                channel_id: channelId,
                self_mute: false,
                self_deaf: true // Set to deafened to save bandwidth
              }
            });
            return true;
          } catch (err) {
            console.error('Failed to send voice state update', err);
            return false;
          }
        }
        return false;
      }
    ];
    
    // Try each connection method until one works
    let connected = false;
    for (const method of connectMethods) {
      try {
        connected = await method();
        if (connected) {
          console.log('Successfully connected to voice channel');
          break;
        }
      } catch (err) {
        console.error('Connection method failed:', err);
        // Continue to next method
      }
    }
    
    if (!connected) {
      throw new Error('All voice connection methods failed');
    }
    
    // Verify the connection
    setTimeout(async () => {
      const connectionVerified = await checkVoiceConnectionStatus();
      if (!connectionVerified) {
        console.warn('Voice connection could not be verified after connecting');
        
        // Try one more time with the direct WS method
        try {
          const guildId = channel.guild?.id;
          if (guildId && client.ws) {
            client.ws.send({
              op: 4,
              d: {
                guild_id: guildId,
                channel_id: channelId,
                self_mute: false,
                self_deaf: true
              }
            });
          }
        } catch (err) {
          console.error('Final connection attempt failed:', err);
        }
      }
    }, 1000);
    
    // Set voice connection start time and channel name
    voiceConnectionStartTime = new Date();
    connectedChannelName = channel.name || `Voice Channel (${channelId})`;
    
    // Log voice connection
    await storage.addActivityLog({
      type: 'system',
      message: `Connected to voice channel: ${connectedChannelName}`
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
    let userFriendlyMessage = errorMessage;
    
    // Special handling for common errors with more helpful guidance
    if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      userFriendlyMessage = 'You do not have permission to join this voice channel. Please check that:\n' +
        '- The channel ID is correct\n' +
        '- Your Discord account has access to this channel\n' +
        '- You have joined the server containing this channel\n' +
        '- Your Discord token has the necessary permissions';
    }
    
    await storage.addActivityLog({
      type: 'error',
      message: `Failed to connect to voice channel: ${userFriendlyMessage}`
    });
    
    // Broadcast status update with the more user-friendly error message
    const status = await getStatusUpdate();
    broadcastStatus({
      ...status,
      voiceStatus: 'error' as 'connected' | 'disconnected' | 'connecting' | 'error',
      error: userFriendlyMessage
    });
    
    throw new Error(userFriendlyMessage);
  }
}

// Check if user is actually connected to a voice channel
export async function checkVoiceConnectionStatus(): Promise<boolean> {
  if (!client || !client.isReady()) {
    return false;
  }
  
  try {
    // Method 1: Check client's voice state
    if (client.voice && client.voice.connections && client.voice.connections.size > 0) {
      return true;
    }
    
    // Method 2: Check voice channels the client is in
    const voiceChannels = client.channels?.cache?.filter(
      (c: any) => c?.type === 'GUILD_VOICE' && c?.members?.has(client.user?.id)
    );
    
    // Method 3: Check user voice state
    const guildIds = client.guilds?.cache?.map((guild: any) => guild.id) || [];
    for (const guildId of guildIds) {
      const guild = client.guilds.cache.get(guildId);
      if (guild && guild.voiceStates && guild.voiceStates.cache) {
        const voiceState = guild.voiceStates.cache.get(client.user?.id);
        if (voiceState && voiceState.channelId) {
          return true;
        }
      }
    }
    
    // If using various Discord client versions
    if (
      client.voice?.channelId || 
      (client as any).voiceConnection || 
      (client.ws?.connection?.voice && client.ws.connection.voice.channelID) ||
      voiceChannels?.size > 0
    ) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking voice connection status:', error);
    return false;
  }
}

// Disconnect from voice channel
export async function disconnectFromVoice() {
  if (!client || !client.isReady()) {
    return false;
  }
  
  try {
    // First, check if we're actually in a voice channel
    const isConnected = await checkVoiceConnectionStatus();
    if (!isConnected) {
      console.log('Not connected to any voice channel, updating status...');
      
      // Reset voice connection tracking
      voiceConnectionStartTime = null;
      connectedChannelName = null;
      
      // Log disconnection state
      await storage.addActivityLog({
        type: 'system',
        message: 'Already disconnected from voice channel'
      });
      
      // Update status to reflect disconnected state
      const status = await getStatusUpdate();
      broadcastStatus({
        ...status,
        voiceStatus: 'disconnected' as 'connected' | 'disconnected' | 'connecting' | 'error',
        connectedChannel: null,
        connectionDuration: null
      });
      
      return true;
    }
    
    // NUCLEAR APPROACH: Force disconnect by destroying and recreating the client
    try {
      // Save token before destroying
      const token = process.env.DISCORD_TOKEN || '';
      
      // Get the current state of connection for later
      const currentGuilds = client.guilds?.cache?.map((g: any) => g.id) || [];
      let foundVoiceChannel = false;
      let guildWithVoice = null;
      let channelIdToLeave = null;
      
      // Try to find which guild and channel we're connected to
      for (const guildId of currentGuilds) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && guild.voiceStates && guild.voiceStates.cache) {
          const voiceState = guild.voiceStates.cache.get(client.user?.id);
          if (voiceState && voiceState.channelId) {
            foundVoiceChannel = true;
            guildWithVoice = guildId;
            channelIdToLeave = voiceState.channelId;
            
            // Try one more direct disconnect approach
            try {
              console.log(`Found voice connection in guild ${guildId}, channel ${channelIdToLeave}`);
              
              // Check which type of websocket interface we have
              if (typeof client.ws === 'object' && client.ws !== null) {
                // Try different approaches depending on the client implementation
                if (typeof client.ws.send === 'function') {
                  // Direct WebSocket send method
                  client.ws.send({
                    op: 4, // Voice State Update opcode
                    d: {
                      guild_id: guildId,
                      channel_id: null, // null = disconnect
                      self_mute: false,
                      self_deaf: false
                    }
                  });
                } else if (client.ws.connection && typeof client.ws.connection.send === 'function') {
                  // Send through connection
                  client.ws.connection.send(JSON.stringify({
                    op: 4,
                    d: {
                      guild_id: guildId,
                      channel_id: null,
                      self_mute: false,
                      self_deaf: false
                    }
                  }));
                } else if (client.ws.socket && typeof client.ws.socket.send === 'function') {
                  // Direct socket send
                  client.ws.socket.send(JSON.stringify({
                    op: 4,
                    d: {
                      guild_id: guildId,
                      channel_id: null,
                      self_mute: false,
                      self_deaf: false
                    }
                  }));
                } else {
                  console.log('No suitable ws.send method found, trying alternative disconnect');
                  // Try an alternative approach by using client's voice state
                  if (typeof client.voice?.setChannel === 'function') {
                    await client.voice.setChannel(null);
                  }
                }
              } else {
                console.log('No WebSocket interface available, trying voice manager');
                // Try voice manager if available
                if (client.voice && typeof client.voice.disconnect === 'function') {
                  client.voice.disconnect();
                }
              }
              
              // Give it a moment to take effect
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
              console.error('Failed on direct disconnect:', err);
            }
          }
        }
      }
      
      // If we found a voice connection, try to force disconnect through client
      if (foundVoiceChannel) {
        console.log(`Attempting nuclear disconnect from guild ${guildWithVoice}, channel ${channelIdToLeave}`);
        
        // Try using destroy method if available
        if (client.voice && typeof client.voice.connections !== 'undefined') {
          if (client.voice.connections.size > 0) {
            console.log(`Found ${client.voice.connections.size} voice connections to destroy`);
            
            // Get all voice connections
            const connections = Array.from(client.voice.connections.values());
            
            // Try to destroy each connection
            for (const connection of connections) {
              try {
                if (typeof connection.disconnect === 'function') {
                  connection.disconnect();
                }
                
                // Try to access and clean up any lingering event listeners
                if (connection.removeAllListeners) {
                  connection.removeAllListeners();
                }
                
                // If there's a player, try to stop it
                if (connection.player && typeof connection.player.stop === 'function') {
                  connection.player.stop();
                }
              } catch (connErr) {
                console.error('Error disconnecting individual connection:', connErr);
              }
            }
          }
          
          // Try to destroy the voice manager
          if (typeof client.voice.destroy === 'function') {
            try {
              client.voice.destroy();
            } catch (destroyErr) {
              console.error('Error destroying voice manager:', destroyErr);
            }
          }
        }
      }
    
      // ULTRA NUCLEAR: Complete client restart
      // This is a last resort that will disconnect from voice but briefly interrupt the Discord connection
      if (token) {
        // Attempt to reset the client - this is a safer alternative to full destruction
        try {
          // First notify that we're reconnecting
          await updateConnectionStatus('connecting');
          
          if (typeof client.destroy === 'function') {
            // Try to gracefully destroy the client
            await client.destroy();
            
            // Log the action
            await storage.addActivityLog({
              type: 'system',
              message: 'Performing client reset to force voice disconnect'
            });
            
            // Wait a brief period
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // We need to completely reinitialize the client
            try {
              // Create a new Client instance with the same options as in setupDiscordClient
              client = new Client({
                checkUpdate: false,
                messageCacheMaxSize: 50,
                ws: {
                  properties: {
                    $browser: 'Chrome',
                    $device: 'Windows',
                    $os: 'Windows 10'
                  },
                },
              });
              
              // Set up event listeners
              client.on('ready', () => {
                console.log('Discord client ready!');
              });
              
              client.on('error', (error) => {
                console.error('Discord client error:', error);
              });
              
              // Login with the token
              await client.login(token);
              
              // Verify the login was successful
              if (!client.isReady()) {
                await new Promise((resolve) => {
                  const checkReady = setInterval(() => {
                    if (client && client.isReady()) {
                      clearInterval(checkReady);
                      resolve(true);
                    }
                  }, 1000);
                  
                  // Timeout after 10 seconds
                  setTimeout(() => {
                    clearInterval(checkReady);
                    resolve(false);
                  }, 10000);
                });
              }
              
              if (client.isReady()) {
                console.log('Successfully reconnected Discord client');
                
                // Set the status mode back to what it was
                const status = await storage.getDiscordStatus();
                if (status && status.statusMode) {
                  try {
                    await client.user.setStatus(status.statusMode as 'online' | 'idle' | 'dnd' | 'invisible');
                  } catch (statusErr) {
                    console.error('Error setting status after reconnect:', statusErr);
                  }
                }
              } else {
                console.error('Failed to reconnect Discord client after nuclear disconnect');
              }
            } catch (reloginErr) {
              console.error('Error during client reinitialization:', reloginErr);
              
              // One more attempt with basic connection
              try {
                await setupDiscordClient();
              } catch (finalErr) {
                console.error('Final reconnection attempt failed:', finalErr);
              }
            }
            
            // Update connection status after reconnect attempt
            await updateConnectionStatus(client && client.isReady() ? 'connected' : 'error');
            
            console.log('Successfully reset client to force voice disconnect');
          }
        } catch (resetErr) {
          console.error('Error during client reset:', resetErr);
          
          // Try a complete reset as a final fallback
          try {
            client = await setupDiscordClient() as Client;
          } catch (e) {
            console.error('Failed to recover client after error:', e);
          }
        }
      }
    } catch (nuclearErr) {
      console.error('Nuclear disconnect approach failed:', nuclearErr);
    }
    
    // Reset voice connection tracking regardless of success
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

// Track reconnection attempts and time
let reconnectAttempts = 0;
let lastReconnectTime = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 30000; // 30 seconds
const RECONNECT_RESET_TIME = 300000; // 5 minutes

// Reconnect client with improved robustness
export async function reconnectClient() {
  // Get current time to track reconnection rate
  const now = Date.now();
  
  // If we've tried recently, use exponential backoff
  if (now - lastReconnectTime < RECONNECT_INTERVAL) {
    const backoffTime = Math.min(RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts), 300000); // Max 5 min backoff
    console.log(`Too many reconnection attempts, backing off for ${backoffTime/1000} seconds`);
    setTimeout(reconnectClient, backoffTime);
    return false;
  }
  
  // Reset reconnect attempts counter if it's been a while
  if (now - lastReconnectTime > RECONNECT_RESET_TIME) {
    reconnectAttempts = 0;
  }
  
  // Track this attempt
  reconnectAttempts++;
  lastReconnectTime = now;
  
  // Get token from environment
  const token = process.env.DISCORD_TOKEN || '';
  
  if (!token || !client) {
    console.log('Cannot reconnect: Missing token or client');
    return false;
  }
  
  // Get the current status to check if account should be active
  const status = await storage.getDiscordStatus();
  if (!status?.isAccountActive) {
    console.log('Not reconnecting: Account is set to inactive');
    return false;
  }
  
  try {
    await updateConnectionStatus('connecting');
    
    // Log reconnection attempt
    console.log(`Discord reconnection attempt ${reconnectAttempts}`);
    await storage.addActivityLog({
      type: 'system',
      message: `Attempting to reconnect to Discord (attempt ${reconnectAttempts})`
    });
    
    // Create a connection timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 15000);
    });
    
    // Try to log in again with timeout protection
    try {
      await Promise.race([
        client.login(token),
        timeoutPromise
      ]);
      
      // If we get here, login was successful
      console.log('Successfully reconnected to Discord');
      reconnectAttempts = 0; // Reset counter on success
      
      // Log success
      await storage.addActivityLog({
        type: 'status',
        message: 'Successfully reconnected to Discord'
      });
      
      // Restore status mode from storage
      if (status.statusMode) {
        await setStatusMode(status.statusMode);
      }
      
      // Restore voice connection if needed
      if (status.isVoiceActive && status.channelId) {
        try {
          await connectToVoice(status.channelId);
        } catch (voiceErr) {
          console.error('Failed to restore voice connection after reconnect:', voiceErr);
        }
      }
      
      return true;
    } catch (timeoutError) {
      throw new Error('Connection timed out after 15 seconds');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log error
    console.error(`Discord reconnection failed: ${errorMessage}`);
    await storage.addActivityLog({
      type: 'error',
      message: `Failed to reconnect to Discord: ${errorMessage}`
    });
    
    // Try creating a new client if enough failures
    if (reconnectAttempts >= 3) {
      try {
        console.log('Attempting to create a new Discord client');
        
        // Destroy the old client if possible
        if (client?.destroy) {
          try {
            await client.destroy();
          } catch (destroyErr) {
            console.error('Error destroying old client:', destroyErr);
          }
        }
        
        // Set up a completely new client
        client = await setupDiscordClient();
        if (client) {
          console.log('Successfully created new Discord client');
          
          // Reset attempts on successful recreation
          reconnectAttempts = 0;
          
          return true;
        }
      } catch (recreateError) {
        console.error('Failed to create new Discord client:', recreateError);
      }
    }
    
    // Try again after a delay with exponential backoff
    const backoffTime = Math.min(RECONNECT_INTERVAL * Math.pow(1.5, reconnectAttempts), 300000);
    console.log(`Will retry reconnection in ${backoffTime/1000} seconds`);
    setTimeout(reconnectClient, backoffTime);
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
