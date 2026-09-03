function getHelpMenu() {
  return `📜 *WARRIOR BOT COMMANDS* 📜

👤 *PLAYER*
• *#profile* / *#stats* — Check stats & inventory
• *#myid* — View JID and admin status
• *#hunt* — Hunt for coins & XP (45s cooldown)
• *#meditate* — Restore full HP and Ether
• *#board* — View top 10 leaderboard

⚡ *SKILLS*
• *#skill* — View class categories or your powers
• *#selectskill <category>* — Lock class (fire, lightning, blood, physical, darkness)

🛒 *SHOP & ITEMS*
• *#shop* — Open potion shop
• *#buy hp <amount>* — Buy Health Potions (250 coins)
• *#buy ether <amount>* — Buy Ether Potions (250 coins)
• *#use hp* — Restore 150 HP
• *#use ether* — Restore 150 Ether

⚔️ *COMBAT*
• *#challenge @user* — Duel a player (30s timer)
• *#accept* / *#a* — Accept duel
• *#reject* / *#r* — Decline duel
• *#[skill_name]* — Cast skill (5s cooldown)
• *#block* — Block 50% incoming damage (5s cooldown)

👑 *ADMIN*
• *#lock* / *#unlock* — Toggle group bot locking
• *#addadmin @user* — Grant admin status
• *#addxp @user <amount>* — Grant XP
• *#addcoins @user <amount>* — Grant coins`;
}

module.exports = { getHelpMenu };