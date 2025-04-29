import React from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useDiscordStatus } from '@/hooks/useDiscordStatus';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { Skeleton } from '@/components/ui/skeleton';

export default function AccountStatusCard() {
  const { toast } = useToast();
  const { 
    statusData, 
    isAccountActive, 
    statusMode, 
    activeSince, 
    isLoading, 
    error 
  } = useDiscordStatus();

  const handleToggleAccountStatus = async (checked: boolean) => {
    try {
      await apiRequest('POST', '/api/discord/account-status', { isActive: checked });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Account Status Updated",
        description: `Account is now ${checked ? 'active' : 'inactive'}`
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update account status",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  const handleStatusModeChange = async (newStatus: string) => {
    try {
      await apiRequest('POST', '/api/discord/status-mode', { mode: newStatus });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Status Updated",
        description: `Status changed to ${newStatus}`
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update status",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  // Status options for the buttons
  const statusOptions = [
    { key: 'online', label: 'Online', color: 'bg-discord-online' },
    { key: 'idle', label: 'Idle', color: 'bg-discord-idle' },
    { key: 'dnd', label: 'Do Not Disturb', color: 'bg-discord-dnd' },
    { key: 'invisible', label: 'Invisible', color: 'bg-discord-invisible' }
  ];

  // Get status text and color for current status indicator
  const getCurrentStatusStyle = () => {
    const option = statusOptions.find(opt => opt.key === statusMode);
    return {
      text: option?.label || 'Unknown',
      color: `text-${option?.color.replace('bg-', '') || 'discord-muted'}`
    };
  };

  const currentStatusStyle = getCurrentStatusStyle();

  return (
    <Card className="bg-discord-surface rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h2 className="text-lg font-medium">Account Status</h2>
        <Switch 
          checked={isAccountActive}
          onCheckedChange={handleToggleAccountStatus}
          disabled={isLoading}
        />
      </div>
      
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ) : (
          <>
            {/* User Profile Section */}
            <div className="flex items-center mb-5">
              <div className="h-12 w-12 rounded-full bg-gray-700 flex items-center justify-center text-xl overflow-hidden">
                {statusData?.user?.avatar ? (
                  <img 
                    src={`https://cdn.discordapp.com/avatars/${statusData.user.id}/${statusData.user.avatar}.png`} 
                    alt="User avatar" 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-discord-light">
                    {statusData?.user?.username?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="ml-3">
                <div className="font-medium">{statusData?.user?.username || 'Username'}</div>
                <div className="text-discord-muted text-sm">
                  {statusData?.user?.discriminator ? `#${statusData.user.discriminator}` : ''}
                </div>
              </div>
            </div>

            {/* Status Selection */}
            <div className="mb-4">
              <label className="block text-discord-muted mb-2 text-sm font-medium">Status Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {statusOptions.map((option) => (
                  <button 
                    key={option.key}
                    className={`py-2 px-3 rounded flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 transition-colors focus:outline-none ${statusMode === option.key ? 'ring-2 ring-discord-blue' : ''}`}
                    onClick={() => handleStatusModeChange(option.key)}
                  >
                    <span className={`h-3 w-3 rounded-full ${option.color}`}></span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Status Information */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="flex justify-between text-sm">
                <span className="text-discord-muted">Active Since</span>
                <span>{activeSince}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-discord-muted">Current Status</span>
                <span className={currentStatusStyle.color}>{currentStatusStyle.text}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
