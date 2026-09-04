var Module = {};
Module.canvas = document.getElementById("canvas");
Module.qtCanvasElements = [Module.canvas];

var g_device = null;
var g_reconnect_candidate = null;
var g_animation = null;
var g_animation_counter = 0;
var g_pending_request = null;
var g_deferred_worker_report = null;
var g_request_sequence = 0;
var g_communication_check = null;
var g_last_communication_result = null;
var g_last_macro_safety = null;
var g_last_worker_write_at = 0;
var g_last_transport_activity_at = 0;
var g_runtime_alive = false;
var g_runtime_ready = false;
var g_vial_started = false;
var g_connection_state = "idle";
var g_page_started_at = new Date().toISOString();
var g_device_description = null;
var g_protocol_info = { via: null, vial: null };
var g_transport_stats = {
  workerWrites: 0,
  responses: 0,
  timeouts: 0,
  sendErrors: 0,
  invalidReports: 0,
  unexpectedReports: 0,
  diagnosticWrites: 0,
  lastRoundTripMs: null,
  averageRoundTripMs: null,
  maximumRoundTripMs: null,
};
var g_round_trip_total = 0;
var g_storage = getSessionStorage();
var g_diagnostic_store = VialDiagnostics.createEventStore({
  storage: g_storage,
  maxEvents: 160,
});

var LAST_DEVICE_STORAGE_KEY = "vial.webhid.last-device.v1";
var RECONNECT_STORAGE_KEY = "vial.webhid.reconnect.v1";
var CHECKLIST_STORAGE_KEY = "vial.webhid.ab-checklist.v1";
var WORKER_READ_TIMEOUT_MS = 500;
var COMMUNICATION_CHECK_TIMEOUT_MS = 750;
var COMMUNICATION_CHECK_DEADLINE_MS = 3000;
var COMMUNICATION_CHECK_SAMPLE_COUNT = 3;

var FILE_OPTIONS = {
  types: [{
    description: "Vial layout",
    accept: { "application/json": [".vil"] },
  }],
  excludeAcceptAllOption: false,
  multiple: false,
};

function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch (error) {
    return null;
  }
}

function readStoredJson(key, fallback) {
  if (!g_storage) {
    return fallback;
  }
  try {
    return JSON.parse(g_storage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  if (!g_storage) {
    return;
  }
  try {
    g_storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Connection and diagnostics continue even when storage is unavailable.
  }
}

function removeStoredValue(key) {
  if (!g_storage) {
    return;
  }
  try {
    g_storage.removeItem(key);
  } catch (error) {
    // Ignore unavailable storage.
  }
}

function errorDetails(error) {
  return {
    name: error && error.name ? String(error.name) : "Error",
    message: error && error.message ? String(error.message) : String(error || "Unknown error"),
  };
}

function eventDeviceDetails(device) {
  var description = VialDiagnostics.describeDevice(device);
  if (!description) {
    return {};
  }
  return {
    productName: description.productName,
    vendorId: description.vendorId,
    productId: description.productId,
    vendorIdHex: description.vendorIdHex,
    productIdHex: description.productIdHex,
    opened: description.opened,
  };
}

function recordDiagnostic(type, details) {
  g_diagnostic_store.add(type, details);
  renderEventLog();
}

function setStartupState(label, status, disabled) {
  document.getElementById("button_label").textContent = label;
  document.getElementById("startup_status").textContent = status;
  document.getElementById("startup_btn").disabled = disabled;
}

function showError(message, fatal) {
  document.getElementById("error_msg").textContent = message;
  document.getElementById("error").hidden = false;
  setStartupState(fatal ? "Unable to connect" : "Try again", "Check the message below, then try again.", Boolean(fatal));
  g_connection_state = "error";
  renderDiagnostics();
}

function clearError() {
  document.getElementById("error").hidden = true;
  document.getElementById("error_msg").textContent = "";
}

function formatUsage(value) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }
  return "0x" + Number(value).toString(16).toUpperCase().padStart(4, "0");
}

function vialCollection(description) {
  if (!description || !description.collections) {
    return null;
  }
  return description.collections.find(function (collection) {
    return collection.usagePage === 0xFF60 && collection.usage === 0x61;
  }) || null;
}

function hasVialCollection(device) {
  return Boolean(vialCollection(VialDiagnostics.describeDevice(device)));
}

function rememberDevice(device) {
  g_device_description = VialDiagnostics.describeDevice(device);
  if (!g_device_description) {
    return;
  }
  writeStoredJson(LAST_DEVICE_STORAGE_KEY, {
    vendorId: g_device_description.vendorId,
    productId: g_device_description.productId,
    productName: g_device_description.productName,
  });
}

