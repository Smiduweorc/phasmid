import { DEFAULT_PROVIDERS } from "./providers.js";
import type {
	DefaultRule,
	NormalizeOptions,
	NormalizedEmail,
	ProviderRule,
} from "./types.js";

/** Conservative fallback used for domains that match no provider. */
const CONSERVATIVE_DEFAULT: Required<DefaultRule> = {
	lowercaseLocal: false,
	removeDots: false,
	subaddressSeparators: [],
};

/** A basic domain shape: labels separated by dots, with a final TLD label. */
const DOMAIN_RE =
	/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/** Lazily-built registry for the default-only case (the common path). */
let defaultRegistry: Map<string, ProviderRule> | null = null;

function buildRegistry(
	providers: readonly ProviderRule[],
): Map<string, ProviderRule> {
	const map = new Map<string, ProviderRule>();
	for (const provider of providers) {
		for (const domain of provider.domains) {
			map.set(domain.toLowerCase(), provider);
		}
	}
	return map;
}

function getRegistry(options: NormalizeOptions): Map<string, ProviderRule> {
	if (!options.providers && !options.replaceDefaultProviders) {
		return (defaultRegistry ??= buildRegistry(DEFAULT_PROVIDERS));
	}
	const base = options.replaceDefaultProviders ? [] : DEFAULT_PROVIDERS;
	// Later entries override earlier ones, so user providers take precedence.
	return buildRegistry([...base, ...(options.providers ?? [])]);
}

/** Split on the last `@`, the way most parsers treat the local/domain boundary. */
function splitEmail(email: string): { local: string; domain: string } | null {
	const at = email.lastIndexOf("@");
	if (at <= 0 || at === email.length - 1) return null;
	return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** A quoted local part (`"a b"@x.com`) is preserved verbatim. */
function isQuoted(local: string): boolean {
	return local.length >= 2 && local.startsWith("\"") && local.endsWith("\"");
}

function stripSubaddress(
	local: string,
	separators: readonly string[],
): { local: string; subaddress: string | null } {
	let cut = -1;
	let cutLen = 0;
	for (const sep of separators) {
		if (!sep) continue;
		const idx = local.indexOf(sep);
		// Ignore a separator at index 0; cutting there yields an empty local part.
		if (idx > 0 && (cut === -1 || idx < cut)) {
			cut = idx;
			cutLen = sep.length;
		}
	}
	if (cut === -1) return { local, subaddress: null };
	return { local: local.slice(0, cut), subaddress: local.slice(cut + cutLen) };
}

function isValidLocal(local: string): boolean {
	if (local.length === 0) return false;
	if (isQuoted(local)) return true;
	return !/[\s@]/.test(local);
}

/**
 * Normalize an email address and return the full structured result, including
 * the matched provider, the stripped sub-address, and a validity flag.
 *
 * @throws {TypeError} if `email` is not a string.
 */
export function normalizeEmailDetailed(
	email: string,
	options: NormalizeOptions = {},
): NormalizedEmail {
	if (typeof email !== "string") {
		throw new TypeError(
			`Expected email to be a string, received ${typeof email}`,
		);
	}

	const lowercaseDomain = options.lowercaseDomain ?? true;
	const trimmed = email.trim();
	const parts = splitEmail(trimmed);

	if (!parts) {
		return {
			normalized: trimmed,
			local: trimmed,
			domain: "",
			providerId: null,
			subaddress: null,
			valid: false,
		};
	}

	const lookupDomain = parts.domain.toLowerCase();
	const provider = getRegistry(options).get(lookupDomain) ?? null;
	const rule = provider ?? options.defaultRule ?? CONSERVATIVE_DEFAULT;

	let local = parts.local;
	let subaddress: string | null = null;

	if (!isQuoted(local)) {
		const stripped = stripSubaddress(local, rule.subaddressSeparators ?? []);
		local = stripped.local;
		subaddress = stripped.subaddress;
		if (rule.removeDots) local = local.replace(/\./g, "");
		if (rule.lowercaseLocal) local = local.toLowerCase();
	}

	let domain = lowercaseDomain ? lookupDomain : parts.domain;
	if (provider?.canonicalDomain) {
		domain = lowercaseDomain
			? provider.canonicalDomain.toLowerCase()
			: provider.canonicalDomain;
	}

	const valid = isValidLocal(local) && DOMAIN_RE.test(domain);

	return {
		normalized: `${local}@${domain}`,
		local,
		domain,
		providerId: provider?.id ?? null,
		subaddress,
		valid,
	};
}

/**
 * Normalize an email address to its canonical form.
 *
 * Applies the matching provider's rules (sub-address stripping, dot removal,
 * case-folding, alias-domain collapsing) and returns the canonical string.
 * Unknown domains get a conservative treatment: the domain is lowercased and
 * the local part is left untouched.
 *
 * @throws {TypeError} if `email` is not a string.
 */
export function normalizeEmail(
	email: string,
	options?: NormalizeOptions,
): string {
	return normalizeEmailDetailed(email, options).normalized;
}

/**
 * Return the id of the provider that handles the given address's domain, or
 * `null` if no provider matches (or the input is not a valid address).
 */
export function getEmailProvider(
	email: string,
	options: NormalizeOptions = {},
): string | null {
	if (typeof email !== "string") return null;
	const parts = splitEmail(email.trim());
	if (!parts) return null;
	return getRegistry(options).get(parts.domain.toLowerCase())?.id ?? null;
}

/**
 * Returns `true` if two addresses normalize to the same canonical address,
 * i.e. they deliver to the same mailbox under the configured rules.
 */
export function isSameEmail(
	a: string,
	b: string,
	options?: NormalizeOptions,
): boolean {
	return normalizeEmail(a, options) === normalizeEmail(b, options);
}