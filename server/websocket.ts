import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { StatusUpdate } from '@shared/schema';
import { storage } from './storage';

// Track connected clients with timestamp for heartbeat
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  lastActivity: number; // Timestamp of last activity
  clientId: string; // Unique identifier
}

// Track connected clients - using array instead of Set to avoid TypeScript iteration issues
const clients: ExtendedWebSocket[] = [];

// Setup WebSocket server with enhanced reliability
export function setupWebsocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    // More permissive ping timeout
    clientTracking: true,
  });
  
  console.log('WebSocket server initialized');
  
  // Heartbeat interval to detect dead connections
  const pingInterval = setInterval(() => {
    // Loop through the clients array
    for (let i = clients.length - 1; i >= 0; i--) {
      const client = clients[i];
      // Check if the client hasn't been active in the last 60 seconds
      if (Date.now() - client.lastActivity > 60000) {
        if (!client.isAlive) {
          console.log(`WebSocket client ${client.clientId} failed heartbeat, terminating`);
          // Remove from array
          clients.splice(i, 1);
          client.terminate();
          continue; // Skip to next client
        }
        
        // Mark as needing a response
        client.isAlive = false;
        
        // Send ping
        try {
          client.ping();
        } catch (err) {
          console.error(`Error pinging client ${client.clientId}:`, err);
          // Remove from array
          clients.splice(i, 1);
          try {
            client.terminate();
          } catch (termErr) {
            console.error('Error terminating client:', termErr);
          }
        }
      }
    }
  }, 30000); // Check every 30 seconds
  
  // Clean up interval on server close
  wss.on('close', () => {
    clearInterval(pingInterval);
  });
  
  // Handle new connections
  wss.on('connection', (ws, req) => {
    // Extend the WebSocket with our properties
    const extendedWs = ws as ExtendedWebSocket;
    extendedWs.isAlive = true;
    extendedWs.lastActivity = Date.now();
    
    // Generate a unique client ID using timestamp and remote IP
    const ip = req.socket.remoteAddress || 'unknown';
    extendedWs.clientId = `${Date.now()}-${ip}-${Math.floor(Math.random() * 1000)}`;
    
    console.log(`WebSocket client connected: ${extendedWs.clientId}`);
    
    // Add client to array
    clients.push(extendedWs);
    
    // Handle pong responses
    extendedWs.on('pong', () => {
      extendedWs.isAlive = true;
      extendedWs.lastActivity = Date.now();
    });
    
    // Send initial status update
    sendInitialStatus(extendedWs);
    
    // Handle messages from client
    extendedWs.on('message', (message) => {
      // Update last activity timestamp
      extendedWs.lastActivity = Date.now();
      
      try {
        const data = JSON.parse(message.toString());
        
        // Handle ping-pong for keeping connection alive
        if (data.type === 'ping') {
          extendedWs.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        
        if (data.type === 'pong') {
          // Client responded to our ping
          extendedWs.isAlive = true;
          return;
        }
        
        // Could process other client messages here if needed
        console.log(`Received message from ${extendedWs.clientId}:`, data);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    // Handle disconnection
    extendedWs.on('close', () => {
      console.log(`WebSocket client disconnected: ${extendedWs.clientId}`);
      const index = clients.indexOf(extendedWs);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
    
    // Handle errors
    extendedWs.on('error', (error) => {
      console.error(`WebSocket error for client ${extendedWs.clientId}:`, error);
      const index = clients.indexOf(extendedWs);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
  });
  
  // Start periodic status updates
  startPeriodicUpdates();
  
  return wss;
}

// Send initial status to a client
async function sendInitialStatus(ws: WebSocket) {
  try {
    // Get current status
    const status = await getFullStatus();
    
    // Send to client
    ws.send(JSON.stringify(status));
  } catch (error) {
    console.error('Error sending initial status:', error);
  }
}

// Get full status update
async function getFullStatus(): Promise<StatusUpdate> {
  try {
    // Import getStatusUpdate from discord.ts
    const { getStatusUpdate } = await import('./discord');
    return await getStatusUpdate();
  } catch (error) {
    // If there's an error, return basic status
    return {
      connectionStatus: 'disconnected',
      statusMode: 'online',
      isAccountActive: false,
      isVoiceActive: false,
      autoReconnect: true,
      voiceStatus: 'disconnected',
      connectedChannel: null,
      activeSince: 'Not connected',
      connectionDuration: null,
      uptime: 'Just started'
    };
  }
}

// Start periodic status updates
function startPeriodicUpdates() {
  setInterval(async () => {
    if (clients.length > 0) {
      try {
        // Get current status
        const status = await getFullStatus();
        
        // Broadcast to all clients
        broadcastStatus(status);
      } catch (error) {
        console.error('Error in periodic update:', error);
      }
    }
  }, 5000);
}

// Broadcast status to all clients
export function broadcastStatus(status: StatusUpdate) {
  const message = JSON.stringify(status);
  
  // Iterate through the clients array directly
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
