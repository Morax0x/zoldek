const pvpState = require('./pvp-state.js');
const pvpUtils = require('./pvp-utils.js');
const pvpData = require('./pvp-data.js');
const pvpCombat = require('./pvp-combat.js');
const pvpUi = require('./pvp-ui.js');
const pvpManager = require('./pvp-manager.js');

module.exports = {
    ...pvpState,
    ...pvpUtils,
    ...pvpData,
    ...pvpCombat,
    ...pvpUi,
    ...pvpManager
};
