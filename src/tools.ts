import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import * as db from './db.js';

let myAgentId: string | null = null;

export function setMyAgentId(id: string) {
  myAgentId = id;
}

export function getMyAgentId(): string {
  if (!myAgentId) throw new Error('Agent not registered. Wait for session_start.');
  return myAgentId;
}

export function registerTools(pi: ExtensionAPI) {
  // ─── Board Tools ────────────────────────────────────────────────

  pi.registerTool({
    name: 'messageboard_post',
    label: 'Messageboard Post',
    description: 'Post a message to the public message board',
    promptSnippet: 'Post a message to the shared message board',
    promptGuidelines: [
      'Use messageboard_post to ask for help, share info, or assign tasks to other agents.',
      'messageboard_post accepts category (help/info/task/resolved), subject, body, tags, and optional assigned_to.',
    ],
    parameters: Type.Object({
      category: Type.Union([
        Type.Literal('help'),
        Type.Literal('info'),
        Type.Literal('task'),
        Type.Literal('resolved'),
      ]),
      subject: Type.String({ description: 'Short subject line' }),
      body: Type.String({ description: 'Full message body (supports markdown)' }),
      tags: Type.Optional(Type.Array(Type.String(), { description: 'Tags for categorization' })),
      assigned_to: Type.Optional(Type.String({ description: 'Agent ID to assign task to (for task category)' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const agentId = getMyAgentId();
      const msg = db.createMessage(agentId, params.category, params.subject, params.body, params.tags ?? [], params.assigned_to);

      // Check for mentions and notify
      const mentions = db.extractMentions(params.body);
      for (const mentionedId of mentions) {
        if (mentionedId !== agentId) {
          const mentionedAgent = db.getAgent(mentionedId);
          if (mentionedAgent?.status === 'online') {
            ctx.ui.notify(`${agentId} mentioned you in "${params.subject}"`, 'info');
          }
        }
      }

      return {
        content: [{ type: 'text', text: `Posted to board: "${params.subject}" (${msg.id.slice(0, 8)})` }],
        details: { messageId: msg.id, mentions },
      };
    },
  });

  pi.registerTool({
    name: 'messageboard_read',
    label: 'Messageboard Read',
    description: 'Read messages from the public board',
    promptSnippet: 'Read messages from the shared board',
    promptGuidelines: [
      'Use messageboard_read to see what other agents are discussing.',
      'messageboard_read accepts optional filters: category, status, tag, author, and limit.',
    ],
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: 'Filter by category: help, info, task, resolved' })),
      status: Type.Optional(Type.String({ description: 'Filter by status: open, claimed, resolved' })),
      tag: Type.Optional(Type.String({ description: 'Filter by tag' })),
      author: Type.Optional(Type.String({ description: 'Filter by author agent ID' })),
      limit: Type.Optional(Type.Number({ description: 'Max messages to return (default 20)' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const messages = db.getMessages({
        category: params.category as any,
        status: params.status as any,
        tag: params.tag,
        author: params.author,
        limit: params.limit,
      });

      if (messages.length === 0) {
        return { content: [{ type: 'text', text: 'No messages found matching your filters.' }], details: {} };
      }

      const formatted = messages.map(m =>
        `[${m.id.slice(0, 8)}] (${m.status.toUpperCase()}) ${m.category.toUpperCase()}: ${m.subject}\n  by ${m.author} | ${new Date(m.timestamp).toISOString()}\n  ${m.body.slice(0, 200)}${m.body.length > 200 ? '...' : ''}`
      ).join('\n\n');

      return { content: [{ type: 'text', text: formatted }], details: { count: messages.length } };
    },
  });

  pi.registerTool({
    name: 'messageboard_reply',
    label: 'Messageboard Reply',
    description: 'Reply to a message on the board',
    promptSnippet: 'Reply to a board message',
    promptGuidelines: [
      'Use messageboard_reply to respond to a message thread.',
      'messageboard_reply requires the parent message ID and your reply body.',
    ],
    parameters: Type.Object({
      message_id: Type.String({ description: 'ID of the message to reply to' }),
      body: Type.String({ description: 'Reply body (supports markdown)' }),
      parent_reply_id: Type.Optional(Type.String({ description: 'ID of the parent reply for threading (optional)' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const agentId = getMyAgentId();
      const msg = db.getMessage(params.message_id);
      if (!msg) {
        return { content: [{ type: 'text', text: `Message ${params.message_id} not found.` }], details: {}, isError: true };
      }
      const reply = db.createReply(params.message_id, agentId, params.body, params.parent_reply_id);
      return {
        content: [{ type: 'text', text: `Replied to "${msg.subject}" (${reply.id.slice(0, 8)})` }],
        details: { replyId: reply.id },
      };
    },
  });

  pi.registerTool({
    name: 'messageboard_close',
    label: 'Messageboard Close',
    description: 'Mark a message as resolved on the board',
    promptSnippet: 'Mark a board message as resolved',
    promptGuidelines: [
      'Use messageboard_close when a question is answered or a task is completed.',
    ],
    parameters: Type.Object({
      message_id: Type.String({ description: 'ID of the message to close' }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const msg = db.getMessage(params.message_id);
      if (!msg) {
        return { content: [{ type: 'text', text: `Message ${params.message_id} not found.` }], details: {}, isError: true };
      }
      db.updateMessageStatus(params.message_id, 'resolved');
      return {
        content: [{ type: 'text', text: `Resolved "${msg.subject}"` }],
        details: { resolved: true },
      };
    },
  });

  pi.registerTool({
    name: 'messageboard_search',
    label: 'Messageboard Search',
    description: 'Search messages on the board by query',
    promptSnippet: 'Search the message board',
    promptGuidelines: [
      'Use messageboard_search to find messages matching a query across subject and body.',
    ],
    parameters: Type.Object({
      query: Type.String({ description: 'Search query' }),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 20)' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const messages = db.searchMessages(params.query, params.limit);
      if (messages.length === 0) {
        return { content: [{ type: 'text', text: `No messages found for "${params.query}".` }], details: {} };
      }
      const formatted = messages.map(m =>
        `[${m.id.slice(0, 8)}] (${m.status.toUpperCase()}) ${m.category.toUpperCase()}: ${m.subject}\n  by ${m.author} | ${new Date(m.timestamp).toISOString()}\n  ${m.body.slice(0, 200)}${m.body.length > 200 ? '...' : ''}`
      ).join('\n\n');
      return { content: [{ type: 'text', text: formatted }], details: { count: messages.length } };
    },
  });

  // ─── Agent / Inbox Tools ────────────────────────────────────────

  pi.registerTool({
    name: 'agent_list_online',
    label: 'List Online Agents',
    description: 'List all currently online agents',
    promptSnippet: 'Show online agents',
    promptGuidelines: [
      'Use agent_list_online to see who is available for direct communication.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: Record<string, never>, _signal: AbortSignal, _onUpdate?: unknown, _ctx?: unknown) {
      const agents = db.getOnlineAgents();
      if (agents.length === 0) {
        return { content: [{ type: 'text', text: 'No agents currently online.' }], details: {} };
      }
      const formatted = agents.map(a =>
        `${a.id} (${a.name}) — last seen ${new Date(a.last_heartbeat).toISOString()}`
      ).join('\n');
      return { content: [{ type: 'text', text: `Online agents:\n${formatted}` }], details: { count: agents.length } };
    },
  });

  pi.registerTool({
    name: 'agent_send_dm',
    label: 'Send Direct Message',
    description: 'Send a direct message to another agent',
    promptSnippet: 'DM another agent',
    promptGuidelines: [
      'Use agent_send_dm to privately message another agent.',
      'agent_send_dm requires recipient agent ID, subject, and body.',
    ],
    parameters: Type.Object({
      to_agent: Type.String({ description: 'Recipient agent ID (e.g. Zeus-a3f2)' }),
      subject: Type.String({ description: 'Message subject' }),
      body: Type.String({ description: 'Message body (supports markdown)' }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const agentId = getMyAgentId();
      const recipient = db.getAgent(params.to_agent);
      if (!recipient) {
        return { content: [{ type: 'text', text: `Agent "${params.to_agent}" not found.` }], details: {}, isError: true };
      }
      if (recipient.status === 'offline') {
        ctx.ui.notify(`Warning: ${params.to_agent} is offline`, 'info');
      }
      const dm = db.sendDirectMessage(agentId, params.to_agent, params.subject, params.body);
      return {
        content: [{ type: 'text', text: `DM sent to ${params.to_agent} (${dm.id.slice(0, 8)})` }],
        details: { dmId: dm.id },
      };
    },
  });

  pi.registerTool({
    name: 'agent_read_inbox',
    label: 'Read Inbox',
    description: 'Read your direct message inbox',
    promptSnippet: 'Read DM inbox',
    promptGuidelines: [
      'Use agent_read_inbox to check for direct messages from other agents.',
      'agent_read_inbox accepts optional unreadOnly flag.',
    ],
    parameters: Type.Object({
      unread_only: Type.Optional(Type.Boolean({ description: 'Show only unread messages (default false)' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const agentId = getMyAgentId();
      const dms = db.getInbox(agentId, params.unread_only ?? false);
      if (dms.length === 0) {
        return { content: [{ type: 'text', text: 'Inbox is empty.' }], details: {} };
      }
      const formatted = dms.map(dm =>
        `[${dm.read ? 'read' : 'NEW'}] ${dm.id.slice(0, 8)} from ${dm.from_agent}\n  Subject: ${dm.subject}\n  ${dm.body.slice(0, 200)}${dm.body.length > 200 ? '...' : ''}`
      ).join('\n\n');
      // Mark as read
      for (const dm of dms) {
        if (!dm.read) db.markAsRead(dm.id);
      }
      return { content: [{ type: 'text', text: `Inbox (${dms.length} messages):\n${formatted}` }], details: { count: dms.length } };
    },
  });

  // ─── Bookmark Tools ──────────────────────────────────────────────

  pi.registerTool({
    name: 'messageboard_bookmark',
    label: 'Bookmark Message',
    description: 'Save a message to your bookmarks for later reference',
    promptSnippet: 'Bookmark a board message',
    promptGuidelines: [
      'Use messageboard_bookmark to save useful messages for later.',
    ],
    parameters: Type.Object({
      message_id: Type.String({ description: 'ID of the message to bookmark' }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const agentId = getMyAgentId();
      const msg = db.getMessage(params.message_id);
      if (!msg) {
        return { content: [{ type: 'text', text: `Message ${params.message_id} not found.` }], details: {}, isError: true };
      }
      db.addBookmark(agentId, params.message_id);
      return {
        content: [{ type: 'text', text: `Bookmarked: "${msg.subject}"` }],
        details: { bookmarked: true },
      };
    },
  });

  pi.registerTool({
    name: 'messageboard_read_thread',
    label: 'Read Thread',
    description: 'Read all replies in a message thread',
    promptSnippet: 'Read message thread',
    promptGuidelines: [
      'Use messageboard_read_thread to see the full conversation on a message.',
    ],
    parameters: Type.Object({
      message_id: Type.String({ description: 'ID of the message thread to read' }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const msg = db.getMessage(params.message_id);
      if (!msg) {
        return { content: [{ type: 'text', text: `Message ${params.message_id} not found.` }], details: {}, isError: true };
      }
      const replies = db.getThreadedReplies(params.message_id);
      const header = `[${msg.id.slice(0, 8)}] ${msg.category.toUpperCase()}: ${msg.subject}\n  by ${msg.author} | ${new Date(msg.timestamp).toISOString()}\n  ${msg.body}`;
      if (replies.length === 0) {
        return { content: [{ type: 'text', text: header + '\n\nNo replies yet.' }], details: {} };
      }
      const replyText = replies.map((r, i) => {
        const indent = r.parent_reply_id ? '  └─ ' : '  ';
        return `${indent}[${i + 1}] ${r.author} (${new Date(r.timestamp).toISOString()}):\n      ${r.body}`;
      }).join('\n');
      return { content: [{ type: 'text', text: `${header}\n\nReplies (${replies.length}):\n${replyText}` }], details: { replyCount: replies.length } };
    },
  });
}
