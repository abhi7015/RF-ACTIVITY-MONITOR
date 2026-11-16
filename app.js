/*
 * RF Activity Monitor - Blynk IoT dashboard
 * Datastream mapping:
 * V0 = RF transitions (integer)
 * V1 = Activity status (0 = no activity, 1 = activity)
 * V2 = Threshold
 * V3 = Active windows (0..3)
 * V4 = RF detector monitor flag (1 = firmware monitoring GPIO12)
 * V5 = GPIO33 commanded output (1 = HIGH, 0 = LOW)
 */

const PIN_MAP = {
  rf: "v0",
  activity: "v1",
  threshold: "v2",
  activeWindows: "v3",
  detector: "v4",
  power: "v5"
};

const POLL_INTERVAL_MS = 2000;
const HISTORY_POINTS = 30;
const DEFAULT_THRESHOLD = 400;

const els = {
  connectionPill: document.getElementById("connectionPill"),
  connectionText: document.getElementById("connectionText"),
  activityText: document.getElementById("activityText"),
  activitySubtext: document.getElementById("activitySubtext"),
  heroIcon: document.getElementById("heroIcon"),
  heroCard: document.querySelector(".hero-card"),
  lastUpdate: document.getElementById("lastUpdate"),
  rfValue: document.getElementById("rfValue"),
  thresholdValue: document.getElementById("thresholdValue"),
  activeWindowsValue: document.getElementById("activeWindowsValue"),
  rfDetectorBadge: document.getElementById("rfDetectorBadge"),
  rfDetectorDescription: document.getElementById("rfDetectorDescription"),
  powerBadge: document.getElementById("powerBadge"),
  powerDescription: document.getElementById("powerDescription"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsForm: document.getElementById("settingsForm"),
  settingsButton: document.getElementById("settingsButton"),
  closeSettings: document.getElementById("closeSettings"),
  disconnectButton: document.getElementById("disconnectButton"),
  blynkHost: document.getElementById("blynkHost"),
  authToken: document.getElementById("authToken"),
  settingsMessage: document.getElementById("settingsMessage"),
  liveTag: document.getElementById("liveTag")
};

let settings = loadSettings();
let pollTimer = null;
let chart = null;
let history = [];

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem("rfMonitorBlynkSettings")) || {
      host: "blynk.cloud",
      token: ""
    };
  } catch {
    return { host: "blynk.cloud", token: "" };
  }
}

function saveSettings() {
  localStorage.setItem("rfMonitorBlynkSettings", JSON.stringify(settings));
}

function cleanHost(host) {
  return host.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function setConnection(state, message) {
  els.connectionPill.classList.toggle("connected", state === "connected");
  els.connectionPill.classList.toggle("error", state === "error");
  els.connectionText.textContent = message;
}

function setBadge(element, state, text) {
  element.classList.remove("state-on", "state-off", "state-neutral");
  element.classList.add(state);
  element.textContent = text;
}

function numericValue(raw, pin) {
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value)) {
    throw new Error(`Blynk returned an invalid value for ${pin.toUpperCase()}.`);
  }
  return value;
}

async function getPinValue(pin) {
  const host = cleanHost(settings.host || "blynk.cloud");
  const url = `https://${host}/external/api/get?token=${encodeURIComponent(settings.token)}&${pin}`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Blynk request failed (${response.status}) for ${pin.toUpperCase()}.`);
  }

  const body = (await response.text()).trim();
  if (!body || body.toLowerCase().includes('"error"')) {
    throw new Error(`No valid value returned for ${pin.toUpperCase()}. Check the token and datastream.`);
  }
  return numericValue(body, pin);
}

async function getDeviceConnectionStatus() {
  const host = cleanHost(settings.host || "blynk.cloud");
  const url = `https://${host}/external/api/isHardwareConnected?token=${encodeURIComponent(settings.token)}`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Blynk device-status request failed (${response.status}).`);
  }

  const body = (await response.text()).trim().toLowerCase();
  if (body === "true") return true;
  if (body === "false") return false;
  throw new Error("Blynk returned an unexpected device connection status.");
}

async function readAllDatastreams() {
  const entries = Object.entries(PIN_MAP);
  const results = await Promise.all(entries.map(async ([key, pin]) => [key, await getPinValue(pin)]));
  return Object.fromEntries(results);
}

function initializeChart() {
  const ctx = document.getElementById("rfChart");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "RF transitions",
          data: [],
          borderColor: "#6ba9ff",
          backgroundColor: "rgba(107,169,255,.12)",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.32
        },
        {
          label: "Threshold",
          data: [],
          borderColor: "#f5c46a",
          borderWidth: 1.5,
          borderDash: [6, 5],
          pointRadius: 0,
          fill: false,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#08111e",
          titleColor: "#edf3fc",
          bodyColor: "#b9c8dc",
          borderColor: "rgba(148,163,184,.2)",
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#71839d", maxTicksLimit: 6, maxRotation: 0 },
          border: { color: "rgba(148,163,184,.12)" }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148,163,184,.10)" },
          ticks: { color: "#71839d", precision: 0 },
          border: { display: false }
        }
      }
    }
  });
}

function updateChart(rf, threshold) {
  const now = new Date();
  const label = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  history.push({ label, rf, threshold });
  if (history.length > HISTORY_POINTS) history.shift();

  chart.data.labels = history.map(point => point.label);
  chart.data.datasets[0].data = history.map(point => point.rf);
  chart.data.datasets[1].data = history.map(point => point.threshold);
  chart.update("none");
}