function describeEvent(event) {
  var details = event.details || {};
  var names = {
    "page.loaded": "Diagnostics session opened",
    "hid.device_selected": "Keyboard selected",
    "hid.opened": "Vial HID interface opened",
    "hid.open_error": "HID interface could not open",
    "hid.connect": "Browser reported USB connect",
    "hid.disconnect": "Browser reported USB disconnect",
    "raw_hid.timeout": "Raw HID reply timed out",
    "raw_hid.send_error": "Raw HID send failed",
    "raw_hid.invalid_report": "Invalid Raw HID reply",
    "raw_hid.unexpected_report": "Unexpected Raw HID reply",
    "communication_check.started": "Communication check started",
    "communication_check.completed": "Communication check completed",
    "communication_check.interrupted": "Communication check interrupted",
    "layout.macro_safety_passed": "Layout macro check passed",
    "layout.macro_safety_warning": "Layout macro warning",
    "layout.macro_safety_cancelled": "Unsafe layout load cancelled",
    "layout.macro_safety_error": "Layout macro check failed",
    "reconnect.requested": "Manual reconnect requested",
    "reconnect.authorized_device_missing": "Authorized keyboard not detected",
    "runtime.ready": "Vial interface ready",
    "runtime.fatal_error": "Vial runtime error",
    "window.error": "Browser runtime error",
    "window.unhandled_rejection": "Unhandled browser error",
  };
  var detail = "";

  if (details.productName) {
    detail = details.productName;
  } else if (details.message) {
    detail = details.message;
  } else if (details.status) {
    detail = details.status;
  } else if (details.source) {
    detail = details.source;
  }

  return {
    title: names[event.type] || event.type,
    detail: detail,
  };
}

function renderEventLog() {
  var list = document.getElementById("diagnostics_event_log");
  var count = document.getElementById("event_log_count");
  if (!list || !count) {
    return;
  }

  var events = g_diagnostic_store.all();
  count.textContent = events.length + " retained event" + (events.length === 1 ? "" : "s") +
    " · max " + g_diagnostic_store.maxEvents + " in this tab";
  list.textContent = "";

  if (!events.length) {
    var empty = document.createElement("li");
    empty.className = "empty-event";
    empty.textContent = "No events captured yet.";
    list.appendChild(empty);
    return;
  }

  events.slice(-18).reverse().forEach(function (event) {
    var copy = describeEvent(event);
    var item = document.createElement("li");
    var time = document.createElement("time");
    var content = document.createElement("span");
    var title = document.createElement("strong");
    var detail = document.createElement("small");

    time.dateTime = event.at;
    time.textContent = new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    title.textContent = copy.title;
    content.appendChild(title);
    if (copy.detail) {
      detail.textContent = copy.detail;
      content.appendChild(detail);
    }
    item.appendChild(time);
    item.appendChild(content);
    list.appendChild(item);
  });
}

function communicationResultText() {
  if (g_communication_check) {
    return "Running " + g_communication_check.samples.length + "/" + COMMUNICATION_CHECK_SAMPLE_COUNT + " replies…";
  }
  if (!g_last_communication_result) {
    return g_runtime_ready && g_device && g_device.opened ? "Ready for a bounded read-only check." : "Connect the keyboard first.";
  }
  if (g_last_communication_result.status === "passed") {
    return g_last_communication_result.samples.length + "/" + COMMUNICATION_CHECK_SAMPLE_COUNT +
      " replies · average " + g_last_communication_result.averageMs + " ms · max " +
      g_last_communication_result.maximumMs + " ms";
  }
  return g_last_communication_result.message;
}

function renderDiagnostics() {
  var description = g_device ? VialDiagnostics.describeDevice(g_device) : g_device_description;
  var collection = vialCollection(description);
  var connection = document.getElementById("diagnostics_connection");
  var connectionDetail = document.getElementById("diagnostics_connection_detail");
  var card = document.getElementById("diagnostics_status_card");
  var toggleDot = document.getElementById("diagnostics_toggle_dot");
  var reconnectButton = document.getElementById("diagnostics_reconnect_btn");
  var checkButton = document.getElementById("communication_check_btn");

  if (!connection) {
    return;
  }

  var labels = {
    idle: ["Not connected", "Connect a keyboard to capture its WebHID descriptor and protocol."],
    connecting: ["Connecting", "Opening the selected Vial Raw HID interface…"],
    connected: ["Connected", "Raw HID is open. Disconnects and transport errors are retained in this tab."],
    available: ["Keyboard detected", "The browser sees the keyboard again. Choose Reconnect to start a fresh Vial session."],
    disconnected: ["Keyboard disconnected", "The page stayed open so you can inspect and export the event trail."],
    error: ["Connection error", "Open the event trail for the captured error, then reconnect when ready."],
  };
  var label = labels[g_connection_state] || labels.idle;
  connection.textContent = label[0];
  connectionDetail.textContent = label[1];
  card.dataset.state = g_connection_state;
  toggleDot.dataset.state = g_connection_state;
  reconnectButton.disabled = ["disconnected", "available", "error"].indexOf(g_connection_state) === -1;
  checkButton.disabled = !(g_runtime_ready && g_connection_state === "connected" && g_device && g_device.opened &&
    !g_pending_request && !g_communication_check);
  checkButton.textContent = g_communication_check ? "Checking…" : "Run 3-sample check";

  document.getElementById("diagnostics_product").textContent = description ? description.productName : "—";
  document.getElementById("diagnostics_ids").textContent = description ?
    description.vendorIdHex + ":" + description.productIdHex : "—";
  document.getElementById("diagnostics_usage").textContent = collection ?
    formatUsage(collection.usagePage) + " / " + formatUsage(collection.usage) : "—";
  document.getElementById("diagnostics_reports").textContent = collection ?
    "Input " + (collection.inputReportIds.join(", ") || "0") + " · Output " +
      (collection.outputReportIds.join(", ") || "0") : "—";
  document.getElementById("diagnostics_via_protocol").textContent =
    g_protocol_info.via === null ? "—" : String(g_protocol_info.via);
  document.getElementById("diagnostics_vial_protocol").textContent =
    g_protocol_info.vial === null ? "—" : String(g_protocol_info.vial);
  document.getElementById("communication_check_result").textContent = communicationResultText();
  var macroResult = document.getElementById("macro_safety_result");
  if (macroResult) {
    if (!g_last_macro_safety) {
      macroResult.textContent = "A .vil file is checked before it is sent to the keyboard.";
      macroResult.dataset.state = "idle";
    } else if (g_last_macro_safety.status === "passed") {
      macroResult.textContent = "Passed: " + g_last_macro_safety.macroCount + " macros checked; every key-down has a matching key-up.";
      macroResult.dataset.state = "passed";
    } else if (g_last_macro_safety.status === "warning") {
      macroResult.textContent = "Warning: " + g_last_macro_safety.macrosWithIssues + " macro(s) can leave a key held. Review the event trail before loading.";
      macroResult.dataset.state = "warning";
    } else {
      macroResult.textContent = g_last_macro_safety.error || "The macro check could not read this layout.";
      macroResult.dataset.state = "error";
    }
  }
  renderEventLog();
}

