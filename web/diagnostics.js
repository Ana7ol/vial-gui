(function (root, factory) {
  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.VialDiagnostics = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_STORAGE_KEY = "vial.webhid.events.v1";
  var DEFAULT_MAX_EVENTS = 160;

  function cloneJson(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return fallback;
    }
  }

  function loadEvents(storage, storageKey, maxEvents) {
    if (!storage) {
      return [];
    }

    try {
      var parsed = JSON.parse(storage.getItem(storageKey) || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.slice(-maxEvents);
    } catch (error) {
      return [];
    }
  }

  function createEventStore(options) {
    options = options || {};
    var storage = options.storage || null;
    var storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    var maxEvents = Math.max(1, options.maxEvents || DEFAULT_MAX_EVENTS);
    var now = options.now || function () { return Date.now(); };
    var events = loadEvents(storage, storageKey, maxEvents);
    var sequence = events.reduce(function (highest, event) {
      return Math.max(highest, Number(event.sequence) || 0);
    }, 0);

    function persist() {
      if (!storage) {
        return;
      }
      try {
        storage.setItem(storageKey, JSON.stringify(events));
      } catch (error) {
        // Diagnostics must never prevent the configurator from connecting.
      }
    }

    return {
      add: function (type, details) {
        sequence += 1;
        var event = {
          sequence: sequence,
          at: new Date(now()).toISOString(),
          type: String(type),
          details: cloneJson(details || {}, {}),
        };
        events.push(event);
        if (events.length > maxEvents) {
          events = events.slice(-maxEvents);
        }
        persist();
        return cloneJson(event, event);
      },
      all: function () {
        return cloneJson(events, []);
      },
      clear: function () {
        events = [];
        sequence = 0;
        persist();
      },
      maxEvents: maxEvents,
      storageKey: storageKey,
    };
  }

  function hexId(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return null;
    }
    return "0x" + number.toString(16).toUpperCase().padStart(4, "0");
  }

  function reportIds(reports) {
    if (!reports || typeof reports.length !== "number") {
      return [];
    }
    return Array.prototype.map.call(reports, function (report) {
      return Number(report.reportId);
    }).filter(function (reportId) {
      return Number.isFinite(reportId);
    });
  }

  function describeDevice(device) {
    if (!device) {
      return null;
    }

    var collections = Array.prototype.map.call(device.collections || [], function (collection) {
      return {
        usagePage: Number(collection.usagePage),
        usage: Number(collection.usage),
        inputReportIds: reportIds(collection.inputReports),
        outputReportIds: reportIds(collection.outputReports),
        featureReportIds: reportIds(collection.featureReports),
      };
    });

    return {
      productName: device.productName || "Vial keyboard",
      vendorId: Number(device.vendorId),
      productId: Number(device.productId),
      vendorIdHex: hexId(device.vendorId),
      productIdHex: hexId(device.productId),
      opened: Boolean(device.opened),
      collections: collections,
    };
  }

  function validateMacroSafety(layout) {
    var parsed = layout;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch (error) {
        return {
          status: "error",
          macroCount: 0,
          macrosWithIssues: 0,
          issues: [],
          error: "The cached layout JSON could not be parsed.",
        };
      }
    }

    var macros = parsed && Array.isArray(parsed.macro) ? parsed.macro : [];
    var issues = [];
    macros.forEach(function (macro, macroIndex) {
      if (!Array.isArray(macro)) {
        return;
      }
      var held = {};
      var unmatchedRelease = {};

      macro.forEach(function (action) {
        if (!Array.isArray(action) || (action[0] !== "down" && action[0] !== "up")) {
          return;
        }
        action.slice(1).forEach(function (keycode) {
          var key = String(keycode);
          if (action[0] === "down") {
            held[key] = (held[key] || 0) + 1;
          } else if (held[key]) {
            held[key] -= 1;
          } else {
            unmatchedRelease[key] = (unmatchedRelease[key] || 0) + 1;
          }
        });
      });

      var unreleased = Object.keys(held).filter(function (key) { return held[key] > 0; }).sort();
      var releases = Object.keys(unmatchedRelease).filter(function (key) { return unmatchedRelease[key] > 0; }).sort();
      if (unreleased.length || releases.length) {
        issues.push({
          macroIndex: macroIndex,
          macroLabel: "M" + macroIndex,
          unreleasedKeycodes: unreleased,
          unmatchedReleaseKeycodes: releases,
        });
      }
    });

    return {
      status: issues.length ? "warning" : "passed",
      macroCount: macros.length,
      macrosWithIssues: issues.length,
      issues: issues,
    };
  }

  function buildReport(options) {
    options = options || {};
    return {
      schemaVersion: 1,
      generatedAt: options.generatedAt || new Date().toISOString(),
      configurator: cloneJson(options.configurator || {}, {}),
      environment: cloneJson(options.environment || {}, {}),
      connection: cloneJson(options.connection || {}, {}),
      device: cloneJson(options.device || null, null),
      protocol: cloneJson(options.protocol || {}, {}),
      transport: cloneJson(options.transport || {}, {}),
      communicationCheck: cloneJson(options.communicationCheck || null, null),
      macroSafety: cloneJson(options.macroSafety || null, null),
      abChecklist: cloneJson(options.abChecklist || [], []),
      events: cloneJson(options.events || [], []),
    };
  }

  return {
    DEFAULT_STORAGE_KEY: DEFAULT_STORAGE_KEY,
    DEFAULT_MAX_EVENTS: DEFAULT_MAX_EVENTS,
    createEventStore: createEventStore,
    describeDevice: describeDevice,
    validateMacroSafety: validateMacroSafety,
    buildReport: buildReport,
    hexId: hexId,
  };
}));
