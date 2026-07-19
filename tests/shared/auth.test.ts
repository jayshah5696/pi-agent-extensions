import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { hasRequestAuth } from "../../extensions/shared/auth.js";

const model = {} as Model<Api>;

function registryReturning(
	result:
		| { ok: true; apiKey?: string; headers?: Record<string, string> }
		| { ok: false; error: string },
) {
	return {
		async getApiKeyAndHeaders() {
			return result;
		},
	};
}

describe("hasRequestAuth", () => {
	it("rejects unavailable credentials", async () => {
		assert.equal(
			await hasRequestAuth(registryReturning({ ok: false, error: "missing" }), model),
			false,
		);
	});

	it("rejects an empty successful lookup", async () => {
		assert.equal(await hasRequestAuth(registryReturning({ ok: true }), model), false);
		assert.equal(
			await hasRequestAuth(registryReturning({ ok: true, headers: {} }), model),
			false,
		);
	});

	it("accepts an API key or authentication headers", async () => {
		assert.equal(
			await hasRequestAuth(registryReturning({ ok: true, apiKey: "token" }), model),
			true,
		);
		assert.equal(
			await hasRequestAuth(
				registryReturning({ ok: true, headers: { Authorization: "Bearer token" } }),
				model,
			),
			true,
		);
	});
});