function setDiagnosticsOpen(open) {
  var panel = document.getElementById("diagnostics_panel");
  var backdrop = document.getElementById("diagnostics_backdrop");
  var toggle = document.getElementById("diagnostics_toggle");
  panel.hidden = !open;
  backdrop.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  if (open) {
    renderDiagnostics();
    document.getElementById("diagnostics_close").focus();
  } else {
    toggle.focus();
  }
}

function showConnectionNotice(title, message) {
  document.getElementById("connection_notice_title").textContent = title;
  document.getElementById("connection_notice_text").textContent = message;
  document.getElementById("connection_notice").hidden = false;
}

function hideConnectionNotice() {
  document.getElementById("connection_notice").hidden = true;
}

function safeResponseError() {
  if (typeof _vialglue_set_response_error === "function") {
    _vialglue_set_response_error();
  }
}

function commandDetails(bytes) {
  var command = bytes && bytes.length ? bytes[0] : null;
  var subcommand = bytes && bytes.length > 1 ? bytes[1] : null;
  return {
    command: command === null ? null : "0x" + command.toString(16).toUpperCase().padStart(2, "0"),
    subcommand: subcommand === null ? null : "0x" + subcommand.toString(16).toUpperCase().padStart(2, "0"),
  };
}

function captureProtocol(requestBytes, responseData) {
  if (!requestBytes || !responseData) {
    return;
  }

  if (requestBytes[0] === 0x01 && responseData.byteLength >= 3 && responseData.getUint8(0) === 0x01) {
    g_protocol_info.via = responseData.getUint16(1, false);
  } else if (requestBytes[0] === 0xFE && requestBytes[1] === 0x00 && responseData.byteLength >= 4) {
    g_protocol_info.vial = responseData.getUint32(0, true);
  }
  renderDiagnostics();
}

function updateRoundTrip(duration) {
  g_transport_stats.lastRoundTripMs = duration;
  g_round_trip_total += duration;
  g_transport_stats.averageRoundTripMs = Math.round(g_round_trip_total / g_transport_stats.responses);
  g_transport_stats.maximumRoundTripMs = Math.max(g_transport_stats.maximumRoundTripMs || 0, duration);
}

function onWorkerReadTimeout(requestId) {
  if (!g_pending_request || g_pending_request.id !== requestId) {
    return;
  }
  var pending = g_pending_request;
  g_pending_request = null;
  g_transport_stats.timeouts += 1;
  g_last_transport_activity_at = Date.now();
  recordDiagnostic("raw_hid.timeout", Object.assign({
    source: "Vial runtime",
    elapsedMs: Date.now() - pending.startedAt,
  }, commandDetails(pending.bytes)));
  safeResponseError();
  renderDiagnostics();
}

function sendWorkerReport(bytes) {
  g_last_worker_write_at = Date.now();

  if (g_communication_check) {
    g_deferred_worker_report = bytes;
    interruptCommunicationCheck("Vial requested the transport; the diagnostic check yielded immediately.");
    return;
  }

  if (!g_device || !g_device.opened) {
    g_transport_stats.sendErrors += 1;
    recordDiagnostic("raw_hid.send_error", Object.assign({
      source: "Vial runtime",
      name: "InvalidStateError",
      message: "The HID device is not open.",
    }, commandDetails(bytes)));
    safeResponseError();
    renderDiagnostics();
    return;
  }

  g_request_sequence += 1;
  var request = {
    id: g_request_sequence,
    bytes: bytes,
    startedAt: Date.now(),
    timeoutId: null,
  };
  g_pending_request = request;
  g_transport_stats.workerWrites += 1;
  g_last_transport_activity_at = Date.now();
  request.timeoutId = setTimeout(function () {
    onWorkerReadTimeout(request.id);
  }, WORKER_READ_TIMEOUT_MS);

  g_device.sendReport(0, bytes).catch(function (error) {
    if (!g_pending_request || g_pending_request.id !== request.id) {
      return;
    }
    clearTimeout(request.timeoutId);
    g_pending_request = null;
    g_transport_stats.sendErrors += 1;
    g_last_transport_activity_at = Date.now();
    recordDiagnostic("raw_hid.send_error", Object.assign({
      source: "Vial runtime",
    }, commandDetails(bytes), errorDetails(error)));
    safeResponseError();
    renderDiagnostics();
  });
}

