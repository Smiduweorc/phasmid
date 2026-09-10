/**
 * The set of transformations that can be applied to the local part of an
 * address. Both {@link ProviderRule} and {@link DefaultRule} share these
 * fields so the engine can treat a matched provider and a fallback rule
 * uniformly.
 */
export interface LocalPartRules {
	/**
	 * Lowercase the local part. Most consumer providers treat the local part
	 * case-insensitively, so this is enabled for the built-in providers. The
	 * email spec (RFC 5321) technically allows case-sensitive local parts, so
	 * it is left disabled for unknown domains by default.
	 */
	lowercaseLocal?: boolean;

	/**
	 * Remove all dots (`.`) from the local part. This is Gmail's behavior:
	 * `john.doe@gmail.com` and `johndoe@gmail.com` are the same mailbox.
	 */
	removeDots?: boolean;

	/**
	 * Characters that begin a "sub-address" (also called plus-addressing or
	 * tagging). Everything from the first occurrence of any separator to the
	 * end of the local part is stripped. Gmail/Outlook/etc. use `"+"`; Yahoo
	 * historically uses `"-"`.
	 *
	 * A separator at index 0 is ignored, because stripping it would leave an
	 * empty local part.
	 */
	subaddressSeparators?: string[];
}

/**
 * A rule describing how a specific email provider's addresses should be
 * canonicalized.
 */
export interface ProviderRule extends LocalPartRules {
	/** Stable identifier for the provider, e.g. `"gmail"`. */
	id: string;

	/**
	 * The domains this rule applies to. Matched case-insensitively. The first
	 * provider registered for a domain wins, and user-supplied providers
	 * override the built-ins.
	 */
	domains: string[];

	/**
	 * Collapse every matched domain to this single canonical domain. Used for
	 * provider aliases that deliver to the same mailbox, e.g. `googlemail.com`
	 * -> `gmail.com`.
	 */
	canonicalDomain?: string;
}

/**
 * The fallback rule applied to domains that do not match any provider. It is
 * the same as a {@link ProviderRule} minus the identity fields, and it cannot
 * rewrite the domain.
 */
export type DefaultRule = LocalPartRules;

/**
 * Options accepted by the normalization functions.
 */
export interface NormalizeOptions {
	/**
	 * Additional provider rules, or overrides for the built-in providers.
	 * Matched by domain; entries here take precedence over the built-ins.
	 */
	providers?: ProviderRule[];

	/**
	 * Ignore the built-in provider list entirely and use only the providers
	 * supplied in {@link NormalizeOptions.providers}. Defaults to `false`.
	 */
	replaceDefaultProviders?: boolean;

	/**
	 * Rule applied to domains that match no provider. Defaults to a
	 * conservative rule that only lowercases the domain and leaves the local
	 * part untouched.
	 */
	defaultRule?: DefaultRule;

	/**
	 * Lowercase the domain. Domains are case-insensitive per RFC 1035, so this
	 * defaults to `true`. Disabling it is rarely useful but available.
	 */
	lowercaseDomain?: boolean;
}

/**
 * The structured result of normalizing an address.
 */
export interface NormalizedEmail {
	/** The fully normalized address, `${local}@${domain}`. */
	normalized: string;
	/** The normalized local part (before the `@`). */
	local: string;
	/** The normalized domain (after the `@`). */
	domain: string;
	/** The id of the provider that matched, or `null` if none did. */
	providerId: string | null;
	/** The sub-address ("tag") that was stripped, or `null` if there was none. */
	subaddress: string | null;
	/** Whether the input looks like a syntactically valid address. */
	valid: boolean;
}