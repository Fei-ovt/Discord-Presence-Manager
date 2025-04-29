import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useDiscordStatus } from '@/hooks/useDiscordStatus';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityLog } from '@shared/schema';
import { format } from 'date-fns';

export default function SettingsAndLogsCard() {
  const { toast } = useToast();
  const { 
    systemNotifications,
    autoStart,
    isLoading: statusLoading,
    connectionStatus
  } = useDiscordStatus();

  // Get activity logs
  const { 
    data: logs, 
    isLoading: logsLoading,
    error 
  } = useQuery<ActivityLog[]>({
    queryKey: ['/api/discord/logs'],
    staleTime: 10000 // Refresh every 10 seconds
  });

  // Handle logs loading error
  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to load logs",
        description: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  }, [error, toast]);

  // State for local toggle button values - for immediate UI feedback
  const [localNotifications, setLocalNotifications] = useState(systemNotifications);
  const [localAutoStart, setLocalAutoStart] = useState(autoStart);
  
  // Track toggle states for UI responsiveness
  const [isTogglingNotifications, setIsTogglingNotifications] = useState(false);
  const [isTogglingAutoStart, setIsTogglingAutoStart] = useState(false);
  
  // Keep local state in sync with the server state
  useEffect(() => {
    setLocalNotifications(systemNotifications);
    setLocalAutoStart(autoStart);
  }, [systemNotifications, autoStart]);

  const handleToggleNotifications = async (checked: boolean) => {
    // Prevent rapid toggling
    if (isTogglingNotifications) {
      return;
    }
    
    // Update local state immediately for responsive UI
    setIsTogglingNotifications(true);
    setLocalNotifications(checked);
    
    // Introduce a small delay before making the API call for better UX
    setTimeout(async () => {
      try {
        await apiRequest('POST', '/api/discord/notifications', { enabled: checked });
        queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
        toast({
          title: "Notifications Updated",
          description: `System notifications are now ${checked ? 'enabled' : 'disabled'}`
        });
      } catch (err) {
        // Revert local state on error
        setLocalNotifications(!checked);
        toast({
          variant: "destructive",
          title: "Failed to update notifications",
          description: err instanceof Error ? err.message : "Unknown error occurred"
        });
      } finally {
        // Ensure we always end the toggling state
        setIsTogglingNotifications(false);
      }
    }, 300);
  };

  const handleToggleAutoStart = async (checked: boolean) => {
    // Prevent rapid toggling
    if (isTogglingAutoStart) {
      return;
    }
    
    // Update local state immediately for responsive UI
    setIsTogglingAutoStart(true);
    setLocalAutoStart(checked);
    
    // Introduce a small delay before making the API call for better UX
    setTimeout(async () => {
      try {
        await apiRequest('POST', '/api/discord/auto-start', { enabled: checked });
        queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
        toast({
          title: "Auto Start Updated",
          description: `Auto-start on system boot is now ${checked ? 'enabled' : 'disabled'}`
        });
      } catch (err) {
        // Revert local state on error
        setLocalAutoStart(!checked);
        toast({
          variant: "destructive",
          title: "Failed to update auto start",
          description: err instanceof Error ? err.message : "Unknown error occurred"
        });
      } finally {
        // Ensure we always end the toggling state
        setIsTogglingAutoStart(false);
      }
    }, 300);
  };

  // Format log timestamp
  const formatLogTime = (timestamp: Date | string | null) => {
    try {
      if (!timestamp) {
        return 'Unknown time';
      }
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      return format(date, "yyyy-MM-dd HH:mm:ss");
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Get log type styling
  const getLogTypeStyle = (type: string) => {
    const typeStyles: Record<string, string> = {
      'system': 'text-discord-light',
      'status': 'text-discord-light',
      'warning': 'text-yellow-400',
      'error': 'text-discord-dnd'
    };
    
    return typeStyles[type] || 'text-discord-light';
  };

  return (
    <Card className="bg-discord-surface rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-medium">Settings & Logs</h2>
      </div>
      
      <div className="p-5">
        {statusLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-12" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-12" />
              </div>
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* Token Environment Variable */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-discord-muted text-sm font-medium">Discord Token</label>
                <span className="text-xs px-2 py-1 bg-green-900 bg-opacity-30 text-green-400 rounded-full">Set via .env</span>
              </div>
              <div className="bg-gray-800 rounded px-4 py-3 border border-gray-700 text-discord-muted text-sm">
                <code>DISCORD TOKEN = SETTING IN ENV</code>
              </div>
            </div>

            {/* Settings */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">System Notifications</span>
                <Switch 
                  checked={localNotifications}
                  onCheckedChange={handleToggleNotifications}
                  disabled={isTogglingNotifications}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-start on System Boot</span>
                <Switch 
                  checked={localAutoStart}
                  onCheckedChange={handleToggleAutoStart}
                  disabled={isTogglingAutoStart}
                />
              </div>
            </div>

            {/* 24/7 Uptime Section */}
            <div className="mt-4 py-3 px-4 bg-green-900/20 border border-green-800 rounded-lg">
              <div className="flex items-center">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 mr-2"></div>
                <h3 className="text-sm font-medium text-green-400">24/7 Uptime Ready</h3>
              </div>
              <p className="mt-2 text-xs text-green-300/80">
                This application supports 24/7 uptime with UptimeRobot. 
                See DEPLOYMENT.md for setup instructions.
              </p>
              <div className="mt-2 flex items-center text-xs text-green-300/70">
                <span>Health Check URL:</span>
                <code className="ml-2 px-2 py-1 bg-gray-800 rounded">/api/health</code>
              </div>
              <div className="mt-2 text-xs text-green-300/70">
                <div className="flex justify-between items-center">
                  <span>Discord Token:</span>
                  <span className="px-2 py-1 bg-gray-800 rounded flex items-center">
                    <div className={`h-2 w-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'} mr-2`}></div>
                    DISCORD TOKEN = SETTING IN ENV
                  </span>
                </div>
                <p className="mt-1 text-xs text-green-300/60">
                  {connectionStatus === 'connected' 
                    ? 'Token is valid and connection is active' 
                    : connectionStatus === 'connecting' 
                    ? 'Connecting to Discord...' 
                    : 'Token may be invalid or connection is disrupted'}
                </p>
              </div>
            </div>

            {/* Activity Log */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-discord-muted mb-2">Activity Log</h3>
              <ScrollArea className="bg-gray-800 rounded border border-gray-700 h-[220px] p-3 text-sm text-discord-muted">
                {logsLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="mb-2 pb-2 border-b border-gray-700">
                        <div className="flex justify-between mb-1">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))}
                  </div>
                ) : logs && logs.length > 0 ? (
                  logs.map((log, index) => (
                    <div key={index} className="mb-2 pb-2 border-b border-gray-700">
                      <div className="flex justify-between mb-1">
                        <span className={getLogTypeStyle(log.type)}>[{log.type.charAt(0).toUpperCase() + log.type.slice(1)}]</span>
                        <span className="text-xs">{formatLogTime(log.timestamp)}</span>
                      </div>
                      <p>{log.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full text-discord-muted">
                    No activity logs to display
                  </div>
                )}
              </ScrollArea>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
