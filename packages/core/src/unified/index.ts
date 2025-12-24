/**
 * Unified Interface Exports
 */

// Capabilities
export {
	Capability,
	type CapabilityType,
	type ICapabilities,
	ProviderCapabilities,
} from "./capabilities";

// Output
export {
	type IOutput,
	type IOutputMeta,
	type UnifiedStreamChunk,
	type IProviderError as IOutputError,
	type NormalizerConfig,
	DEFAULT_NORMALIZER_CONFIG,
	OutputNormalizer,
} from "./output";

// Errors
export {
	type IProviderError,
	ProviderError,
	classifyErrorMessage,
} from "./errors";
