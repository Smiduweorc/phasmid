import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameEmail, normalizeEmail } from "../index.js";

test("Gmail normalization", async (t) => {
	await t.test("removes dots from the local part", () => {
		assert.equal(normalizeEmail("john.doe@gmail.com"), "johndoe@gmail.com");
	});

	await t.test("strips +tag sub-addressing", () => {
		assert.equal(
			normalizeEmail("johndoe+newsletter@gmail.com"),
			"johndoe@gmail.com",
		);
	});

	await t.test("lowercases the local part", () => {
		assert.equal(normalizeEmail("JohnDoe@gmail.com"), "johndoe@gmail.com");
	});

	await t.test("collapses googlemail.com to gmail.com", () => {
		assert.equal(normalizeEmail("john.doe@googlemail.com"), "johndoe@gmail.com");
	});

	await t.test("applies dots, tags, case and alias together", () => {
		assert.equal(
			normalizeEmail("  John.Doe+promo@GoogleMail.com "),
			"johndoe@gmail.com",
		);
	});

	await t.test("treats dotted/plussed variants as the same mailbox", () => {
		assert.ok(isSameEmail("j.o.h.n@gmail.com", "john+anything@googlemail.com"));
	});
});