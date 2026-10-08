'use strict';

const Homey = require('homey');

const DOOR_STATES = ['open', 'closed', 'opening', 'closing', 'stopped'];
// How long a door gets to reach the commanded position before we trust the cloud state again.
const COMMAND_TIMEOUT = 60 * 1000;

class GarageDoorDevice extends Homey.Device {

  async onInit() {
    this.registerCapabilityListener('garagedoor_closed', this.onCapabilityClosed.bind(this));
    this.homey.app.registerDevice(this);
  }

  async onUninit() {
    this.homey.app.unregisterDevice(this);
  }

  async onDeleted() {
    this.homey.app.unregisterDevice(this);
  }

  async onCapabilityClosed(closed) {
    const command = closed ? 'close' : 'open';
    if (this.myqState && this.myqState[`is_unattended_${command}_allowed`] === false) {
      throw new Error(this.homey.__(`errors.unattended_${command}_not_allowed`));
    }

    await this.homey.app.api.doorCommand(this.getStoreValue('accountId'), this.getData().id, command);

    // myQ keeps reporting the old position for a few seconds (a close is preceded by a warning
    // beep), so don't let those polls flip the capability back.
    this.pending = { closed, until: Date.now() + COMMAND_TIMEOUT };
    this.homey.app.pollFast();
  }

  isMoving() {
    return Boolean(this.pending) || ['opening', 'closing'].includes(this.myqState?.door_state);
  }

  /**
   * @param {object} [item] this door as returned by the myQ devices endpoint
   */
  async onMyQDevice(item) {
    if (!item) {
      await this.setUnavailable(this.homey.__('errors.not_found'));
      return;
    }

    const { state } = item;
    this.myqState = state;

    if (!state.online) {
      await this.setUnavailable(this.homey.__('errors.offline'));
      return;
    }
    await this.setAvailable();

    const doorState = DOOR_STATES.includes(state.door_state) ? state.door_state : 'unknown';
    const previous = this.getCapabilityValue('myq_door_state');
    if (doorState !== previous) {
      this.log(`Door is ${doorState}`);
      await this.setCapabilityValue('myq_door_state', doorState);

      // A poll can miss the short opening/closing phase, so a jump between the end positions
      // counts as well.
      const { triggers } = this.driver;
      if (doorState === 'opening' || (doorState === 'open' && previous === 'closed')) {
        triggers.opening.trigger(this).catch(this.error);
      } else if (doorState === 'closing' || (doorState === 'closed' && previous === 'open')) {
        triggers.closing.trigger(this).catch(this.error);
      }
    }
    if (doorState === 'unknown') return;

    const closed = doorState === 'closed';
    if (this.pending) {
      if (closed !== this.pending.closed && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (closed !== this.getCapabilityValue('garagedoor_closed')) {
      await this.setCapabilityValue('garagedoor_closed', closed);
    }
  }

}

module.exports = GarageDoorDevice;
