export interface MbAgent {
	id: string; // "Zeus-a3f2"
	session_id: string;
	name: string;
	suffix: string;
	status: "online" | "offline" | "busy";
	last_heartbeat: number;
	task?: string; // current task description
	task_post_id?: string; // board message ID for current task
	spawned_by?: string; // parent agent ID
	spawn_time: number;
	loop_id?: string; // if part of a loop
}

export interface MbLoop {
	id: string; // uuid
	owner_agent: string; // who started the loop
	goal: string;
	criteria: string;
	status: "running" | "paused" | "completed" | "stuck";
	iteration: number;
	max_iterations: number;
	agent_ids: string[]; // spawned agents
	post_id?: string; // board message for loop tracking
	start_time: number;
	last_update: number;
	last_notice: string;
	check_command?: string;
	model?: string;
	rescue_model?: string;
	consecutive_stuck: number;
	rescue_active: boolean;
}

export interface MbTaskAssignment {
	task_post_id: string;
	assigned_to: string;
	assigned_by: string;
	status: "pending" | "claimed" | "in_progress" | "completed" | "failed";
	created_at: number;
	updated_at: number;
}

export type MbAgentStatus = MbAgent["status"];
export type MbLoopStatus = MbLoop["status"];
