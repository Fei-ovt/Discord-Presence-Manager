import React, { createContext, useContext, useEffect, useState } from 'react';
import { StatusUpdate } from '@shared/schema';

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
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<StatusUpdate | null>(null);

  // Connect to WebSocket
  const connect = () => {
    if (socket || isConnecting) return;
    
    setIsConnecting(true);
    
    // Determine host based on current URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    
    const newSocket = new WebSocket(wsUrl);
    
    newSocket.onopen = () => {
      setStatus('connected');
      setIsConnecting(false);
      setSocket(newSocket);
    };
    
    newSocket.onclose = () => {
      setStatus('disconnected');
      setIsConnecting(false);
      setSocket(null);
      
      // Try to reconnect after a delay
      setTimeout(connect, 3000);
    };
    
    newSocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      newSocket.close();
    };
    
    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StatusUpdate;
        setLastMessage(data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };
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
