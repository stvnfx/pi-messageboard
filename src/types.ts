export interface Agent {
  id: string;              // "Zeus-a3f2"
  session_id: string;      // full pi session ID
  name: string;            // "Zeus"
  suffix: string;          // "a3f2"
  status: 'online' | 'offline';
  last_heartbeat: number;  // timestamp ms
  inbox_policy: 'board' | 'direct' | 'both';
}

export interface Message {
  id: string;              // uuid
  author: string;          // agent id "Zeus-a3f2"
  timestamp: number;
  category: 'help' | 'info' | 'task' | 'resolved';
  subject: string;
  body: string;
  tags: string[];          // stored as JSON in DB
  status: 'open' | 'claimed' | 'resolved';
  assigned_to?: string;    // agent id, for tasks
}

export interface Reply {
  id: string;
  message_id: string;      // parent message id
  parent_reply_id?: string; // for threading
  author: string;
  timestamp: number;
  body: string;
}

export interface DirectMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  timestamp: number;
  subject: string;
  body: string;
  read: boolean;
}

export interface Mention {
  agent_id: string;
  message_id: string;
  timestamp: number;
}

export type Category = Message['category'];
export type MessageStatus = Message['status'];
export type InboxPolicy = Agent['inbox_policy'];

export const CATEGORIES: Category[] = ['help', 'info', 'task', 'resolved'];
export const MESSAGE_STATUSES: MessageStatus[] = ['open', 'claimed', 'resolved'];
