import React from 'react';

type StatusType = 'connected' | 'connecting' | 'disconnected' | 'error';

interface ConnectionStatusProps {
  status: StatusType;
}

const statusStyles = {
  connected: {
    bg: 'bg-discord-online',
    text: 'text-discord-online',
    label: 'Connected'
  },
  connecting: {
    bg: 'bg-discord-idle',
    text: 'text-discord-idle',
    label: 'Connecting...'
  },
  disconnected: {
    bg: 'bg-discord-invisible',
    text: 'text-discord-invisible',
    label: 'Disconnected'
  },
  error: {
    bg: 'bg-discord-dnd',
    text: 'text-discord-dnd',
    label: 'Connection Error'
  }
};

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  const style = statusStyles[status] || statusStyles.disconnected;
  
  return (
    <div className={`flex items-center px-3 py-1 rounded-full text-sm bg-opacity-20 ${style.bg} ${style.text}`}>
      <span className={`h-2 w-2 rounded-full ${style.bg} mr-2`}></span>
      <span>{style.label}</span>
    </div>
  );
}
