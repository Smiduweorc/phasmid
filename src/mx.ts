import { PhasmidError } from "./errors.js";
import { DOMAIN_RE, normalizeCore } from "./normalize.js";
import { DEFAULT_MX_PROVIDERS } from "./providers.js";
import type {
	MxNormalizeOptions,
	MxProviderRule,
	MxRecord,
	NormalizedEmail,
} from "./types.js";

/** Lowercase and drop the trailing dot of a fully qualified name. */
function toHost(name: string): string {
	return name.toLowerCase().replace(/\.$/, "");
}

function isMatch(host: string, mxHost: string): boolean {
	return host === mxHost || host.endsWith(`.${mxHost}`);
}

interface MxPlan {
	rules: readonly MxProviderRule[];
	overrides: Map<string, MxProviderRule | null>;
}

/**
 * Check the caller's MX options once per call, before any lookup. A typo here
 * would otherwise turn detection off without a trace.
 */
function planMx(options: MxNormalizeOptions): MxPlan {
	if (typeof options?.resolveMx !== "function") {
		throw new PhasmidError(
			"resolver-missing",
			"resolveMx is required; pass resolveMx from node:dns/promises or your own resolver",
		);
	}

	const user = options.mxProviders ?? [];
	if (!Array.isArray(user)) {
		throw new PhasmidError(
			"invalid-mx-providers",
			"mxProviders must be an array of MX rules",
		);
	}
	const ids = new Set<string>();
	for (const rule of user) {
		if (typeof rule?.id !== "string" || rule.id.length === 0) {
			throw new PhasmidError(
				"invalid-mx-rule",
				"Every MX rule needs a non-empty string id",
			);
		}
		if (ids.has(rule.id)) {
			throw new PhasmidError(
				"invalid-mx-rule",
				`MX rule id "${rule.id}" is listed twice`,
				rule.id,
			);
		}
		ids.add(rule.id);
		if (!Array.isArray(rule.mxHosts) || rule.mxHosts.length === 0) {
			throw new PhasmidError(
				"invalid-mx-rule",
				`MX rule "${rule.id}" needs at least one mxHosts entry`,
				rule.id,
			);
		}
		for (const host of rule.mxHosts) {
			if (typeof host !== "string" || !DOMAIN_RE.test(toHost(host))) {
				throw new PhasmidError(
					"invalid-mx-rule",
					`MX rule "${rule.id}" has an invalid mxHosts entry: ${JSON.stringify(host)}`,
					rule.id,
				);
			}
		}
	}
	const rules = options.replaceDefaultMxProviders
		? user
		: [...user, ...DEFAULT_MX_PROVIDERS.filter((r) => !ids.has(r.id))];

	const overrides = new Map<string, MxProviderRule | null>();
	for (const [domain, id] of Object.entries(options.mxOverrides ?? {})) {
		let rule: MxProviderRule | null = null;
		if (id !== null) {
			rule = rules.find((r) => r.id === id) ?? null;
			if (rule === null) {
				throw new PhasmidError(
					"invalid-mx-override",
					`mxOverrides["${domain}"] names unknown MX rule ${JSON.stringify(id)}`,
					domain,
				);
			}
		}
		const key = toHost(domain);
		if (overrides.has(key) && overrides.get(key) !== rule) {
			throw new PhasmidError(
				"invalid-mx-override",
				`mxOverrides lists "${key}" twice with different rules`,
				key,
			);
		}
		overrides.set(key, rule);
	}
	return { rules, overrides };
}

/**
 * The resolver and the store are the caller's code, so what they return is
 * checked here; a wrong shape is a bug on their side and is reported, never
 * read as "no MX".
 */
