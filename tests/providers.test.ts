import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_PROVIDERS,
	getEmailProvider,
	isSameEmail,
	normalizeEmail,
} from "../index.js";

test("Microsoft (Outlook/Hotmail/Live)", async (t) => {
	await t.test("strips +tag but keeps dots", () => {
		assert.equal(normalizeEmail("John.Doe+news@outlook.com"), "john.doe@outlook.com");
	});

	await t.test("does not collapse distinct Microsoft domains", () => {
		assert.equal(normalizeEmail("user@hotmail.com"), "user@hotmail.com");
		assert.ok(!isSameEmail("user@hotmail.com", "user@outlook.com"));
	});

	await t.test("dots are significant (distinct mailboxes)", () => {
		assert.ok(!isSameEmail("a.b@outlook.com", "ab@outlook.com"));
	});
});

test("Yahoo", async (t) => {
	await t.test("uses '-' as the sub-address separator", () => {
		assert.equal(normalizeEmail("john-shopping@yahoo.com"), "john@yahoo.com");
	});

	await t.test("does not treat '+' as a separator", () => {
		assert.equal(normalizeEmail("john+tag@yahoo.com"), "john+tag@yahoo.com");
	});

	await t.test("keeps dots", () => {
		assert.equal(normalizeEmail("john.doe@ymail.com"), "john.doe@ymail.com");
	});
});

test("other +tag providers", async (t) => {
	const plusProviders: Array<[string, string]> = [
		["Jane+lists@icloud.com", "jane@icloud.com"],
		["Jane+lists@proton.me", "jane@proton.me"],
		["Jane+lists@fastmail.com", "jane@fastmail.com"],
		["Jane+lists@yandex.ru", "jane@yandex.ru"],
		["Jane+lists@zoho.com", "jane@zoho.com"],
		["Jane+lists@mailfence.com", "jane@mailfence.com"],
		["Jane+lists@runbox.com", "jane@runbox.com"],
		["Jane+lists@pobox.com", "jane@pobox.com"],
		["Jane+lists@tuta.com", "jane@tuta.com"],
		["Jane+lists@posteo.de", "jane@posteo.de"],
		["Jane+lists@mailbox.org", "jane@mailbox.org"],
	];

	for (const [input, expected] of plusProviders) {
		await t.test(`${input} -> ${expected}`, () => {
			assert.equal(normalizeEmail(input), expected);
		});
	}

	await t.test("AOL lowercases but does not strip +tag", () => {
		assert.equal(normalizeEmail("Jane+lists@aol.com"), "jane+lists@aol.com");
	});
});

test("provider detection", async (t) => {
	await t.test("gmail is detected", () => {
		assert.equal(getEmailProvider("a@gmail.com"), "gmail");
	});

	await t.test("microsoft is detected across TLDs", () => {
		assert.equal(getEmailProvider("a@hotmail.co.uk"), "microsoft");
	});

	await t.test("yahoo is detected", () => {
		assert.equal(getEmailProvider("a@yahoo.fr"), "yahoo");
	});

	await t.test("provider matching is case-insensitive", () => {
		assert.equal(getEmailProvider("a@GmAiL.cOm"), "gmail");
	});

	await t.test("unknown domain -> null", () => {
		assert.equal(getEmailProvider("a@example.com"), null);
	});

	await t.test("invalid input -> null", () => {
		assert.equal(getEmailProvider("nope"), null);
	});
});

test("DEFAULT_PROVIDERS validation", async (t) => {
	await t.test("exports required providers", () => {
		const ids = DEFAULT_PROVIDERS.map((p) => p.id);
		assert.ok(ids.includes("gmail"));
		assert.ok(ids.includes("microsoft"));
		assert.ok(ids.includes("yahoo"));
	});

	await t.test("has no duplicate domains", () => {
		const seen = new Set<string>();
		for (const provider of DEFAULT_PROVIDERS) {
			for (const domain of provider.domains) {
				assert.ok(!seen.has(domain), `domain ${domain} must not be duplicated`);
				seen.add(domain);
			}
		}
	});
});