/**
 * [WHO]: Provides shared dev-loop artifact and verification types
 * [FROM]: Depends on no runtime modules; type-only contracts for repo scripts
 * [TO]: Consumed by scripts/dev-loop parser, runner, GitHub provider, and watch state
 * [HERE]: scripts/dev-loop/types.ts within repo-level development loop infrastructure
 */

export type IssueSource = "local" | "github";
export type IssueStatus = "open" | "fixed" | "blocked";
export type DevLoopDecision = "continue" | "complete" | "blocked";
export type VerificationCategory = "dip" | "quality" | "package-boundary" | "build" | "typecheck" | "test" | "github" | "other";

export interface VerificationCommand {
	id: string;
	label: string;
	command: string;
	required: boolean;
	category: VerificationCategory;
	timeoutMs?: number;
}

export interface VerificationPlan {
	schemaVersion: 1;
	repository: string;
	description: string;
	artifactRoot: string;
	commands: VerificationCommand[];
	prChecks: {
		provider: "gh";
		command: string;
		watchCommand: string;
	};
}

export interface IssueEvidence {
	source: IssueSource;
	commandId: string;
	command: string;
	exitCode: number | null;
	summary: string;
	logRef: string;
	excerpt: string;
	observedAt: string;
}

export interface IssueRecord {
	id: string;
	source: IssueSource;
	commandId: string;
	command: string;
	exitCode: number | null;
	kind: string;
	signature: string;
	summary: string;
	evidence: IssueEvidence[];
	status: IssueStatus;
	attemptCount: number;
	lastFailureLogRef: string;
}

export interface VerificationCommandResult {
	id: string;
	label: string;
	command: string;
	category: VerificationCategory;
	required: boolean;
	startedAt: string;
	endedAt: string;
	exitCode: number;
	rawLogRef: string;
	compactLogRef: string;
}

export interface VerificationRun {
	schemaVersion: 1;
	runId: string;
	repoRoot: string;
	artifactDir: string;
	startedAt: string;
	endedAt: string;
	decision: DevLoopDecision;
	commands: VerificationCommandResult[];
	issues: IssueRecord[];
	blockedReason?: string;
	currentIssueSignature?: string;
}

export interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export type ExecCommand = (command: string, options: { cwd: string; timeoutMs?: number; killGraceMs?: number }) => Promise<ExecResult>;

export interface WatchDecisionInput {
	localGreen: boolean;
	remoteGreen: boolean | null;
	issues: Array<Pick<IssueRecord, "signature" | "attemptCount" | "status">>;
	maxAttemptsPerIssue?: number;
}

export interface WatchDecision {
	decision: DevLoopDecision;
	reason?: string;
	nextDelayMs?: number;
	currentIssueSignature?: string;
}

export type AutonomyReadiness = "green" | "repair-ready" | "blocked" | "needs-evidence";

export interface AutonomyState {
	schemaVersion: 1;
	readiness: AutonomyReadiness;
	decision: DevLoopDecision;
	nextAction: string;
	nextIssueSignature?: string;
	requiredFailures: string[];
	optionalFailures: string[];
	handoffMarkdown: string;
}
