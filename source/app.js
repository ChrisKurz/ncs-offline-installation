(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var DEFAULTS = {
    win:   { usb: "E:\\ncs-offline", root: "C:\\ncs", bundle: "" },
    linux: { usb: "/media/usb/ncs-offline", root: "$HOME/ncs", bundle: "" },
    mac:   { usb: "/Volumes/USB/ncs-offline", root: "$HOME/ncs", bundle: "" }
  };
  var current = "online";

  function cfg() {
    var os = $("os").value;
    var d = DEFAULTS[os];
    return {
      os: os,
      win: os === "win",
      ver: ($("ver").value || "v3.0.0").trim(),
      mode: $("mode").value,
      usb: ($("usb").value || d.usb).trim().replace(/[\\\/]+$/, ""),
      root: ($("root").value || d.root).trim().replace(/[\\\/]+$/, ""),
      bundle: $("bundle").value.trim(),
      nrfutil: $("oNrfutil").checked,
      tool: $("oTool").checked,
      sdk: $("oSdk").checked
    };
  }

  function j(c, base, sub) { return base + (c.win ? "\\" : "/") + sub; }
  function cmt(c, t) { return "# " + t; }

  // ---------- script generators ----------
  function online(c) {
    var L = [], u = c.usb, v = c.ver;
    var tm = c.mode === "sdkm" ? "sdk-manager" : "toolchain-manager";
    L.push(cmt(c, "Run on an ONLINE machine (same OS/arch as the target)."));
    L.push(cmt(c, "Prepares: " + u));
    L.push("");
    if (c.win) L.push('New-Item -ItemType Directory -Force "' + u + '" | Out-Null');
    else L.push('mkdir -p "' + u + '"');
    L.push("");
    if (c.nrfutil) {
      L.push(cmt(c, "1) nrfutil: upgrade twice (needed when coming from old versions)"));
      L.push("nrfutil self-upgrade"); L.push("nrfutil self-upgrade");
      L.push("nrfutil install " + tm);
      L.push("nrfutil upgrade");
      L.push(cmt(c, "Export an offline package index with the installed commands"));
      L.push('nrfutil prepare-offline "' + j(c, u, "nrfutil-offline") + '"');
      L.push(cmt(c, "Copy the nrfutil binary itself to the stick"));
      L.push(c.win ? 'Copy-Item (Get-Command nrfutil).Source "' + u + '"'
                   : 'cp "$(command -v nrfutil)" "' + u + '/"');
      L.push("");
    }
    if (c.tool) {
      L.push(cmt(c, "2) Toolchain for NCS " + v));
      if (c.mode === "sdkm") {
        L.push('nrfutil sdk-manager toolchain install --ncs-version ' + v +
               ' --install-dir "' + j(c, u, "toolchains") + '"');
      } else {
        L.push('nrfutil toolchain-manager install --ncs-version ' + v +
               ' --install-dir "' + j(c, u, "toolchains") + '"');
      }
      L.push("");
    }
    if (c.sdk) {
      var sdkDir = j(c, u, "sdk\\" + v).replace(/\\/g, c.win ? "\\" : "/");
      L.push(cmt(c, "3) SDK source (west workspace) for NCS " + v));
      if (c.mode === "sdkm") {
        L.push('nrfutil sdk-manager sdk install ' + v +
               ' --install-dir "' + j(c, u, "sdk") + '"');
        L.push(cmt(c, "If your version lacks this subcommand, use the west method below."));
      }
      L.push(cmt(c, "west method (works with both flavours):"));
      L.push('nrfutil toolchain-manager launch --ncs-version ' + v +
             ' --install-dir "' + j(c, u, "toolchains") + '" --chdir "' + sdkDir +
             '" -- west init -m https://github.com/nrfconnect/sdk-nrf --mr ' + v);
      L.push('nrfutil toolchain-manager launch --ncs-version ' + v +
             ' --install-dir "' + j(c, u, "toolchains") + '" --chdir "' + sdkDir +
             '" -- west update');
      L.push("");
    }
    L.push(cmt(c, "4) Also put these on the stick manually:"));
    L.push(cmt(c, "   - VS Code installer + the 'nRF Connect for VS Code' .vsix (and its extension pack deps)"));
    L.push(cmt(c, "   - SEGGER J-Link installer (for flashing/debugging)"));
    L.push(cmt(c, "   - Any device drivers your OS needs"));
    return L.join("\n");
  }

  function offline(c) {
    var L = [], u = c.usb, r = c.root, v = c.ver;
    var tm = c.mode === "sdkm" ? "sdk-manager" : "toolchain-manager";
    L.push(cmt(c, "Run on the OFFLINE machine with the USB stick connected."));
    L.push(cmt(c, "IMPORTANT: " + r + " must be the folder that VS Code (nrfutil sdk-manager) uses for"));
    L.push(cmt(c, "all its ncs installations. Any other folder is not detected by the nRF Connect extension."));
    L.push(cmt(c, "If unsure, use the folder where VS Code installs SDKs, or point sdk-manager at your folder:"));
    L.push(cmt(c, '  nrfutil sdk-manager config install-dir set "' + r + '"'));
    L.push("");
    if (c.nrfutil) {
      L.push(cmt(c, "1) Install nrfutil from the stick"));
      if (c.win) {
        L.push('New-Item -ItemType Directory -Force "' + r + '\\bin" | Out-Null');
        L.push('Copy-Item "' + u + '\\nrfutil.exe" "' + r + '\\bin\\"');
        L.push('$env:Path = "' + r + '\\bin;" + $env:Path');
        L.push('# Persist: [Environment]::SetEnvironmentVariable("Path", "' + r + '\\bin;" + [Environment]::GetEnvironmentVariable("Path","User"), "User")');
      } else {
        L.push('mkdir -p "' + r + '/bin"');
        L.push('cp "' + u + '/nrfutil" "' + r + '/bin/" && chmod +x "' + r + '/bin/nrfutil"');
        L.push('export PATH="' + r + '/bin:$PATH"');
      }
      L.push('nrfutil self-upgrade --from-offline "' + j(c, u, "nrfutil-offline") + '"');
      L.push('nrfutil install ' + tm + ' --from-offline "' + j(c, u, "nrfutil-offline") + '"');
      L.push("");
    }
    if (c.tool) {
      L.push(cmt(c, "2) Toolchain"));
      if (c.bundle) {
        L.push('nrfutil ' + tm + (c.mode === "sdkm" ? " toolchain" : "") +
               ' install --toolchain-bundle "' + c.bundle + '" --install-dir "' + j(c, r, "toolchains") + '"');
      } else {
        L.push(cmt(c, "Option A: copy the toolchains prepared on the online machine"));
        L.push(c.win ? 'Copy-Item -Recurse -Force "' + u + '\\toolchains" "' + r + '\\"'
                     : 'cp -R "' + u + '/toolchains" "' + r + '/"');
        L.push(cmt(c, "Option B: install from a downloaded bundle instead:"));
        L.push(cmt(c, '  nrfutil ' + tm + (c.mode === "sdkm" ? " toolchain" : "") +
               ' install --toolchain-bundle <bundle-file> --install-dir "' + j(c, r, "toolchains") + '"'));
      }
      L.push("");
    }
    if (c.sdk) {
      L.push(cmt(c, "3) SDK source"));
      L.push(c.win ? 'New-Item -ItemType Directory -Force "' + r + '" | Out-Null' : 'mkdir -p "' + r + '"');
      L.push(c.win ? 'Copy-Item -Recurse -Force "' + u + '\\sdk\\*" "' + r + '\\"'
                   : 'cp -R "' + u + '/sdk/." "' + r + '/"');
      L.push("");
    }
    if (c.sdk) {
      L.push(cmt(c, "4) Register the SDK with CMake (needed for nRF Connect for VS Code to find it)"));
      L.push(cmt(c, "   SDKs copied from a tarball/USB stick or installed via 'sdk install' are not registered yet."));
      L.push('nrfutil sdk-manager sdk register ' + v);
      L.push(cmt(c, "   Check syntax with: nrfutil sdk-manager sdk register --help"));
      L.push(cmt(c, "   Fallback if the command is unavailable or fails: export the CMake package manually"));
      L.push('nrfutil toolchain-manager launch --ncs-version ' + v +
             ' --install-dir "' + j(c, r, "toolchains") + '" --chdir "' + j(c, r, v) +
             '" -- west zephyr-export');
      L.push("");
    }
    L.push(cmt(c, "NOTE: nRF Connect for VS Code lists the SDK under the version defined in the file"));
    L.push(cmt(c, "   nrf/VERSION inside the SDK - not the folder name or the version entered above."));
    L.push(cmt(c, "   Check with: " + (c.win ? "type " : "cat ") + j(c, r, v) + (c.win ? "\\nrf\\VERSION" : "/nrf/VERSION")));
    L.push(cmt(c, "5) VS Code: install the .vsix files from the stick"));
    L.push('code --install-extension "<path-to>.vsix"');
    L.push(cmt(c, "   Reload VS Code, then in nRF Connect for VS Code:"));
    L.push(cmt(c, "   - Manage toolchains: select the toolchain under " + j(c, r, "toolchains")));
    L.push(cmt(c, "   - Manage SDKs: the registered SDK " + v + " should now be listed"));
    L.push(cmt(c, "6) Install the J-Link package from the stick."));
    return L.join("\n");
  }

  function verify(c) {
    var L = [], r = c.root, v = c.ver;
    var tm = "toolchain-manager";
    L.push(cmt(c, "Run on the offline machine after installing (disconnect network to be sure)."));
    L.push("nrfutil --version");
    L.push("nrfutil list");
    L.push('nrfutil ' + tm + ' list --install-dir "' + j(c, r, "toolchains") + '"');
    L.push('nrfutil ' + tm + ' launch --ncs-version ' + v +
           ' --install-dir "' + j(c, r, "toolchains") + '" -- west --version');
    L.push('nrfutil ' + tm + ' launch --ncs-version ' + v +
           ' --install-dir "' + j(c, r, "toolchains") + '" --chdir "' + j(c, r, v) +
           '" -- west build -b nrf52840dk/nrf52840 nrf/samples/bluetooth/peripheral_uart -d build_test');
    L.push("");
    L.push(cmt(c, "A successful offline build confirms toolchain + SDK are consistent."));
    L.push(cmt(c, "If west tries to fetch from GitHub, the workspace was not fully populated (re-run 'west update' online)."));
    return L.join("\n");
  }

  var CHECK = [
    "Online and offline machines use the same OS and CPU architecture",
    "nrfutil upgraded twice on the online machine before prepare-offline",
    "Toolchain for the chosen NCS version copied to the stick",
    "SDK source fully fetched (west update finished without errors)",
    "VS Code installer and nRF Connect .vsix files copied",
    "SEGGER J-Link installer copied",
    "Install path is short and has no spaces",
    "Install folder is the one VS Code / sdk-manager uses for all ncs installations",
    "SDK is listed in VS Code under the version from nrf/VERSION (may differ from the folder name)",
    "nrfutil installed from the stick on the offline machine",
    "Toolchain registered/listed by nrfutil on the offline machine",
    "SDK registered with CMake (nrfutil sdk-manager sdk register, or west zephyr-export)",
    "VS Code reloaded; SDK and toolchain appear in Manage SDKs / Manage toolchains",
    "Sample project builds with the network disconnected"
  ];

  // ---------- UI ----------
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function renderChecklist() {
    var ul = $("checklist"), saved = {};
    try { saved = JSON.parse(load("ncs-check") || "{}"); } catch (e) {}
    ul.innerHTML = "";
    CHECK.forEach(function (t, i) {
      var li = document.createElement("li"), lb = document.createElement("label");
      var cb = document.createElement("input"), sp = document.createElement("span");
      cb.type = "checkbox"; cb.checked = !!saved[i]; sp.textContent = t;
      cb.addEventListener("change", function () {
        saved[i] = cb.checked; store("ncs-check", JSON.stringify(saved));
      });
      lb.appendChild(cb); lb.appendChild(sp); li.appendChild(lb); ul.appendChild(li);
    });
  }

  function render() {
    var c = cfg(), isCheck = current === "check";
    $("out").hidden = isCheck; $("checklist").hidden = !isCheck;
    $("toolbar").hidden = isCheck;
    if (isCheck) { renderChecklist(); return; }
    $("out").textContent = current === "online" ? online(c)
                         : current === "offline" ? offline(c) : verify(c);
  }

  function setDefaults() {
    var d = DEFAULTS[$("os").value];
    $("usb").placeholder = d.usb; $("root").placeholder = d.root;
  }

  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active"); current = b.dataset.tab; render();
    });
  });
  ["os", "ver", "mode", "usb", "root", "bundle", "oNrfutil", "oTool", "oSdk"].forEach(function (id) {
    $(id).addEventListener("input", function () { if (id === "os") setDefaults(); render(); });
    $(id).addEventListener("change", render);
  });

  $("copy").addEventListener("click", function () {
    var t = $("out").textContent;
    function done(ok) { $("msg").textContent = ok ? "Copied" : "Copy failed – select the text manually";
      setTimeout(function () { $("msg").textContent = ""; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
    } else {
      var r = document.createRange(); r.selectNodeContents($("out"));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      try { done(document.execCommand("copy")); } catch (e) { done(false); }
    }
  });

  $("dl").addEventListener("click", function () {
    var c = cfg(), ext = c.win ? "ps1" : "sh";
    var name = "ncs-" + current + "." + ext;
    var text = (c.win ? "" : "#!/usr/bin/env bash\nset -e\n") + $("out").textContent + "\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  });

  setDefaults(); render();
})();
