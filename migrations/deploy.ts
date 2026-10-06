// Migration script placeholder — nothing to deploy-time initialize yet
// beyond what the test suite handles directly. Fill in once there's a
// standing devnet market we want migrations to bootstrap idempotently.
const anchor = require("@coral-xyz/anchor");

module.exports = async function (provider: typeof anchor.AnchorProvider) {
  anchor.setProvider(provider);
};
