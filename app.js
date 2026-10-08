'use strict';

const Homey = require('homey');
const { MyQApi, MyQAuthError } = require('./lib/MyQApi');

const POLL_INTERVAL = 15 * 1000;
// Used while a door is moving or a command was just sent, same rate as the official app.
const FAST_POLL_INTERVAL = 2 * 1000;
const FAST_POLL_DURATION = 60 * 1000;
const MAX_BACKOFF = 5 * 60 * 1000;
const FAILURES_BEFORE_UNAVAILABLE = 3;

class MyQApp extends Homey.App {

  async onInit() {
    this.devices = new Set();
    this.failures = 0;
    this.fastUntil = 0;
    this.authFailed = false;

    this.api = new MyQApi({
      tokens: this.homey.settings.get('tokens') || {},
      onTokens: (tokens) => this.homey.settings.set('tokens', tokens),
      log: this.log.bind(this),
    });
  }

  isAuthenticated() {
    return this.api.hasToken() && !this.authFailed;
  }

  /**
   * Replaces the stored refresh token, after checking that myQ accepts it.
   */
  async setRefreshToken(refreshToken) {
    const previous = this.api.tokens;
    this.api.setRefreshToken(refreshToken);
    try {
      await this.api.getAccounts();
    } catch (err) {
      this.api.tokens = previous;
      throw err;
    }
    this.authFailed = false;
    this.failures = 0;
    this.schedulePoll(0);
  }

  registerDevice(device) {
    this.devices.add(device);
    this.schedulePoll(0);
  }

  unregisterDevice(device) {
    this.devices.delete(device);
  }

  pollFast() {
    this.fastUntil = Date.now() + FAST_POLL_DURATION;
    this.schedulePoll(FAST_POLL_INTERVAL);
  }

  schedulePoll(delay) {
    this.homey.clearTimeout(this.pollTimer);
    this.pollTimer = this.homey.setTimeout(() => this.poll(), delay);
  }

  async poll() {
    // Polling resumes when a device is added or a new token is entered.
    if (this.polling || !this.devices.size || !this.isAuthenticated()) return;
    this.polling = true;

    let delay = POLL_INTERVAL;
    try {
      const accountIds = new Set([...this.devices].map((device) => device.getStoreValue('accountId')));
      for (const accountId of accountIds) {
        const items = await this.api.getDevices(accountId);
        const bySerial = new Map(items.map((item) => [item.serial_number, item]));
        for (const device of this.devices) {
          if (device.getStoreValue('accountId') !== accountId) continue;
          await device.onMyQDevice(bySerial.get(device.getData().id));
          if (device.isMoving()) this.fastUntil = Date.now() + FAST_POLL_DURATION;
        }
      }
      this.failures = 0;
      if (Date.now() < this.fastUntil) delay = FAST_POLL_INTERVAL;
    } catch (err) {
      this.error('Polling myQ failed:', err.message);
      this.failures++;
      if (err instanceof MyQAuthError) {
        this.authFailed = true;
        this.setDevicesUnavailable(this.homey.__('errors.token_rejected'));
      } else if (this.failures >= FAILURES_BEFORE_UNAVAILABLE) {
        this.setDevicesUnavailable(err.message);
      }
      delay = Math.min(POLL_INTERVAL * (2 ** (this.failures - 1)), MAX_BACKOFF);
    } finally {
      this.polling = false;
    }

    this.schedulePoll(delay);
  }

  setDevicesUnavailable(message) {
    for (const device of this.devices) {
      device.setUnavailable(message).catch(this.error);
    }
  }

}

module.exports = MyQApp;
