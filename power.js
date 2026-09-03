const categories = {
  fire: {
    name: "Fire / Thermal",
    powers: [
      { name: "Firefist", damage: 40, cost: 20 },
      { name: "Prometheus", damage: 65, cost: 35 },
      { name: "Amaterasu", damage: 95, cost: 50 },
      { name: "Inferno", damage: 110, cost: 60 },
      { name: "Supernova", damage: 135, cost: 75 }
    ]
  },
  lightning: {
    name: "Energy / Lightning",
    powers: [
      { name: "Rasengan", damage: 50, cost: 25 },
      { name: "Chidori", damage: 70, cost: 40 },
      { name: "Kirin", damage: 90, cost: 50 },
      { name: "Getsuga", damage: 105, cost: 55 },
      { name: "Raikiri", damage: 130, cost: 70 }
    ]
  },
  blood: {
    name: "Blood / Curse",
    powers: [
      { name: "Crimson", damage: 55, cost: 30 },
      { name: "Spear", damage: 75, cost: 40 },
      { name: "Pierce", damage: 90, cost: 50 },
      { name: "Vampire", damage: 110, cost: 60 },
      { name: "Execution", damage: 135, cost: 70 }
    ]
  },
  physical: {
    name: "Ki / Physical",
    powers: [
      { name: "Kamehameha", damage: 80, cost: 45 },
      { name: "Spiritgun", damage: 85, cost: 45 },
      { name: "Smash", damage: 105, cost: 55 },
      { name: "Impact", damage: 120, cost: 65 },
      { name: "Seriouspunch", damage: 145, cost: 80 }
    ]
  },
  darkness: {
    name: "Darkness / Gravity",
    powers: [
      { name: "Shadow", damage: 50, cost: 25 },
      { name: "Gravity", damage: 65, cost: 35 },
      { name: "Blackhole", damage: 95, cost: 50 },
      { name: "Dimension", damage: 115, cost: 60 },
      { name: "Abyss", damage: 140, cost: 75 }
    ]
  }
};

const legendaryPowers = {
  void: {
    name: "Void",
    reqLevel: 5,
    costCoins: 1500,
    costPerSec: 2,
    baseDmg: 300
  },
  bankai: {
    name: "Bankai",
    reqLevel: 4,
    costCoins: 1200,
    costPerSec: 2,
    baseDmg: 280
  },
  shrine: {
    name: "Shrine",
    reqLevel: 5,
    costCoins: 1500,
    costPerSec: 2,
    baseDmg: 320
  },
  mugetsu: {
    name: "Mugetsu",
    reqLevel: 5,
    costCoins: 1800,
    costPerSec: 3,
    baseDmg: 350
  },
  purple: {
    name: "Purple",
    reqLevel: 4,
    costCoins: 1000,
    costPerSec: 2,
    baseDmg: 260
  },
  susanoo: {
    name: "Susanoo",
    reqLevel: 5,
    costCoins: 1600,
    costPerSec: 2,
    baseDmg: 310
  },
  baryon: {
    name: "Baryon",
    reqLevel: 6,
    costCoins: 2000,
    costPerSec: 3,
    baseDmg: 380
  }
};

module.exports = { categories, legendaryPowers };