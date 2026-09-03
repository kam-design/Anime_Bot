const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');
const pino = require('pino');
require('dotenv').config();
const { categories, legendaryPowers } = require('./power');
const { getHelpMenu } = require('./help');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_NUMBER = '0771912883'; 
const PRIMARY_ADMIN_LID = '42924289085446@lid';

const lockedGroups = new Map();
const activeChallenges = new Map();
const activeBattles = new Map();
const activeDomains = new Map();

const playerSchema = new mongoose.Schema({
  jid: { type: String, required: true, unique: true },
  name: { type: String, default: 'Warrior' },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  coins: { type: Number, default: 2000 },
  hp: { type: Number, default: 300 },
  ether: { type: Number, default: 300 },
  attack: { type: Number, default: 15 },
  category: { type: String, default: null },
  potions: {
    hp: { type: Number, default: 0 },
    ether: { type: Number, default: 0 }
  },
  learnedPowers: { type: [String], default: [] },
  lastHunt: { type: Date, default: 0 },
  lastMeditate: { type: Date, default: 0 }
});

const botConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global_config', unique: true },
  admins: [{ type: String }]
});

const Player = mongoose.model('Player', playerSchema);
const BotConfig = mongoose.model('BotConfig', botConfigSchema);

async function getBotConfig() {
  let config = await BotConfig.findOne({ key: 'global_config' });
  if (!config) {
    config = await BotConfig.create({ key: 'global_config', admins: [PRIMARY_ADMIN_LID] });
  }
  if (!config.admins.includes(PRIMARY_ADMIN_LID)) {
    config.admins.push(PRIMARY_ADMIN_LID);
    await config.save();
  }
  return config;
}

async function checkIsAdmin(sender) {
  const cleanSender = sender.replace(/[^0-9]/g, '');
  const cleanAdmin = ADMIN_NUMBER.replace(/^0/, '263');
  if (
    sender === PRIMARY_ADMIN_LID ||
    cleanSender.endsWith(ADMIN_NUMBER.slice(-9)) ||
    cleanSender.includes(cleanAdmin)
  ) {
    return true;
  }
  const config = await getBotConfig();
  return config.admins.includes(sender);
}

async function getOrCreatePlayer(jid, name) {
  let player = await Player.findOne({ jid });
  const validName = (name && name !== 'undefined') ? name : 'Warrior';
  if (!player) {
    player = await Player.create({ jid, name: validName });
  } else if (validName !== 'Warrior' && player.name !== validName) {
    player.name = validName;
    await player.save();
  }
  return player;
}

function calculateTotalStats(player) {
  const hpBonus = Math.floor(player.level / 5) * 10;
  const etherBonus = Math.floor(player.level / 5) * 5;
  const maxHp = Math.min(1000, 300 + hpBonus);
  const maxEther = Math.min(1000, 300 + etherBonus);
  const atkBonus = player.level * 0.5;
  const totalAtk = player.attack + atkBonus;

  return {
    doc: player,
    name: player.name || 'Warrior',
    atk: totalAtk,
    hp: player.hp > maxHp ? maxHp : player.hp,
    maxHp,
    ether: player.ether > maxEther ? maxEther : player.ether,
    maxEther,
    level: player.level,
    category: player.category ? categories[player.category]?.name : 'None',
    jid: player.jid
  };
}

function processLevelUp(player) {
  const xpNeeded = 500;
  let leveledUp = false;
  while (player.xp >= xpNeeded) {
    player.level += 1;
    player.xp -= xpNeeded;
    leveledUp = true;
  }
  return leveledUp;
}

function startEtherDrain(sock, from, battle, casterP, costPerSec) {
  const drainInterval = setInterval(() => {
    if (casterP.ether < costPerSec || !activeBattles.has(casterP.jid) || casterP.hp <= 0) {
      clearInterval(drainInterval);
      return;
    }
    casterP.ether -= costPerSec;
  }, 1000);
}

