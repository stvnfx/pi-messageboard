import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { MbAgent, MbLoop, MbTaskAssignment } from './types.js';

const DB_DIR = join(homedir(), '.pi', 'agent', 'messageboard');
const DB_PATH = join(DB_DIR, 'mb.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mb_agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      suffix TEXT NOT NULL,
      status TEXT DEFAULT 'online',
      last_heartbeat INTEGER,
      task TEXT,
      task_post_id TEXT,
      spawned_by TEXT,
      spawn_time INTEGER NOT NULL,
      loop_id TEXT
    );

    CREATE TABLE IF NOT EXISTS mb_loops (
      id TEXT PRIMARY KEY,
      owner_agent TEXT NOT NULL,
      goal TEXT NOT NULL,
      criteria TEXT DEFAULT '',
      status TEXT DEFAULT 'running',
      iteration INTEGER DEFAULT 0,
      max_iterations INTEGER DEFAULT 0,
      agent_ids TEXT DEFAULT '[]',
      post_id TEXT,
      start_time INTEGER NOT NULL,
      last_update INTEGER NOT NULL,
      last_notice TEXT DEFAULT '',
      check_command TEXT,
      model TEXT
    );

    CREATE TABLE IF NOT EXISTS mb_task_assignments (
      task_post_id TEXT PRIMARY KEY,
      assigned_to TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function parseJsonArray(text: string): string[] {
  try { return JSON.parse(text); } catch { return []; }
}

// ─── MbAgent Operations ─────────────────────────────────────────────

export function registerMbAgent(agent: Omit<MbAgent, 'spawn_time'> & { spawn_time?: number }): MbAgent {
  const d = getDb();
  const now = Date.now();
  const full: MbAgent = { ...agent, spawn_time: agent.spawn_time ?? now };
  d.prepare(`
    INSERT INTO mb_agents (id, session_id, name, suffix, status, last_heartbeat, task, task_post_id, spawned_by, spawn_time, loop_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      last_heartbeat = excluded.last_heartbeat,
      task = excluded.task,
      task_post_id = excluded.task_post_id
  `).run(full.id, full.session_id, full.name, full.suffix, full.status, full.last_heartbeat ?? now,
    full.task ?? null, full.task_post_id ?? null, full.spawned_by ?? null, full.spawn_time, full.loop_id ?? null);
  return getMbAgent(full.id)!;
}

export function getMbAgent(id: string): MbAgent | null {
  const d = getDb();
  const row = d.prepare('SELECT * FROM mb_agents WHERE id = ?').get(id) as any;
  return row ?? null;
}

export function getAllMbAgents(): MbAgent[] {
  const d = getDb();
  return d.prepare('SELECT * FROM mb_agents ORDER BY spawn_time DESC').all() as MbAgent[];
}

export function getOnlineMbAgents(): MbAgent[] {
  const d = getDb();
  const twoMinAgo = Date.now() - 2 * 60 * 1000;
  d.prepare('UPDATE mb_agents SET status = ? WHERE status = ? AND last_heartbeat < ?')
    .run('offline', 'online', twoMinAgo);
  return d.prepare('SELECT * FROM mb_agents WHERE status IN (?, ?) ORDER BY name')
    .all('online', 'busy') as MbAgent[];
}

export function updateMbAgentHeartbeat(id: string): void {
  const d = getDb();
  d.prepare('UPDATE mb_agents SET last_heartbeat = ?, status = ? WHERE id = ?')
    .run(Date.now(), 'online', id);
}

export function setMbAgentOffline(id: string): void {
  const d = getDb();
  d.prepare('UPDATE mb_agents SET status = ? WHERE id = ?').run('offline', id);
}

export function setMbAgentTask(id: string, task: string, taskPostId?: string): void {
  const d = getDb();
  d.prepare('UPDATE mb_agents SET task = ?, task_post_id = ?, status = ? WHERE id = ?')
    .run(task, taskPostId ?? null, 'busy', id);
}

export function clearMbAgentTask(id: string): void {
  const d = getDb();
  d.prepare('UPDATE mb_agents SET task = NULL, task_post_id = NULL, status = ? WHERE id = ?')
    .run('online', id);
}

// ─── MbLoop Operations ──────────────────────────────────────────────

export function createMbLoop(ownerAgent: string, goal: string, criteria: string, maxIterations: number, model?: string): MbLoop {
  const d = getDb();
  const id = randomUUID();
  const now = Date.now();
  d.prepare(`
    INSERT INTO mb_loops (id, owner_agent, goal, criteria, status, iteration, max_iterations, agent_ids, start_time, last_update, model)
    VALUES (?, ?, ?, ?, 'running', 0, ?, '[]', ?, ?, ?)
  `).run(id, ownerAgent, goal, criteria, maxIterations, now, now, model ?? null);
  return getMbLoop(id)!;
}

export function getMbLoop(id: string): MbLoop | null {
  const d = getDb();
  const row = d.prepare('SELECT * FROM mb_loops WHERE id = ?').get(id) as any;
  if (!row) return null;
  return { ...row, agent_ids: parseJsonArray(row.agent_ids) };
}

export function getActiveMbLoops(): MbLoop[] {
  const d = getDb();
  const rows = d.prepare("SELECT * FROM mb_loops WHERE status IN ('running', 'stuck') ORDER BY start_time DESC").all() as any[];
  return rows.map(r => ({ ...r, agent_ids: parseJsonArray(r.agent_ids) }));
}

export function updateMbLoop(id: string, updates: Partial<MbLoop>): void {
  const d = getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
  if (updates.iteration !== undefined) { sets.push('iteration = ?'); vals.push(updates.iteration); }
  if (updates.agent_ids !== undefined) { sets.push('agent_ids = ?'); vals.push(JSON.stringify(updates.agent_ids)); }
  if (updates.post_id !== undefined) { sets.push('post_id = ?'); vals.push(updates.post_id); }
  if (updates.last_notice !== undefined) { sets.push('last_notice = ?'); vals.push(updates.last_notice); }
  if (updates.check_command !== undefined) { sets.push('check_command = ?'); vals.push(updates.check_command); }
  sets.push('last_update = ?'); vals.push(Date.now());
  vals.push(id);
  d.prepare(`UPDATE mb_loops SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function addAgentToLoop(loopId: string, agentId: string): void {
  const loop = getMbLoop(loopId);
  if (!loop) return;
  const agents = [...new Set([...loop.agent_ids, agentId])];
  updateMbLoop(loopId, { agent_ids: agents });
}

// ─── MbTaskAssignment Operations ────────────────────────────────────

export function createTaskAssignment(taskPostId: string, assignedTo: string, assignedBy: string): MbTaskAssignment {
  const d = getDb();
  const now = Date.now();
  d.prepare(`
    INSERT INTO mb_task_assignments (task_post_id, assigned_to, assigned_by, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(task_post_id) DO UPDATE SET
      assigned_to = excluded.assigned_to,
      status = 'pending',
      updated_at = excluded.updated_at
  `).run(taskPostId, assignedTo, assignedBy, now, now);
  return d.prepare('SELECT * FROM mb_task_assignments WHERE task_post_id = ?').get(taskPostId) as MbTaskAssignment;
}

export function updateTaskAssignment(taskPostId: string, status: MbTaskAssignment['status']): void {
  const d = getDb();
  d.prepare('UPDATE mb_task_assignments SET status = ?, updated_at = ? WHERE task_post_id = ?')
    .run(status, Date.now(), taskPostId);
}

export function getAgentTasks(agentId: string): MbTaskAssignment[] {
  const d = getDb();
  return d.prepare('SELECT * FROM mb_task_assignments WHERE assigned_to = ? ORDER BY created_at DESC')
    .all(agentId) as MbTaskAssignment[];
}

// ─── Utility ────────────────────────────────────────────────────────

export function closeMbDb(): void {
  if (db) { db.close(); db = null; }
}

export function resetMbAll(): void {
  const d = getDb();
  d.exec('DELETE FROM mb_task_assignments; DELETE FROM mb_loops; DELETE FROM mb_agents;');
}