function deliverWorkerResponse(event) {
  var pending = g_pending_request;
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  g_pending_request = null;
  g_last_transport_activity_at = Date.now();

  if (event.data.byteLength < 32) {
    g_transport_stats.invalidReports += 1;
    recordDiagnostic("raw_hid.invalid_report", Object.assign({
      source: "Vial runtime",
      expectedBytes: 32,
      receivedBytes: event.data.byteLength,
    }, commandDetails(pending.bytes)));
    safeResponseError();
    renderDiagnostics();
    return true;
  }

  try {
    g_transport_stats.responses += 1;
    updateRoundTrip(Date.now() - pending.startedAt);
    captureProtocol(pending.bytes, event.data);
    var pointer = _malloc(32);
    for (var index = 0; index < 32; index += 1) {
      setValue(pointer + index, event.data.getUint8(index), "i8");
    }
    _vialglue_set_response(pointer);
    _free(pointer);
  } catch (error) {
    g_transport_stats.invalidReports += 1;
    recordDiagnostic("raw_hid.invalid_report", Object.assign({
      source: "Vial runtime",
    }, commandDetails(pending.bytes), errorDetails(error)));
    safeResponseError();
  }
  renderDiagnostics();
  return true;
}

function finishCommunicationCheck(status, message) {
  var check = g_communication_check;
  if (!check) {
    return;
  }
  if (check.awaiting) {
    clearTimeout(check.awaiting.timeoutId);
  }
  clearTimeout(check.nextTimer);
  clearTimeout(check.deadlineTimer);

  var latencies = check.samples.map(function (sample) { return sample.roundTripMs; });
  var result = {
    status: status,
    message: message,
    startedAt: check.startedAtIso,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - check.startedAt,
    requestedSamples: COMMUNICATION_CHECK_SAMPLE_COUNT,
    samples: check.samples,
    averageMs: latencies.length ? Math.round(latencies.reduce(function (sum, value) { return sum + value; }, 0) / latencies.length) : null,
    maximumMs: latencies.length ? Math.max.apply(Math, latencies) : null,
  };
  g_communication_check = null;
  g_last_communication_result = result;

  recordDiagnostic(status === "interrupted" ? "communication_check.interrupted" : "communication_check.completed", {
    status: status,
    replies: result.samples.length,
    requestedSamples: result.requestedSamples,
    averageMs: result.averageMs,
    maximumMs: result.maximumMs,
    message: message,
  });
  renderDiagnostics();

  if (g_deferred_worker_report) {
    var deferred = g_deferred_worker_report;
    g_deferred_worker_report = null;
    setTimeout(function () { sendWorkerReport(deferred); }, 0);
  }
}

function interruptCommunicationCheck(message) {
  if (!g_communication_check) {
    return;
  }
  g_communication_check.interruptedMessage = message;
  clearTimeout(g_communication_check.nextTimer);
  if (!g_communication_check.awaiting) {
    finishCommunicationCheck("interrupted", message);
  } else {
    document.getElementById("communication_check_result").textContent = "Yielding to Vial after the current reply…";
  }
}

function communicationCheckTimeout(checkId) {
  var check = g_communication_check;
  if (!check || check.id !== checkId || !check.awaiting) {
    return;
  }
  var elapsed = Date.now() - check.awaiting.startedAt;
  check.awaiting = null;
  g_transport_stats.timeouts += 1;
  g_last_transport_activity_at = Date.now();
  recordDiagnostic("raw_hid.timeout", {
    source: "Communication check",
    command: "0x01",
    elapsedMs: elapsed,
  });
  finishCommunicationCheck("failed", "Timed out waiting for protocol reply " + (check.samples.length + 1) + ".");
}

function sendCommunicationCheckSample() {
  var check = g_communication_check;
  if (!check) {
    return;
  }
  if (check.interruptedMessage) {
    finishCommunicationCheck("interrupted", check.interruptedMessage);
    return;
  }
  if (!g_device || !g_device.opened) {
    finishCommunicationCheck("failed", "The keyboard disconnected during the check.");
    return;
  }
  if (Date.now() >= check.deadlineAt) {
    finishCommunicationCheck("failed", "The 3-second communication-check limit was reached.");
    return;
  }

  var payload = new Uint8Array(32);
  payload[0] = 0x01;
  check.awaiting = {
    startedAt: Date.now(),
    timeoutId: setTimeout(function () {
      communicationCheckTimeout(check.id);
    }, Math.min(COMMUNICATION_CHECK_TIMEOUT_MS, check.deadlineAt - Date.now())),
  };
  g_transport_stats.diagnosticWrites += 1;
  g_last_transport_activity_at = Date.now();

  g_device.sendReport(0, payload).catch(function (error) {
    if (!g_communication_check || g_communication_check.id !== check.id || !g_communication_check.awaiting) {
      return;
    }
    clearTimeout(g_communication_check.awaiting.timeoutId);
    g_communication_check.awaiting = null;
    g_transport_stats.sendErrors += 1;
    g_last_transport_activity_at = Date.now();
    recordDiagnostic("raw_hid.send_error", Object.assign({
      source: "Communication check",
      command: "0x01",
    }, errorDetails(error)));
    finishCommunicationCheck("failed", "The protocol request could not be sent: " + errorDetails(error).message);
  });
  renderDiagnostics();
}

