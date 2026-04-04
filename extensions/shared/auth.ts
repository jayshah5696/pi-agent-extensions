import type { Api, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";

export type RequestAuth = Pick<ProviderStreamOptions, "apiKey" | "headers">;

type ModelRegistryWithRequestAuth = {
	getApiKeyAndHeaders: (
		model: Model<Api>,
	) => Promise<
		| { ok: true; apiKey?: string; headers?: Record<string, string> }
		| { ok: false; error: string }
	>;
};

export async function getRequestAuth(
	modelRegistry: ModelRegistryWithRequestAuth,
	model: Model<Api>,
): Promise<RequestAuth | undefined> {
	const auth = await modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) return undefined;
	return { apiKey: auth.apiKey, headers: auth.headers };
}

export async function getRequestAuthOrThrow(
	modelRegistry: ModelRegistryWithRequestAuth,
	model: Model<Api>,
): Promise<RequestAuth> {
	const auth = await modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		throw new Error(auth.error);
	}
	return { apiKey: auth.apiKey, headers: auth.headers };
}

export async function hasRequestAuth(
	modelRegistry: ModelRegistryWithRequestAuth,
	model: Model<Api>,
): Promise<boolean> {
	const auth = await modelRegistry.getApiKeyAndHeaders(model);
	return auth.ok;
}
