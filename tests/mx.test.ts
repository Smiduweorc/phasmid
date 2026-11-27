import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
	DEFAULT_MX_PROVIDERS,
	PhasmidError,
	getEmailProviderAsync,
	isSameEmailAsync,
	normalizeEmailAsync,
	normalizeEmailDetailed,
	normalizeEmailDetailedAsync,
	type MxCache,
	type MxNormalizeOptions,
	type MxRecord,
	type MxResolver,
	type PhasmidErrorCode,
} from "../index.js";

/** Matches a PhasmidError with this code, subject and message. */
function refusal(code: PhasmidErrorCode, subject: string | undefined, message: RegExp) {
	return (e: unknown): boolean => {
		assert.ok(e instanceof PhasmidError);
		assert.ok(e instanceof TypeError);
		assert.equal(e.name, "PhasmidError");
		assert.equal(e.code, code);
		assert.equal(e.subject, subject);
		assert.match(e.message, /^phasmid: /);
		assert.match(e.message, message);
		return true;
	};
}

/** A resolver over a fixed table that counts its calls. */
function dns(table: Record<string, MxRecord[]>): MxResolver & { calls: string[] } {
	const calls: string[] = [];
	const resolve = async (domain: string): Promise<MxRecord[]> => {
		calls.push(domain);
		const records = table[domain];
		if (!records) {
			throw Object.assign(new Error(`queryMx ENOTFOUND ${domain}`), { code: "ENOTFOUND" });
		}
		return records;
	};
	return Object.assign(resolve, { calls });
}

/** A resolver that answers every domain with the same records. */
function always(records: unknown): MxResolver {
	return async () => records as MxRecord[];
}

const mx = (exchange: string, priority = 10): MxRecord => ({ exchange, priority });

const table = {
	"acme.example": [mx("alt1.aspmx.l.google.com", 5), mx("aspmx.l.google.com", 1)],
	"contoso.example": [mx("contoso-example.mail.protection.outlook.com.", 0)],
	"self.example": [mx("mail.self.example")],
	"nomail.example": [],
};

test("each built-in MX rule is detected from a real-shaped MX host", async (t) => {
	const cases: [string, string][] = [
		["smtp.google.com", "google-workspace"],
		["aspmx.l.google.com", "google-workspace"],
		["alt4.aspmx.l.google.com", "google-workspace"],
		["aspmx2.googlemail.com", "google-workspace"],
		["contoso-com.mail.protection.outlook.com", "microsoft-365"],
		["contoso-com.l-v1.mx.microsoft", "microsoft-365"],
		["mx.zoho.com", "zoho-custom"],
		["mx2.zoho.eu", "zoho-custom"],
		["mx.zoho.in", "zoho-custom"],
		["mx.zoho.com.au", "zoho-custom"],
		["mx.zohomail.com", "zoho-custom"],
		["in1-smtp.messagingengine.com", "fastmail-custom"],
		["mail.protonmail.ch", "proton-custom"],
		["mailsec.protonmail.ch", "proton-custom"],
	];
	for (const [host, id] of cases) {
		await t.test(`${host} is ${id}`, async () => {
			assert.equal(await getEmailProviderAsync("a@custom.example", { resolveMx: always([mx(host)]) }), id);
		});
	}

	await t.test("the built-in list is exactly those five ids", () => {
		assert.deepEqual(
			DEFAULT_MX_PROVIDERS.map((r) => r.id),
			["google-workspace", "microsoft-365", "zoho-custom", "fastmail-custom", "proton-custom"],
		);
	});

	await t.test("every built-in lowercases, strips + tags, keeps dots and the domain", async () => {
		for (const rule of DEFAULT_MX_PROVIDERS) {
			const resolveMx = always([mx(`mx.${rule.mxHosts[0]}`)]);
			const r = await normalizeEmailDetailedAsync("Jo.Doe+tag@Custom.Example", { resolveMx });
			assert.equal(r.normalized, "jo.doe@custom.example", rule.id);
			assert.equal(r.subaddress, "tag", rule.id);
			assert.equal(r.providerId, rule.id);
		}
	});
});

