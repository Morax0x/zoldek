const { safeQuery, safeExecute } = require('./db');
const { EmbedBuilder, Colors } = require('discord.js');

async function saveCaravanBattle(db, caravanId, guildId, hostId, threadId, state) {
    const data = JSON.stringify(state);
    await safeExecute(db, `
        INSERT INTO caravan_battles ("caravanId","guildID","hostID","threadId","data")
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT ("caravanId") DO UPDATE SET
            "guildID"=EXCLUDED."guildID",
            "hostID"=EXCLUDED."hostID",
            "threadId"=EXCLUDED."threadId",
            "data"=EXCLUDED."data"
    `, [caravanId, guildId, hostId, threadId, data]).catch(() => {});
}

async function deleteCaravanBattle(db, caravanId) {
    await safeExecute(db, `DELETE FROM caravan_battles WHERE "caravanId"=$1`, [caravanId]).catch(() => {});
}

async function resumeAmbushEncounters(client, db) {
    let res = await safeQuery(db, `SELECT * FROM caravan_battles`, []).catch(() => null);
    if (!res?.rows?.length) return;

    const { runCaravanBattle } = require('./combat');

    for (const row of res.rows) {
        try {
            const caravanId = row.caravanid || row.caravanId;
            const guildId = row.guildid || row.guildID;
            const hostId = row.hostid || row.hostID;
            const threadId = row.threadid || row.threadId;
            let state;
            try { state = JSON.parse(row.data); } catch { await deleteCaravanBattle(db, caravanId); continue; }
            if (!state) { await deleteCaravanBattle(db, caravanId); continue; }

            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) { await deleteCaravanBattle(db, caravanId); continue; }

            let thread = guild.channels.cache.get(threadId);
            if (!thread) thread = await guild.channels.fetch(threadId).catch(() => null);
            if (!thread) { await deleteCaravanBattle(db, caravanId); continue; }

            // Check caravan still exists and is unresolved
            const cvRow = await safeQuery(db,
                `SELECT * FROM user_caravans WHERE "id"=$1 AND "attackResolved"=0`,
                [caravanId]).catch(() => ({ rows: [] }));
            if (!cvRow?.rows?.length) { await deleteCaravanBattle(db, caravanId); continue; }

            // ── Za Warudo — time rewind ──
            const dioEmbed = new EmbedBuilder()
                .setDescription(`**زا واردوو!** ديو اعـاد الزمن جاري استكمال الدفاع عن القافلة من الموجة: **${state.wave || 1}**\n\n✶ خـلل زمكـانـي ادى الى مضاعفـة قوتـكم في هـذه المعـركـة`)
                .setImage('https://i.postimg.cc/VvsFq67N/dio-da.gif')
                .setColor(Colors.Gold);

            await thread.send({ embeds: [dioEmbed] }).catch(() => {});
            await thread.send({ content: `<@${hostId}> ⏳ تم اعادة الزمن! الهجوم مستمر من الموجة ${state.wave || 1}.` }).catch(() => {});

            // Restart battle from saved wave with anomaly buffs
            const party = [hostId, ...(state.guardIds || [])];
            const partyClasses = new Map();
            for (const p of state.players || []) {
                if (p.class) partyClasses.set(p.id, p.class);
            }

            runCaravanBattle(thread, party, partyClasses, db, guild, hostId, false, state.destId, state.wave || 1, state, caravanId)
                .catch(async err => {
                    console.error(`[Caravan Resume Battle Error] caravanId=${caravanId}:`, err?.message);
                    await deleteCaravanBattle(db, caravanId);
                });
        } catch (err) {
            console.error(`[Caravan Resume Error]`, err?.message);
        }
    }
}

module.exports = { saveCaravanBattle, deleteCaravanBattle, resumeAmbushEncounters };