async function startBot() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to DB...");
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, logger: pino({ level: 'silent' }), printQRInTerminal: false, auth: state });
  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    const phoneNumber = "263719558719";
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n🔑 YOUR PAIRING CODE IS: ${code}\n`);
      } catch (err) {
        console.error("Failed to request pairing code:", err);
      }
    }, 3000);
  }

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    let rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const text = rawText.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const senderName = msg.pushName || 'Warrior';
    const isAdmin = await checkIsAdmin(sender);

    if (text === '#help' || text === '!help') {
      return sock.sendMessage(from, { text: getHelpMenu() });
    }

    if (text === '#myid') return sock.sendMessage(from, { text: `🆔 *Your JID:* \`${sender}\`\n👑 *Admin Status:* ${isAdmin}` });
    
    if (text === '#lock') {
      if (!isAdmin) return sock.sendMessage(from, { text: "⛔ Access Denied!" });
      lockedGroups.set(from, true);
      return sock.sendMessage(from, { text: "🔒 GROUP LOCKED!" });
    }
    
    if (text === '#unlock') {
      if (!isAdmin) return sock.sendMessage(from, { text: "⛔ Access Denied!" });
      lockedGroups.set(from, false);
      return sock.sendMessage(from, { text: "🔓 GROUP UNLOCKED!" });
    }
    
    if (lockedGroups.get(from) && !isAdmin && (text.startsWith('#') || text.startsWith('!'))) {
      return sock.sendMessage(from, { text: "🔒 Group Maintenance!" });
    }
    
    if (text.startsWith('#addadmin')) {
      if (!isAdmin) return sock.sendMessage(from, { text: "⛔ Access Denied!" });
      const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
      let targetJid = mentioned[0] || text.split(' ')[1]?.trim();
      if (!targetJid) return sock.sendMessage(from, { text: "⚠️ Provide a user." });
      const config = await getBotConfig();
      if (!config.admins.includes(targetJid)) {
        config.admins.push(targetJid);
        await config.save();
        return sock.sendMessage(from, { text: `👑 Added @${targetJid.split('@')[0]} as Admin.`, mentions: [targetJid] });
      }
    }
    
    if (text.startsWith('#addxp')) {
      if (!isAdmin) return sock.sendMessage(from, { text: "⛔ Access Denied!" });
      const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targetJid = mentioned[0];
      const amount = parseInt(text.split(' ').find(a => !isNaN(a) && !a.includes('@')), 10);
      if (!targetJid || isNaN(amount)) return sock.sendMessage(from, { text: "⚠️ Usage: #addxp @user <amount>" });
      const player = await getOrCreatePlayer(targetJid, "Warrior");
      player.xp += amount;
      processLevelUp(player);
      await player.save();
      return sock.sendMessage(from, { text: `✨ Added +${amount} XP to @${targetJid.split('@')[0]}!`, mentions: [targetJid] });
    }
    
    if (text.startsWith('#addcoins')) {
      if (!isAdmin) return sock.sendMessage(from, { text: "⛔ Access Denied!" });
      const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targetJid = mentioned[0];
      const amount = parseInt(text.split(' ').find(a => !isNaN(a) && !a.includes('@')), 10);
      if (!targetJid || isNaN(amount)) return sock.sendMessage(from, { text: "⚠️ Usage: #addcoins @user <amount>" });
      const player = await getOrCreatePlayer(targetJid, "Warrior");
      player.coins += amount;
      await player.save();
      return sock.sendMessage(from, { text: `💰 Added +${amount} Coins to @${targetJid.split('@')[0]}!`, mentions: [targetJid] });
    }
    
    if (text === '#hunt' || text === '!hunt') {
      const player = await getOrCreatePlayer(sender, senderName);
      const cooldown = 45 * 1000;
      const now = Date.now();
      if (now - new Date(player.lastHunt).getTime() < cooldown) {
        const remaining = Math.ceil((cooldown - (now - new Date(player.lastHunt).getTime())) / 1000);
        return sock.sendMessage(from, { text: `⏳ Wait ${remaining}s.` });
      }
      const coinsEarned = Math.floor(Math.random() * 300) + 150;
      const xpEarned = Math.floor(Math.random() * 40) + 20;
      player.coins += coinsEarned;
      player.xp += xpEarned;
      player.lastHunt = now;
      processLevelUp(player);
      await player.save();
      return sock.sendMessage(from, { text: `⚔️ *HUNT SUCCESSFUL!*\n💰 +${coinsEarned} Coins\n✨ +${xpEarned} XP` });
    }
    
    if (text === '#profile' || text === '#stats') {
      const player = await getOrCreatePlayer(sender, senderName);
      const stats = calculateTotalStats(player);
      const learnedStr = player.learnedPowers.length ? player.learnedPowers.join(', ') : 'None';
      let profileText = `👤 *PLAYER PROFILE: ${stats.name}*\n🔥 Class: ${stats.category}\n⭐ Level: ${player.level}\n✨ XP: ${player.xp}/500\n💰 Coins: ${player.coins}\n⚔️ ATK: ${stats.atk}\n❤️ HP: ${stats.hp}/${stats.maxHp}\n🔮 Ether: ${stats.ether}/${stats.maxEther}\n\n🎒 *Inventory:*\n❤️ Health Potions: ${player.potions?.hp || 0}\n🔮 Ether Potions: ${player.potions?.ether || 0}\n\n🌟 *Legendary Powers:* ${learnedStr}`;
      return sock.sendMessage(from, { text: profileText });
    }
    
    if (text === '#meditate' || text === '!meditate') {
      const player = await getOrCreatePlayer(sender, senderName);
      const stats = calculateTotalStats(player);
      player.ether = stats.maxEther;
      player.hp = stats.maxHp;
      await player.save();
      return sock.sendMessage(from, { text: `✨ Fully restored HP (${stats.maxHp}) and Ether (${stats.maxEther})!` });
    }

    if (text === '#board' || text === '#leaderboard') {
      const topPlayers = await Player.find().sort({ level: -1, xp: -1 }).limit(10);
      if (!topPlayers.length) return sock.sendMessage(from, { text: "🏆 No players found on the board!" });

      let boardText = "🏆 *TOP WARRIORS LEADERBOARD*\n\n";
      topPlayers.forEach((p, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
        boardText += `${medal} *#${index + 1} ${p.name}*\n   └ Lvl ${p.level} | 💰 ${p.coins} Coins | ✨ ${p.xp} XP\n\n`;
      });

      return sock.sendMessage(from, { text: boardText.trim() });
    }

    if (text === '#skill' || text === '#skills') {
      const player = await getOrCreatePlayer(sender, senderName);

      if (player.category) {
        const chosen = categories[player.category];
        let skillMsg = `⚡ *YOUR PERMANENT CLASS: ${chosen.name.toUpperCase()}*\n\n*Unlocked Powers:*\n`;
        chosen.powers.forEach(p => {
          skillMsg += `• *${p.name}* — ⚔️ ${p.damage} DMG | 🔮 ${p.cost} Ether\n`;
        });
        return sock.sendMessage(from, { text: skillMsg });
      }

      let menuMsg = "📜 *ELEMENTAL POWER CATEGORIES*\n\nChoose carefully! Your selection is *PERMANENT*.\n\n";
      Object.keys(categories).forEach(key => {
        const cat = categories[key];
        menuMsg += `🔹 *${cat.name}* (\`#selectskill ${key}\`)\n`;
        cat.powers.forEach(p => {
          menuMsg += `   └ ${p.name} (DMG: ${p.damage} | Ether: ${p.cost})\n`;
        });
        menuMsg += "\n";
      });
      menuMsg += "👉 *To lock in your skills, type:* `#selectskill <category_name>`\n_Example: `#selectskill fire`_";
      return sock.sendMessage(from, { text: menuMsg });
    }

    if (text.startsWith('#selectskill')) {
      const player = await getOrCreatePlayer(sender, senderName);
      if (player.category) {
        return sock.sendMessage(from, { text: `⚠️ You have already locked in the *${categories[player.category]?.name}* class permanently!` });
      }

      const inputKey = text.split(' ')[1]?.toLowerCase().trim();
      if (!inputKey || !categories[inputKey]) {
        return sock.sendMessage(from, { text: "⚠️ Invalid category! Options: `fire`, `lightning`, `blood`, `physical`, `darkness`." });
      }

      player.category = inputKey;
      await player.save();

      const chosen = categories[inputKey];
      return sock.sendMessage(from, { text: `🎉 *CONGRATULATIONS!*\nYou have permanently bound your soul to the *${chosen.name}* class!\nType '#skill' to view your available powers.` });
    }

    // --- LEGENDARY POWERS & LEARNING ---
    if (text === '#power' || text === '#powers') {
      let pMsg = "🌟 *LEGENDARY POWERS & DOMAINS*\n\n";
      Object.keys(legendaryPowers).forEach(k => {
        const lp = legendaryPowers[k];
        pMsg += `🌀 *${lp.name}*\n   └ Level Req: ${lp.reqLevel} | Cost: 💰 ${lp.costCoins} Coins\n   └ Base DMG: ⚔️ ${lp.baseDmg} | Drain: 🔮 ${lp.costPerSec} Ether/s\n   └ Command: \`#learn ${k}\`\n\n`;
      });
      pMsg += "👉 Type `#learn <power_name>` to unlock a Legendary Power!";
      return sock.sendMessage(from, { text: pMsg });
    }

    if (text.startsWith('#learn')) {
      const powerKey = text.slice(6).toLowerCase().trim();
      const legPower = legendaryPowers[powerKey];

      if (!legPower) {
        return sock.sendMessage(from, { text: "⚠️ Legendary power not found! Type `#power` to see available powers." });
      }

      const player = await getOrCreatePlayer(sender, senderName);
      if (player.learnedPowers.includes(legPower.name)) {
        return sock.sendMessage(from, { text: `⚠️ You already know *${legPower.name}*!` });
      }

      if (player.level < legPower.reqLevel) {
        return sock.sendMessage(from, { text: `❌ Level too low! Requires Level ${legPower.reqLevel}.` });
      }

      if (player.coins < legPower.costCoins) {
        return sock.sendMessage(from, { text: `❌ Not enough coins! Need 💰 ${legPower.costCoins} Coins.` });
      }

      player.coins -= legPower.costCoins;
      player.learnedPowers.push(legPower.name);
      await player.save();

      return sock.sendMessage(from, { text: `🎉 *POWER UNLOCKED!* You learned *${legPower.name}*!` });
    }

    // --- SHOP SYSTEM ---
    if (text === '#shop') {
      const shopMsg = `🛒 *MAGIC POTION SHOP*\n\n` +
        `❤️ *Health Potion* — 💰 250 Coins\n` +
        `   └ Restores +150 HP\n` +
        `   👉 \`#buy hp <amount>\`\n\n` +
        `🔮 *Ether Potion* — 💰 250 Coins\n` +
        `   └ Restores +150 Ether\n` +
        `   👉 \`#buy ether <amount>\`\n\n` +
        `🧪 *Use In/Out of Battle:* \`#use hp\` or \`#use ether\``;
      return sock.sendMessage(from, { text: shopMsg });
    }

    if (text.startsWith('#buy')) {
      const args = text.split(' ').filter(Boolean);
      const item = args[1]?.toLowerCase();
      const amount = parseInt(args[2] || '1', 10);

      if (!item || !['hp', 'health', 'ether'].includes(item) || isNaN(amount) || amount <= 0) {
        return sock.sendMessage(from, { text: "⚠️ Usage: `#buy hp <amount>` or `#buy ether <amount>`" });
      }

      const player = await getOrCreatePlayer(sender, senderName);
      const pricePerUnit = 250;
      const totalCost = pricePerUnit * amount;

      if (player.coins < totalCost) {
        return sock.sendMessage(from, { text: `❌ Not enough coins! You need 💰 ${totalCost} Coins (You have: 💰 ${player.coins}).` });
      }

      player.coins -= totalCost;
      if (!player.potions) player.potions = { hp: 0, ether: 0 };

      if (item === 'hp' || item === 'health') {
        player.potions.hp = (player.potions.hp || 0) + amount;
      } else {
        player.potions.ether = (player.potions.ether || 0) + amount;
      }

      await player.save();
      return sock.sendMessage(from, { text: `🛍️ Bought ${amount}x ${item.toUpperCase()} Potion(s) for 💰 ${totalCost} Coins!\n💰 Remaining Coins: ${player.coins}` });
    }

    // --- USE POTION (IN/OUT BATTLE) ---
    if (text === '#use hp' || text === '#use health' || text === '#use ether') {
      const player = await getOrCreatePlayer(sender, senderName);
      const stats = calculateTotalStats(player);
      const isHp = text.includes('hp') || text.includes('health');
      const potType = isHp ? 'hp' : 'ether';

      if (!player.potions || player.potions[potType] <= 0) {
        return sock.sendMessage(from, { text: `❌ You don't have any ${isHp ? 'Health' : 'Ether'} Potions! Buy some at the \`#shop\`.` });
      }

      const inBattle = activeBattles.has(sender) && activeBattles.get(sender).groupJid === from;
      const now = Date.now();

      if (inBattle) {
        const battle = activeBattles.get(sender);
        const p = battle.p1.jid === sender ? battle.p1 : battle.p2;

        if (p.stunnedUntil && p.stunnedUntil > Date.now()) {
          return sock.sendMessage(from, { text: `⛔ You are frozen in a Domain Expansion and cannot act!` });
        }

        if (now - p.lastAction < 5000) {
          const waitSec = Math.ceil((5000 - (now - p.lastAction)) / 1000);
          return sock.sendMessage(from, { text: `⏳ Wait ${waitSec}s before taking another action!` });
        }

        player.potions[potType] -= 1;
        await player.save();

        p.lastAction = now;
        if (isHp) {
          p.hp = Math.min(p.maxHp, p.hp + 150);
          return sock.sendMessage(from, { text: `🧪 *${p.name}* drank a Health Potion!\n❤️ Restored 150 HP! Current HP: ${p.hp}/${p.maxHp}` });
        } else {
          p.ether = Math.min(p.maxEther, p.ether + 150);
          return sock.sendMessage(from, { text: `🧪 *${p.name}* drank an Ether Potion!\n🔮 Restored 150 Ether! Current Ether: ${p.ether}/${p.maxEther}` });
        }
      } else {
        player.potions[potType] -= 1;
        if (isHp) {
          player.hp = Math.min(stats.maxHp, player.hp + 150);
        } else {
          player.ether = Math.min(stats.maxEther, player.ether + 150);
        }
        await player.save();
        return sock.sendMessage(from, { text: `🧪 Drank a ${isHp ? 'Health' : 'Ether'} Potion!\n❤️ HP: ${player.hp}/${stats.maxHp} | 🔮 Ether: ${player.ether}/${stats.maxEther}` });
      }
    }

    // --- COMBAT & CHALLENGE SYSTEM ---
    if (text.startsWith('#challenge')) {
      const challenger = await getOrCreatePlayer(sender, senderName);
      if (!challenger.category) return sock.sendMessage(from, { text: "⚠️ Select a class first using `#skill`!" });

      const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targetJid = mentioned[0];
      if (!targetJid) return sock.sendMessage(from, { text: "⚠️ Tag a player to challenge! Example: `#challenge @user`" });
      if (targetJid === sender) return sock.sendMessage(from, { text: "⚠️ You cannot challenge yourself!" });

      const targetPlayer = await getOrCreatePlayer(targetJid, "Warrior");
      if (!targetPlayer.category) return sock.sendMessage(from, { text: "⚠️ Target user has not chosen a skill class yet!" });

      if (activeBattles.has(sender) || activeBattles.has(targetJid)) {
        return sock.sendMessage(from, { text: "⚠️ One of you is already in an active battle!" });
      }

      const challengeId = `${from}_${targetJid}`;
      if (activeChallenges.has(challengeId)) {
        return sock.sendMessage(from, { text: "⚠️ A pending challenge already exists for this player in this group!" });
      }

      const timer = setTimeout(() => {
        if (activeChallenges.has(challengeId)) {
          activeChallenges.delete(challengeId);
          sock.sendMessage(from, { text: `⏰ *CHALLENGE EXPIRED!*\n@${targetJid.split('@')[0]} failed to respond in 30 seconds.`, mentions: [targetJid] });
        }
      }, 30000);

      activeChallenges.set(challengeId, { challenger: sender, challengerName: senderName, target: targetJid, groupJid: from, timer });
      return sock.sendMessage(from, {
        text: `⚔️ *COMBAT CHALLENGE!*\n@${sender.split('@')[0]} challenged @${targetJid.split('@')[0]} to a duel!\n\nType *#accept* (*#a*) or *#reject* (*#r*).\n⏳ *30 seconds to respond!*`,
        mentions: [sender, targetJid]
      });
    }

    if (text === '#accept' || text === '#a') {
      const challengeId = `${from}_${sender}`;
      const challenge = activeChallenges.get(challengeId);
      if (!challenge) return sock.sendMessage(from, { text: "⚠️ No pending challenges for you!" });

      clearTimeout(challenge.timer);
      activeChallenges.delete(challengeId);

      const p1Doc = await getOrCreatePlayer(challenge.challenger, challenge.challengerName);
      const p2Doc = await getOrCreatePlayer(sender, senderName);

      const p1Stats = calculateTotalStats(p1Doc);
      const p2Stats = calculateTotalStats(p2Doc);

      const battle = {
        groupJid: from,
        p1: { jid: p1Doc.jid, name: p1Stats.name, level: p1Doc.level, atk: p1Stats.atk, hp: p1Stats.maxHp, maxHp: p1Stats.maxHp, ether: p1Stats.maxEther, maxEther: p1Stats.maxEther, category: p1Doc.category, lastAction: 0, blocking: false, stunnedUntil: 0 },
        p2: { jid: p2Doc.jid, name: p2Stats.name, level: p2Doc.level, atk: p2Stats.atk, hp: p2Stats.maxHp, maxHp: p2Stats.maxHp, ether: p2Stats.maxEther, maxEther: p2Stats.maxEther, category: p2Doc.category, lastAction: 0, blocking: false, stunnedUntil: 0 }
      };

      activeBattles.set(p1Doc.jid, battle);
      activeBattles.set(p2Doc.jid, battle);

      return sock.sendMessage(from, {
        text: `⚔️ *BATTLE COMMENCED!* ⚔️\n\n🔴 *${p1Stats.name}* vs 🔵 *${p2Stats.name}*\n\n❤️ HP: ${p1Stats.maxHp} | 🔮 Ether: ${p1Stats.maxEther}\n\n👉 *Attack:* Use \`#<skill_name>\`\n👉 *Defend:* Type \`#block\`\n👉 *Legendary Powers:* \`#<power_name>\`\n⏱️ *Cooldown:* 5 seconds per action!`,
        mentions: [p1Doc.jid, p2Doc.jid]
      });
    }

    if (text === '#reject' || text === '#r') {
      const challengeId = `${from}_${sender}`;
      const challenge = activeChallenges.get(challengeId);
      if (!challenge) return sock.sendMessage(from, { text: "⚠️ No pending challenges to reject!" });

      clearTimeout(challenge.timer);
      activeChallenges.delete(challengeId);
      return sock.sendMessage(from, { text: `❌ Challenge rejected by @${sender.split('@')[0]}.`, mentions: [sender] });
    }

    // --- IN-BATTLE ACTIONS ---
    if (activeBattles.has(sender)) {
      const battle = activeBattles.get(sender);
      if (battle.groupJid !== from) return;

      const p = battle.p1.jid === sender ? battle.p1 : battle.p2;
      const opp = battle.p1.jid === sender ? battle.p2 : battle.p1;
      const now = Date.now();

      if (p.stunnedUntil && p.stunnedUntil > now) {
        return sock.sendMessage(from, { text: `⛔ You are frozen by a Domain Expansion and cannot move or act!` });
      }

      if (text === '#block') {
        if (now - p.lastAction < 5000) {
          const waitSec = Math.ceil((5000 - (now - p.lastAction)) / 1000);
          return sock.sendMessage(from, { text: `⏳ Wait ${waitSec}s before taking another action!` });
        }
        p.blocking = true;
        p.lastAction = now;
        return sock.sendMessage(from, { text: `🛡️ *${p.name}* readies a shield! Next incoming attack deals 50% reduced damage.` });
      }

      const moveInput = text.startsWith('#') ? text.slice(1).toLowerCase().trim() : '';
      if (moveInput) {
        // --- CHECK LEGENDARY DOMAIN POWERS ---
        const legPower = legendaryPowers[moveInput];
        if (legPower) {
          const playerDoc = await getOrCreatePlayer(sender, senderName);
          if (!playerDoc.learnedPowers.includes(legPower.name)) {
            return sock.sendMessage(from, { text: `❌ You have not learned *${legPower.name}*! Unlock it with \`#learn ${moveInput}\`` });
          }

          const existingDomain = activeDomains.get(sender);
          if (existingDomain && existingDomain.state === 'WAITING_COUNTER') {
            clearTimeout(existingDomain.counterTimer);
            const casterP = battle.p1.jid === existingDomain.casterJid ? battle.p1 : battle.p2;

            if (p.level < casterP.level) {
              const massiveDmg = casterP.atk * 6;
              opp.hp = Math.max(0, opp.hp - massiveDmg);
              p.stunnedUntil = Date.now() + 60000;
              startEtherDrain(sock, from, battle, casterP, legPower.costPerSec);
              activeDomains.delete(sender);

              let msgStr = `💥 *COUNTER FAILED!* @${sender.split('@')[0]} was too weak!\n` +
                `☠️ Took *${massiveDmg}* massive damage and is frozen for 60 seconds!\n` +
                `🔮 @${casterP.jid.split('@')[0]} is draining ${legPower.costPerSec} Ether/sec!`;

              if (opp.hp <= 0) {
                activeBattles.delete(p.jid);
                activeBattles.delete(opp.jid);
                msgStr += `\n\n🏆 *VICTORY!* @${casterP.jid.split('@')[0]} won the battle!`;
              }
              return sock.sendMessage(from, { text: msgStr, mentions: [sender, casterP.jid] });
            } else {
              activeDomains.delete(sender);
              return sock.sendMessage(from, {
                text: `⚔️ *DOMAIN NEUTRALIZED!* @${sender.split('@')[0]} successfully countered with *${legPower.name}*!`,
                mentions: [sender]
              });
            }
          }

          if (p.ether < 20) {
            return sock.sendMessage(from, { text: `⚠️ Need at least 20 Ether to cast a Legendary Power!` });
          }

          const domainObj = {
            casterJid: sender,
            targetJid: opp.jid,
            power: legPower,
            state: 'WAITING_COUNTER',
            counterTimer: setTimeout(async () => {
              const massiveDmg = legPower.baseDmg;
              opp.hp = Math.max(0, opp.hp - massiveDmg);
              opp.stunnedUntil = Date.now() + 60000;
              startEtherDrain(sock, from, battle, p, legPower.costPerSec);
              activeDomains.delete(opp.jid);

              let endMsg = `⏳ *TIME EXPIRED!* @${opp.jid.split('@')[0]} failed to counter in 10s!\n` +
                `💥 Took *${massiveDmg}* DMG and is frozen for 60s!\n` +
                `🔮 @${sender.split('@')[0]} is draining ${legPower.costPerSec} Ether/sec.`;

              if (opp.hp <= 0) {
                activeBattles.delete(p.jid);
                activeBattles.delete(opp.jid);
                endMsg += `\n\n🏆 *VICTORY!* @${sender.split('@')[0]} won!`;
              }

              await sock.sendMessage(from, { text: endMsg, mentions: [opp.jid, sender] });
            }, 10000)
          };

          activeDomains.set(opp.jid, domainObj);
          p.lastAction = now;
          return sock.sendMessage(from, {
            text: `🌀 *LEGENDARY POWER ACTIVATED!*\n@${sender.split('@')[0]} cast *${legPower.name}*!\n\n⏳ @${opp.jid.split('@')[0]} has *10 SECONDS* to cast a legendary power to counter!`,
            mentions: [sender, opp.jid]
          });
        }

        // --- STANDARD CLASS SKILLS ---
        const cat = categories[p.category];
        const power = cat?.powers.find(pow => pow.name.toLowerCase() === moveInput);

        if (power) {
          if (now - p.lastAction < 5000) {
            const waitSec = Math.ceil((5000 - (now - p.lastAction)) / 1000);
            return sock.sendMessage(from, { text: `⏳ Wait ${waitSec}s before taking another action!` });
          }

          if (p.ether < power.cost) {
            return sock.sendMessage(from, { text: `⚠️ Not enough Ether! Need ${power.cost} Ether, but you have ${p.ether}.` });
          }

          p.ether -= power.cost;
          let dmg = power.damage;
          let blockNotice = '';

          if (opp.blocking) {
            dmg = Math.floor(dmg * 0.5);
            opp.blocking = false;
            blockNotice = " 🛡️ *(Blocked 50% DMG!)*";
          }

          opp.hp -= dmg;
          p.lastAction = now;

          if (opp.hp <= 0) {
            opp.hp = 0;
            activeBattles.delete(p.jid);
            activeBattles.delete(opp.jid);

            const winnerDoc = await Player.findOne({ jid: p.jid });
            if (winnerDoc) {
              winnerDoc.coins += 300;
              winnerDoc.xp += 100;
              processLevelUp(winnerDoc);
              await winnerDoc.save();
            }

            return sock.sendMessage(from, {
              text: `💥 *${p.name}* used *${power.name}*!\nDealt *${dmg}* DMG!${blockNotice}\n\n🏆 *VICTORY!* *${p.name}* defeated *${opp.name}*!\n💰 Rewards: +300 Coins | ✨ +100 XP`
            });
          }

          return sock.sendMessage(from, {
            text: `💥 *${p.name}* used *${power.name}*!\nDealt *${dmg}* DMG!${blockNotice}\n\n🔴 *${p.name}:* ❤️ ${p.hp}/${p.maxHp} | 🔮 ${p.ether}/${p.maxEther}\n🔵 *${opp.name}:* ❤️ ${opp.hp}/${opp.maxHp} | 🔮 ${opp.ether}/${opp.maxEther}`
          });
        }
      }
    }
  });

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') console.log('Bot is connected!');
    if (update.connection === 'close') startBot();
  });
}

startBot();