function receiveCommunicationCheckReport(event) {
  var check = g_communication_check;
  if (!check || !check.awaiting) {
    return false;
  }

  if (event.data.byteLength < 3 || event.data.getUint8(0) !== 0x01) {
    clearTimeout(check.awaiting.timeoutId);
    check.awaiting = null;
    g_transport_stats.invalidReports += 1;
    recordDiagnostic("raw_hid.invalid_report", {
      source: "Communication check",
      command: "0x01",
      expectedBytes: 32,
      receivedBytes: event.data.byteLength,
      message: "Reply did not identify the VIA protocol-version command.",
    });
    finishCommunicationCheck("failed", "Received an unexpected Raw HID reply during the check.");
    return true;
  }

  var startedAt = check.awaiting.startedAt;
  clearTimeout(check.awaiting.timeoutId);
  check.awaiting = null;
  g_last_transport_activity_at = Date.now();
  g_protocol_info.via = event.data.getUint16(1, false);
  check.samples.push({
    index: check.samples.length + 1,
    roundTripMs: Date.now() - startedAt,
    viaProtocol: g_protocol_info.via,
  });

  if (check.interruptedMessage) {
    finishCommunicationCheck("interrupted", check.interruptedMessage);
  } else if (check.samples.length >= COMMUNICATION_CHECK_SAMPLE_COUNT) {
    finishCommunicationCheck("passed", "All bounded protocol requests replied.");
  } else {
    check.nextTimer = setTimeout(sendCommunicationCheckSample, 100);
    renderDiagnostics();
  }
  return true;
}

function runCommunicationCheck() {
  if (g_communication_check) {
    return;
  }
  if (!g_runtime_ready || !g_device || !g_device.opened || g_connection_state !== "connected") {
    g_last_communication_result = {
      status: "failed",
      message: "Connect the keyboard and wait for Vial to finish loading first.",
      samples: [],
    };
    renderDiagnostics();
    return;
  }
  if (g_pending_request || Date.now() - g_last_worker_write_at < 250 || Date.now() - g_last_transport_activity_at < 150) {
    g_last_communication_result = {
      status: "failed",
      message: "Vial is using Raw HID right now. Close Matrix tester or wait a moment, then retry.",
      samples: [],
    };
    renderDiagnostics();
    return;
  }

  var now = Date.now();
  g_communication_check = {
    id: now,
    startedAt: now,
    startedAtIso: new Date(now).toISOString(),
    deadlineAt: now + COMMUNICATION_CHECK_DEADLINE_MS,
    deadlineTimer: setTimeout(function () {
      if (g_communication_check && g_communication_check.id === now) {
        finishCommunicationCheck("failed", "The 3-second communication-check limit was reached.");
      }
    }, COMMUNICATION_CHECK_DEADLINE_MS),
    nextTimer: null,
    awaiting: null,
    interruptedMessage: null,
    samples: [],
  };
  recordDiagnostic("communication_check.started", {
    requestedSamples: COMMUNICATION_CHECK_SAMPLE_COUNT,
    perSampleTimeoutMs: COMMUNICATION_CHECK_TIMEOUT_MS,
    overallDeadlineMs: COMMUNICATION_CHECK_DEADLINE_MS,
    command: "VIA get protocol version (0x01)",
  });
  sendCommunicationCheckSample();
}

function handleInputReport(event) {
  try {
    if (receiveCommunicationCheckReport(event)) {
      return;
    }
    if (deliverWorkerResponse(event)) {
      return;
    }
    g_transport_stats.unexpectedReports += 1;
    g_last_transport_activity_at = Date.now();
    recordDiagnostic("raw_hid.unexpected_report", {
      source: "Vial runtime",
      receivedBytes: event.data.byteLength,
    });
    renderDiagnostics();
  } catch (error) {
    g_transport_stats.invalidReports += 1;
    recordDiagnostic("raw_hid.invalid_report", Object.assign({
      source: "Vial runtime",
    }, errorDetails(error)));
    if (g_pending_request) {
      clearTimeout(g_pending_request.timeoutId);
      g_pending_request = null;
      safeResponseError();
    }
    renderDiagnostics();
  }
}

