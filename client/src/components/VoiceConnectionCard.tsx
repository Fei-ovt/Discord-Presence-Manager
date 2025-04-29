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
import { LinkIcon, UnlinkIcon, SaveIcon } from 'lucide-react';

export default function VoiceConnectionCard() {
  const { toast } = useToast();
  const { 
    isVoiceActive,
    autoReconnect,
    channelId,
    voiceStatus,
    connectedChannel,
    connectionDuration,
    isLoading
  } = useDiscordStatus();

  const [channelIdInput, setChannelIdInput] = useState(channelId || '');

  const handleToggleVoiceConnection = async (checked: boolean) => {
    try {
      await apiRequest('POST', '/api/discord/voice-active', { isActive: checked });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Voice Connection Updated",
        description: `Voice connection is now ${checked ? 'active' : 'inactive'}`
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update voice connection",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  const handleToggleAutoReconnect = async (checked: boolean) => {
    try {
      await apiRequest('POST', '/api/discord/auto-reconnect', { enabled: checked });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Auto Reconnect Updated",
        description: `Auto reconnect is now ${checked ? 'enabled' : 'disabled'}`
      });
    } catch (err) {
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

  const handleConnectVoice = async () => {
    try {
      await apiRequest('POST', '/api/discord/connect-voice', {});
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Connecting to Voice Channel",
        description: "Attempting to connect to the voice channel"
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  const handleDisconnectVoice = async () => {
    try {
      await apiRequest('POST', '/api/discord/disconnect-voice', {});
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Disconnected from Voice",
        description: "Successfully disconnected from voice channel"
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Disconnection Failed",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  // Voice status styles
  const getVoiceStatusStyle = () => {
    const statusMap: Record<string, { bg: string, text: string }> = {
      connected: { bg: 'bg-discord-online', text: 'text-discord-online' },
      connecting: { bg: 'bg-discord-idle', text: 'text-discord-idle' },
      disconnected: { bg: 'bg-discord-invisible', text: 'text-discord-invisible' },
      error: { bg: 'bg-discord-dnd', text: 'text-discord-dnd' }
    };
    
    return statusMap[voiceStatus] || statusMap.disconnected;
  };

  const voiceStatusStyle = getVoiceStatusStyle();

  return (
    <Card className="bg-discord-surface rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h2 className="text-lg font-medium">Voice Connection</h2>
        <Switch 
          checked={isVoiceActive}
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
                  className="w-full px-4 py-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-discord-blue focus:border-transparent pr-11"
                />
                <Button
                  size="icon"
                  className="absolute right-1 top-1 bg-discord-blue text-white p-1.5 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-discord-blue"
                  onClick={handleSaveChannelId}
                  disabled={!channelIdInput.trim()}
                >
                  <SaveIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Auto Reconnect Toggle */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Auto Reconnect</span>
              <Switch 
                checked={autoReconnect}
                onCheckedChange={handleToggleAutoReconnect}
              />
            </div>

            {/* Connection Controls */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button
                className="py-2.5 px-4 bg-discord-blue text-white rounded flex items-center justify-center space-x-2 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-discord-blue"
                onClick={handleConnectVoice}
                disabled={!isVoiceActive || !channelId}
              >
                <LinkIcon className="h-5 w-5" />
                <span>Connect</span>
              </Button>
              <Button
                variant="secondary"
                className="py-2.5 px-4 bg-gray-700 text-white rounded flex items-center justify-center space-x-2 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                onClick={handleDisconnectVoice}
                disabled={voiceStatus !== 'connected'}
              >
                <UnlinkIcon className="h-5 w-5" />
                <span>Disconnect</span>
              </Button>
            </div>

            {/* Voice Connection Status */}
            <div className="mt-6 pt-4 border-t border-gray-800">
              <div className="flex items-center text-sm text-discord-muted">
                <span>Connection Status:</span>
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${voiceStatusStyle.bg} bg-opacity-20 ${voiceStatusStyle.text}`}>
                  {voiceStatus.charAt(0).toUpperCase() + voiceStatus.slice(1)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-discord-muted">Connected to</span>
                <span>{connectedChannel || 'Not connected'}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-discord-muted">Connected for</span>
                <span>{connectionDuration || 'N/A'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
