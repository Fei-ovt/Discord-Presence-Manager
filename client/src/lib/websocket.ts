import React, { createContext, useContext, useEffect, useState } from 'react';
import { StatusUpdate } from '@shared/schema';

// Extend WebSocket with our custom properties
interface ExtendedWebSocket extends WebSocket {
  pingInterval?: number;
}

// Default status shape
const defaultStatus: StatusUpdate = {
  connectionStatus: 'disconnected',
  statusMode: 'online',
  isAccountActive: false,
  isVoiceActive: false,
  autoReconnect: true,
  voiceStatus: 'disconnected',
  connectedChannel: null,
  activeSince: 'Not connected',
  connectionDuration: null,
  uptime: 'Calculating...'
};

interface WebsocketContextType {
  status: 'connected' | 'disconnected' | 'connecting';
  isConnecting: boolean;
  lastMessage: StatusUpdate | null;
  sendMessage: (message: any) => void;
}

// Create context
const WebsocketContext = createContext<WebsocketContextType>({
  status: 'disconnected',
  isConnecting: false,
  lastMessage: null,
  sendMessage: () => {},
});

// Provider component
export const WebsocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<ExtendedWebSocket | null>(null);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<StatusUpdate | null>(null);

  // Track reconnection attempts for exponential backoff
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [reconnectionTimer, setReconnectionTimer] = useState<number | null>(null);
  
  // Connect to WebSocket with advanced reconnection
  const connect = () => {
    // Don't try to connect if already connecting or connected
    if (socket || isConnecting) return;
    
    // Clear any existing reconnection timer
    if (reconnectionTimer) {
      window.clearTimeout(reconnectionTimer);
      setReconnectionTimer(null);
    }
    
    setIsConnecting(true);
    setStatus('connecting');
    
    // Determine host based on current URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    
    console.log(`Connecting to WebSocket: ${wsUrl} (attempt ${reconnectAttempts + 1})`);
    
    try {
      const newSocket = new WebSocket(wsUrl) as ExtendedWebSocket;
      
      // Set a connection timeout
      const connectionTimeout = window.setTimeout(() => {
        console.log('WebSocket connection timeout');
        if (newSocket.readyState !== WebSocket.OPEN) {
          newSocket.close();
        }
      }, 10000);
      
      newSocket.onopen = () => {
        window.clearTimeout(connectionTimeout);
        console.log('WebSocket connected successfully');
        setStatus('connected');
        setIsConnecting(false);
        setSocket(newSocket);
        setReconnectAttempts(0); // Reset attempts on successful connection
        
        // Set up a ping interval to keep the connection alive
        const pingInterval = window.setInterval(() => {
          if (newSocket.readyState === WebSocket.OPEN) {
            newSocket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Send ping every 30 seconds
        
        // Store the interval ID to clear it later
        newSocket.pingInterval = pingInterval;
      };
      
      newSocket.onclose = (event) => {
        window.clearTimeout(connectionTimeout);
        // Clear ping interval if it exists
        if (newSocket.pingInterval) {
          window.clearInterval(newSocket.pingInterval);
        }
        
        console.log(`WebSocket closed: ${event.code} ${event.reason || 'No reason provided'}`);
        setStatus('disconnected');
        setIsConnecting(false);
        setSocket(null);
        
        // Don't change the lastMessage to null - keep showing the last known state
        // This ensures the UI doesn't show "disconnected" for Discord even when just the WebSocket is disconnected
        
        // Increase reconnect attempts for backoff calculation
        setReconnectAttempts(prev => prev + 1);
        
        // Calculate backoff time - starts at 2 seconds and increases exponentially
        // but caps at 1 minute (60000ms) to ensure quicker reconnects on mobile
        const backoffTime = Math.min(2000 * Math.pow(1.5, reconnectAttempts), 60000);
        console.log(`Reconnecting in ${backoffTime/1000} seconds...`);
        
        // Try to reconnect after calculated delay
        const timer = window.setTimeout(connect, backoffTime);
        setReconnectionTimer(timer);
      };
      
      newSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // The onclose handler will be called automatically after this
      };
      
      newSocket.onmessage = (event) => {
        try {
          // Reset reconnect attempts on successful message
          if (reconnectAttempts > 0) {
            setReconnectAttempts(0);
          }
          
          const data = JSON.parse(event.data);
          
          // Handle ping-pong for keeping connection alive
          if (data.type === 'ping') {
            newSocket.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          
          // Handle normal status updates
          setLastMessage(data as StatusUpdate);
          
          // If we were in a disconnected state but got a message with connectionStatus='connected',
          // make a request to the server to retrieve the latest status
          if (status !== 'connected' && data.connectionStatus === 'connected') {
            fetch('/api/discord/status')
              .then(res => res.json())
              .catch(err => console.error('Failed to refresh status after reconnection:', err));
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      setIsConnecting(false);
      setStatus('disconnected');
      
      // Try again after a delay
      const timer = window.setTimeout(connect, 5000);
      setReconnectionTimer(timer);
    }
  };

  // Initialize connection
  useEffect(() => {
    connect();
    
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, []);

  // Send message function
  const sendMessage = (message: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  // Use createElement instead of JSX to avoid TypeScript JSX-in-TS files confusion
  return React.createElement(
    WebsocketContext.Provider,
    { value: { status, isConnecting, lastMessage, sendMessage } },
    children
  );
};

// Hook to use the WebSocket context
export const useWebsocket = () => {
  return useContext(WebsocketContext);
};

// Export provider as object with Provider property
export const websocketProvider = {
  Provider: WebsocketProvider
};
