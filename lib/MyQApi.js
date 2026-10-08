'use strict';

// The myQ cloud has no public API. These values mirror what the official iOS app sends.
const CLIENT_ID = 'IOS_CGI_MYQ';
const APP_VERSION = '5.320.0.68974';
const USER_AGENT = 'myQ/320.0.68974 CFNetwork/3896.100.1.2.1 Darwin/27.0.0';

const TOKEN_URL = 'https://partner-identity.myq-cloud.com/connect/token';
const ACCOUNTS_URL = 'https://accounts.myq-cloud.com/api/v6.0/accounts';
const DEVICES_URL = 'https://devices.myq-cloud.com/api/v6.2/Accounts';
const GDO_URL = 'https://account-devices-gdo.myq-cloud.com/api/v6.0/Accounts';

const REQUEST_TIMEOUT = 15 * 1000;
// Refresh this long before the access token actually expires.
const EXPIRY_MARGIN = 5 * 60 * 1000;

class MyQError extends Error {

  constructor(message, { status, body } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.body = body;
  }

}

// The refresh token was rejected. The user has to supply a new one.
class MyQAuthError extends MyQError {}

class MyQApi {

  /**
   * @param {object} opts
   * @param {object} [opts.tokens] `{ refreshToken, accessToken, expiresAt }`
   * @param {Function} [opts.onTokens] called with the new tokens after every refresh. myQ refresh
   *   tokens are single use, so the rotated token must be persisted or the session is lost.
   * @param {Function} [opts.log]
   */
  constructor({ tokens, onTokens, log } = {}) {
    this.tokens = { ...tokens };
    this.onTokens = onTokens || (() => {});
    this.log = log || (() => {});
    this._refreshing = null;
  }

  hasToken() {
    return Boolean(this.tokens.refreshToken);
  }

  setRefreshToken(refreshToken) {
    this.tokens = { refreshToken };
  }

  async _fetch(url, options) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    } catch (err) {
      throw new MyQError(`Could not reach myQ: ${err.cause?.code || err.message}`);
    }
  }

  async refresh() {
    // Concurrent callers must share one refresh, a second use of the same token would fail.
    if (!this._refreshing) {
      this._refreshing = this._refresh().finally(() => {
        this._refreshing = null;
      });
    }
    return this._refreshing;
  }

  async _refresh() {
    if (!this.tokens.refreshToken) throw new MyQAuthError('No myQ refresh token configured');

    const res = await this._fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: '*/*',
        'App-Version': APP_VERSION,
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        refresh_token: this.tokens.refreshToken,
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
      }),
    });
    const text = await res.text();

    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        throw new MyQAuthError(`myQ rejected the refresh token (${text.slice(0, 100) || res.status})`, { status: res.status, body: text });
      }
      throw new MyQError(`myQ token refresh failed (HTTP ${res.status})`, { status: res.status, body: text });
    }

    const json = JSON.parse(text);
    this.tokens = {
      refreshToken: json.refresh_token || this.tokens.refreshToken,
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in * 1000),
    };
    await this.onTokens({ ...this.tokens });
    this.log('myQ access token refreshed');
  }

  async request(method, url) {
    if (!this.tokens.accessToken || Date.now() > (this.tokens.expiresAt || 0) - EXPIRY_MARGIN) {
      await this.refresh();
    }

    let res = await this._request(method, url);
    if (res.status === 401) {
      await this.refresh();
      res = await this._request(method, url);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new MyQError(`myQ request failed (HTTP ${res.status})`, { status: res.status, body: text });
    }
    return text ? JSON.parse(text) : null;
  }

  _request(method, url) {
    return this._fetch(url, {
      method,
      headers: {
        Accept: '*/*',
        Authorization: `Bearer ${this.tokens.accessToken}`,
        'App-Version': APP_VERSION,
        'User-Agent': USER_AGENT,
      },
    });
  }

  async getAccounts() {
    const { accounts } = await this.request('GET', ACCOUNTS_URL);
    return accounts || [];
  }

  async getDevices(accountId) {
    const { items } = await this.request('GET', `${DEVICES_URL}/${accountId}/Devices`);
    return items || [];
  }

  async getDevice(accountId, serialNumber) {
    return this.request('GET', `${DEVICES_URL}/${accountId}/Devices/${serialNumber}`);
  }

  /**
   * @param {string} accountId
   * @param {string} serialNumber
   * @param {'open'|'close'} command
   */
  async doorCommand(accountId, serialNumber, command) {
    await this.request('PUT', `${GDO_URL}/${accountId}/door_openers/${serialNumber}/${command}`);
  }

}

module.exports = { MyQApi, MyQError, MyQAuthError };
