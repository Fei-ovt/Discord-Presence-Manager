import { 
  users, 
  type User, 
  type InsertUser, 
  discordStatus, 
  type DiscordStatus, 
  type InsertDiscordStatus,
  activityLogs,
  type ActivityLog,
  type InsertActivityLog
} from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Discord status methods
  getDiscordStatus(): Promise<DiscordStatus | undefined>;
  createDiscordStatus(status: InsertDiscordStatus): Promise<DiscordStatus>;
  updateDiscordStatus(status: Partial<InsertDiscordStatus>): Promise<DiscordStatus>;
  
  // Activity logs methods
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;
  addActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private discordStatus: DiscordStatus | undefined;
  private activityLogs: ActivityLog[];
  private userCurrentId: number;
  private activityLogCurrentId: number;

  constructor() {
    this.users = new Map();
    this.activityLogs = [];
    this.userCurrentId = 1;
    this.activityLogCurrentId = 1;
    
    // Initialize with default discord status
    this.discordStatus = {
      id: 1,
      token: process.env.DISCORD_TOKEN || '',
      channelId: '',
      statusMode: 'online',
      isAccountActive: true,
      isVoiceActive: false,
      autoReconnect: true,
      systemNotifications: true,
      autoStart: false,
      lastUpdated: new Date()
    };
    
    // Add initial activity log
    this.addActivityLog({
      type: 'system',
      message: 'Application started'
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Discord status methods
  async getDiscordStatus(): Promise<DiscordStatus | undefined> {
    return this.discordStatus;
  }
  
  async createDiscordStatus(insertStatus: InsertDiscordStatus): Promise<DiscordStatus> {
    const status: DiscordStatus = { 
      ...insertStatus, 
      id: 1,
      lastUpdated: new Date()
    };
    
    this.discordStatus = status;
    return status;
  }
  
  async updateDiscordStatus(partialStatus: Partial<InsertDiscordStatus>): Promise<DiscordStatus> {
    if (!this.discordStatus) {
      throw new Error('Discord status not initialized');
    }
    
    this.discordStatus = {
      ...this.discordStatus,
      ...partialStatus,
      lastUpdated: new Date()
    };
    
    return this.discordStatus;
  }
  
  // Activity logs methods
  async getActivityLogs(limit = 20): Promise<ActivityLog[]> {
    // Return logs in reverse order (newest first) with limit
    return [...this.activityLogs].reverse().slice(0, limit);
  }
  
  async addActivityLog(insertLog: InsertActivityLog): Promise<ActivityLog> {
    const log: ActivityLog = {
      ...insertLog,
      id: this.activityLogCurrentId++,
      timestamp: new Date()
    };
    
    // Add to beginning of array (newest first)
    this.activityLogs.push(log);
    
    // Keep only the last 100 logs
    if (this.activityLogs.length > 100) {
      this.activityLogs.shift();
    }
    
    return log;
  }
}

export const storage = new MemStorage();
