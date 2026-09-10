import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, normalizeEmailDetailed } from "../index.js";

test("unknown domains (conservative default)", async (t) => {
	await t.test("domain is lowercased but local-part case is preserved", () => {
		assert.equal(normalizeEmail("John.Doe@Example.COM"), "John.Doe@example.com");
	});

	await t.test("+tags are not stripped by default", () => {
		assert.equal(normalizeEmail("john+tag@example.com"), "john+tag@example.com");
	});

	await t.test("dots are not removed by default", () => {
		assert.equal(normalizeEmail("john.doe@example.com"), "john.doe@example.com");
	});
});

test("quoted local parts", async (t) => {
	await t.test("preserves quoted local parts", () => {
		assert.equal(
			normalizeEmail("\"John..Doe+x\"@gmail.com"),
			"\"John..Doe+x\"@gmail.com",
		);
	});
});

test("sub-address edge cases", async (t) => {
	await t.test("a separator at index 0 is ignored", () => {
		assert.equal(normalizeEmail("+tag@gmail.com"), "+tag@gmail.com");
	});

	await t.test("only the first separator is used as the cut point", () => {
		assert.equal(normalizeEmail("user+a+b@outlook.com"), "user@outlook.com");
	});
});

test("input handling", async (t) => {
	await t.test("surrounding whitespace is trimmed", () => {
		assert.equal(normalizeEmail("   user@example.com  "), "user@example.com");
	});

	await t.test("the address is split on the last @", () => {
		const lastAt = normalizeEmailDetailed("\"a@b\"@gmail.com");
		assert.equal(lastAt.domain, "gmail.com");
		assert.equal(lastAt.local, "\"a@b\"");
	});

	await t.test("throws TypeError for non-string input", () => {
		assert.throws(
			() => {
				// @ts-expect-error testing the runtime guard
				normalizeEmail(undefined);
			},
			TypeError,
		);
	});
});

test("validity flag", async (t) => {
	await t.test("input without @ is invalid", () => {
		assert.equal(normalizeEmailDetailed("not-an-email").valid, false);
	});

	await t.test("invalid input is returned unchanged", () => {
		assert.equal(normalizeEmailDetailed("not-an-email").normalized, "not-an-email");
	});

	await t.test("empty local part is invalid", () => {
		assert.equal(normalizeEmailDetailed("@example.com").valid, false);
	});

	await t.test("empty domain is invalid", () => {
		assert.equal(normalizeEmailDetailed("user@").valid, false);
	});

	await t.test("a well-formed address is valid", () => {
		assert.equal(normalizeEmailDetailed("user@example.com").valid, true);
	});
});

test("structured result", async (t) => {
	await t.test("returns correct fields", () => {
		const detailed = normalizeEmailDetailed("John.Doe+promo@gmail.com");
		assert.equal(detailed.normalized, "johndoe@gmail.com");
		assert.equal(detailed.local, "johndoe");
		assert.equal(detailed.domain, "gmail.com");
		assert.equal(detailed.providerId, "gmail");
		assert.equal(detailed.subaddress, "promo");
		assert.equal(detailed.valid, true);
	});

	await t.test("subaddress is null when there is none", () => {
		assert.equal(normalizeEmailDetailed("john@gmail.com").subaddress, null);
	});

	await t.test("providerId is null for unknown domains", () => {
		assert.equal(normalizeEmailDetailed("john@example.com").providerId, null);
	});
});