import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
	getEmailProvider,
	isSameEmail,
	normalizeEmail,
	normalizeEmailDetailed,
} from "../index.js";

const HEADER_INJECTION = "ab+x\r\nBcc: evil@evil.com@gmail.com";

function assertRefused(input: string): void {
	const result = normalizeEmailDetailed(input);
	assert.equal(result.valid, false, `expected ${JSON.stringify(input)} to be invalid`);
	assert.equal(result.normalized, input.trim());
	assert.equal(result.providerId, null);
	assert.equal(result.subaddress, null);
}

test("invalid input is refused before any provider rule runs", async (t) => {
	await t.test("a CRLF header injection hidden in a gmail tag is invalid", () => {
		assertRefused(HEADER_INJECTION);
	});

	await t.test("a NUL byte in a gmail tag is invalid", () => {
		assertRefused("ab+x\u0000y@gmail.com");
	});

	await t.test("a space in a gmail tag is invalid", () => {
		assertRefused("ab+x y@gmail.com");
	});

	await t.test("a tab in the local part is invalid", () => {
		assertRefused("a\tb@example.com");
	});

	await t.test("an extra @ in a gmail tag is invalid", () => {
		assertRefused("ab+x@y@gmail.com");
	});

	await t.test("a comma-joined pair of addresses is invalid and comes back unchanged", () => {
		assertRefused("x@GMAIL.com,y@gmail.com");
		assert.equal(normalizeEmail("x@GMAIL.com,y@gmail.com"), "x@GMAIL.com,y@gmail.com");
	});

	for (const special of ["(", ")", "<", ">", "[", "]", ":", ";", "\\", ",", "\""]) {
		await t.test(`an unquoted ${JSON.stringify(special)} in the local part is invalid`, () => {
			assertRefused(`a${special}b@gmail.com`);
		});
	}

	await t.test("a DEL character in the local part is invalid", () => {
		assertRefused("a\u007fb@gmail.com");
	});

	await t.test("a control character inside a quoted local part is invalid", () => {
		assertRefused("\"a\r\nb\"@gmail.com");
	});

	await t.test("an unescaped quote inside a quoted local part is invalid", () => {
		assertRefused("\"a\"b\"@gmail.com");
	});

	await t.test("an escaped quote inside a quoted local part is valid", () => {
		assert.equal(normalizeEmailDetailed("\"a\\\"b\"@gmail.com").valid, true);
	});

	await t.test("a malformed domain is invalid and keeps its original case", () => {
		assertRefused("John@Exa mple.COM");
		assertRefused("john@-example.com");
		assertRefused("john@example");
	});

	await t.test("a local part that removes to nothing is invalid", () => {
		assertRefused("...@gmail.com");
	});

	await t.test("dots alone are valid for a provider that keeps them", () => {
		assert.equal(normalizeEmailDetailed("...@outlook.com").valid, true);
	});

	await t.test("a non-ASCII local part is valid", () => {
		assert.equal(normalizeEmail("Jürgen@Example.com"), "Jürgen@example.com");
		assert.equal(normalizeEmailDetailed("Jürgen@example.com").valid, true);
	});

	await t.test("an invalid local and domain are reported as split from the input", () => {
		const result = normalizeEmailDetailed("  A B+x@GMAIL.com ");
		assert.equal(result.local, "A B+x");
		assert.equal(result.domain, "GMAIL.com");
	});
});

test("isSameEmail never matches invalid input", async (t) => {
	await t.test("a header injection is not the same as the address it hides", () => {
		assert.equal(isSameEmail(HEADER_INJECTION, "ab@gmail.com"), false);
		assert.equal(isSameEmail("ab@gmail.com", HEADER_INJECTION), false);
	});

	await t.test("an invalid input is not the same as itself", () => {
		assert.equal(isSameEmail(HEADER_INJECTION, HEADER_INJECTION), false);
		assert.equal(isSameEmail("not-an-email", "not-an-email"), false);
	});

	await t.test("two valid aliases still match", () => {
		assert.equal(isSameEmail("a.b+x@googlemail.com", "AB@gmail.com"), true);
	});
});

test("getEmailProvider returns null for invalid input", async (t) => {
	await t.test("a header injection on a gmail domain has no provider", () => {
		assert.equal(getEmailProvider(HEADER_INJECTION), null);
	});

	await t.test("a valid gmail address still reports gmail", () => {
		assert.equal(getEmailProvider("ab@gmail.com"), "gmail");
	});
});

const forbidden = fc.constantFrom(
	"\r", "\n", "\u0000", " ", "\t", "\u007f", " ", "@", ",", ";", "<", ">", "\\",
);
const domains = fc.constantFrom(
	"gmail.com", "googlemail.com", "outlook.com", "yahoo.com", "example.com",
);
const atext = fc.stringMatching(/^[A-Za-z0-9.+\-_]{1,12}$/);

test("validity properties", async (t) => {
	await t.test("a forbidden character anywhere in an unquoted local part makes it invalid", () => {
		fc.assert(
			fc.property(atext, forbidden, atext, domains, (before, bad, after, domain) => {
				const input = `${before}${bad}${after}@${domain}`;
				const result = normalizeEmailDetailed(input);
				assert.equal(result.valid, false);
				assert.equal(result.normalized, input.trim());
				assert.equal(isSameEmail(input, `${before}@${domain}`), false);
			}),
		);
	});

	await t.test("normalizing a valid address twice gives the same valid address", () => {
		fc.assert(
			fc.property(atext, domains, (local, domain) => {
				const once = normalizeEmailDetailed(`${local}@${domain}`);
				fc.pre(once.valid);
				const twice = normalizeEmailDetailed(once.normalized);
				assert.equal(twice.valid, true);
				assert.equal(twice.normalized, once.normalized);
			}),
		);
	});

	await t.test("arbitrary strings never throw and invalid ones come back trimmed", () => {
		fc.assert(
			fc.property(fc.string({ unit: "binary" }), (input) => {
				const result = normalizeEmailDetailed(input);
				if (!result.valid) assert.equal(result.normalized, input.trim());
			}),
		);
	});
});
