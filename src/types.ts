export interface LocalPartRules {
	lowercaseLocal?: boolean;
	removeDots?: boolean;
	subaddressSeparator?: string[];
}

export interface ProviderRule extends LocalPartRules {
	id: string;
	domains: string[];
	canonicalDomain?: string;
}

export type DefaultRule = LocalPartRules;

export interface NormalizeOptions {
	providers?: ProviderRule[];
	replaceDefaultProviders?: boolean;
	defaultRules?: DefaultRule;
	lowercaseDomain?: boolean;
}

export interface NormalizeEmail {
	normalized: string;
	local: string;
	domain: string;
	providerId: string | null;
	subaddress: string | null;
	valid: boolean;
}