import * as db from './db.js';

export interface BoardStats {
  totalMessages: number;
  openMessages: number;
  resolvedMessages: number;
  totalReplies: number;
  totalAgents: number;
  onlineAgents: number;
  messagesByCategory: Record<string, number>;
  topPosters: Array<{ agent: string; count: number }>;
  recentActivity: Array<{ timestamp: number; type: string; subject?: string; author: string }>;
}

export function getBoardStats(): BoardStats {
  const d = (db as any).getDb?.() ?? null;
  if (!d) {
    return {
      totalMessages: 0, openMessages: 0, resolvedMessages: 0,
      totalReplies: 0, totalAgents: 0, onlineAgents: 0,
      messagesByCategory: {}, topPosters: [], recentActivity: [],
    };
  }

  const totalMessages = (d.prepare('SELECT COUNT(*) as c FROM messages').get() as any).c;
  const openMessages = (d.prepare("SELECT COUNT(*) as c FROM messages WHERE status = 'open'").get() as any).c;
  const resolvedMessages = (d.prepare("SELECT COUNT(*) as c FROM messages WHERE status = 'resolved'").get() as any).c;
  const totalReplies = (d.prepare('SELECT COUNT(*) as c FROM replies').get() as any).c;
  const totalAgents = (d.prepare('SELECT COUNT(*) as c FROM agents').get() as any).c;
  const onlineAgents = (d.prepare("SELECT COUNT(*) as c FROM agents WHERE status = 'online'").get() as any).c;

  const catRows = d.prepare('SELECT category, COUNT(*) as c FROM messages GROUP BY category').all() as any[];
  const messagesByCategory: Record<string, number> = {};
  for (const row of catRows) messagesByCategory[row.category] = row.c;

  const topPosters = d.prepare('SELECT author as agent, COUNT(*) as c FROM messages GROUP BY author ORDER BY c DESC LIMIT 5').all() as Array<{ agent: string; count: number }>;

  const recentActivity = d.prepare(`
    SELECT timestamp, 'message' as type, subject, author FROM messages
    UNION ALL
    SELECT timestamp, 'reply' as type, NULL as subject, author FROM replies
    ORDER BY timestamp DESC LIMIT 10
  `).all() as Array<{ timestamp: number; type: string; subject?: string; author: string }>;

  return { totalMessages, openMessages, resolvedMessages, totalReplies, totalAgents, onlineAgents, messagesByCategory, topPosters, recentActivity };
}

export function formatStats(stats: BoardStats): string {
  const lines = [
    `📊 Board Stats`,
    `Messages: ${stats.totalMessages} (open: ${stats.openMessages}, resolved: ${stats.resolvedMessages})`,
    `Replies: ${stats.totalReplies}`,
    `Agents: ${stats.totalAgents} (online: ${stats.onlineAgents})`,
    ``,
    `Categories:`,
    ...Object.entries(stats.messagesByCategory).map(([cat, count]) => `  ${cat}: ${count}`),
    ``,
    `Top posters:`,
    ...stats.topPosters.map(p => `  ${p.agent}: ${p.count} messages`),
  ];
  return lines.join('\n');
}
