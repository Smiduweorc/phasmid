/**
 * Why phasmid refused a call.
 *
 * | code                   | thrown when                                                     | `subject`                      |
 * | ---------------------- | --------------------------------------------------------------- | ------------------------------ |
 * | `email-not-string`     | the email argument is not a string                              | its `typeof`                   |
 * | `resolver-missing`     | the async options have no `resolveMx` function                  | none                           |
 * | `invalid-mx-providers` | `mxProviders` is not an array                                   | none                           |
 * | `invalid-mx-rule`      | an MX rule has no id, a duplicate id, or bad `mxHosts`          | the rule id, when it has one   |
 * | `invalid-mx-override`  | an override names an unknown rule, or a domain maps two ways    | the domain                     |
 * | `invalid-mx-records`   | `resolveMx` or `mxCache.get` returned something not MX records  | `resolveMx` or `mxCache.get`   |
 */
export type PhasmidErrorCode =
	| "email-not-string"
	| "resolver-missing"
	| "invalid-mx-providers"
	| "invalid-mx-rule"
	| "invalid-mx-override"
	| "invalid-mx-records";

/**
 * The one error phasmid throws for its own refusals. Errors from your
 * `resolveMx` or `mxCache` are rethrown as they are, never wrapped in this.
 *
 * It extends `TypeError`, because every refusal is a wrong argument or a wrong
 * return value, and so code that caught `TypeError` before keeps working.
 */
export class PhasmidError extends TypeError {
	override readonly name = "PhasmidError";
	readonly code: PhasmidErrorCode;
	/** What the refusal is about; see {@link PhasmidErrorCode}. */
	readonly subject: string | undefined;

	constructor(code: PhasmidErrorCode, message: string, subject?: string) {
		super(`phasmid: ${message}`);
		this.code = code;
		this.subject = subject;
	}
}