function checkRecords(records: unknown, source: string): MxRecord[] {
	if (!Array.isArray(records)) {
		throw new PhasmidError(
			"invalid-mx-records",
			`${source} must return an array of MX records`,
			source,
		);
	}
	for (const record of records as unknown[]) {
		const r = record as Partial<MxRecord> | null;
		if (
			typeof r !== "object" ||
			r === null ||
			typeof r.exchange !== "string" ||
			typeof r.priority !== "number" ||
			!Number.isFinite(r.priority)
		) {
			throw new PhasmidError(
				"invalid-mx-records",
				`${source} returned a malformed MX record: ${JSON.stringify(record)}`,
				source,
			);
		}
	}
	return records as MxRecord[];
}

async function lookupMx(
	domain: string,
	options: MxNormalizeOptions,
): Promise<MxRecord[]> {
	const cache = options.mxCache;
	if (cache) {
		const hit: unknown = await cache.get(domain);
		if (hit !== undefined) return checkRecords(hit, "mxCache.get");
	}
	const records = checkRecords(await options.resolveMx(domain), "resolveMx");
	if (cache) await cache.set(domain, records);
	return records;
}

async function detect(
	domain: string,
	plan: MxPlan,
	options: MxNormalizeOptions,
): Promise<MxProviderRule | null> {
	if (plan.overrides.has(domain)) return plan.overrides.get(domain) ?? null;

	const records = await lookupMx(domain, options);
	// A null MX (RFC 7505, exchange ".") becomes "", which no valid mxHosts
	// entry matches.
	const hosts = [...records]
		.sort((a, b) => a.priority - b.priority)
		.map((r) => toHost(r.exchange));
	for (const host of hosts) {
		const rule = plan.rules.find((r) =>
			r.mxHosts.some((mxHost) => isMatch(host, toHost(mxHost))),
		);
		if (rule) return rule;
	}
	return null;
}

/**
 * Like {@link normalizeEmailDetailed}, but a valid address whose domain no
 * provider lists has its MX records looked up, so a custom domain on Google
 * Workspace, Microsoft 365 or another host in {@link DEFAULT_MX_PROVIDERS}
 * gets that host's rules. Listed domains and invalid input never reach the
 * resolver.
 *
 * Errors from `resolveMx` and `mxCache` are rethrown unchanged. Note that
 * `resolveMx` from `node:dns/promises` rejects with `ENODATA` or `ENOTFOUND`
 * for a domain without MX records; decide in your resolver whether that is
 * `[]` or a failure.
 *
 * @throws {PhasmidError} if `email` is not a string, the MX options are
 * malformed, or the resolver or store returns something that is not MX
 * records; the `code` says which.
 */
export async function normalizeEmailDetailedAsync(
	email: string,
	options: MxNormalizeOptions,
): Promise<NormalizedEmail> {
	const plan = planMx(options);
	const plain = normalizeCore(email, options, null);
	if (!plain.valid || plain.providerId !== null) return plain;
	const detected = await detect(plain.domain.toLowerCase(), plan, options);
	return detected ? normalizeCore(email, options, detected) : plain;
}

/** MX-aware {@link normalizeEmail}. */
export async function normalizeEmailAsync(
	email: string,
	options: MxNormalizeOptions,
): Promise<string> {
	return (await normalizeEmailDetailedAsync(email, options)).normalized;
}

/**
 * MX-aware {@link getEmailProvider}. Non-string input resolves to `null`;
 * malformed options and resolver or store errors still reject.
 */
export async function getEmailProviderAsync(
	email: string,
	options: MxNormalizeOptions,
): Promise<string | null> {
	if (typeof email !== "string") {
		planMx(options);
		return null;
	}
	return (await normalizeEmailDetailedAsync(email, options)).providerId;
}

/** MX-aware {@link isSameEmail}. */
export async function isSameEmailAsync(
	a: string,
	b: string,
	options: MxNormalizeOptions,
): Promise<boolean> {
	const [left, right] = await Promise.all([
		normalizeEmailDetailedAsync(a, options),
		normalizeEmailDetailedAsync(b, options),
	]);
	return left.valid && right.valid && left.normalized === right.normalized;
}