function my_onmessage(event) {
  if (event.data.cmd === "write_device") {
    sendWorkerReport(new Uint8Array(event.data.data));
  } else if (event.data.cmd === "unlock_start") {
    var imageData = new Uint8Array(event.data.data);
    var imageUrl = URL.createObjectURL(new Blob([imageData], { type: "image/png" }));
    var progress = document.getElementById("unlock_status");
    var image = document.getElementById("unlock_img");
    progress.max = 1;
    progress.value = 0;
    image.src = imageUrl;
    image.style.width = Math.round(event.data.width / window.devicePixelRatio) + "px";
    image.style.height = Math.round(event.data.height / window.devicePixelRatio) + "px";
    document.getElementById("unlock_inner").style.minWidth = image.style.width;
    document.getElementById("unlock").hidden = false;
  } else if (event.data.cmd === "unlock_status") {
    var unlockStatus = document.getElementById("unlock_status");
    unlockStatus.max = Math.max(unlockStatus.max, event.data.data);
    unlockStatus.value = unlockStatus.max - event.data.data;
  } else if (event.data.cmd === "unlock_done") {
    document.getElementById("unlock").hidden = true;
  } else if (event.data.cmd === "notify_ready") {
    clearInterval(g_animation);
    g_runtime_ready = true;
    g_connection_state = "connected";
    document.getElementById("startup").hidden = true;
    hideConnectionNotice();
    recordDiagnostic("runtime.ready", eventDeviceDetails(g_device));
    renderDiagnostics();
    window.dispatchEvent(new Event("resize"));
  } else if (event.data.cmd === "notify_alive") {
    g_runtime_alive = true;
    setStartupState("Connect keyboard", "Ready. Your browser will ask which keyboard to use.", false);
    var reconnectRequest = readStoredJson(RECONNECT_STORAGE_KEY, null);
    removeStoredValue(RECONNECT_STORAGE_KEY);
    if (reconnectRequest) {
      reconnectAuthorizedDevice(reconnectRequest);
    }
  } else if (event.data.cmd === "load_layout") {
    loadLayout();
  } else if (event.data.cmd === "save_layout") {
    saveLayout(event.data.layout);
  } else if (event.data.cmd === "fatal_error") {
    recordDiagnostic("runtime.fatal_error", { message: event.data.msg });
    showError(event.data.msg, false);
  }
}

async function loadLayout() {
  if (!window.showOpenFilePicker) {
    showError("File loading is unavailable in this browser. Use a current Chrome or Edge release.", false);
    return;
  }

  try {
    var handles = await window.showOpenFilePicker(FILE_OPTIONS);
    if (!handles.length) {
      return;
    }
    var file = await handles[0].getFile();
    var layout = await file.text();
    g_last_macro_safety = VialDiagnostics.validateMacroSafety(layout);

    if (g_last_macro_safety.status === "error") {
      recordDiagnostic("layout.macro_safety_error", {
        message: g_last_macro_safety.error,
      });
      renderDiagnostics();
      showError(g_last_macro_safety.error, false);
      return;
    }

    if (g_last_macro_safety.status === "warning") {
      var issueSummary = g_last_macro_safety.issues.map(function (issue) {
        var problems = [];
        if (issue.unreleasedKeycodes.length) {
          problems.push("unreleased " + issue.unreleasedKeycodes.join(", "));
        }
        if (issue.unmatchedReleaseKeycodes.length) {
          problems.push("unmatched release " + issue.unmatchedReleaseKeycodes.join(", "));
        }
        return issue.macroLabel + ": " + problems.join("; ");
      }).join("\n");
      recordDiagnostic("layout.macro_safety_warning", {
        status: g_last_macro_safety.status,
        macrosChecked: g_last_macro_safety.macroCount,
        macrosWithIssues: g_last_macro_safety.macrosWithIssues,
        issues: g_last_macro_safety.issues,
      });
      renderDiagnostics();

      var continueLoad = window.confirm(
        "Macro safety warning\n\n" + issueSummary +
        "\n\nThis can cause a modifier or letter to remain held. Load the layout anyway?",
      );
      if (!continueLoad) {
        recordDiagnostic("layout.macro_safety_cancelled", {
          macrosWithIssues: g_last_macro_safety.macrosWithIssues,
        });
        return;
      }
    } else {
      recordDiagnostic("layout.macro_safety_passed", {
        status: g_last_macro_safety.status,
        macrosChecked: g_last_macro_safety.macroCount,
      });
      renderDiagnostics();
    }

    PThread.runningWorkers[0].postMessage({
      cmd: "py",
      payload: "import webmain;webmain.window.on_layout_loaded(b" + JSON.stringify(layout) + ")",
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(error.message || "The layout file could not be opened.", false);
    }
  }
}

async function saveLayout(layout) {
  try {
    if (window.showSaveFilePicker) {
      var handle = await window.showSaveFilePicker(FILE_OPTIONS);
      var stream = await handle.createWritable();
      await stream.write(layout);
      await stream.close();
      return;
    }

    var download = document.createElement("a");
    download.href = "data:text/plain;charset=utf-8," + encodeURIComponent(layout);
    download.download = "layout.vil";
    download.click();
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(error.message || "The layout file could not be saved.", false);
    }
  }
}

function createDeviceDescription(device) {
  return {
    path: "/webhid",
    vendor_id: device.vendorId,
    product_id: device.productId,
    serial_number: "",
    release_number: 1,
    manufacturer_string: "",
    product_string: device.productName,
    usage_page: 65376,
    usage: 97,
    interface_number: 1,
  };
}

