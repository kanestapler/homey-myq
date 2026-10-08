'use strict';

const Homey = require('homey');

class GarageDoorDriver extends Homey.Driver {

  async onInit() {
    this.triggers = {
      opening: this.homey.flow.getDeviceTriggerCard('door_opening'),
      closing: this.homey.flow.getDeviceTriggerCard('door_closing'),
    };

    this.homey.flow.getConditionCard('door_state_is')
      .registerRunListener(async ({ device, state }) => device.getCapabilityValue('myq_door_state') === state);
  }

  async onPair(session) {
    this.registerTokenHandlers(session);

    session.setHandler('list_devices', async () => {
      const { api } = this.homey.app;
      const devices = [];
      for (const account of await api.getAccounts()) {
        for (const item of await api.getDevices(account.id)) {
          if (item.device_family !== 'garagedoor') continue;
          devices.push({
            name: item.name,
            data: { id: item.serial_number },
            store: { accountId: item.account_id },
          });
        }
      }
      return devices;
    });
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

}

module.exports = GarageDoorDriver;
