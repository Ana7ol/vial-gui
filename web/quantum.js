(function () {
  "use strict";

  var search = document.getElementById("keycode_search");
  var resultCount = document.getElementById("result_count");
  var sections = document.getElementById("keycode_sections");
  var entries = window.QUANTUM_KEYCODES || [];

  function escapeHtml(value) {
    var node = document.createElement("span");
    node.textContent = value;
    return node.innerHTML;
  }

  function searchableText(entry) {
    return [entry.qmk_id, entry.label, entry.description]
      .concat(entry.aliases || [])
      .join(" ")
      .toLowerCase();
  }

  function entryHtml(entry) {
    var details = [];
    if (entry.aliases && entry.aliases.length) {
      details.push("Aliases: " + entry.aliases.join(", "));
    }
    if (entry.requires_feature) {
      details.push("Requires firmware feature: " + entry.requires_feature);
    }
    return (
      '<article class="keycode-row">' +
        '<div class="keycode-id"><code>' + escapeHtml(entry.qmk_id) + "</code></div>" +
        '<div class="keycode-copy"><h3>' + escapeHtml(entry.label) + "</h3>" +
          "<p>" + escapeHtml(entry.description) + "</p>" +
          (details.length ? "<small>" + escapeHtml(details.join(" | ")) + "</small>" : "") +
        "</div>" +
      "</article>"
    );
  }

  function render() {
    var query = search.value.trim().toLowerCase();
    var matches = entries.filter(function (entry) {
      return !query || searchableText(entry).indexOf(query) !== -1;
    });
    var groups = [];
    matches.forEach(function (entry) {
      if (groups.indexOf(entry.group) === -1) {
        groups.push(entry.group);
      }
    });

    sections.innerHTML = groups.map(function (group) {
      var rows = matches.filter(function (entry) { return entry.group === group; });
      return '<section class="keycode-group"><h2>' + escapeHtml(group) + "</h2>" +
        rows.map(entryHtml).join("") + "</section>";
    }).join("");
    resultCount.textContent = matches.length + (matches.length === 1 ? " keycode" : " keycodes");
  }

  search.addEventListener("input", render);
  render();
}());
