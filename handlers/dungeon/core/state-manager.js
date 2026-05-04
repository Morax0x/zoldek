async function saveDungeonState(db, channelID, guildID, hostID, state) {
    if (!db) return;
    
    const data = JSON.stringify(state);
    
    // 🔥 تم وضع علامات التنصيص المزدوجة لحماية أسماء الأعمدة في PostgreSQL
    await db.query(`
        INSERT INTO active_dungeons ("channelID", "guildID", "hostID", "data")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("channelID") DO UPDATE SET
        "guildID" = EXCLUDED."guildID",
        "hostID" = EXCLUDED."hostID",
        "data" = EXCLUDED."data"
    `, [channelID, guildID, hostID, data]);
}

async function deleteDungeonState(db, channelID) {
    if (!db) return;
    
    // 🔥 تم حماية اسم العمود هنا أيضاً
    await db.query('DELETE FROM active_dungeons WHERE "channelID" = $1', [channelID]);
}

module.exports = { saveDungeonState, deleteDungeonState };
