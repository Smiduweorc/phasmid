/**
 * Phasmid: provider-aware email normalization and canonicalization.
 *
 * @example
 * ```ts
 * import { normalizeEmail, isSameEmail } from "Phasmid";
 *
 * normalizeEmail("John.Doe+newsletter@googlemail.com"); // "johndoe@gmail.com"
 * isSameEmail("a.b@gmail.com", "ab@gmail.com");          // true
 * ```
 */

export {
	normalizeEmail,
	normalizeEmailDetailed,
	getEmailProvider,
	isSameEmail,
} from "./src/normalize.js";

export {
	normalizeEmailAsync,
	normalizeEmailDetailedAsync,
	getEmailProviderAsync,
	isSameEmailAsync,
} from "./src/mx.js";

export { PhasmidError, type PhasmidErrorCode } from "./src/errors.js";

export { DEFAULT_PROVIDERS, DEFAULT_MX_PROVIDERS } from "./src/providers.js";

export type {
	ProviderRule,
	DefaultRule,
	LocalPartRules,
	NormalizeOptions,
	NormalizedEmail,
	MxProviderRule,
	MxRecord,
	MxResolver,
	MxCache,
	MxNormalizeOptions,
} from "./src/types.js";