import type { ProviderRule } from "./types.js";

/**
 * Built-in provider rules.
 *
 * These encode the well-documented, widely-relied-upon behaviors of major mail
 * providers. They are deliberately conservative: domains are only collapsed
 * where aliases truly deliver to the same mailbox (Gmail), and local parts are
 * only lowercased for providers known to be case-insensitive.
 *
 * Sources cross-checked while compiling this list:
 *   - Wikipedia, "Email address" (sub-addressing section).
 *   - aaronbassett's "Email sub addressing for different providers" gist.
 *   - validator.js `normalizeEmail` provider conventions.
 *   - Fastmail / Microsoft Learn / Proton provider documentation.
 *
 * Consumers can extend or override any of these via
 * {@link NormalizeOptions.providers}.
 */
export const DEFAULT_PROVIDERS: readonly ProviderRule[] = Object.freeze([
	{
		// Gmail ignores dots, supports `+` tagging, and treats googlemail.com as
		// an alias of gmail.com.
		id: "gmail",
		domains: ["gmail.com", "googlemail.com"],
		canonicalDomain: "gmail.com",
		lowercaseLocal: true,
		removeDots: true,
		subaddressSeparators: ["+"],
	},
	{
		// Microsoft consumer mail (Outlook.com / Hotmail / Live / MSN). Dots are
		// significant; `+` tagging is supported. The domains are distinct
		// mailboxes, so they are not collapsed.
		id: "microsoft",
		domains: [
			"outlook.com",
			"outlook.com.au",
			"outlook.co.uk",
			"outlook.fr",
			"outlook.de",
			"outlook.es",
			"outlook.it",
			"outlook.jp",
			"hotmail.com",
			"hotmail.co.uk",
			"hotmail.com.au",
			"hotmail.fr",
			"hotmail.de",
			"hotmail.it",
			"hotmail.es",
			"hotmail.ca",
			"live.com",
			"live.com.au",
			"live.co.uk",
			"live.fr",
			"live.de",
			"live.ca",
			"msn.com",
			"windowslive.com",
			"passport.com",
		],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		// Yahoo historically uses a hyphen as its sub-address separator (its
		// "disposable addresses" feature), not `+`.
		id: "yahoo",
		domains: [
			"yahoo.com",
			"yahoo.co.uk",
			"yahoo.ie",
			"yahoo.fr",
			"yahoo.de",
			"yahoo.es",
			"yahoo.it",
			"yahoo.ca",
			"yahoo.in",
			"yahoo.com.au",
			"yahoo.com.br",
			"yahoo.com.mx",
			"yahoo.com.ar",
			"yahoo.co.jp",
			"ymail.com",
			"rocketmail.com",
		],
		lowercaseLocal: true,
		subaddressSeparators: ["-"],
	},
	{
		// Apple iCloud. me.com and mac.com forward to the same Apple ID, but we
		// keep them distinct by default to avoid surprising collapses.
		id: "icloud",
		domains: ["icloud.com", "me.com", "mac.com"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		// Fastmail also supports subdomain addressing
		// (user+tag@fastmail.com == tag@user.fastmail.com), which is not
		// resolved here because it depends on the account's domain layout.
		id: "fastmail",
		domains: ["fastmail.com", "fastmail.fm"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "proton",
		domains: ["protonmail.com", "protonmail.ch", "proton.me", "pm.me"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "yandex",
		domains: [
			"yandex.com",
			"yandex.ru",
			"ya.ru",
			"yandex.by",
			"yandex.kz",
			"yandex.ua",
		],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "zoho",
		domains: ["zoho.com", "zohomail.com", "zoho.eu"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "mailfence",
		domains: ["mailfence.com"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "runbox",
		domains: ["runbox.com"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		// Pobox is part of the Fastmail family.
		id: "pobox",
		domains: ["pobox.com"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "tutanota",
		domains: [
			"tutanota.com",
			"tutanota.de",
			"tutamail.com",
			"tuta.com",
			"tuta.io",
			"keemail.me",
		],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "posteo",
		domains: ["posteo.de", "posteo.net"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		id: "mailbox",
		domains: ["mailbox.org"],
		lowercaseLocal: true,
		subaddressSeparators: ["+"],
	},
	{
		// AOL is case-insensitive but does not support `+` tagging.
		id: "aol",
		domains: ["aol.com", "aim.com"],
		lowercaseLocal: true,
	},
]);