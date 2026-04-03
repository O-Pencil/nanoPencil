declare module "@pencil-agent/nano-pencil" {
	export type ExtensionContext = {
		cwd: string;
		hasUI?: boolean;
		sessionManager: {
			getSessionFile(): string | undefined;
		};
		ui: {
			setStatus(namespace: string, message: string): void;
			notify(message: string, level?: string): void;
		};
		getSettings?: () => {
			nanomem?: {
				autoDream?: {
					enabled?: boolean;
					minHours?: number;
					minSessions?: number;
					scanIntervalMinutes?: number;
				};
				dream?: {
					lockStaleMinutes?: number;
				};
			};
		};
	};

	export type ExtensionAPI = {
		on(event: string, handler: (event: any, context: ExtensionContext) => unknown): void;
		registerCommand(
			name: string,
			command: {
				description: string;
				handler: (args: string, context: ExtensionContext) => unknown;
			},
		): void;
		registerTool(tool: unknown): void;
	};

	export class SessionManager {
		static countTouchedSince(
			cwd: string,
			lastAtMs: number,
			options?: {
				excludeBasename?: string;
			},
		): Promise<number>;
	}
}
