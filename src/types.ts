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
	/**
	 * The fully normalized address, `${local}@${domain}`. For invalid input,
	 * the trimmed input with no rule applied.
	 */
	normalized: string;
	/** The normalized local part (before the `@`). */
	local: string;
	/** The normalized domain (after the `@`). */
	domain: string;
	/** The id of the provider that matched, or `null` if none did. */
	providerId: string | null;
	/** The sub-address ("tag") that was stripped, or `null` if there was none. */
	subaddress: string | null;
	/**
	 * Whether the trimmed input, before any rule ran, looks like a
	 * syntactically valid address.
	 */
	valid: boolean;
}

/**
 * A rule that identifies a mail host by a domain's MX records, for custom
 * domains no {@link ProviderRule} lists (a company domain on Google Workspace
 * or Microsoft 365, say).
 *
 * There is no `canonicalDomain`: a custom domain is its own namespace and is
 * never rewritten.
 */
export interface MxProviderRule extends LocalPartRules {
	/** Stable identifier reported as `providerId`, e.g. `"google-workspace"`. */
	id: string;

	/**
	 * MX hosts that identify this provider. Each entry matches that host and
	 * every host below it, case-insensitively: `"mail.protection.outlook.com"`
	 * matches `contoso-com.mail.protection.outlook.com` and not
	 * `evilmail.protection.outlook.com.example`. A trailing dot is allowed.
	 */
	mxHosts: string[];
}

/** One MX record, the shape `resolveMx` from `node:dns/promises` returns. */
export interface MxRecord {
	exchange: string;
	priority: number;
}

/** Looks up a domain's MX records. A domain without any resolves to `[]`. */
export type MxResolver = (domain: string) => Promise<MxRecord[]>;

/**
 * A store for MX lookups that you own: a `Map`, Redis, a database table.
 * Phasmid calls `get` before resolving and `set` after a successful lookup,
 * and nothing else; expiry, refresh and eviction are the store's.
 *
 * Values are the raw records, so a change to the MX rules applies to cached
 * domains too. Errors the store throws are rethrown unchanged.
 */
export interface MxCache {
	/** The cached records for `domain`, or `undefined` on a miss. */
	get(
		domain: string,
	): MxRecord[] | undefined | Promise<MxRecord[] | undefined>;
	/** Store the records for `domain`. The return value is ignored. */
	set(domain: string, records: MxRecord[]): unknown;
}

/**
 * Options for the async functions (`normalizeEmailAsync` and the rest). All of
 * {@link NormalizeOptions} applies, and a domain a provider lists is never
 * looked up.
 */
export interface MxNormalizeOptions extends NormalizeOptions {
	/**
	 * How to look up MX records. Required, because phasmid has no `node:`
	 * imports: pass `resolveMx` from `node:dns/promises`, or a resolver that
	 * adds a timeout or uses DNS over HTTPS. Its errors are rethrown unchanged.
	 */
	resolveMx: MxResolver;

	/**
	 * Extra MX rules, checked before the built-ins. A rule whose `id` matches a
	 * built-in replaces it. Ids must be unique.
	 */
	mxProviders?: MxProviderRule[];

	/**
	 * Use only {@link mxProviders} and ignore {@link DEFAULT_MX_PROVIDERS}.
	 * Defaults to `false`.
	 */
	replaceDefaultMxProviders?: boolean;

	/**
	 * Answers that skip the lookup: a domain mapped to an MX rule id gets that
	 * rule, a domain mapped to `null` gets none. Domains are matched
	 * case-insensitively. An unknown id throws.
	 */
	mxOverrides?: Record<string, string | null>;

	/** Where to remember lookups. Without it, every call resolves. */
	mxCache?: MxCache;
}
