import React, { useEffect } from 'react';
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
    isLoading: statusLoading
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

  const handleToggleNotifications = async (checked: boolean) => {
    try {
      await apiRequest('POST', '/api/discord/notifications', { enabled: checked });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Notifications Updated",
        description: `System notifications are now ${checked ? 'enabled' : 'disabled'}`
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update notifications",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  const handleToggleAutoStart = async (checked: boolean) => {
    try {
      await apiRequest('POST', '/api/discord/auto-start', { enabled: checked });
      queryClient.invalidateQueries({ queryKey: ['/api/discord/status'] });
      toast({
        title: "Auto Start Updated",
        description: `Auto-start on system boot is now ${checked ? 'enabled' : 'disabled'}`
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update auto start",
        description: err instanceof Error ? err.message : "Unknown error occurred"
      });
    }
  };

  // Format log timestamp
  const formatLogTime = (timestamp: Date | string) => {
    try {
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
                  checked={systemNotifications}
                  onCheckedChange={handleToggleNotifications}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-start on System Boot</span>
                <Switch 
                  checked={autoStart}
                  onCheckedChange={handleToggleAutoStart}
                />
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
