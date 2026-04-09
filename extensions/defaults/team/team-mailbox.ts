/**
 * [WHO]: TeamMailbox, MailboxMessage, MailboxMessageType, MailboxDirection
 * [FROM]: No external deps
 * [TO]: Consumed by team-runtime.ts, index.ts
 * [HERE]: extensions/defaults/team/team-mailbox.ts - Phase B B.3 mailbox protocol
 *
 * Per refactor plan §B.3: mailbox is the single channel between the leader
 * and teammates; no direct callbacks are allowed. The implementation is a
 * typed in-memory append-only log with subscribe() for live observers.
 *
 * Mailbox messages are NOT persisted across restarts in v1 — durability lives
 * in TeamStateStore (one entry per teammate). This is the explicit scope of
 * the §B.3 milestone, the doc punts cross-restart mailbox replay to a later
 * iteration.
 */

export type MailboxMessageType =
	| "task_request"
	| "task_progress"
	| "task_result"
	| "permission_request"
	| "permission_response"
	| "plan_approval_request"
	| "plan_approval_response"
	| "mode_change"
	| "shutdown_request"
	| "shutdown_ack";

export type MailboxDirection = "leader_to_teammate" | "teammate_to_leader";

export interface MailboxMessage {
	id: string;
	teammateId: string;
	teammateName: string;
	type: MailboxMessageType;
	direction: MailboxDirection;
	payload: Record<string, unknown>;
	timestamp: number;
}

export type MailboxListener = (message: MailboxMessage) => void;

/**
 * Append-only typed mailbox shared by all teammates. Bounded by
 * `maxMessages` to prevent unbounded growth in long-lived sessions; oldest
 * messages drop first.
 */
export class TeamMailbox {
	private messages: MailboxMessage[] = [];
	private listeners: Set<MailboxListener> = new Set();
	private readonly maxMessages: number;

	constructor(maxMessages = 1000) {
		this.maxMessages = maxMessages;
	}

	/** Post a new message and notify listeners. */
	post(message: Omit<MailboxMessage, "id" | "timestamp">): MailboxMessage {
		const full: MailboxMessage = {
			...message,
			id: crypto.randomUUID(),
			timestamp: Date.now(),
		};
		this.messages.push(full);
		if (this.messages.length > this.maxMessages) {
			this.messages.splice(0, this.messages.length - this.maxMessages);
		}
		for (const listener of this.listeners) {
			try {
				listener(full);
			} catch {
				// Listener errors must not poison the mailbox.
			}
		}
		return full;
	}

	/** All messages, optionally filtered by teammate id. */
	list(teammateId?: string): MailboxMessage[] {
		if (!teammateId) return [...this.messages];
		return this.messages.filter((m) => m.teammateId === teammateId);
	}

	/** Subscribe to live mailbox events. Returns an unsubscribe handle. */
	subscribe(listener: MailboxListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Drop all messages owned by a teammate (called on terminate). */
	clearTeammate(teammateId: string): void {
		this.messages = this.messages.filter((m) => m.teammateId !== teammateId);
	}
}
