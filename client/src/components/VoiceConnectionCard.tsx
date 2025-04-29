import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDiscordStatus } from '@/hooks/useDiscordStatus';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { Skeleton } from '@/components/ui/skeleton';
import { LinkIcon, UnlinkIcon, SaveIcon, AlertCircleIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function VoiceConnectionCard() {
  const { toast } = useToast();
  const { 
    isVoiceActive,
    autoReconnect,
    channelId,
    voiceStatus,
    connectedChannel,
    connectionDuration,
    errorMessage,
    isLoading
  } = useDiscordStatus();

  const [channelIdInput, setChannelIdInput] = useState(channelId || '');

  // Use state to make toggle switches instantly responsive
  const [localVoiceActive, setLocalVoiceActive] = useState(isVoiceActive);
  const [localAutoReconnect, setLocalAutoReconnect] = useState(autoReconnect);
  
  // Update local state when props change
  React.useEffect(() => {
    setLocalVoiceActive(isVoiceActive);
    setLocalAutoReconnect(autoReconnect);
  }, [isVoiceActive, autoReconnect]);
  
  const handleToggleVoiceConnection = async (checked: boolean) => {
    // Update local state immediately for responsive UI
    setLocalVoiceActive(checked);
    
    try {
      await apiRequest('POST', '/api/discord/voice-active', { isActive: checked });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Voice Connection Updated",
        description: `Voice connection is now ${checked ? 'active' : 'inactive'}`
      });
    } catch (err) {
      // Revert local state on error
      setLocalVoiceActive(!checked);
      toast({
        variant: "destructive",
        title: "Failed to update voice connection",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  const handleToggleAutoReconnect = async (checked: boolean) => {
    // Update local state immediately for responsive UI
    setLocalAutoReconnect(checked);
    
    try {
      await apiRequest('POST', '/api/discord/auto-reconnect', { enabled: checked });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Auto Reconnect Updated",
        description: `Auto reconnect is now ${checked ? 'enabled' : 'disabled'}`
      });
    } catch (err) {
      // Revert local state on error
      setLocalAutoReconnect(!checked);
      toast({
        variant: "destructive",
        title: "Failed to update auto reconnect",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  const handleSaveChannelId = async () => {
    if (!channelIdInput.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid Channel ID",
        description: "Please enter a valid channel ID"
      });
      return;
    }

    try {
      await apiRequest('POST', '/api/discord/channel-id', { channelId: channelIdInput });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Channel ID Updated",
        description: "Voice channel ID has been updated"
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update channel ID",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  // Add state for button loading indicators
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  // Add local voice status for immediate UI feedback
  const [localVoiceStatus, setLocalVoiceStatus] = useState(voiceStatus);
  
  // Update local voice status when the server state changes
  React.useEffect(() => {
    setLocalVoiceStatus(voiceStatus);
  }, [voiceStatus]);

  const handleConnectVoice = async () => {
    setIsConnecting(true);
    setLocalVoiceStatus('connecting'); // Immediate feedback
    
    try {
      // First, ensure we have a valid channel ID
      if (!channelId) {
        toast({
          variant: "destructive",
          title: "Missing Channel ID",
          description: "Please enter and save a voice channel ID before connecting"
        });
        setLocalVoiceStatus('disconnected');
        setIsConnecting(false);
        return;
      }
      
      // Make the connect request
      await apiRequest('POST', '/api/discord/connect-voice', {});
      
      // Invalidate queries to get the latest status
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      
      // Verify connection took effect with a slight delay
      setTimeout(async () => {
        try {
          const statusResponse = await fetch('/api/discord/status');
          const statusData = await statusResponse.json();
          
          if (statusData?.status?.voiceStatus === 'connected') {
            toast({
              title: "Connected to Voice Channel",
              description: `Successfully joined ${statusData?.status?.connectedChannel || 'voice channel'}`
            });
          } else if (statusData?.status?.voiceStatus === 'error') {
            // Connection attempt failed, show the error message
            toast({
              variant: "destructive",
              title: "Connection Failed",
              description: statusData?.status?.error || "Unknown error connecting to voice channel"
            });
            // Reset the local status
            setLocalVoiceStatus('disconnected');
          } else {
            toast({
              title: "Connecting to Voice Channel",
              description: "Attempting to connect to the voice channel"
            });
          }
        } catch (verifyErr) {
          console.error("Error verifying connection:", verifyErr);
        }
      }, 1500);
    } catch (err) {
      // Revert to previous state on error
      setLocalVoiceStatus('disconnected');
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectVoice = async () => {
    setIsDisconnecting(true);
    setLocalVoiceStatus('disconnected'); // Immediate feedback
    
    // Show an initial toast informing about disconnect process
    toast({
      title: "Disconnecting from Voice",
      description: "Attempting to fully disconnect - this may take a moment..."
    });
    
    try {
      // Make the disconnect request with a long timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      
      try {
        // Set a longer timeout since the server might be doing a nuclear disconnect
        const response = await fetch('/api/discord/disconnect-voice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          // Success - wait a moment to let things settle
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Always invalidate queries to ensure UI reflects latest state
          queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
          
          toast({
            title: "Disconnected from Voice",
            description: "Successfully disconnected from voice channel"
          });
        } else {
          // Server returned an error
          console.error('Disconnect request failed:', await response.text());
          
          toast({
            variant: "destructive",
            title: "Disconnection Failed",
            description: "Server reported an error during disconnect"
          });
        }
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        
        // Handle abort or network errors
        if (fetchErr?.name === 'AbortError') {
          console.log('Disconnect request took too long but may still complete');
          
          toast({
            title: "Disconnect In Progress",
            description: "Disconnect operation is taking longer than expected but may still complete. The UI will update shortly."
          });
          
          // Force a status update after a brief pause
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
          }, 5000);
        } else {
          console.error('Network error during disconnect:', fetchErr);
          
          toast({
            variant: "destructive",
            title: "Network Error",
            description: "Unable to reach the server to disconnect. Please try again."
          });
          
          // Revert to previous state on network error
          setLocalVoiceStatus(voiceStatus);
        }
      }
    } catch (err) {
      console.error('Top-level error in disconnect handler:', err);
      
      // Revert to previous state on error
      setLocalVoiceStatus(voiceStatus);
      
      toast({
        variant: "destructive",
        title: "Disconnection Failed",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    } finally {
      setIsDisconnecting(false);
      
      // Force a query invalidation after everything is done
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      }, 1000);
    }
  };

  // Voice status styles
  const getVoiceStatusStyle = (status: string) => {
    const statusMap: Record<string, { bg: string, text: string }> = {
      connected: { bg: 'bg-discord-online', text: 'text-discord-online' },
      connecting: { bg: 'bg-discord-idle', text: 'text-discord-idle' },
      disconnected: { bg: 'bg-discord-invisible', text: 'text-discord-invisible' },
      error: { bg: 'bg-discord-dnd', text: 'text-discord-dnd' }
    };
    
    return statusMap[status] || statusMap.disconnected;
  };

  // Use local voice status for immediate UI feedback
  const voiceStatusStyle = getVoiceStatusStyle(localVoiceStatus);

  return (
    <Card className="bg-discord-surface rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h2 className="text-lg font-medium">Voice Connection</h2>
        <Switch 
          checked={localVoiceActive}
          onCheckedChange={handleToggleVoiceConnection}
          disabled={isLoading}
        />
      </div>
      
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-12" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            {/* Channel ID Input */}
            <div className="mb-4">
              <label htmlFor="channel-id" className="block text-discord-muted mb-2 text-sm font-medium">Channel ID</label>
              <div className="relative">
                <Input
                  id="channel-id"
                  value={channelIdInput}
                  onChange={(e) => setChannelIdInput(e.target.value)}
                  placeholder="Enter channel ID"
                  className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-discord-blue focus:border-transparent pr-11"
                  style={{ boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)' }}
                />
                <Button
                  onClick={handleSaveChannelId}
                  disabled={!channelIdInput.trim()}
                  className="absolute right-1 top-1 flex items-center justify-center bg-gray-800 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                  style={{ boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)', minWidth: '80px' }}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-green-500 flex-shrink-0"></span>
                    <span className="mr-1">Save</span>
                  </span>
                </Button>
              </div>
            </div>

            {/* Auto Reconnect Toggle */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Auto Reconnect</span>
              <Switch 
                checked={localAutoReconnect}
                onCheckedChange={handleToggleAutoReconnect}
              />
            </div>

            {/* Connection Controls */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button
                className="py-3 px-4 bg-discord-blue text-white rounded-xl flex items-center justify-center space-x-2 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-discord-blue"
                style={{ boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)' }}
                onClick={handleConnectVoice}
                disabled={!localVoiceActive || !channelId || isConnecting || localVoiceStatus === 'connected'}
              >
                {isConnecting ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-opacity-50 border-t-transparent rounded-full"></div>
                ) : (
                  <LinkIcon className="h-5 w-5" />
                )}
                <span>{isConnecting ? "Connecting..." : "Connect"}</span>
              </Button>
              <Button
                variant="secondary"
                className="py-3 px-4 bg-gray-700 text-white rounded-xl flex items-center justify-center space-x-2 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                style={{ boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)' }}
                onClick={handleDisconnectVoice}
                disabled={localVoiceStatus !== 'connected' || isDisconnecting}
              >
                {isDisconnecting ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-opacity-50 border-t-transparent rounded-full"></div>
                ) : (
                  <UnlinkIcon className="h-5 w-5" />
                )}
                <span>{isDisconnecting ? "Disconnecting..." : "Disconnect"}</span>
              </Button>
            </div>

            {/* Error Alert */}
            {localVoiceStatus === 'error' && errorMessage && (
              <Alert variant="destructive" className="mt-4 bg-discord-dnd/20 border-discord-dnd text-white">
                <AlertCircleIcon className="h-4 w-4 mr-2" />
                <AlertDescription className="text-sm whitespace-pre-line">
                  {errorMessage}
                </AlertDescription>
              </Alert>
            )}
            
            {/* Voice Connection Status */}
            <div className="mt-6 pt-4 border-t border-gray-800">
              <div className="flex items-center text-sm text-discord-muted">
                <span>Connection Status:</span>
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${voiceStatusStyle.bg} bg-opacity-20 ${voiceStatusStyle.text}`}>
                  {localVoiceStatus.charAt(0).toUpperCase() + localVoiceStatus.slice(1)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-discord-muted">Connected to</span>
                <span>{localVoiceStatus === 'connected' ? (connectedChannel || 'Voice Channel') : 'Not connected'}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-discord-muted">Connected for</span>
                <span>{localVoiceStatus === 'connected' ? (connectionDuration || 'Just connected') : 'N/A'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