async function startDeviceConnection(device, source) {
  clearError();
  hideConnectionNotice();
  g_connection_state = "connecting";
  g_device = device;
  g_reconnect_candidate = null;
  rememberDevice(device);
  recordDiagnostic("hid.device_selected", Object.assign({ source: source }, eventDeviceDetails(device)));
  setStartupState("Reading firmware", "Opening the Vial interface and reading the keyboard definition…", true);
  document.getElementById("device_name").textContent = device.productName || "Vial keyboard";
  document.getElementById("device_preview").hidden = false;
  renderDiagnostics();

  try {
    if (!device.opened) {
      await device.open();
    }
    device.oninputreport = handleInputReport;
    rememberDevice(device);
    recordDiagnostic("hid.opened", eventDeviceDetails(device));
    g_connection_state = "connected";
    renderDiagnostics();

    var deviceDescription = createDeviceDescription(device);
    _vialglue_set_device_desc(allocateUTF8(JSON.stringify(deviceDescription)));
    g_vial_started = true;
    PThread.runningWorkers[0].postMessage({ cmd: "py", payload: "import webmain;webmain.main(qtApp)" });

    g_animation_counter = 0;
    g_animation = setInterval(function () {
      g_animation_counter = (g_animation_counter + 1) % 4;
      document.getElementById("startup_status").textContent =
        "Reading firmware definition" + ".".repeat(g_animation_counter + 1);
    }, 500);
  } catch (error) {
    g_connection_state = "error";
    recordDiagnostic("hid.open_error", Object.assign(eventDeviceDetails(device), errorDetails(error)));
    showError(error.message || "The selected device could not be opened.", false);
  }
}

async function connect() {
  clearError();
  setStartupState("Choose keyboard", "Waiting for the WebHID device picker…", true);

  try {
    var devices = await navigator.hid.requestDevice({
      filters: [{ usagePage: 0xFF60, usage: 0x61 }],
    });

    if (devices.length !== 1) {
      setStartupState("Connect keyboard", "No keyboard selected. You can try again.", false);
      return;
    }
    await startDeviceConnection(devices[0], "WebHID picker");
  } catch (error) {
    if (error.name === "NotFoundError") {
      setStartupState("Connect keyboard", "No keyboard selected. You can try again.", false);
      return;
    }
    recordDiagnostic("hid.open_error", errorDetails(error));
    showError(error.message || "The selected device could not be opened.", false);
  }
}

async function reconnectAuthorizedDevice(request) {
  setStartupState("Finding keyboard", "Looking for the previously authorized Vial interface…", true);
  try {
    var devices = await navigator.hid.getDevices();
    var matching = devices.filter(function (device) {
      var sameIds = !request || (device.vendorId === request.vendorId && device.productId === request.productId);
      return sameIds && hasVialCollection(device);
    });
    if (!matching.length) {
      recordDiagnostic("reconnect.authorized_device_missing", request || {});
      setStartupState("Connect keyboard", "Reconnect the cable, then choose the keyboard if it is not detected automatically.", false);
      g_connection_state = "disconnected";
      renderDiagnostics();
      return;
    }
    await startDeviceConnection(matching[0], "authorized reconnect");
  } catch (error) {
    recordDiagnostic("hid.open_error", Object.assign({ source: "authorized reconnect" }, errorDetails(error)));
    showError(error.message || "The keyboard could not be reconnected.", false);
  }
}

function requestReconnect() {
  var previous = g_device_description || readStoredJson(LAST_DEVICE_STORAGE_KEY, null);
  recordDiagnostic("reconnect.requested", previous || {});

  if (g_vial_started) {
    writeStoredJson(RECONNECT_STORAGE_KEY, previous || {});
    window.location.reload();
    return;
  }
  reconnectAuthorizedDevice(previous);
}

function handleHidConnect(event) {
  recordDiagnostic("hid.connect", eventDeviceDetails(event.device));
  var previous = g_device_description || readStoredJson(LAST_DEVICE_STORAGE_KEY, null);
  if (!previous || (event.device.vendorId === previous.vendorId && event.device.productId === previous.productId)) {
    g_reconnect_candidate = event.device;
    if (g_connection_state === "disconnected") {
      g_connection_state = "available";
      showConnectionNotice(
        "Keyboard detected again",
        "The browser sees the Vial interface. Choose Reconnect to start a clean session; this page will reload only then.",
      );
    }
  }
  renderDiagnostics();
}

function handleHidDisconnect(event) {
  recordDiagnostic("hid.disconnect", eventDeviceDetails(event.device));
  if (!g_device || event.device !== g_device) {
    return;
  }

  if (g_pending_request) {
    clearTimeout(g_pending_request.timeoutId);
    g_pending_request = null;
    g_transport_stats.sendErrors += 1;
    recordDiagnostic("raw_hid.send_error", {
      source: "Vial runtime",
      name: "NetworkError",
      message: "The keyboard disconnected while a Raw HID reply was pending.",
    });
    safeResponseError();
  }
  if (g_communication_check) {
    finishCommunicationCheck("failed", "The keyboard disconnected during the check.");
  }
  clearInterval(g_animation);
  g_connection_state = "disconnected";
  g_runtime_ready = false;
  rememberDevice(event.device);
  showConnectionNotice(
    "Keyboard disconnected",
    "The page stayed open and retained the event trail. Replug the keyboard, then choose Reconnect when ready.",
  );
  renderDiagnostics();
}

function loadVialRuntime(source) {
  if (!("hid" in navigator)) {
    showError("This browser does not support WebHID. Open the site in Chrome or Microsoft Edge on a desktop computer.", true);
    return;
  }

  if (!HTMLCanvasElement.prototype.transferControlToOffscreen) {
    showError("This browser does not support the OffscreenCanvas feature used by Vial Web.", true);
    return;
  }

  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    setStartupState("Preparing browser", "Enabling the secure WebAssembly runtime. This page will reload once.", true);
    setTimeout(function () {
      if (!window.crossOriginIsolated) {
        showError("Browser isolation could not be enabled. Reload once, or use the Cloudflare-hosted build with COOP/COEP headers.", true);
      }
    }, 6000);
    return;
  }

  var runtime = document.createElement("script");
  runtime.src = source;
  runtime.onerror = function () {
    recordDiagnostic("runtime.fatal_error", { message: "The Vial Web runtime could not be downloaded." });
    showError("The Vial Web runtime could not be downloaded. Reload the page and try again.", false);
  };
  document.body.appendChild(runtime);
}

