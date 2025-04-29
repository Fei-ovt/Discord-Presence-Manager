import { useQuery } from '@tanstack/react-query';
import { StatusUpdate } from '@shared/schema';
import { useWebsocket } from '@/lib/websocket';

// Default status values 
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

export function useDiscordStatus() {
  const { lastMessage } = useWebsocket();
  
  // Fetch initial status from API
  const { 
    data: apiStatus,
    isLoading,
    error,
    refetch
  } = useQuery<{
    status: StatusUpdate;
    user: any;
  }>({
    queryKey: ['/api/discord/status'],
    staleTime: 30000, // 30 seconds
  });

  // Combine API data with real-time WebSocket updates
  const statusData = {
    ...apiStatus,
    status: lastMessage || apiStatus?.status || defaultStatus
  };

  // Extract individual status properties for easier access
  const {
    connectionStatus,
    statusMode,
    isAccountActive,
    isVoiceActive,
    autoReconnect,
    systemNotifications,
    autoStart,
    voiceStatus,
    connectedChannel,
    activeSince,
    connectionDuration,
    uptime
  } = statusData?.status || defaultStatus;

  // Also provide the channelId if it exists
  const channelId = apiStatus?.status?.channelId || '';

  return {
    // Full status data
    statusData,
    
    // Individual status properties
    connectionStatus,
    statusMode,
    isAccountActive,
    isVoiceActive,
    autoReconnect,
    systemNotifications,
    autoStart,
    voiceStatus,
    connectedChannel,
    activeSince,
    connectionDuration,
    uptime,
    channelId,
    
    // Query state
    isLoading,
    error,
    refetch
  };
}
