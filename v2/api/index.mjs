import {createHostedHandler} from '../packages/backend/src/hosted.mjs';

// Accounts are opt-in and require an initialized persistent database. A failed
// account initialization never falls back to synthetic users or temporary data.
export default createHostedHandler();
