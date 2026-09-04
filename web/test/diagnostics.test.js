const assert = require("node:assert/strict");
const test = require("node:test");

const diagnostics = require("../diagnostics.js");

function memoryStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(diagnostics.DEFAULT_STORAGE_KEY, initialValue);
  }
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("event store persists only the newest bounded events", () => {
  const storage = memoryStorage();
  let now = 1_700_000_000_000;
  const store = diagnostics.createEventStore({
    storage,
    maxEvents: 3,
    now: () => now++,
  });

  store.add("one");
  store.add("two");
  store.add("three");
  store.add("four", { source: "test" });

  assert.deepEqual(store.all().map((event) => event.type), ["two", "three", "four"]);
  assert.deepEqual(
    JSON.parse(storage.getItem(diagnostics.DEFAULT_STORAGE_KEY)).map((event) => event.type),
    ["two", "three", "four"],
  );
});

test("event store recovers from corrupt session storage", () => {
  const store = diagnostics.createEventStore({ storage: memoryStorage("not-json") });
  assert.deepEqual(store.all(), []);
  assert.equal(store.add("page.loaded").sequence, 1);
});

test("device description keeps useful WebHID fields without report contents", () => {
  const device = diagnostics.describeDevice({
    productName: "Corne",
    vendorId: 0x4653,
    productId: 0x0001,
    opened: true,
    collections: [{
      usagePage: 0xFF60,
      usage: 0x61,
      inputReports: [{ reportId: 0, items: [{ reportSize: 8 }] }],
      outputReports: [{ reportId: 0, items: [{ reportSize: 8 }] }],
      featureReports: [],
    }],
  });

  assert.equal(device.vendorIdHex, "0x4653");
  assert.equal(device.productIdHex, "0x0001");
  assert.deepEqual(device.collections[0].inputReportIds, [0]);
  assert.equal("items" in device.collections[0], false);
});

test("report output is a detached JSON-safe snapshot", () => {
  const events = [{ type: "hid.disconnect", details: {} }];
  const report = diagnostics.buildReport({
    generatedAt: "2026-09-04T10:00:00.000Z",
    events,
    protocol: { via: 9, vial: 6 },
  });

  events[0].type = "changed";
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.events[0].type, "hid.disconnect");
  assert.deepEqual(report.protocol, { via: 9, vial: 6 });
});

test("macro safety audit flags unmatched key state without retaining macro text", () => {
  const result = diagnostics.validateMacroSafety({
    macro: [
      [["exact-text", "German (QWERTZ)", "private command"]],
      [["down", "KC_LSHIFT"], ["tap", "KC_A"], ["up", "KC_LSHIFT"]],
      [["down", "KC_LCTRL"], ["tap", "KC_C"]],
      [["up", "KC_LALT"]],
    ],
  });

  assert.equal(result.status, "warning");
  assert.equal(result.macrosWithIssues, 2);
  assert.deepEqual(result.issues[0], {
    macroIndex: 2,
    macroLabel: "M2",
    unreleasedKeycodes: ["KC_LCTRL"],
    unmatchedReleaseKeycodes: [],
  });
  assert.equal(JSON.stringify(result).includes("private command"), false);
});

test("macro safety audit accepts saved layout JSON", () => {
  const result = diagnostics.validateMacroSafety(JSON.stringify({
    macro: [[ ["down", "KC_LCTRL", "KC_LSHIFT"], ["up", "KC_LSHIFT", "KC_LCTRL"] ]],
  }));

  assert.equal(result.status, "passed");
  assert.equal(result.macrosWithIssues, 0);
});