test("MX detection", async (t) => {
	await t.test("a Workspace domain keeps dots and its own domain", async () => {
		const r = await normalizeEmailDetailedAsync("John.Doe+x@Acme.example", { resolveMx: dns(table) });
		assert.deepEqual(r, {
			normalized: "john.doe@acme.example",
			local: "john.doe",
			domain: "acme.example",
			providerId: "google-workspace",
			subaddress: "x",
			valid: true,
		});
	});

	await t.test("a trailing dot on the exchange still matches", async () => {
		assert.equal(await getEmailProviderAsync("a@contoso.example", { resolveMx: dns(table) }), "microsoft-365");
	});

	await t.test("an MX host on no rule gets the conservative default", async () => {
		assert.equal(await normalizeEmailAsync("Jo+x@self.example", { resolveMx: dns(table) }), "Jo+x@self.example");
	});

	await t.test("a domain with no MX records gets the conservative default", async () => {
		assert.equal(await getEmailProviderAsync("a@nomail.example", { resolveMx: dns(table) }), null);
	});

	await t.test("a null MX (RFC 7505) matches no rule", async () => {
		// node:dns reports the "." exchange as an empty string.
		for (const exchange of ["", "."]) {
			assert.equal(await getEmailProviderAsync("a@x.example", { resolveMx: always([mx(exchange, 0)]) }), null);
		}
	});

	await t.test("a host match needs a label boundary", async () => {
		for (const host of ["mx.notgoogle.com", "google.com.example", "evilmessagingengine.com"]) {
			assert.equal(await getEmailProviderAsync("a@x.example", { resolveMx: always([mx(host)]) }), null, host);
		}
	});

	await t.test("an MX host equal to the rule's host matches", async () => {
		assert.equal(await getEmailProviderAsync("a@x.example", { resolveMx: always([mx("google.com")]) }), "google-workspace");
	});

	await t.test("MX hosts are compared case-insensitively", async () => {
		assert.equal(await getEmailProviderAsync("a@x.example", { resolveMx: always([mx("ASPMX.L.Google.COM")]) }), "google-workspace");
	});

	await t.test("the lowest priority value decides between two hosts", async () => {
		const resolveMx = always([mx("aspmx.l.google.com", 20), mx("x.mail.protection.outlook.com", 10)]);
		assert.equal(await getEmailProviderAsync("a@x.example", { resolveMx }), "microsoft-365");
	});

	await t.test("an unmatched primary falls through to a matched backup", async () => {
		const resolveMx = always([mx("mx.self.example", 0), mx("aspmx.l.google.com", 50)]);
		assert.equal(await getEmailProviderAsync("a@x.example", { resolveMx }), "google-workspace");
	});

	await t.test("the resolver's array is left in the order it gave", async () => {
		const records = [mx("b.example", 20), mx("a.example", 10)];
		await getEmailProviderAsync("a@x.example", { resolveMx: always(records) });
		assert.deepEqual(records.map((r) => r.priority), [20, 10]);
	});

	await t.test("the resolver is asked for the lowercased domain", async () => {
		const resolveMx = dns(table);
		await getEmailProviderAsync("a@ACME.Example", { resolveMx, lowercaseDomain: false });
		assert.deepEqual(resolveMx.calls, ["acme.example"]);
	});

	await t.test("lowercaseDomain: false still keeps the input's case on a detected domain", async () => {
		assert.equal(
			await normalizeEmailAsync("A@ACME.Example", { resolveMx: dns(table), lowercaseDomain: false }),
			"a@ACME.Example",
		);
	});

	await t.test("a listed domain never reaches the resolver", async () => {
		const resolveMx = dns(table);
		assert.equal(await normalizeEmailAsync("J.D+x@googlemail.com", { resolveMx }), "jd@gmail.com");
		assert.deepEqual(resolveMx.calls, []);
	});

	await t.test("invalid input never reaches the resolver", async () => {
		const resolveMx = dns(table);
		for (const input of ["", "no-at", "a@", "@acme.example", "a b@acme.example", "a@acme..example"]) {
			assert.equal((await normalizeEmailDetailedAsync(input, { resolveMx })).valid, false, input);
		}
		assert.deepEqual(resolveMx.calls, []);
	});

	await t.test("a quoted local part is kept verbatim on a detected domain", async () => {
		assert.equal(await normalizeEmailAsync("\"A.B+c\"@acme.example", { resolveMx: dns(table) }), "\"A.B+c\"@acme.example");
	});

	await t.test("a detected rule takes precedence over defaultRule", async () => {
		const options: MxNormalizeOptions = { resolveMx: dns(table), defaultRule: { removeDots: true } };
		assert.equal(await normalizeEmailAsync("J.D@acme.example", options), "j.d@acme.example");
		assert.equal(await normalizeEmailAsync("J.D@self.example", options), "JD@self.example");
	});

	await t.test("isSameEmailAsync compares under detected rules", async () => {
		const resolveMx = dns(table);
		assert.equal(await isSameEmailAsync("Bob+a@acme.example", "bob@ACME.example", { resolveMx }), true);
		assert.equal(await isSameEmailAsync("b.ob@acme.example", "bob@acme.example", { resolveMx }), false);
		assert.equal(await isSameEmailAsync("bad", "bad", { resolveMx }), false);
	});

	await t.test("the async result equals the sync one when no rule matches", async () => {
		await fc.assert(
			fc.asyncProperty(fc.string(), async (input) => {
				const sync = normalizeEmailDetailed(input);
				const async = await normalizeEmailDetailedAsync(input, { resolveMx: always([]) });
				assert.deepEqual(async, sync);
			}),
		);
	});

	await t.test("a detected rule never changes the domain beyond lowercasing", async () => {
		const local = fc.stringMatching(/^[A-Za-z0-9.+_-]{1,20}$/);
		const label = fc.stringMatching(/^[a-z0-9]{1,10}$/);
		await fc.assert(
			fc.asyncProperty(local, label, async (l, d) => {
				const domain = `${d}.example`;
				const r = await normalizeEmailDetailedAsync(`${l}@${domain.toUpperCase()}`, {
					resolveMx: always([mx("smtp.google.com")]),
				});
				if (r.valid) {
					assert.equal(r.domain, domain);
					assert.equal(r.providerId, "google-workspace");
					assert.equal(r.local, r.local.toLowerCase());
				}
			}),
		);
	});
});

