import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { StatusUpdate } from '@shared/schema';
import { storage } from './storage';

// Track connected clients
const clients = new Set<WebSocket>();

// Setup WebSocket server
export function setupWebsocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    // Add client to set
    clients.add(ws);
    
    // Send initial status update
    sendInitialStatus(ws);
    
    // Handle messages from client
    ws.on('message', (message) => {
      try {
        // Could process client messages here if needed
        console.log('Received message:', message.toString());
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      clients.delete(ws);
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });
  
  // Start periodic status updates (every 5 seconds)
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
    if (clients.size > 0) {
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
  
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
