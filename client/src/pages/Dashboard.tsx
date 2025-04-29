import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import ConnectionStatus from '@/components/ConnectionStatus';
import AccountStatusCard from '@/components/AccountStatusCard';
import VoiceConnectionCard from '@/components/VoiceConnectionCard';
import SettingsAndLogsCard from '@/components/SettingsAndLogsCard';
import { useDiscordStatus } from '@/hooks/useDiscordStatus';
import { useWebsocket } from '@/lib/websocket';
import { AlertCircle, InfoIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Dashboard() {
  const { toast } = useToast();
  const { status: websocketStatus, isConnecting } = useWebsocket();
  const { 
    connectionStatus, 
    uptime, 
    error,
    isLoading
  } = useDiscordStatus();
  
  // Store if we've shown the WebSocket info message
  const [hasShownWebsocketInfo, setHasShownWebsocketInfo] = useState(false);

  // Handle Discord connection errors (not WebSocket errors)
  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Discord Connection Error",
        description: error.message || "Failed to connect to Discord. Please check your token."
      });
    }
  }, [error, toast]);
  
  // Handle WebSocket disconnections with a friendlier message
  useEffect(() => {
    if (websocketStatus === 'disconnected' && !isConnecting && !hasShownWebsocketInfo) {
      setHasShownWebsocketInfo(true);
      toast({
        title: "UI Connection Status",
        description: "Your app has disconnected from the server UI but your Discord presence remains online. This is expected when closing the app or losing internet connection.",
        duration: 8000, // Show longer than default
      });
    }
  }, [websocketStatus, isConnecting, toast, hasShownWebsocketInfo]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-discord-surface border-b border-gray-800 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-discord-blue fill-current">
              <path d="M20.222 0c1.406 0 2.54 1.137 2.607 2.475V24l-2.677-2.273-1.47-1.338-1.604-1.398.67 2.205H3.71c-1.402 0-2.54-1.065-2.54-2.476V2.48C1.17 1.142 2.31.003 3.715.003h16.5L20.222 0zm-6.118 5.683h-.03l-.202.2c2.073.6 3.076 1.537 3.076 1.537-1.336-.668-2.54-1.002-3.744-1.137-.87-.135-1.74-.064-2.475 0h-.2c-.47 0-1.47.2-2.81.735-.467.203-.735.336-.735.336s1.002-1.002 3.21-1.537l-.135-.135s-1.672-.064-3.477 1.27c0 0-1.805 3.144-1.805 7.02 0 0 1 1.74 3.743 1.806 0 0 .4-.533.805-1.002-1.54-.468-2.14-1.404-2.14-1.404s.134.066.335.2h.06c.03 0 .044.015.06.03v.006c.016.016.03.03.06.03.33.136.66.27.93.4.466.202 1.065.403 1.8.536.93.135 1.996.2 3.21 0 .6-.135 1.2-.267 1.8-.535.39-.2.87-.4 1.397-.737 0 0-.6.936-2.205 1.404.33.466.795 1 .795 1 2.744-.06 3.81-1.8 3.87-1.726 0-3.87-1.815-7.02-1.815-7.02-1.635-1.214-3.165-1.26-3.435-1.26l.056-.02zm.168 4.413c.703 0 1.27.6 1.27 1.335 0 .74-.57 1.34-1.27 1.34-.7 0-1.27-.6-1.27-1.334.002-.74.573-1.338 1.27-1.338zm-4.543 0c.7 0 1.266.6 1.266 1.335 0 .74-.57 1.34-1.27 1.34-.7 0-1.27-.6-1.27-1.334 0-.74.57-1.338 1.27-1.338z" />
            </svg>
            <h1 className="text-xl font-semibold">Discord 24/7 Presence</h1>
          </div>
          <ConnectionStatus status={connectionStatus} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <AccountStatusCard />
          <VoiceConnectionCard />
          <SettingsAndLogsCard />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-discord-surface py-3 px-4 border-t border-gray-800">
        <div className="container mx-auto flex justify-between items-center">
          <div className="text-sm text-discord-muted">
            <span>Uptime: {uptime || "Calculating..."}</span>
          </div>
          <div className="text-sm text-discord-muted">Discord 24/7 Presence</div>
        </div>
      </footer>
    </div>
  );
}