test("MX overrides", async (t) => {
	await t.test("a user rule reusing a built-in id replaces it", async () => {
		const r = await normalizeEmailAsync("J.D+x@acme.example", {
			resolveMx: dns(table),
			mxProviders: [{ id: "google-workspace", mxHosts: ["google.com"], lowercaseLocal: true }],
		});
		assert.equal(r, "j.d+x@acme.example");
	});

	await t.test("a user rule is checked before the built-ins", async () => {
		const r = await getEmailProviderAsync("a@acme.example", {
			resolveMx: dns(table),
			mxProviders: [{ id: "my-google", mxHosts: ["aspmx.l.google.com"] }],
		});
		assert.equal(r, "my-google");
	});

	await t.test("a custom rule covers a self-hosted MX", async () => {
		const r = await normalizeEmailDetailedAsync("Jo+x@self.example", {
			resolveMx: dns(table),
			mxProviders: [{ id: "corp", mxHosts: ["SELF.example."], subaddressSeparators: ["+"] }],
		});
		assert.equal(r.normalized, "Jo@self.example");
		assert.equal(r.providerId, "corp");
	});

	await t.test("replaceDefaultMxProviders defaults to false", async () => {
		assert.equal(await getEmailProviderAsync("a@acme.example", { resolveMx: dns(table) }), "google-workspace");
	});

	await t.test("replaceDefaultMxProviders drops the built-ins", async () => {
		assert.equal(
			await getEmailProviderAsync("a@acme.example", { resolveMx: dns(table), replaceDefaultMxProviders: true }),
			null,
		);
	});

	await t.test("replaceDefaultMxProviders keeps the user rules", async () => {
		const r = await getEmailProviderAsync("a@self.example", {
			resolveMx: dns(table),
			replaceDefaultMxProviders: true,
			mxProviders: [{ id: "corp", mxHosts: ["self.example"] }],
		});
		assert.equal(r, "corp");
	});

	await t.test("mxOverrides forces a rule or none without a lookup", async () => {
		const resolveMx = dns(table);
		const mxOverrides = { "Other.example": "microsoft-365", "ACME.example": null };
		assert.equal(await getEmailProviderAsync("a@other.example", { resolveMx, mxOverrides }), "microsoft-365");
		assert.equal(await getEmailProviderAsync("a@acme.example", { resolveMx, mxOverrides }), null);
		assert.deepEqual(resolveMx.calls, []);
	});

	await t.test("mxOverrides can name a user rule", async () => {
		const r = await getEmailProviderAsync("a@x.example", {
			resolveMx: dns(table),
			mxProviders: [{ id: "corp", mxHosts: ["self.example"] }],
			mxOverrides: { "x.example": "corp" },
		});
		assert.equal(r, "corp");
	});

	await t.test("an explicit provider beats MX detection", async () => {
		const resolveMx = dns(table);
		const r = await getEmailProviderAsync("a@acme.example", { resolveMx, providers: [{ id: "mine", domains: ["acme.example"] }] });
		assert.equal(r, "mine");
		assert.deepEqual(resolveMx.calls, []);
	});
});

