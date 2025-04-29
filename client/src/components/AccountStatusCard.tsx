import React, { useState, useEffect } from 'react';
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
  
  // Define connection status type specifically for this component
  type ConnectionStatusType = 'connected' | 'connecting' | 'disconnected' | 'error';
  
  // Extract connection status from the status data with appropriate typing
  const connectionStatus = (statusData?.status?.connectionStatus || 'disconnected') as ConnectionStatusType;
  
  // Local states for immediate UI feedback
  const [localAccountActive, setLocalAccountActive] = useState(isAccountActive);
  const [localStatusMode, setLocalStatusMode] = useState<'online' | 'idle' | 'dnd' | 'invisible'>(
    statusMode as 'online' | 'idle' | 'dnd' | 'invisible'
  );
  const [isChangingStatus, setIsChangingStatus] = useState<string | null>(null);
  
  // Update local state when props change from server
  useEffect(() => {
    setLocalAccountActive(isAccountActive);
    setLocalStatusMode(statusMode);
  }, [isAccountActive, statusMode]);

  // Track if account toggling is in progress
  const [isTogglingAccount, setIsTogglingAccount] = useState(false);

  const handleToggleAccountStatus = async (checked: boolean) => {
    // Prevent multiple rapid toggles
    if (isTogglingAccount) {
      return;
    }
    
    // Start toggling and update local state immediately
    setIsTogglingAccount(true);
    setLocalAccountActive(checked);
    
    try {
      // Update with a slight UI delay to make toggle feel responsive
      setTimeout(async () => {
        try {
          await apiRequest('POST', '/api/discord/account-status', { isActive: checked });
          queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
          toast({
            title: "Account Status Updated",
            description: `Account is now ${checked ? 'active' : 'inactive'}`
          });
        } catch (err) {
          // Revert local state on error
          setLocalAccountActive(!checked);
          toast({
            variant: "destructive",
            title: "Failed to update account status",
            description: err instanceof Error ? err.message : "Unknown error occurred"
          });
        } finally {
          // Ensure we always end toggling state
          setIsTogglingAccount(false);  
        }
      }, 300);  
    } catch (err) {
      // In case the timeout somehow fails
      setIsTogglingAccount(false);
      setLocalAccountActive(!checked);
    }
  };

  const handleStatusModeChange = async (newStatus: 'online' | 'idle' | 'dnd' | 'invisible') => {
    // Prevent rapid clicking by ignoring if we're already changing
    if (isChangingStatus) {
      return;
    }
    
    // If we're already in this status, do nothing
    if (localStatusMode === newStatus) {
      return;
    }
    
    // Set local loading state for this specific button
    setIsChangingStatus(newStatus);
    
    // Update local status immediately for instant UI feedback
    setLocalStatusMode(newStatus);
    
    try {
      const response = await apiRequest('POST', '/api/discord/status-mode', { mode: newStatus });
      
      // Add a slight delay to avoid flickering UI and ensure full 
      // visibility of the state change before removing loading spinner
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Forced refresh status after change
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      
      // Show success toast
      toast({
        title: "Status Updated",
        description: `Status changed to ${newStatus}`
      });
    } catch (err) {
      // Revert to previous status on error
      setLocalStatusMode(statusMode as 'online' | 'idle' | 'dnd' | 'invisible');
      
      // Show error toast
      toast({
        variant: "destructive",
        title: "Failed to update status",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    } finally {
      // Only clear loading state after everything is done
      setTimeout(() => setIsChangingStatus(null), 300);
    }
  };

  // Status options for the buttons with proper typing
  const statusOptions: {key: 'online' | 'idle' | 'dnd' | 'invisible', label: string, color: string}[] = [
    { key: 'online', label: 'Online', color: 'bg-discord-online' },
    { key: 'idle', label: 'Idle', color: 'bg-discord-idle' },
    { key: 'dnd', label: 'Do Not Disturb', color: 'bg-discord-dnd' },
    { key: 'invisible', label: 'Invisible', color: 'bg-discord-invisible' }
  ];
  
  // Smoothed status indicator - add a delay to prevent flickering during transitions
  const [smoothedStatusMode, setSmoothedStatusMode] = useState<'online' | 'idle' | 'dnd' | 'invisible'>(
    localStatusMode
  );
  
  // Add a delay to status changes to prevent flickering during transitions
  useEffect(() => {
    if (localStatusMode) {
      // Use a longer delay to ensure the backend has fully transitioned
      const timer = setTimeout(() => {
        setSmoothedStatusMode(localStatusMode);
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [localStatusMode]);

  // Get status text and color for current status indicator - use smoothed state to prevent flickering
  const getCurrentStatusStyle = () => {
    // Use the smoothed status for display to prevent flickering
    const option = statusOptions.find(opt => opt.key === smoothedStatusMode);
    return {
      text: option?.label || 'Unknown',
      color: `text-${option?.color.replace('bg-', '') || 'discord-muted'}`
    };
  };

  const currentStatusStyle = getCurrentStatusStyle();

  // Determine if there's a token error with proper typing
  const hasTokenError = connectionStatus === 'error';

  return (
    <Card className="bg-discord-surface rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h2 className="text-lg font-medium">Account Status</h2>
        <div className="flex items-center gap-2">
          {/* Connection status indicator */}
          <div className={`h-2.5 w-2.5 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' : 
            connectionStatus === 'connecting' ? 'bg-yellow-500' : 
            connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
          }`}></div>
          <Switch 
            checked={localAccountActive}
            onCheckedChange={handleToggleAccountStatus}
            disabled={isLoading}
          />
        </div>
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
        ) : hasTokenError ? (
          <div className="p-4 rounded-lg bg-red-950/30 border border-red-950 mb-4">
            <h3 className="text-red-400 font-medium">Discord Token Error</h3>
            <p className="mt-2 text-sm">Your Discord token is invalid or has expired. Please update your token in the environment settings.</p>
            <div className="mt-3 text-xs text-discord-muted">
              <p className="mb-1">To get a valid token:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Open Discord in your web browser</li>
                <li>Press F12 to open developer tools</li>
                <li>Go to Application tab → Local Storage → discord.com</li>
                <li>Find the entry named "token" and copy its value</li>
              </ol>
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
                <div className="font-medium">{statusData?.user?.username || 'Not connected'}</div>
                <div className="text-discord-muted text-sm">
                  {statusData?.user?.discriminator ? `#${statusData.user.discriminator}` : 'Check Discord token'}
                </div>
              </div>
            </div>

            {/* Connection Status */}
            <div className="py-2 px-3 rounded bg-gray-800 mb-4 flex items-center justify-between">
              <span className="text-sm">Connection Status</span>
              <span className={`text-sm ${
                connectionStatus === 'connected' ? 'text-green-400' : 
                connectionStatus === 'connecting' ? 'text-yellow-400' : 
                (connectionStatus as string) === 'error' ? 'text-red-400' : 'text-gray-400'
              }`}>
                {connectionStatus === 'connected' ? 'Connected' : 
                 connectionStatus === 'connecting' ? 'Connecting...' : 
                 (connectionStatus as string) === 'error' ? 'Connection Error' : 'Disconnected'}
              </span>
            </div>

            {/* Status Selection */}
            <div className="mb-4">
              <label className="block text-discord-muted mb-2 text-sm font-medium">Status Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {statusOptions.map((option) => {
                  const isChanging = isChangingStatus === option.key;
                  
                  return (
                    <button 
                      key={option.key}
                      className={`py-3 px-4 rounded-xl flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 transition-colors focus:outline-none ${localStatusMode === option.key ? 'ring-2 ring-discord-blue' : ''}`}
                      onClick={() => handleStatusModeChange(option.key)}
                      disabled={connectionStatus !== 'connected' || isChanging}
                      style={{ boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)' }}
                    >
                      {isChanging ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-opacity-50 border-t-transparent"></div>
                      ) : (
                        <span className={`h-3 w-3 rounded-full ${option.color}`}></span>
                      )}
                      <span>{option.label}</span>
                    </button>
                  );
                })}
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
