declare module 'discord-user' {
  export default class DiscordUser {
    constructor(token: string);
    
    user: {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
      setPresence: (options: any) => Promise<void>;
    };
    
    connect(): Promise<void>;
    isConnected(): Promise<boolean>;
    fetchUserInfo(): Promise<any>;
    setStatus(status: 'online' | 'idle' | 'dnd' | 'invisible'): Promise<void>;
    joinVoiceChannel(channelId: string): Promise<void>;
    leaveVoiceChannel(): Promise<void>;
    isReady(): boolean;
  }
}