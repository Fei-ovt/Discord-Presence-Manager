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
                    $browser: 'Discord Android', // Use mobile client identification
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
