'use strict';

const MyQDriver = require('../../lib/MyQDriver');

class CameraDriver extends MyQDriver {

  async onInit() {
    this.triggers = {
      motion: this.homey.flow.getDeviceTriggerCard('camera_motion'),
      person: this.homey.flow.getDeviceTriggerCard('camera_person'),
      vehicle: this.homey.flow.getDeviceTriggerCard('camera_vehicle'),
    };
  }

  async onPairListDevices() {
    const cameras = await this.getMyQDevices('camera');
    if (!cameras.length) return [];

    // Snapshots and recordings are addressed by the camera's Tend id.
    const tendIds = new Map((await this.homey.app.api.getCameras())
      .map((camera) => [camera.serialNumber, String(camera.id)]));

    return cameras
      .filter((item) => tendIds.has(item.serial_number))
      .map((item) => ({
        name: item.name,
        data: { id: item.serial_number },
        store: { accountId: item.account_id, cameraId: tendIds.get(item.serial_number) },
      }));
  }

}

module.exports = CameraDriver;
