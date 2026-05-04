const { generateCaravanHub }    = require('./hub');
const { generateSendMap }       = require('./send-map');
const { generateCaravanStatus } = require('./status');
const { generateUpgradePanel }  = require('./upgrade-panel');
const { generateEquipPanel }    = require('./equip-panel');

module.exports = {
    generateCaravanHub,
    generateSendMap,
    generateCaravanStatus,
    generateUpgradePanel,
    generateEquipPanel,
};