test("MX option validation", async (t) => {
	const resolveMx = dns(table);
	const bad: [string, unknown, PhasmidErrorCode, string | undefined, RegExp][] = [
		["a missing options object", undefined, "resolver-missing", undefined, /resolveMx is required/],
		["a missing resolveMx", {}, "resolver-missing", undefined, /resolveMx is required/],
		["a resolveMx that is not a function", { resolveMx: "8.8.8.8" }, "resolver-missing", undefined, /resolveMx is required/],
		["mxProviders that is not an array", { resolveMx, mxProviders: {} }, "invalid-mx-providers", undefined, /mxProviders must be an array/],
		["a rule without an id", { resolveMx, mxProviders: [{ mxHosts: ["a.example"] }] }, "invalid-mx-rule", undefined, /non-empty string id/],
		["a rule with an empty id", { resolveMx, mxProviders: [{ id: "", mxHosts: ["a.example"] }] }, "invalid-mx-rule", undefined, /non-empty string id/],
		["two rules with one id", { resolveMx, mxProviders: [{ id: "x", mxHosts: ["a.example"] }, { id: "x", mxHosts: ["b.example"] }] }, "invalid-mx-rule", "x", /"x" is listed twice/],
		["a rule without mxHosts", { resolveMx, mxProviders: [{ id: "x" }] }, "invalid-mx-rule", "x", /"x" needs at least one mxHosts/],
		["a rule with empty mxHosts", { resolveMx, mxProviders: [{ id: "x", mxHosts: [] }] }, "invalid-mx-rule", "x", /"x" needs at least one mxHosts/],
		["an empty mxHosts entry", { resolveMx, mxProviders: [{ id: "x", mxHosts: [""] }] }, "invalid-mx-rule", "x", /invalid mxHosts entry: ""/],
		["a wildcard mxHosts entry", { resolveMx, mxProviders: [{ id: "x", mxHosts: ["*.a.example"] }] }, "invalid-mx-rule", "x", /invalid mxHosts entry: "\*\.a\.example"/],
		["a non-string mxHosts entry", { resolveMx, mxProviders: [{ id: "x", mxHosts: [7] }] }, "invalid-mx-rule", "x", /invalid mxHosts entry: 7/],
		["an override to an unknown id", { resolveMx, mxOverrides: { "a.example": "gogle-workspace" } }, "invalid-mx-override", "a.example", /unknown MX rule "gogle-workspace"/],
		["an override to a dropped built-in", { resolveMx, replaceDefaultMxProviders: true, mxOverrides: { "a.example": "microsoft-365" } }, "invalid-mx-override", "a.example", /unknown MX rule/],
		["one domain overridden two ways", { resolveMx, mxOverrides: { "a.example": null, "A.example": "microsoft-365" } }, "invalid-mx-override", "a.example", /"a.example" twice/],
	];
	for (const [name, options, code, subject, message] of bad) {
		await t.test(`${name} is refused with ${code}`, async () => {
			await assert.rejects(normalizeEmailAsync("a@gmail.com", options as never), refusal(code, subject, message));
		});
	}

	await t.test("options are checked even when the domain is listed", async () => {
		await assert.rejects(normalizeEmailAsync("a@gmail.com", {} as never), TypeError);
	});

	await t.test("getEmailProviderAsync checks options even for non-string input", async () => {
		await assert.rejects(getEmailProviderAsync(5 as never, {} as never), TypeError);
		assert.equal(await getEmailProviderAsync(5 as never, { resolveMx: dns(table) }), null);
	});

	await t.test("a non-string email rejects with TypeError", async () => {
		await assert.rejects(
			normalizeEmailAsync(5 as never, { resolveMx: dns(table) }),
			refusal("email-not-string", "number", /Expected email to be a string, received number/),
		);
	});
});

