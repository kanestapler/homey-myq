'use strict';

const Homey = require('homey');

// How long motion stays on after the last new recording.
const MOTION_RESET = 30 * 1000;
// Recordings remembered so they never trigger twice.
const MAX_SEEN_EVENTS = 200;

class CameraDevice extends Homey.Device {

  async onInit() {
    // Recording id → which triggers have fired for it. Filled without triggering on the first
    // poll, so recordings made before Homey started are not reported as new.
    this.seen = null;
    this.lastEventId = null;

    const { api } = this.homey.app;

    this.snapshot = await this.homey.images.createImage();
    this.snapshot.setStream(async (stream) => {
      stream.end(await api.getCameraSnapshot(this.getStoreValue('cameraId')));
    });
    await this.setCameraImage('snapshot', this.homey.__('camera.snapshot'), this.snapshot);

    this.eventImage = await this.homey.images.createImage();
    this.eventImage.setStream(async (stream) => {
      if (!this.lastEventId) throw new Error(this.homey.__('camera.no_recording'));
      stream.end(await api.getCameraEventThumbnail(this.lastEventId));
    });
    await this.setCameraImage('event', this.homey.__('camera.last_recording'), this.eventImage);

    this.homey.app.registerDevice(this);
  }

  async onUninit() {
    this.cleanup();
  }

  async onDeleted() {
    this.cleanup();
  }

  cleanup() {
    this.homey.app.unregisterDevice(this);
    this.homey.clearTimeout(this.motionTimer);
    this.snapshot?.unregister().catch(this.error);
    this.eventImage?.unregister().catch(this.error);
  }

  isMoving() {
    return false;
  }

  /**
   * @param {object} [item] this camera as returned by the myQ devices endpoint
   */
  async onMyQDevice(item) {
    if (!item) {
      await this.setUnavailable(this.homey.__('errors.not_found'));
    } else if (!item.state.online) {
      await this.setUnavailable(this.homey.__('errors.camera_offline'));
    } else {
      await this.setAvailable();
    }
  }

  /**
   * @param {object[]} events recent recordings of this camera, newest first
   */
  async onCameraEvents(events) {
    if (!this.seen) {
      this.seen = new Map(events.map((event) => [event.id, { motion: true, person: true, vehicle: true }]));
      if (events.length) this.lastEventId = events[0].id;
      return;
    }

    const { triggers } = this.driver;
    for (const event of [...events].reverse()) {
      let fired = this.seen.get(event.id);
      if (!fired) {
        fired = { motion: false, person: false, vehicle: false };
        this.seen.set(event.id, fired);
      }

      // Detections are added to a recording while it is being analysed, so a person or vehicle
      // can show up on a later poll than the recording itself.
      const tags = event.tags || {};
      const people = Number(tags.peopleCount) || 0;
      const vehicles = Number(tags.movingVehicleCount) || 0;
      const tokens = { people, vehicles, image: this.eventImage };

      if (!fired.motion) {
        fired.motion = true;
        this.lastEventId = event.id;
        await this.eventImage.update();
        this.log('New recording');
        this.setMotion();
        triggers.motion.trigger(this, tokens).catch(this.error);
      }
      if (!fired.person && people > 0) {
        fired.person = true;
        this.log('Person detected');
        triggers.person.trigger(this, tokens).catch(this.error);
      }
      if (!fired.vehicle && vehicles > 0) {
        fired.vehicle = true;
        this.log('Vehicle detected');
        triggers.vehicle.trigger(this, tokens).catch(this.error);
      }
    }

    while (this.seen.size > MAX_SEEN_EVENTS) {
      this.seen.delete(this.seen.keys().next().value);
    }
  }

  setMotion() {
    this.setCapabilityValue('alarm_motion', true).catch(this.error);
    this.homey.clearTimeout(this.motionTimer);
    this.motionTimer = this.homey.setTimeout(() => {
      this.setCapabilityValue('alarm_motion', false).catch(this.error);
    }, MOTION_RESET);
  }

}

module.exports = CameraDevice;