function updateActivity(active) {
  els.heroCard.classList.toggle("alert", active);
  if (active) {
    els.heroIcon.textContent = "!";
    els.activityText.textContent = "ACTIVITY DETECTED";
    els.activityText.style.color = "var(--red)";
    els.activitySubtext.textContent = "RF readings have crossed the configured activity threshold.";
  } else {
    els.heroIcon.textContent = "✓";
    els.activityText.textContent = "NO ACTIVITY";
    els.activityText.style.color = "var(--green)";
    els.activitySubtext.textContent = "RF signal is at or below the configured threshold.";
  }
}

function clearLiveDashboard(message = "Device is offline. Waiting for it to reconnect to Blynk.") {
  els.rfValue.textContent = "—";
  els.thresholdValue.textContent = "—";
  els.activeWindowsValue.textContent = "—";
  els.lastUpdate.textContent = "—";

  els.heroCard.classList.remove("alert");
  els.heroIcon.textContent = "×";
  els.activityText.textContent = "DEVICE OFFLINE";
  els.activityText.style.color = "var(--red)";
  els.activitySubtext.textContent = message;

  setBadge(els.rfDetectorBadge, "state-neutral", "OFFLINE");
  els.rfDetectorDescription.textContent = "No live detector status is available while the ESP32 is disconnected.";
  setBadge(els.powerBadge, "state-neutral", "OFFLINE");
  els.powerDescription.textContent = "No live output status is available while the ESP32 is disconnected.";

  history = [];
  if (chart) {
    chart.data.labels = [];
    chart.data.datasets.forEach(dataset => dataset.data = []);
    chart.update("none");
  }

  if (els.liveTag) {
    els.liveTag.innerHTML = '<span class="status-dot"></span> OFFLINE';
    els.liveTag.classList.add("offline");
  }
}

function markDashboardLive() {
  if (els.liveTag) {
    els.liveTag.innerHTML = '<span class="status-dot"></span> LIVE';
    els.liveTag.classList.remove("offline");
  }
}

function updateDashboard(data) {
  const rf = Math.max(0, Math.round(data.rf));
  const active = data.activity === 1;
  const threshold = Math.max(0, Math.round(data.threshold));
  const activeWindows = Math.max(0, Math.round(data.activeWindows));

  els.rfValue.textContent = rf.toLocaleString();
  els.thresholdValue.textContent = threshold.toLocaleString();
  els.activeWindowsValue.innerHTML = `${activeWindows}<small> / 3</small>`;

  updateActivity(active);

  if (data.detector === 1) {
    setBadge(els.rfDetectorBadge, "state-on", "MONITORING");
    els.rfDetectorDescription.textContent = "Firmware reports that GPIO 12 is being monitored.";
  } else {
    setBadge(els.rfDetectorBadge, "state-off", "NOT MONITORING");
    els.rfDetectorDescription.textContent = "Firmware reports that GPIO 12 monitoring is inactive.";
  }

  if (data.power === 1) {
    setBadge(els.powerBadge, "state-on", "HIGH · ON");
    els.powerDescription.textContent = "ESP32 reports GPIO 33 output HIGH.";
  } else {
    setBadge(els.powerBadge, "state-off", "LOW · OFF");
    els.powerDescription.textContent = "ESP32 reports GPIO 33 output LOW.";
  }

  els.lastUpdate.textContent = new Date().toLocaleTimeString();
  updateChart(rf, threshold);
}

let pollInProgress = false;

async function pollBlynk() {
  if (!settings.token || pollInProgress) {
    if (!settings.token) {
      setConnection("idle", "Not connected");
      clearLiveDashboard("Add your Blynk device token in settings to begin monitoring.");
    }
    return;
  }

  pollInProgress = true;
  try {
    // Check the actual Blynk hardware connection before reading stored pin values.
    const isOnline = await getDeviceConnectionStatus();

    if (!isOnline) {
      setConnection("error", "Device offline");
      clearLiveDashboard();
      return;
    }

    const data = await readAllDatastreams();
    updateDashboard(data);
    markDashboardLive();
    setConnection("connected", "Device connected");
  } catch (error) {
    console.error(error);
    setConnection("error", "Connection check failed");
    clearLiveDashboard(`Could not verify the device connection: ${error.message}`);
  } finally {
    pollInProgress = false;
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollBlynk();
  pollTimer = setInterval(pollBlynk, POLL_INTERVAL_MS);
}

function openSettings() {
  els.blynkHost.value = settings.host || "blynk.cloud";
  els.authToken.value = settings.token || "";
  els.settingsMessage.textContent = "";
  els.settingsDialog.showModal();
}

els.settingsButton.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", () => els.settingsDialog.close());

els.settingsForm.addEventListener("submit", event => {
  event.preventDefault();
  const host = cleanHost(els.blynkHost.value || "blynk.cloud");
  const token = els.authToken.value.trim();

  if (!host || !token) {
    els.settingsMessage.textContent = "Enter your Blynk server host and device Auth Token.";
    return;
  }

  settings = { host, token };
  saveSettings();
  els.settingsDialog.close();
  history = [];
  startPolling();
});

els.disconnectButton.addEventListener("click", () => {
  settings = { host: cleanHost(els.blynkHost.value || "blynk.cloud"), token: "" };
  saveSettings();
  if (pollTimer) clearInterval(pollTimer);
  setConnection("idle", "Not connected");
  els.settingsDialog.close();
  els.activityText.textContent = "Waiting for data";
  els.activityText.style.color = "";
  els.activitySubtext.textContent = "Connect your Blynk device to view live readings.";
  els.lastUpdate.textContent = "—";
  clearLiveDashboard("Dashboard disconnected. Add a Blynk token to reconnect.");
});

initializeChart();
if (settings.token) startPolling();
else { setConnection("idle", "Not connected"); clearLiveDashboard("Add your Blynk device token in settings to begin monitoring."); }