test("resolver and store errors", async (t) => {
	await t.test("a resolver error comes back unchanged", async () => {
		const error = new Error("queryMx ESERVFAIL acme.example");
		await assert.rejects(
			normalizeEmailAsync("a@acme.example", { resolveMx: async () => { throw error; } }),
			(e) => e === error,
		);
	});

	await t.test("a resolver can turn ENOTFOUND into no records", async () => {
		const strict = dns(table);
		const resolveMx: MxResolver = (d) =>
			strict(d).catch((e: { code?: string }) => {
				if (e.code === "ENOTFOUND" || e.code === "ENODATA") return [];
				throw e;
			});
		assert.equal(await getEmailProviderAsync("a@gone.example", { resolveMx }), null);
	});

	const malformed: [string, unknown][] = [
		["a non-array", {}],
		["undefined", undefined],
		["a null record", [null]],
		["a string record", ["aspmx.l.google.com"]],
		["a record without a priority", [{ exchange: "aspmx.l.google.com" }]],
		["a NaN priority", [{ exchange: "aspmx.l.google.com", priority: NaN }]],
		["an Infinity priority", [{ exchange: "aspmx.l.google.com", priority: Infinity }]],
		["a non-string exchange", [{ exchange: 7, priority: 1 }]],
	];
	for (const [name, records] of malformed) {
		await t.test(`a resolver returning ${name} is a TypeError`, async () => {
			await assert.rejects(
				normalizeEmailAsync("a@x.example", { resolveMx: always(records) }),
				refusal("invalid-mx-records", "resolveMx", /resolveMx (must return|returned a malformed)/),
			);
		});
	}
});

