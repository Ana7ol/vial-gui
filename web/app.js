var Module = {};
Module.canvas = document.getElementById("canvas");
Module.qtCanvasElements = [Module.canvas];

var g_device = null;
var g_read_timeout = null;
var g_animation = null;
var g_animation_counter = 0;

var FILE_OPTIONS = {
  types: [{
    description: "Vial layout",
    accept: { "application/json": [".vil"] },
  }],
  excludeAcceptAllOption: false,
  multiple: false,
};

function setStartupState(label, status, disabled) {
  document.getElementById("button_label").textContent = label;
  document.getElementById("startup_status").textContent = status;
  document.getElementById("startup_btn").disabled = disabled;
}

function showError(message) {
  document.getElementById("error_msg").textContent = message;
  document.getElementById("error").hidden = false;
  setStartupState("Unable to connect", "Check the message below, then try again.", true);
}

function clearError() {
  document.getElementById("error").hidden = true;
  document.getElementById("error_msg").textContent = "";
}

function read_timeout() {
  console.error("Vial device read timed out");
  _vialglue_set_response_error();
}

function my_onmessage(event) {
  if (event.data.cmd === "write_device") {
    g_device.sendReport(0, new Uint8Array(event.data.data)).catch(function () {
      _vialglue_set_response_error();
    });
    g_read_timeout = setTimeout(read_timeout, 500);
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
    document.getElementById("startup").hidden = true;
    window.dispatchEvent(new Event("resize"));
  } else if (event.data.cmd === "notify_alive") {
    setStartupState("Connect keyboard", "Ready. Your browser will ask which keyboard to use.", false);
  } else if (event.data.cmd === "load_layout") {
    loadLayout();
  } else if (event.data.cmd === "save_layout") {
    saveLayout(event.data.layout);
  } else if (event.data.cmd === "fatal_error") {
    showError(event.data.msg);
  }
}

async function loadLayout() {
  if (!window.showOpenFilePicker) {
    showError("File loading is unavailable in this browser. Use a current Chrome or Edge release.");
    return;
  }

  try {
    var handles = await window.showOpenFilePicker(FILE_OPTIONS);
    if (!handles.length) {
      return;
    }
    var file = await handles[0].getFile();
    var layout = await file.text();
    PThread.runningWorkers[0].postMessage({
      cmd: "py",
      payload: "import webmain;webmain.window.on_layout_loaded(b" + JSON.stringify(layout) + ")",
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(error.message || "The layout file could not be opened.");
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
      showError(error.message || "The layout file could not be saved.");
    }
  }
}

async function connect() {
  clearError();
  setStartupState("Choose keyboard", "Waiting for the WebHID device picker...", true);

  try {
    var devices = await navigator.hid.requestDevice({
      filters: [{ usagePage: 0xFF60, usage: 0x61 }],
    });

    if (devices.length !== 1) {
      setStartupState("Connect keyboard", "No keyboard selected. You can try again.", false);
      return;
    }

    g_device = devices[0];
    setStartupState("Reading firmware", "Opening the Vial interface and reading the keyboard definition...", true);
    document.getElementById("device_name").textContent = g_device.productName || "Vial keyboard";
    document.getElementById("device_preview").hidden = false;

    if (!g_device.opened) {
      await g_device.open();
    }

    g_device.oninputreport = function (event) {
      clearTimeout(g_read_timeout);
      var pointer = _malloc(32);
      for (var index = 0; index < 32; index += 1) {
        setValue(pointer + index, event.data.getUint8(index), "i8");
      }
      _vialglue_set_response(pointer);
      _free(pointer);
    };

    var deviceDescription = {
      path: "/webhid",
      vendor_id: g_device.vendorId,
      product_id: g_device.productId,
      serial_number: "",
      release_number: 1,
      manufacturer_string: "",
      product_string: g_device.productName,
      usage_page: 65376,
      usage: 97,
      interface_number: 1,
    };

    _vialglue_set_device_desc(allocateUTF8(JSON.stringify(deviceDescription)));
    PThread.runningWorkers[0].postMessage({ cmd: "py", payload: "import webmain;webmain.main(qtApp)" });

    g_animation_counter = 0;
    g_animation = setInterval(function () {
      g_animation_counter = (g_animation_counter + 1) % 4;
      document.getElementById("startup_status").textContent =
        "Reading firmware definition" + ".".repeat(g_animation_counter + 1);
    }, 500);
  } catch (error) {
    if (error.name === "NotFoundError") {
      setStartupState("Connect keyboard", "No keyboard selected. You can try again.", false);
      return;
    }
    showError(error.message || "The selected device could not be opened.");
    document.getElementById("startup_btn").disabled = false;
  }
}

function loadVialRuntime(source) {
  if (!("hid" in navigator)) {
    showError("This browser does not support WebHID. Open the site in Chrome or Microsoft Edge on a desktop computer.");
    return;
  }

  if (!HTMLCanvasElement.prototype.transferControlToOffscreen) {
    showError("This browser does not support the OffscreenCanvas feature used by Vial Web.");
    return;
  }

  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    setStartupState("Preparing browser", "Enabling the secure WebAssembly runtime. This page will reload once.", true);
    setTimeout(function () {
      if (!window.crossOriginIsolated) {
        showError("Browser isolation could not be enabled. Reload once, or use the Cloudflare-hosted build with COOP/COEP headers.");
      }
    }, 6000);
    return;
  }

  var runtime = document.createElement("script");
  runtime.src = source;
  runtime.onerror = function () {
    showError("The Vial Web runtime could not be downloaded. Reload the page and try again.");
  };
  document.body.appendChild(runtime);
}

document.getElementById("startup_btn").addEventListener("click", connect);

if ("hid" in navigator) {
  navigator.hid.addEventListener("disconnect", function (event) {
    if (g_device && event.device === g_device) {
      window.location.reload();
    }
  });
}

window.onerror = function (message) {
  showError(String(message));
};
