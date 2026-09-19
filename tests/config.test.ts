import { test } from "node:test";
import assert from "node:assert/strict";
import {
	getEmailProvider,
	isSameEmail,
	normalizeEmail,
	type NormalizeOptions,
	type ProviderRule,
} from "../index.js";

test("custom provider configuration", async (t) => {
	const corporate: ProviderRule = {
		id: "corp",
		domains: ["mycompany.com", "mycompany.co"],
		canonicalDomain: "mycompany.com",
		lowercaseLocal: true,
		removeDots: true,
		subaddressSeparators: ["+"],
	};
	const options: NormalizeOptions = { providers: [corporate] };

	await t.test("applies a user-defined provider", () => {
		assert.equal(
			normalizeEmail("John.Doe+x@mycompany.com", options),
			"johndoe@mycompany.com",
		);
	});

	await t.test("collapses a custom alias domain", () => {
		assert.equal(
			normalizeEmail("john@mycompany.co", options),
			"john@mycompany.com",
		);
	});

	await t.test("still applies built-in providers when extending", () => {
		assert.equal(
			normalizeEmail("John.Doe@gmail.com", options),
			"johndoe@gmail.com",
		);
	});
});

test("provider override", async (t) => {
	const override: NormalizeOptions = {
		providers: [
			{ id: "gmail-strict", domains: ["gmail.com"], lowercaseLocal: true },
		],
	};

	await t.test("a custom provider can override a built-in domain", () => {
		assert.equal(
			normalizeEmail("John.Doe@gmail.com", override),
			"john.doe@gmail.com",
		);
		assert.equal(getEmailProvider("a@gmail.com", override), "gmail-strict");
	});
});

test("replaceDefaultProviders", async (t) => {
	const replaced: NormalizeOptions = {
		replaceDefaultProviders: true,
		providers: [
			{
				id: "only",
				domains: ["only.com"],
				subaddressSeparators: ["+"],
				lowercaseLocal: true,
			},
		],
	};

	await t.test("ignores built-ins and applies only the supplied providers", () => {
		assert.equal(getEmailProvider("a@gmail.com", replaced), null);
		assert.equal(
			normalizeEmail("John.Doe+x@gmail.com", replaced),
			"John.Doe+x@gmail.com",
		);
		assert.equal(normalizeEmail("John+x@only.com", replaced), "john@only.com");
	});
});

test("defaultRule", async (t) => {
	const withDefault: NormalizeOptions = {
		defaultRule: { lowercaseLocal: true, subaddressSeparators: ["+"] },
	};

	await t.test("applies to unknown domains only", () => {
		assert.equal(
			normalizeEmail("John+tag@example.com", withDefault),
			"john@example.com",
		);
		assert.equal(
			normalizeEmail("john+tag@yahoo.com", withDefault),
			"john+tag@yahoo.com",
		);
	});
});

test("lowercaseDomain and isSameEmail", async (t) => {
	await t.test("lowercaseDomain can be disabled", () => {
		assert.equal(
			normalizeEmail("user@Example.COM", { lowercaseDomain: false }),
			"user@Example.COM",
		);
	});

	await t.test("isSameEmail respects custom options", () => {
		const sameOpts: NormalizeOptions = {
			defaultRule: { subaddressSeparators: ["+"] },
		};
		assert.ok(isSameEmail("a+x@example.com", "a+y@example.com", sameOpts));
		assert.ok(!isSameEmail("a+x@example.com", "a+y@example.com"));
	});
});