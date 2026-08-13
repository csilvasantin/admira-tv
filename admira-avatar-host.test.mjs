import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./admira-avatar.js", import.meta.url), "utf8");
const cms = await readFile(new URL("./cms.html", import.meta.url), "utf8");

test("el copiloto del CMS habla con api.yokup.com, no con workers.dev", () => {
  assert.match(source, /var WORKER = "https:\/\/api\.yokup\.com"/);
  assert.match(source, /\/api\/copilot/);
  assert.doesNotMatch(source, /brainUrl: WORKER \+ "\/copilot"/);
  assert.doesNotMatch(source, /yokup-rtc\.csilvasantin\.workers\.dev/);
  assert.doesNotMatch(source, /workers\.dev\/copilot/);
});

test("cms.html pide admira-avatar.js con token de caché", () => {
  assert.match(cms, /src="\/admira-avatar\.js\?v=/);
});
