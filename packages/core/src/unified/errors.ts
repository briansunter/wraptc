/**
 * Enhanced Error Types
 *
 * Provides structured error handling with categorization and suggestions.
 */

import type { ProviderErrorKind, ProviderErrorContext } from "../types";

/**
 * Enhanced provider error interface
 */
export interface IProviderError extends Error {
	readonly kind: ProviderErrorKind;
	readonly provider: string;
	readonly context: ProviderErrorContext;
	readonly isRetryable: boolean;
	readonly isUserError: boolean;
	readonly suggestedAction?: string;
}

/**
 * Enhanced error class with helpful properties
 */
export class ProviderError extends Error implements IProviderError {
	readonly kind: ProviderErrorKind;
	readonly provider: string;
	readonly context: ProviderErrorContext;

	constructor(
		message: string,
		kind: ProviderErrorKind,
		provider: string,
		context: ProviderErrorContext = {},
	) {
		super(message);
		this.name = "ProviderError";
		this.kind = kind;
		this.provider = provider;
		this.context = context;
	}

	/**
	 * Whether this error is safe to retry
	 */
	get isRetryable(): boolean {
		return ["TRANSIENT", "RATE_LIMIT", "TIMEOUT"].includes(this.kind);
	}

	/**
	 * Whether this error is likely due to user input
	 */
	get isUserError(): boolean {
		return [
			"BAD_REQUEST",
			"UNAUTHORIZED",
			"CONTEXT_LENGTH",
			"CONTENT_FILTER",
		].includes(this.kind);
	}

	/**
	 * Suggested action to resolve the error
	 */
	get suggestedAction(): string | undefined {
		const actions: Partial<Record<ProviderErrorKind, string>> = {
			UNAUTHORIZED: "Check your API key configuration",
			RATE_LIMIT: "Wait and retry, or switch to a different provider",
			OUT_OF_CREDITS: "Check your quota or upgrade your plan",
			CONTEXT_LENGTH: "Reduce the input size or use a different model",
			CONTENT_FILTER: "Modify your prompt to comply with content policies",
			TIMEOUT: "Try again with a shorter prompt or increase timeout",
			BAD_REQUEST: "Check the request format and parameters",
			NOT_FOUND: "Verify the model or endpoint exists",
			FORBIDDEN: "Check your permissions for this operation",
			INTERNAL: "The provider is experiencing issues, try again later",
			TRANSIENT: "This is a temporary error, retry the request",
		};
		return actions[this.kind];
	}

	/**
	 * Create from an adapter error
	 */
	static fromAdapterError(
		err: Error & { kind?: ProviderErrorKind; adapterId?: string; context?: ProviderErrorContext },
	): ProviderError {
		return new ProviderError(
			err.message,
			err.kind ?? "UNKNOWN",
			err.adapterId ?? "unknown",
			err.context ?? {},
		);
	}

	/**
	 * Create from a generic error
	 */
	static fromError(
		err: Error,
		provider: string,
		kind: ProviderErrorKind = "UNKNOWN",
	): ProviderError {
		return new ProviderError(err.message, kind, provider, {});
	}
}

/**
 * Error classification helper
 */
export function classifyErrorMessage(message: string): ProviderErrorKind {
	const lower = message.toLowerCase();

	// Check patterns in priority order
	if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many")) {
		return "RATE_LIMIT";
	}
	if (lower.includes("quota") || lower.includes("credits") || lower.includes("exceeded")) {
		return "OUT_OF_CREDITS";
	}
	if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("api key")) {
		return "UNAUTHORIZED";
	}
	if (lower.includes("forbidden") || lower.includes("403")) {
		return "FORBIDDEN";
	}
	if (lower.includes("not found") || lower.includes("404")) {
		return "NOT_FOUND";
	}
	if (lower.includes("timeout") || lower.includes("timed out")) {
		return "TIMEOUT";
	}
	if (lower.includes("context length") || lower.includes("too long")) {
		return "CONTEXT_LENGTH";
	}
	if (lower.includes("content filter") || lower.includes("blocked")) {
		return "CONTENT_FILTER";
	}
	if (lower.includes("500") || lower.includes("internal error")) {
		return "INTERNAL";
	}
	if (lower.includes("bad request") || lower.includes("400")) {
		return "BAD_REQUEST";
	}

	return "TRANSIENT";
}
