const db           = require('./db');
const config       = require('./config');
const calculations = require('./calculations');
const tables       = require('./tables');
const stats        = require('./stats');
const journey      = require('./journey');
const lobby        = require('./lobby');
const combat       = require('./combat');
const market       = require('./market');

module.exports = {
    // db
    safeQuery:    db.safeQuery,
    safeExecute:  db.safeExecute,

    // config
    caravanConfig: config.caravanConfig,
    EMOJI_MORA:    config.EMOJI_MORA,

    // calculations
    getEquippedBuffs:      calculations.getEquippedBuffs,
    calcDuration:          calculations.calcDuration,
    calcRiskFactor:        calculations.calcRiskFactor,
    calcRewardMultiplier:  calculations.calcRewardMultiplier,

    // tables
    initCaravanTables:    tables.initCaravanTables,
    checkCaravanCooldown: tables.checkCaravanCooldown,
    setCaravanCooldown:   tables.setCaravanCooldown,

    // stats
    getUserCaravanStats: stats.getUserCaravanStats,
    getActiveCaravan:    stats.getActiveCaravan,
    upgradeCaravan:      stats.upgradeCaravan,

    // journey
    sendCaravan:             journey.sendCaravan,
    distributeRewards:       journey.distributeRewards,
    sendAttackNotification:  journey.sendAttackNotification,
    processCaravanReturns:   journey.processCaravanReturns,
    setupCaravanChecker:     journey.setupCaravanChecker,

    // lobby
    startEscortLobby:     lobby.startEscortLobby,
    sendAmbushNotification: lobby.sendAmbushNotification,
    buildLobbyEmbed:      lobby.buildLobbyEmbed,
    CLASS_OPTIONS:        lobby.CLASS_OPTIONS,
    LOBBY_TIMEOUT_MS:     lobby.LOBBY_TIMEOUT_MS,
    AMBUSH_WINDOW_MS:     lobby.AMBUSH_WINDOW_MS,
    MAX_PARTY:            lobby.MAX_PARTY,

    // combat
    CARAVAN_HP_MAX:        combat.CARAVAN_HP_MAX,
    WAVE_ENEMIES:          combat.WAVE_ENEMIES,
    WAVE_REWARD_DELTAS:    combat.WAVE_REWARD_DELTAS,
    selectEnemyTarget:     combat.selectEnemyTarget,
    processEnemyTurn:      combat.processEnemyTurn,
    generateBattleEmbed:   combat.generateBattleEmbed,
    makeBattleRows:        combat.makeBattleRows,
    generateRestEmbed:     combat.generateRestEmbed,
    makeRestRows:          combat.makeRestRows,
    doRestPhase:           combat.doRestPhase,
    distributePartyRewards: combat.distributePartyRewards,
    runCaravanBattle:      combat.runCaravanBattle,
    registerCombatListeners: combat.registerCombatListeners,

    // market
    initMarketTables:         market.initMarketTables,
    showMarketSetup:          market.showMarketSetup,
    handleAddItemSelect:      market.handleAddItemSelect,
    handlePriceModalSubmit:   market.handlePriceModalSubmit,
    handleRemoveItemSelect:   market.handleRemoveItemSelect,
    finalizeListings:         market.finalizeListings,
    clearMarketListingsCache: market.clearMarketListingsCache,
    getMarketListingsCache:   market.getMarketListingsCache,
    createMarketThread:       market.createMarketThread,
    setupMarketChecker:       market.setupMarketChecker,
    handleBuySelect:          market.handleBuySelect,
    handleBuyModalSubmit:     market.handleBuyModalSubmit,
    handleRefresh:            market.handleRefresh,
    handleOwnerPriceChange:   market.handleOwnerPriceChange,
    handlePriceChangeSelect:  market.handlePriceChangeSelect,
    handleNewPriceModalSubmit: market.handleNewPriceModalSubmit,
    spawnNpc:                 market.spawnNpc,
    getListingsBySession:     market.getListingsBySession,
    getSessionByThread:       market.getSessionByThread,
    returnUnsoldItems:        market.returnUnsoldItems,
    closeSession:             market.closeSession,
    buildMarketEmbed:         market.buildMarketEmbed,
    buildMarketComponents:    market.buildMarketComponents,
};