test("MX cache", async (t) => {
	await t.test("a Map works as the store and saves repeat lookups", async () => {
		const resolveMx = dns(table);
		const mxCache = new Map<string, MxRecord[]>();
		assert.equal(await getEmailProviderAsync("a@ACME.example", { resolveMx, mxCache }), "google-workspace");
		assert.equal(await getEmailProviderAsync("b@acme.example", { resolveMx, mxCache }), "google-workspace");
		assert.deepEqual(resolveMx.calls, ["acme.example"]);
		assert.deepEqual(mxCache.get("acme.example"), table["acme.example"]);
	});

	await t.test("a domain with no records is stored as []", async () => {
		const mxCache = new Map<string, MxRecord[]>();
		await getEmailProviderAsync("a@nomail.example", { resolveMx: dns(table), mxCache });
		assert.deepEqual(mxCache.get("nomail.example"), []);
	});

	await t.test("a cached [] is a hit", async () => {
		const resolveMx = dns(table);
		const mxCache = new Map([["acme.example", []]]);
		assert.equal(await getEmailProviderAsync("a@acme.example", { resolveMx, mxCache }), null);
		assert.deepEqual(resolveMx.calls, []);
	});

	await t.test("cached records are used without a lookup", async () => {
		const resolveMx = dns(table);
		const mxCache: MxCache = { get: async () => [mx("x.mail.protection.outlook.com")], set: () => {} };
		assert.equal(await getEmailProviderAsync("a@whatever.example", { resolveMx, mxCache }), "microsoft-365");
		assert.deepEqual(resolveMx.calls, []);
	});

	await t.test("cached records go through the current rules", async () => {
		const mxCache = new Map([["self.example", [mx("mail.self.example")]]]);
		const r = await getEmailProviderAsync("a@self.example", {
			resolveMx: dns(table),
			mxCache,
			mxProviders: [{ id: "corp", mxHosts: ["self.example"] }],
		});
		assert.equal(r, "corp");
	});

	await t.test("a failed lookup is not stored", async () => {
		const mxCache = new Map<string, MxRecord[]>();
		await assert.rejects(getEmailProviderAsync("a@gone.example", { resolveMx: dns(table), mxCache }));
		assert.equal(mxCache.size, 0);
	});

	await t.test("malformed resolver output is not stored", async () => {
		const mxCache = new Map<string, MxRecord[]>();
		await assert.rejects(getEmailProviderAsync("a@x.example", { resolveMx: always({}), mxCache }), TypeError);
		assert.equal(mxCache.size, 0);
	});

	await t.test("overrides and listed domains do not touch the store", async () => {
		const seen: string[] = [];
		const mxCache: MxCache = {
			get: (d) => { seen.push(`get ${d}`); return undefined; },
			set: (d) => { seen.push(`set ${d}`); },
		};
		const options = { resolveMx: dns(table), mxCache, mxOverrides: { "acme.example": null } };
		await getEmailProviderAsync("a@acme.example", options);
		await getEmailProviderAsync("a@gmail.com", options);
		assert.deepEqual(seen, []);
	});

	await t.test("a store error from get comes back unchanged and skips the lookup", async () => {
		const error = new Error("redis down");
		const resolveMx = dns(table);
		const mxCache: MxCache = { get: () => { throw error; }, set: () => {} };
		await assert.rejects(getEmailProviderAsync("a@acme.example", { resolveMx, mxCache }), (e) => e === error);
		assert.deepEqual(resolveMx.calls, []);
	});

	await t.test("a store error from set comes back unchanged", async () => {
		const error = new Error("redis read-only");
		const mxCache: MxCache = { get: () => undefined, set: async () => { throw error; } };
		await assert.rejects(getEmailProviderAsync("a@acme.example", { resolveMx: dns(table), mxCache }), (e) => e === error);
	});

	await t.test("a malformed cached value is a TypeError naming the store", async () => {
		const mxCache = { get: () => "junk", set: () => {} } as unknown as MxCache;
		await assert.rejects(
			getEmailProviderAsync("a@acme.example", { resolveMx: dns(table), mxCache }),
			refusal("invalid-mx-records", "mxCache.get", /mxCache\.get must return an array/),
		);
	});

	await t.test("a cached null is a malformed value, not a miss", async () => {
		const mxCache = { get: () => null, set: () => {} } as unknown as MxCache;
		await assert.rejects(
			getEmailProviderAsync("a@acme.example", { resolveMx: dns(table), mxCache }),
			refusal("invalid-mx-records", "mxCache.get", /mxCache\.get must return an array/),
		);
	});
});

test("caller errors are never wrapped", async (t) => {
	await t.test("a resolver that throws a TypeError of its own gets it back as is", async () => {
		const error = new TypeError("my resolver is broken");
		await assert.rejects(
			normalizeEmailAsync("a@acme.example", { resolveMx: async () => { throw error; } }),
			(e) => e === error && !(e instanceof PhasmidError),
		);
	});
});
