'use strict';

const MyQDriver = require('../../lib/MyQDriver');

class GarageDoorDriver extends MyQDriver {

  async onInit() {
    this.triggers = {
      opening: this.homey.flow.getDeviceTriggerCard('door_opening'),
      closing: this.homey.flow.getDeviceTriggerCard('door_closing'),
    };

    this.homey.flow.getConditionCard('door_state_is')
      .registerRunListener(async ({ device, state }) => device.getCapabilityValue('myq_door_state') === state);
  }

  async onPairListDevices() {
    const doors = await this.getMyQDevices('garagedoor');
    return doors.map((item) => ({
      name: item.name,
      data: { id: item.serial_number },
      store: { accountId: item.account_id },
    }));
  }

}

module.exports = GarageDoorDriver;
