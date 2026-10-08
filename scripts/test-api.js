'use strict';

// Talks to the real myQ cloud using the tokens in .myq-tokens.json (gitignored).
//   node scripts/test-api.js            list accounts and devices
//   node scripts/test-api.js watch      print door state changes
//   node scripts/test-api.js open|close send a door command, then watch

const fs = require('fs');
const path = require('path');
const { MyQApi } = require('../lib/MyQApi');

const TOKENS_FILE = path.join(__dirname, '..', '.myq-tokens.json');

const mask = (v) => `${String(v).slice(0, 4)}…`;

async function main() {
  const command = process.argv[2];
  const api = new MyQApi({
    tokens: JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')),
    onTokens: (tokens) => fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens)),
    log: console.log,
  });

  const doors = [];
  for (const account of await api.getAccounts()) {
    console.log(`account ${mask(account.id)}`);
    for (const device of await api.getDevices(account.id)) {
      console.log(`  ${device.device_family} ${mask(device.serial_number)} type=${device.device_type}`
        + ` online=${device.state.online} door_state=${device.state.door_state}`);
      if (device.device_family === 'garagedoor') doors.push(device);
    }
  }

  if (!command || !doors.length) return;
  const door = doors[0];

  if (command === 'open' || command === 'close') {
    await api.doorCommand(door.account_id, door.serial_number, command);
    console.log(`sent ${command}`);
  }

  let last;
  for (let i = 0; i < 45; i++) {
    const { state } = await api.getDevice(door.account_id, door.serial_number);
    if (state.door_state !== last) {
      last = state.door_state;
      console.log(`${new Date().toLocaleTimeString()} door_state=${last}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

main().catch((err) => {
  console.error(`${err.name}: ${err.message}`);
  process.exitCode = 1;
});
