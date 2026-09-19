# Phasmid

![Phasmid Logo](https://raw.githubusercontent.com/Smiduweorc/phasmid/refs/heads/master/assets/logo.png)

Phasmid is provider-aware email normalization and canonicalization for the browser and the server. Pure ESM, zero runtime dependencies, fully typed.

## Installation

```bash
npm install phasmid
```

Phasmid ships as ESM (`"type": "module"`). It runs in modern browsers and in Node 18+, and has no runtime dependencies.

## Quick start

```ts
import { normalizeEmail, isSameEmail, getEmailProvider } from "phasmid";

normalizeEmail("John.Doe+newsletter@googlemail.com"); // "johndoe@gmail.com"
normalizeEmail("John.Doe+news@outlook.com");          // "john.doe@outlook.com" (dots kept)
normalizeEmail("john-shopping@yahoo.com");            // "john@yahoo.com"  (Yahoo uses '-')
normalizeEmail("Jane@Example.COM");                   // "Jane@example.com" (unknown domain: conservative)

isSameEmail("a.b@gmail.com", "ab+promo@gmail.com");   // true
getEmailProvider("x@hotmail.co.uk");                  // "microsoft"
```

## Why canonicalization?

Mail providers apply their own rules to decide which mailbox an address reaches:

| Behavior                       | Example                                              | Same mailbox? |
| ------------------------------ | ---------------------------------------------------- | ------------- |
| **Plus/sub-address tagging**   | `you+anything@gmail.com` -> `you@gmail.com`          | yes           |
| **Dot-insensitivity** (Gmail)  | `y.o.u@gmail.com` -> `you@gmail.com`                 | yes           |
| **Alias domains** (Gmail)      | `you@googlemail.com` -> `you@gmail.com`              | yes           |
| **Case-insensitivity**         | `You@gmail.com` -> `you@gmail.com`                   | yes           |

Phasmid applies the right rules for each provider and returns one canonical string, so equal mailboxes compare equal.

## API reference

Every function takes an optional `options` object (see [Configuration](#configuration)).

### `normalizeEmail(email, options?) => string`

Returns the canonical form of `email`. Throws `TypeError` if `email` is not a string. Malformed input (no `@`, empty local/domain) is returned trimmed and unchanged.

```ts
normalizeEmail("  Foo.Bar+spam@GMAIL.com "); // "foobar@gmail.com"
```

### `normalizeEmailDetailed(email, options?) => NormalizedEmail`

Like `normalizeEmail`, but returns the full breakdown:

```ts
normalizeEmailDetailed("John.Doe+promo@gmail.com");
// {
//   normalized: "johndoe@gmail.com",
//   local: "johndoe",
//   domain: "gmail.com",
//   providerId: "gmail",   // null for unknown domains
//   subaddress: "promo",   // the stripped tag, or null
//   valid: true,           // does it look like a syntactically valid address?
// }
```

### `isSameEmail(a, b, options?) => boolean`

`true` when `a` and `b` normalize to the same canonical address (i.e. deliver to the same mailbox under the configured rules).

```ts
isSameEmail("J.Doe+work@gmail.com", "jdoe@googlemail.com"); // true
isSameEmail("a@outlook.com", "a@hotmail.com");              // false (distinct mailboxes)
```

### `getEmailProvider(email, options?) => string | null`

Returns the id of the provider that owns the address's domain, or `null` if no provider matches (or the input is not a valid address). Never throws.

```ts
getEmailProvider("a@proton.me");   // "proton"
getEmailProvider("a@example.com"); // null
```

### `DEFAULT_PROVIDERS`

The read-only array of built-in [`ProviderRule`](#options-reference) objects, exported so you can inspect or build on top of it.

```ts
import { DEFAULT_PROVIDERS } from "phasmid";
DEFAULT_PROVIDERS.flatMap((p) => p.domains); // every recognized domain
```

## Built-in providers

| id          | Separator | Removes dots | Alias domain | Notable domains                           |
| ----------- | :-------: | :----------: | ------------ | ----------------------------------------- |
| `gmail`     |    `+`    |     yes      | `gmail.com`  | gmail.com, googlemail.com                 |
| `microsoft` |    `+`    |      no      | none         | outlook.\*, hotmail.\*, live.\*, msn.com  |
| `yahoo`     |    `-`    |      no      | none         | yahoo.\*, ymail.com, rocketmail.com       |
| `icloud`    |    `+`    |      no      | none         | icloud.com, me.com, mac.com               |
| `fastmail`  |    `+`    |      no      | none         | fastmail.com, fastmail.fm                 |
| `proton`    |    `+`    |      no      | none         | protonmail.com, proton.me, pm.me          |
| `yandex`    |    `+`    |      no      | none         | yandex.\*, ya.ru                          |
| `zoho`      |    `+`    |      no      | none         | zoho.com, zohomail.com, zoho.eu           |
| `mailfence` |    `+`    |      no      | none         | mailfence.com                             |
| `runbox`    |    `+`    |      no      | none         | runbox.com                                |
| `pobox`     |    `+`    |      no      | none         | pobox.com                                 |
| `tutanota`  |    `+`    |      no      | none         | tuta.com, tutanota.com, keemail.me        |
| `posteo`    |    `+`    |      no      | none         | posteo.de, posteo.net                     |
| `mailbox`   |    `+`    |      no      | none         | mailbox.org                               |
| `aol`       |   none    |      no      | none         | aol.com, aim.com                          |

All built-in providers lowercase the local part (they are case-insensitive in practice).

> **Unknown domains** get a **conservative** treatment: the domain is lowercased and the
> local part is left **untouched**. The email spec (RFC 5321) permits case-sensitive local
> parts, and distinct mailboxes must not be merged by accident. Opt into more aggressive
> behavior with [`defaultRule`](#a-default-rule-for-every-domain).

## Configuration

### Add your own provider

Pass extra rules via `providers`. They are matched by domain and take precedence over the built-ins.

```ts
import { normalizeEmail, type ProviderRule } from "phasmid";

const corporate: ProviderRule = {
  id: "corp",
  domains: ["mycompany.com", "mycompany.co"],
  canonicalDomain: "mycompany.com", // collapse the alias
  lowercaseLocal: true,
  removeDots: true,
  subaddressSeparators: ["+"],
};

normalizeEmail("John.Doe+x@mycompany.co", { providers: [corporate] });
// "johndoe@mycompany.com"
```

### Override a built-in provider

A user provider that lists an existing domain wins, letting you change behavior per domain:

```ts
// Treat gmail.com strictly: keep dots, don't collapse googlemail, just lowercase.
normalizeEmail("John.Doe@gmail.com", {
  providers: [{ id: "gmail-strict", domains: ["gmail.com"], lowercaseLocal: true }],
});
// "john.doe@gmail.com"
```

### Replace all providers

Ignore the built-ins entirely and use only your own:

```ts
normalizeEmail("a@gmail.com", {
  replaceDefaultProviders: true,
  providers: [{ id: "only", domains: ["only.com"], subaddressSeparators: ["+"] }],
});
// gmail.com now matches nothing -> conservative default
```

### A default rule for every domain

Apply rules to domains that match no provider, e.g. strip `+tags` everywhere:

```ts
normalizeEmail("john+tag@example.com", {
  defaultRule: { lowercaseLocal: true, subaddressSeparators: ["+"] },
});
// "john@example.com"
```

A `defaultRule` never overrides a matched provider (Yahoo still uses `-`, etc.).

### Options reference

```ts
interface NormalizeOptions {
  providers?: ProviderRule[];        // extra/override rules (win by domain)
  replaceDefaultProviders?: boolean; // ignore the built-ins entirely (default: false)
  defaultRule?: DefaultRule;         // rule for unmatched domains
  lowercaseDomain?: boolean;         // default: true
}

interface ProviderRule {
  id: string;                        // stable identifier, e.g. "gmail"
  domains: string[];                 // domains this rule applies to (case-insensitive)
  canonicalDomain?: string;          // collapse all matched domains to this one
  lowercaseLocal?: boolean;          // lowercase the local part
  removeDots?: boolean;              // strip dots from the local part (Gmail)
  subaddressSeparators?: string[];   // tag separators, e.g. ["+"] or ["-"]
}

// DefaultRule is a ProviderRule without `id`, `domains`, or `canonicalDomain`.
```

## Recipes

**Deduplicate a list of addresses**

```ts
import { normalizeEmail } from "phasmid";

const unique = [...new Map(
  rawEmails.map((e) => [normalizeEmail(e), e]),
).values()];
```

**Block re-registration with an aliased address**

```ts
import { isSameEmail } from "phasmid";

const alreadyUsed = existingUsers.some((u) => isSameEmail(u.email, signup.email));
```

**Store a canonical key alongside the original**

```ts
const { normalized, valid } = normalizeEmailDetailed(input);
if (!valid) throw new Error("Invalid email");
await db.users.insert({ email: input, emailKey: normalized });
```

## Edge cases & guarantees

- The address is split on the **last** `@`.
- **Quoted** local parts (`"a..b"@x.com`) are preserved verbatim, with no dot/tag transforms.
- A separator at index 0 (`+tag@gmail.com`) is **ignored**; stripping it would empty the local part.
- Only the **first** separator is used as the cut point (`a+b+c` becomes `a`).
- Domains are lowercased by default; the matched provider's `canonicalDomain` (if any) wins.
- Non-string input throws `TypeError`. Malformed input is returned unchanged with `valid: false`.

## Limitations

- `valid` is a lightweight syntactic check, **not** full RFC 5322 validation or MX verification.
- Provider rules reflect widely-documented behavior at the time of writing; providers can change. Everything is overridable via options.
- Fastmail-style **subdomain addressing** (`tag@user.fastmail.com`) is not resolved, because it depends on the account's domain layout.

## Development

```bash
npm install        # install dependencies
npm run build      # compile TypeScript to dist/ (tsc)
npm run typecheck  # type-check the sources and the tests
npm run lint       # eslint
npm test           # run the test suite (node:test via tsx)
npm run docs       # generate API docs to docs/ (typedoc)
```

Tests live in `tests/` as `*.test.ts` files. They run directly against the TypeScript sources with `node --import tsx --test`, so no build step is needed to run them. CI (`.github/workflows/ci.yml`) lints, type-checks, tests, and builds on every push and pull request across Linux, macOS, and Windows on Node 22 and 24.

## License

ISC

## Commits

The commits in this repo are a bit more deliberate, as this small library is not on GitLab.