function checklistReport() {
  return Array.prototype.map.call(document.querySelectorAll("[data-check-id]"), function (input) {
    return {
      id: input.dataset.checkId,
      completed: input.checked,
      step: input.parentElement.textContent.trim(),
    };
  });
}

function initializeChecklist() {
  var saved = readStoredJson(CHECKLIST_STORAGE_KEY, {});
  Array.prototype.forEach.call(document.querySelectorAll("[data-check-id]"), function (input) {
    input.checked = Boolean(saved[input.dataset.checkId]);
    input.addEventListener("change", function () {
      var values = {};
      checklistReport().forEach(function (item) { values[item.id] = item.completed; });
      writeStoredJson(CHECKLIST_STORAGE_KEY, values);
    });
  });
}

function createDiagnosticsReport() {
  return VialDiagnostics.buildReport({
    configurator: {
      title: document.title,
      url: window.location.href,
      repository: document.querySelector(".brand").href,
    },
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.userAgentData && navigator.userAgentData.platform ? navigator.userAgentData.platform : navigator.platform,
      language: navigator.language,
      secureContext: window.isSecureContext,
      crossOriginIsolated: window.crossOriginIsolated,
      webHidSupported: "hid" in navigator,
      offscreenCanvasSupported: Boolean(HTMLCanvasElement.prototype.transferControlToOffscreen),
    },
    connection: {
      state: g_connection_state,
      pageStartedAt: g_page_started_at,
      runtimeAlive: g_runtime_alive,
      runtimeReady: g_runtime_ready,
    },
    device: g_device ? VialDiagnostics.describeDevice(g_device) : g_device_description,
    protocol: g_protocol_info,
    transport: Object.assign({}, g_transport_stats, {
      pendingRequest: g_pending_request ? commandDetails(g_pending_request.bytes) : null,
    }),
    communicationCheck: g_last_communication_result,
    macroSafety: g_last_macro_safety,
    abChecklist: checklistReport(),
    events: g_diagnostic_store.all(),
  });
}

async function copyDiagnosticsReport() {
  var report = JSON.stringify(createDiagnosticsReport(), null, 2);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(report);
    } else {
      var textarea = document.createElement("textarea");
      textarea.value = report;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    document.getElementById("report_status").textContent = "Diagnostic JSON copied.";
  } catch (error) {
    document.getElementById("report_status").textContent = "Copy failed: " + errorDetails(error).message;
  }
}

function downloadDiagnosticsReport() {
  var report = JSON.stringify(createDiagnosticsReport(), null, 2);
  var url = URL.createObjectURL(new Blob([report], { type: "application/json" }));
  var download = document.createElement("a");
  download.href = url;
  download.download = "vial-webhid-diagnostics-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  document.body.appendChild(download);
  download.click();
  download.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  document.getElementById("report_status").textContent = "Diagnostic JSON downloaded.";
}

document.getElementById("startup_btn").addEventListener("click", connect);
document.getElementById("diagnostics_toggle").addEventListener("click", function () { setDiagnosticsOpen(true); });
document.getElementById("diagnostics_close").addEventListener("click", function () { setDiagnosticsOpen(false); });
document.getElementById("diagnostics_backdrop").addEventListener("click", function () { setDiagnosticsOpen(false); });
document.getElementById("notice_diagnostics_btn").addEventListener("click", function () { setDiagnosticsOpen(true); });
document.getElementById("notice_reconnect_btn").addEventListener("click", requestReconnect);
document.getElementById("diagnostics_reconnect_btn").addEventListener("click", requestReconnect);
document.getElementById("communication_check_btn").addEventListener("click", runCommunicationCheck);
document.getElementById("copy_report_btn").addEventListener("click", copyDiagnosticsReport);
document.getElementById("download_report_btn").addEventListener("click", downloadDiagnosticsReport);
document.getElementById("clear_diagnostics_btn").addEventListener("click", function () {
  g_diagnostic_store.clear();
  document.getElementById("report_status").textContent = "Event trail cleared.";
  renderEventLog();
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !document.getElementById("diagnostics_panel").hidden) {
    setDiagnosticsOpen(false);
  }
});

if ("hid" in navigator) {
  navigator.hid.addEventListener("connect", handleHidConnect);
  navigator.hid.addEventListener("disconnect", handleHidDisconnect);
}

window.onerror = function (message, source, line, column) {
  recordDiagnostic("window.error", {
    message: String(message),
    source: source || null,
    line: line || null,
    column: column || null,
  });
  showError(String(message), false);
};

window.addEventListener("unhandledrejection", function (event) {
  recordDiagnostic("window.unhandled_rejection", errorDetails(event.reason));
});

initializeChecklist();
recordDiagnostic("page.loaded", {
  url: window.location.href,
  retainedEventLimit: g_diagnostic_store.maxEvents,
});
renderDiagnostics();
