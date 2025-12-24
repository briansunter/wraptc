/**
 * Capability System - Typed capabilities for terminal coders
 *
 * Provides a structured way to declare and query provider capabilities.
 */

/**
 * Standard capability types
 */
export const Capability = {
	// Coding modes
	GENERATE: "generate",
	EDIT: "edit",
	EXPLAIN: "explain",
	TEST: "test",
	REVIEW: "review",
	REFACTOR: "refactor",

	// Input handling
	FILE_CONTEXT: "file_context",
	MULTI_FILE: "multi_file",
	SYSTEM_PROMPT: "system_prompt",

	// Output features
	STREAMING: "streaming",
	JSON_OUTPUT: "json_output",
	USAGE_TRACKING: "usage_tracking",

	// Advanced features
	MODEL_SELECTION: "model_selection",
	TEMPERATURE_CONTROL: "temperature_control",
	MAX_TOKENS: "max_tokens",
} as const;

export type CapabilityType = (typeof Capability)[keyof typeof Capability];

/**
 * Capabilities interface - what a provider can do
 */
export interface ICapabilities {
	/** Supported coding modes */
	readonly supportedModes: ReadonlySet<string>;

	// Input capabilities
	readonly supportsFileContext: boolean;
	readonly supportsMultiFile: boolean;
	readonly supportsSystemPrompt: boolean;

	// Output capabilities
	readonly supportsStreaming: boolean;
	readonly supportsJsonOutput: boolean;
	readonly supportsUsageTracking: boolean;

	// Request parameter capabilities
	readonly supportsModelSelection: boolean;
	readonly supportsTemperature: boolean;
	readonly supportsMaxTokens: boolean;

	// Feature discovery
	hasCapability(capability: CapabilityType): boolean;
	getCapabilities(): CapabilityType[];
}

/**
 * Implementation of ICapabilities
 */
export class ProviderCapabilities implements ICapabilities {
	private readonly capabilities: Set<CapabilityType>;

	constructor(capabilityList: CapabilityType[]) {
		this.capabilities = new Set(capabilityList);
	}

	get supportedModes(): ReadonlySet<string> {
		const modes = new Set<string>();
		const modeCapabilities = [
			Capability.GENERATE,
			Capability.EDIT,
			Capability.EXPLAIN,
			Capability.TEST,
			Capability.REVIEW,
			Capability.REFACTOR,
		];

		for (const cap of modeCapabilities) {
			if (this.capabilities.has(cap)) {
				modes.add(cap);
			}
		}

		return modes;
	}

	get supportsFileContext(): boolean {
		return this.capabilities.has(Capability.FILE_CONTEXT);
	}

	get supportsMultiFile(): boolean {
		return this.capabilities.has(Capability.MULTI_FILE);
	}

	get supportsSystemPrompt(): boolean {
		return this.capabilities.has(Capability.SYSTEM_PROMPT);
	}

	get supportsStreaming(): boolean {
		return this.capabilities.has(Capability.STREAMING);
	}

	get supportsJsonOutput(): boolean {
		return this.capabilities.has(Capability.JSON_OUTPUT);
	}

	get supportsUsageTracking(): boolean {
		return this.capabilities.has(Capability.USAGE_TRACKING);
	}

	get supportsModelSelection(): boolean {
		return this.capabilities.has(Capability.MODEL_SELECTION);
	}

	get supportsTemperature(): boolean {
		return this.capabilities.has(Capability.TEMPERATURE_CONTROL);
	}

	get supportsMaxTokens(): boolean {
		return this.capabilities.has(Capability.MAX_TOKENS);
	}

	hasCapability(capability: CapabilityType): boolean {
		return this.capabilities.has(capability);
	}

	getCapabilities(): CapabilityType[] {
		return Array.from(this.capabilities);
	}

	/**
	 * Factory method from string array (for backwards compatibility)
	 */
	static fromStringArray(strings: string[]): ProviderCapabilities {
		const capabilities: CapabilityType[] = [];

		for (const str of strings) {
			// Map legacy string capabilities to typed capabilities
			const mapping: Record<string, CapabilityType> = {
				generate: Capability.GENERATE,
				edit: Capability.EDIT,
				explain: Capability.EXPLAIN,
				test: Capability.TEST,
				review: Capability.REVIEW,
				refactor: Capability.REFACTOR,
				streaming: Capability.STREAMING,
				json_output: Capability.JSON_OUTPUT,
			};

			const cap = mapping[str.toLowerCase()];
			if (cap) capabilities.push(cap);
		}

		return new ProviderCapabilities(capabilities);
	}

	/**
	 * Create capabilities from provider info
	 */
	static fromProviderInfo(info: {
		capabilities?: string[];
		supportsStreaming?: boolean;
		prefersJson?: boolean;
	}): ProviderCapabilities {
		const caps = ProviderCapabilities.fromStringArray(info.capabilities ?? []);
		const allCaps = caps.getCapabilities();

		if (info.supportsStreaming) {
			allCaps.push(Capability.STREAMING);
		}
		if (info.prefersJson) {
			allCaps.push(Capability.JSON_OUTPUT);
		}

		return new ProviderCapabilities(allCaps);
	}
}
