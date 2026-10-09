'use strict';

const Homey = require('homey');

/**
 * Pairing and repair shared by all myQ drivers. All devices use the one myQ session held by the
 * app, entered on the token view.
 */
class MyQDriver extends Homey.Driver {

  async onPair(session) {
    this.registerTokenHandlers(session);
    session.setHandler('list_devices', async () => this.onPairListDevices());
  }

  async onRepair(session) {
    this.registerTokenHandlers(session);
  }

  registerTokenHandlers(session) {
    session.setHandler('has_token', async () => this.homey.app.isAuthenticated());
    session.setHandler('set_token', async (token) => {
      await this.homey.app.setRefreshToken(String(token).trim());
    });
  }

  /**
   * @param {string} family myQ `device_family` to list
   * @returns {Promise<object[]>} the matching myQ devices across all accounts
   */
  async getMyQDevices(family) {
    const { api } = this.homey.app;
    const devices = [];
    for (const account of await api.getAccounts()) {
      for (const item of await api.getDevices(account.id)) {
        if (item.device_family === family) devices.push(item);
      }
    }
    return devices;
  }

  async onPairListDevices() {
    return [];
  }

}

module.exports = MyQDriver;
