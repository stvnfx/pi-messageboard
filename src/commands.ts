import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import * as db from './db.js';
import { getMyAgentId } from './tools.js';

export function registerCommands(pi: ExtensionAPI) {
  pi.registerCommand('board', {
    description: 'Show recent public board messages',
    handler: async (_args, ctx) => {
      const messages = db.getMessages({ limit: 10 });
      if (messages.length === 0) {
        ctx.ui.notify('Board is empty.', 'info');
        return;
      }
      const lines = messages.map(m =>
        `[${m.id.slice(0, 8)}] ${m.status.toUpperCase()} ${m.category.toUpperCase()}: ${m.subject} — ${m.author}`
      );
      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });

  pi.registerCommand('inbox', {
    description: 'Show your inbox',
    handler: async (_args, ctx) => {
      const agentId = getMyAgentId();
      const dms = db.getInbox(agentId, false);
      if (dms.length === 0) {
        ctx.ui.notify('Inbox is empty.', 'info');
        return;
      }
      const lines = dms.map(dm =>
        `[${dm.read ? 'read' : 'NEW'}] ${dm.id.slice(0, 8)} from ${dm.from_agent}: ${dm.subject}`
      );
      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });

  pi.registerCommand('who', {
    description: 'List online agents',
    handler: async (_args, ctx) => {
      const agents = db.getOnlineAgents();
      if (agents.length === 0) {
        ctx.ui.notify('No agents online.', 'info');
        return;
      }
      const lines = agents.map(a => `${a.id} — last seen ${new Date(a.last_heartbeat).toISOString()}`);
      ctx.ui.notify(`Online:\n${lines.join('\n')}`, 'info');
    },
  });

  pi.registerCommand('tasks', {
    description: 'Show open tasks on the board',
    handler: async (_args, ctx) => {
      const agentId = getMyAgentId();
      const tasks = db.getMessages({ category: 'task', status: 'open', limit: 20 });
      const myTasks = db.getMessages({ category: 'task', assignedTo: agentId, limit: 20 });
      const all = [...tasks, ...myTasks];
      const unique = [...new Map(all.map(t => [t.id, t])).values()];
      if (unique.length === 0) {
        ctx.ui.notify('No open tasks.', 'info');
        return;
      }
      const lines = unique.map(t => {
        const assignee = t.assigned_to ? ` → ${t.assigned_to}` : '';
        return `[${t.id.slice(0, 8)}] ${t.status.toUpperCase()}: ${t.subject}${assignee} — ${t.author}`;
      });
      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });

  pi.registerCommand('bookmarks', {
    description: 'Show your bookmarked messages',
    handler: async (_args, ctx) => {
      const agentId = getMyAgentId();
      const messages = db.getBookmarks(agentId);
      if (messages.length === 0) {
        ctx.ui.notify('No bookmarks yet.', 'info');
        return;
      }
      const lines = messages.map(m =>
        `[${m.id.slice(0, 8)}] ${m.category.toUpperCase()}: ${m.subject} — ${m.author}`
      );
      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });
}
