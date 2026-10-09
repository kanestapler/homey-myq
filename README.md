# myQ for Homey

A [Homey](https://homey.app) app for myQ garage door openers (Chamberlain, LiftMaster, Craftsman)
and myQ cameras.

**Garage doors**

- See whether the door is open, closed, opening or closing
- Open and close the door from Homey and from Flows
- State comes from the myQ cloud, so the wall button, remotes and the myQ app are all reflected

**Cameras**

- A live snapshot and the thumbnail of the last recording, both usable in Flows
- Motion alarm, plus Flow triggers for new recordings, people and vehicles

Live video is not supported. myQ streams it over a proprietary, encrypted protocol rather than a
standard one such as RTSP or HLS, so Homey cannot play it.

This app is not made or endorsed by Chamberlain Group. It talks to the same cloud service as the
official myQ app, which has no public API and can change or block third-party access at any time.

## Requirements

- Homey Pro (the app does not run on Homey Cloud)
- A myQ account with a garage door opener or camera
- A myQ refresh token, see below

## Getting a refresh token

myQ protects its sign-in so that only the official app can complete it. Instead of signing in,
this app takes over a session created by the official iOS app. You capture that session's refresh
token once with [mitmproxy](https://mitmproxy.org):

1. Install mitmproxy on a computer and start `mitmweb`.
2. On an iPhone or iPad on the same network, set the Wi-Fi HTTP proxy to the computer's IP
   address, port 8080.
3. Open `http://mitm.it` on the phone and install the mitmproxy certificate. Then enable it under
   Settings → General → About → Certificate Trust Settings.
4. In the myQ app, sign out and sign in again.
5. In mitmweb, find the last `POST https://partner-identity.myq-cloud.com/connect/token` request
   and copy `refresh_token` from its response.
6. Remove the proxy and the certificate from the phone.
7. In Homey, add a myQ device and paste the token. Devices you add later reuse it.

Refresh tokens are single use. As soon as Homey has used the token, the session on the phone stops
working and the myQ app will ask you to sign in again. That is expected: signing in gives the
phone a new session of its own. Do not paste the token anywhere else, and do not use "sign out" in
the myQ app between capturing the token and pasting it into Homey, because signing out revokes it.

If myQ ever rejects Homey's session, the device shows as unavailable. Capture a new token and use
Repair on the device to enter it.

## How it works

Homey checks myQ every 15 seconds, and every 2 seconds for a minute after a door command or while
a door is moving. Camera recordings are checked every 15 seconds, so a motion trigger fires
roughly 15 to 30 seconds after the camera starts recording. Person and vehicle triggers fire once
myQ has finished analysing the recording, which can take a little longer.

The token never leaves your Homey. It is only sent to myQ's own servers.

## Development

```sh
npm install -g homey
homey app run --remote   # run on your Homey Pro with live logs
homey app validate --level publish
```

`scripts/test-api.js` exercises the myQ client outside Homey. Put `{"refreshToken":"…"}` in
`.myq-tokens.json` (gitignored) and run `node scripts/test-api.js`, optionally with `watch`, `open`,
`close` or `camera`. The script rotates the token like Homey does, so use a token Homey is not
using.

## License

MIT
