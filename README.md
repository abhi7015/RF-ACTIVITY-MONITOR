# RF Activity Monitor Dashboard

A responsive GitHub Pages dashboard for an ESP32-based 433 MHz RF activity monitor, using Blynk IoT as the data source.

## Dashboard features

- Live activity status
- RF transition count
- Configured RF threshold
- Consecutive active-window count
- RF signal history chart (browser-side rolling history)
- RF detector monitoring status
- GPIO 33 output status
- Mobile-friendly layout
- Two-second automatic refresh
- Checks Blynk hardware connection status before reading datastreams; clears stale readings and marks the dashboard offline when Blynk reports the device offline

## Blynk datastream setup

Create these **Integer** datastreams in your Blynk device template:

| Virtual pin | Name | Meaning | Suggested range |
|---|---|---|---|
| V0 | RF Readings | Transitions counted in one 250 ms window | 0–10000 |
| V1 | Activity Status | `0` = no activity, `1` = activity detected | 0–1 |
| V2 | RF Threshold | Current activity threshold | 0–10000 |
| V3 | Active Windows | Consecutive high-activity windows | 0–3 |
| V4 | RF Detector Status | `1` = firmware is monitoring GPIO 12, `0` = not monitoring | 0–1 |
| V5 | Power Output Status | `1` = GPIO 33 commanded HIGH, `0` = LOW | 0–1 |

Before reading datastreams, the dashboard checks the device connection using Blynk's `GET https://{server}/external/api/isHardwareConnected?token={token}` endpoint. If Blynk returns `false`, the dashboard marks the device offline and clears stale values. It then reads each datastream through Blynk's Device HTTPS API:
`GET https://{server}/external/api/get?token={token}&v0`

See the official Blynk documentation:
- [Get Datastream Value](https://docs.blynk.io/en/blynk.cloud/device-https-api/get-datastream-value)
- [Get Multiple Datastream Values](https://docs.blynk.io/en/blynk.cloud/device-https-api/get-multiple-datastream-values)
- [Is Device Connected](https://docs.blynk.io/en/blynk.cloud/device-https-api/is-device-connected)

## Configure your dashboard

1. Publish this repository to GitHub.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select your `main` branch and `/ (root)` folder, then save.
5. Open the published GitHub Pages URL.
6. Click **Blynk settings**.
7. Enter your Blynk server host (usually `blynk.cloud`) and your device Auth Token.
8. Save and connect. The dashboard checks device connection status every two seconds.

## Important security warning

This is a static browser-only dashboard. The Blynk Auth Token is entered by the user and stored in that browser's local storage; it is not committed in this repository. However, a token used in browser requests can be inspected by anyone who can access that browser session or the public dashboard session. Do not publish a shared public dashboard with a privileged device token.

For a public/shared deployment, put the Blynk API calls behind a server-side proxy or serverless function and keep the Auth Token in a server-side secret/environment variable. Do not put the token in `app.js`, `index.html`, or a public configuration file.

## Important hardware-status notes

- **RF Detector / GPIO 12:** V4 is a firmware-reported monitoring flag. It indicates that the ESP32 code is monitoring the input; it does not prove the RF receiver module is electrically healthy or receiving a signal.
- **Power Output / GPIO 33:** V5 reports the output state commanded by firmware. It does not measure the physical voltage on GPIO 33. Add a feedback circuit if actual electrical verification is required.

## CORS / connection troubleshooting

The browser calls Blynk's HTTPS API directly, including the device connection-status endpoint. If the browser reports a CORS/network error, the static site cannot bypass that restriction; use a server-side proxy as described above. Note that Blynk may take time to detect an unexpected power loss because it relies on its device heartbeat; the dashboard can only reflect the offline state after Blynk reports it.

Also verify:
- The device is online in Blynk.
- The Auth Token belongs to the correct device.
- All six datastreams exist and use the exact virtual pins V0–V5.
- The datastream values are being updated by the ESP32.

## Project files

- `index.html` — dashboard structure
- `style.css` — responsive dark dashboard styling
- `app.js` — Blynk API polling, live updates, and chart
