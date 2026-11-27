// Runs against the built package on every runtime CI covers (Node, Bun,
// Deno), so a broken exports map or a runtime-specific API fails here. It uses
// no network: the resolver is a fixed table.
import assert from "node:assert/strict";
import {
	DEFAULT_MX_PROVIDERS,
	DEFAULT_PROVIDERS,
	PhasmidError,
	getEmailProviderAsync,
	isSameEmail,
	normalizeEmail,
	normalizeEmailAsync,
} from "../../dist/index.js";

const table = {
	"acme.example": [{ exchange: "aspmx.l.google.com", priority: 1 }],
	"contoso.example": [{ exchange: "contoso-example.mail.protection.outlook.com.", priority: 0 }],
};
const options = { resolveMx: async (domain) => table[domain] ?? [] };

assert.equal(normalizeEmail("J.D+x@googlemail.com"), "jd@gmail.com");
assert.equal(isSameEmail("a.b@gmail.com", "ab+promo@gmail.com"), true);
assert.ok(DEFAULT_PROVIDERS.length > 0);
assert.ok(DEFAULT_MX_PROVIDERS.length > 0);
assert.equal(await normalizeEmailAsync("Jane.Doe+news@Acme.example", options), "jane.doe@acme.example");
assert.equal(await getEmailProviderAsync("a@contoso.example", options), "microsoft-365");
assert.equal(await getEmailProviderAsync("a@other.example", options), null);
await assert.rejects(normalizeEmailAsync("a@acme.example", {}), (e) => {
	assert.ok(e instanceof PhasmidError);
	assert.ok(e instanceof TypeError);
	assert.equal(e.code, "resolver-missing");
	return true;
});
