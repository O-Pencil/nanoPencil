/**
 * [UPSTREAM]: No external dependencies
 * [SURFACE]: ResourceCollision, ResourceDiagnostic
 * [LOCUS]: core/diagnostics.ts - resource collision and diagnostic types
 * [COVENANT]: Change diagnostics → update this header
 */
export interface ResourceCollision {
	resourceType: "extension" | "skill" | "prompt" | "theme";
	name: string; // skill name, command/tool/flag name, prompt name, theme name
	winnerPath: string;
	loserPath: string;
	winnerSource?: string; // e.g., "npm:foo", "git:...", "local"
	loserSource?: string;
}

export interface ResourceDiagnostic {
	type: "warning" | "error" | "collision";
	message: string;
	path?: string;
	collision?: ResourceCollision;
}
