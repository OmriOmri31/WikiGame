import { seed } from './emulator.mjs';
import { DAILY } from './wiki-mock.mjs';

export default async function globalSetup() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Run the e2e tests through "npm test" (it starts the Firebase emulators).');
  }
  await seed(DAILY);
}
