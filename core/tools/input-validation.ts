/**
 * [WHO]: Provides validateIntegerWindowOption(), validatePositiveNumberOption()
 * [FROM]: No external dependencies
 * [TO]: Consumed by read/find/grep/ls tools for numeric window validation
 * [HERE]: core/tools/input-validation.ts - shared input invariant helpers for tool schemas
 */
export interface IntegerWindowOption {
	name: string;
	value: number | undefined;
	minimum: number;
}

export function validateIntegerWindowOption({ name, value, minimum }: IntegerWindowOption): void {
	if (value === undefined) return;
	if (!Number.isInteger(value) || value < minimum) {
		throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
	}
}

export function validatePositiveNumberOption(name: string, value: number | undefined): void {
	if (value === undefined) return;
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive number`);
	}
}
