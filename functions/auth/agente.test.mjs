import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "./agente.js";

const TOKEN = "t".repeat(64);

function env() {
  const store = new Map();
  return {
    ADMIRA_AGENT_LOGIN_TOKEN: TOKEN,
    ACCESS: {
      put: async (key, value) => { store.set(key, value); },
      get: async (key) => store.get(key) || null,
      delete: async (key) => { store.delete(key); },
    },
  };
}

test("token malo → 401", async () => {
  const response = await onRequest({
    request: new Request("https://admira.tv/auth/agente", {
      method: "POST",
      headers: { Authorization: "Bearer definitely-not-the-token", "X-Agente": "SmithMacMini" },
    }),
    env: env(),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);
});

test("token bueno con X-Agente → 200 y cookie", async () => {
  const response = await onRequest({
    request: new Request("https://admira.tv/auth/agente", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "X-Agente": "SmithMacMini" },
    }),
    env: env(),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.agent, true);
  assert.equal(body.name, "SmithMacMini");
  assert.match(response.headers.get("set-cookie") || "", /__Host-atv_session=/);
});

test("token bueno sin X-Agente → 200 con nombre agente", async () => {
  const response = await onRequest({
    request: new Request("https://admira.tv/auth/agente", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    env: env(),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, "agente");
  assert.equal(body.agent, true);
});
