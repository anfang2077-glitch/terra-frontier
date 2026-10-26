/* ============================================================
   Terra Frontier — world data, items, recipes, icon art
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;
  const TILE = TF.TILE;

  // ============================================================
  // TILES
  // ============================================================
  const T = {
    AIR: 0,
    DIRT: 1,
    GRASS: 2,
    STONE: 3,
    SAND: 4,
    SANDSTONE: 5,
    SNOW: 6,
    ICE: 7,
    DEEPSTONE: 8,
    MOSSSTONE: 9,
    COPPER: 10,
    IRON: 11,
    GOLD: 12,
    GEM: 13,
    HEART: 14,
    PLANK: 15,
    STONEBRICK: 16,
    PLATFORM: 17,
  };

  const TILE_DEFS = {
    [T.AIR]: { name: '空气', solid: false, palette: null },
    [T.DIRT]: {
      name: '泥土', solid: true, hardness: 0.30, tier: 1, drop: 'dirt', dropCount: 1,
      palette: { base: '#7a4b2b', dark: '#5b351f', light: '#96613a', detail: '#ab7a4e' },
    },
    [T.GRASS]: {
      name: '草地', solid: true, hardness: 0.27, tier: 1, drop: 'dirt', dropCount: 1,
      palette: { base: '#774a2a', dark: '#55331e', light: '#946038', detail: '#a8784c', top: '#4e8b36', topLight: '#77bd4e', topDark: '#2e5c23' },
    },
    [T.STONE]: {
      name: '石块', solid: true, hardness: 0.62, tier: 1, drop: 'stone', dropCount: 1,
      palette: { base: '#686873', dark: '#4e4d58', light: '#85838c', detail: '#585762' },
    },
    [T.SAND]: {
      name: '沙块', solid: true, hardness: 0.24, tier: 1, drop: 'sand', dropCount: 1,
      palette: { base: '#c5a05e', dark: '#a68043', light: '#e2c37e', detail: '#b28c4d' },
    },
    [T.SANDSTONE]: {
      name: '砂岩', solid: true, hardness: 0.48, tier: 1, drop: 'sandstone', dropCount: 1,
      palette: { base: '#a98650', dark: '#82643a', light: '#c8a870', detail: '#927243' },
    },
    [T.SNOW]: {
      name: '雪块', solid: true, hardness: 0.22, tier: 1, drop: 'snow', dropCount: 1,
      palette: { base: '#dbe8ee', dark: '#b4cbd4', light: '#f5fbfd', detail: '#c9dbe2' },
    },
    [T.ICE]: {
      name: '冰块', solid: true, hardness: 0.40, tier: 1, drop: 'snow', dropCount: 1,
      palette: { base: '#9ed2e4', dark: '#76adc5', light: '#c7eef8', detail: '#86c2d8' },
    },
    [T.DEEPSTONE]: {
      name: '深岩', solid: true, hardness: 0.88, tier: 1, drop: 'stone', dropCount: 1,
      palette: { base: '#4e4d5a', dark: '#383743', light: '#676673', detail: '#44434f' },
    },
    [T.MOSSSTONE]: {
      name: '苔石', solid: true, hardness: 0.66, tier: 1, drop: 'stone', dropCount: 1,
      palette: { base: '#646b60', dark: '#4a5348', light: '#7f8a76', detail: '#597155', accent: '#6f955b' },
    },
    [T.COPPER]: {
      name: '铜矿', solid: true, hardness: 0.80, tier: 1, drop: 'copperOre', dropCount: 1,
      palette: { base: '#686873', dark: '#4e4d58', light: '#85838c', detail: '#585762', accent: '#bd6a32', accent2: '#e99a4d' },
    },
    [T.IRON]: {
      name: '铁矿', solid: true, hardness: 0.98, tier: 1, drop: 'ironOre', dropCount: 1,
      palette: { base: '#686873', dark: '#4e4d58', light: '#85838c', detail: '#585762', accent: '#b6afa1', accent2: '#e0d8c8' },
    },
    [T.GOLD]: {
      name: '金矿', solid: true, hardness: 1.35, tier: 2, drop: 'goldOre', dropCount: 1,
      palette: { base: '#686873', dark: '#4e4d58', light: '#85838c', detail: '#585762', accent: '#d1a62d', accent2: '#f7dc6a' },
    },
    [T.GEM]: {
      name: '宝石矿', solid: true, hardness: 1.55, tier: 2, drop: 'gem', dropCount: 1,
      palette: { base: '#5b5968', dark: '#423f50', light: '#777486', detail: '#504d5c', accent: '#a95ce2', accent2: '#e3a8ff' },
    },
    [T.HEART]: {
      name: '生命水晶', solid: true, hardness: 1.15, tier: 1, drop: 'heartCrystal', dropCount: 1,
      palette: { base: '#5f5c68', dark: '#45424e', light: '#7d7985', detail: '#575460', accent: '#dc6176', accent2: '#ffadbd' },
    },
    [T.PLANK]: {
      name: '木板', solid: true, hardness: 0.38, tier: 1, drop: 'wood', dropCount: 1,
      palette: { base: '#976435', dark: '#6b4525', light: '#b78149', detail: '#7d5029' },
    },
    [T.STONEBRICK]: {
      name: '石砖', solid: true, hardness: 0.7, tier: 1, drop: 'stoneBrick', dropCount: 1,
      palette: { base: '#6d6c77', dark: '#4a4954', light: '#8b8994', detail: '#5a5963' },
    },
    [T.PLATFORM]: {
      name: '木平台', solid: false, platform: true, hardness: 0.24, tier: 1, drop: 'woodPlatform', dropCount: 1,
      palette: { base: '#a06c3a', dark: '#704826', light: '#c18a4f', detail: '#85592e' },
    },
  };

  const SOLID = new Uint8Array(18);
  const PLATFORM = new Uint8Array(18);
  for (const k in TILE_DEFS) {
    const d = TILE_DEFS[k];
    SOLID[k] = d.solid ? 1 : 0;
    PLATFORM[k] = d.platform ? 1 : 0;
  }
  SOLID[T.AIR] = 0;

  // ============================================================
  // BACKGROUND WALLS
  // ============================================================
  const W = {
    NONE: 0,
    DIRT: 1,
    STONE: 2,
    CAVE: 3,
    WOOD: 10,
    STONEWALL: 11,
    BRICKWALL: 12,
  };

  const WALL_DEFS = {
    [W.NONE]: { name: '无' },
    [W.DIRT]: { name: '泥土墙', natural: true, palette: { base: '#3d2a1c', dark: '#2b1c12', light: '#4b3523', detail: '#342419' } },
    [W.STONE]: { name: '石墙', natural: true, palette: { base: '#373642', dark: '#262530', light: '#45434f', detail: '#2f2e39' } },
    [W.CAVE]: { name: '洞穴墙', natural: true, palette: { base: '#252631', dark: '#181922', light: '#32333f', detail: '#1f202a' } },
    [W.WOOD]: { name: '木墙', item: 'woodWall', palette: { base: '#5e3d22', dark: '#432a16', light: '#75502d', detail: '#50331b' } },
    [W.STONEWALL]: { name: '石墙', item: 'stoneWall', palette: { base: '#4b4a55', dark: '#36353f', light: '#5d5b67', detail: '#42414b' } },
    [W.BRICKWALL]: { name: '石砖墙', item: 'brickWall', palette: { base: '#4f4e59', dark: '#373641', light: '#61606b', detail: '#464550' } },
  };

  // ============================================================
  // OBJECTS
  // ============================================================
  const OBJECT_DEFS = {
    workbench: {
      name: '工作台', w: 2, h: 1, station: 'workbench', solid: false,
      drop: 'workbench', draw: 'workbench', sort: 1,
    },
    furnace: {
      name: '熔炉', w: 2, h: 2, station: 'furnace', light: 10, solid: false,
      drop: 'furnace', draw: 'furnace', animated: true, sort: 2,
    },
    anvil: {
      name: '铁砧', w: 2, h: 1, station: 'anvil', solid: false,
      drop: 'anvil', draw: 'anvil', sort: 1,
    },
    table: {
      name: '木桌', w: 2, h: 1, solid: false, drop: 'table', draw: 'table', furniture: true, sort: 1,
    },
    chair: {
      name: '木椅', w: 1, h: 2, solid: false, drop: 'chair', draw: 'chair', furniture: true, sort: 1,
    },
    door: {
      name: '木门', w: 1, h: 3, solid: true, door: true, interactive: true,
      drop: 'door', draw: 'door', sort: 2,
    },
    torch: {
      name: '火把', w: 1, h: 1, solid: false, light: 14, interactive: false,
      drop: 'torch', draw: 'torch', sort: 3,
    },
    campfire: {
      name: '营火', w: 2, h: 1, solid: false, light: 13, animated: true,
      drop: 'campfire', draw: 'campfire', sort: 2,
    },
  };

  // ============================================================
  // ITEMS
  // ============================================================
  const ITEMS = {
    copperPick: {
      name: '铜镐', kind: 'tool', tool: 'pick', tier: 1, power: 1.0, damage: 5,
      stack: 1, rarity: 0, icon: 'pick', color: '#c57a42',
      desc: '可以挖掘石头、铜与铁。',
    },
    ironPick: {
      name: '铁镐', kind: 'tool', tool: 'pick', tier: 2, power: 1.75, damage: 8,
      stack: 1, rarity: 1, icon: 'pick', color: '#d8d2c6',
      desc: '比铜镐更快，可以挖开金矿与宝石。',
    },
    goldPick: {
      name: '金镐', kind: 'tool', tool: 'pick', tier: 3, power: 2.6, damage: 11,
      stack: 1, rarity: 2, icon: 'pick', color: '#f0cb5a',
      desc: '锋利的金色镐头，无坚不摧。',
    },
    copperAxe: {
      name: '铜斧', kind: 'tool', tool: 'axe', tier: 1, power: 1.0, damage: 7,
      stack: 1, rarity: 0, icon: 'axe', color: '#c57a42',
      desc: '砍树获取木材。也可以当作笨拙的武器。',
    },
    ironAxe: {
      name: '铁斧', kind: 'tool', tool: 'axe', tier: 2, power: 1.8, damage: 12,
      stack: 1, rarity: 1, icon: 'axe', color: '#d8d2c6',
      desc: '砍树速度大幅提升，木屑纷飞。',
    },
    copperShortsword: {
      name: '铜短剑', kind: 'weapon', weapon: 'stab', damage: 9, useTime: 0.28,
      reach: 34, knockback: 90, stack: 1, rarity: 0, icon: 'sword', color: '#c57a42',
      desc: '短小迅捷的突刺武器，适合贴身战斗。',
    },
    woodSword: {
      name: '木剑', kind: 'weapon', weapon: 'swing', damage: 11, useTime: 0.36,
      reach: 48, knockback: 110, stack: 1, rarity: 0, icon: 'sword', color: '#9d6b3b',
      desc: '至少比赤手空拳强。挥砍范围更远。',
    },
    ironBroadsword: {
      name: '铁宽剑', kind: 'weapon', weapon: 'swing', damage: 23, useTime: 0.44,
      reach: 61, knockback: 150, stack: 1, rarity: 1, icon: 'sword', color: '#d8d2c6',
      desc: '沉重的铁刃，能击退大多数夜间生物。',
    },
    goldBroadsword: {
      name: '金宽剑', kind: 'weapon', weapon: 'swing', damage: 34, useTime: 0.39,
      reach: 67, knockback: 180, stack: 1, rarity: 2, icon: 'sword', color: '#f0cb5a',
      desc: '华而不实的金色巨刃——但确实很致命。',
    },
    woodBow: {
      name: '木弓', kind: 'weapon', weapon: 'bow', damage: 10, useTime: 0.58,
      reach: 400, stack: 1, rarity: 0, icon: 'bow', color: '#a87645', ammo: 'arrow',
      desc: '需要箭矢。按住左键可以向瞄准方向射击。',
    },
    gemStaff: {
      name: '紫晶法杖', kind: 'weapon', weapon: 'magic', damage: 27, useTime: 0.66,
      reach: 430, stack: 1, rarity: 2, icon: 'staff', color: '#b56be4',
      desc: '凝聚紫晶魔力，发射缓慢但穿透的魔法弹。',
    },
    arrow: {
      name: '木箭', kind: 'ammo', damage: 7, stack: 999, rarity: 0, icon: 'arrow',
      color: '#c49a62', desc: '细长的木箭，配合弓使用。',
    },
    torch: {
      name: '火把', kind: 'placeable', place: 'torch', stack: 999, rarity: 0, icon: 'torch',
      color: '#ffb84d', desc: '提供稳定的暖光。夜晚请务必随身携带。',
    },
    workbench: {
      name: '工作台', kind: 'placeable', place: 'workbench', stack: 99, rarity: 0, icon: 'bench',
      color: '#a67845', desc: '多数基础合成需要靠近工作台。',
    },
    furnace: {
      name: '熔炉', kind: 'placeable', place: 'furnace', stack: 99, rarity: 0, icon: 'furnace',
      color: '#8b8177', desc: '把矿石冶炼成金属锭。也会发出光亮。',
    },
    anvil: {
      name: '铁砧', kind: 'placeable', place: 'anvil', stack: 99, rarity: 1, icon: 'anvil',
      color: '#6c6a70', desc: '打造金属武器、工具与盔甲的核心工作台。',
    },
    table: {
      name: '木桌', kind: 'placeable', place: 'table', stack: 99, rarity: 0, icon: 'table',
      color: '#9b6a3d', desc: '一间像样的屋子应当有张桌子。',
    },
    chair: {
      name: '木椅', kind: 'placeable', place: 'chair', stack: 99, rarity: 0, icon: 'chair',
      color: '#9b6a3d', desc: '坐下来，听听夜晚的风。',
    },
    door: {
      name: '木门', kind: 'placeable', place: 'door', stack: 99, rarity: 0, icon: 'door',
      color: '#9b6a3d', desc: '右键开关。关上的门可以挡住僵尸。',
    },
    campfire: {
      name: '营火', kind: 'placeable', place: 'campfire', stack: 99, rarity: 0, icon: 'campfire',
      color: '#ff9b48', desc: '明亮的篝火，适合照亮营地。',
    },
    wood: {
      name: '木材', kind: 'block', block: T.PLANK, stack: 999, rarity: 0, icon: 'wood',
      color: '#9d6b3b', desc: '基础建材与合成材料。也可以放置成木板。',
    },
    dirt: {
      name: '泥土', kind: 'block', block: T.DIRT, stack: 999, rarity: 0, icon: 'dirt',
      color: '#7a4b2b', desc: '随处可见的泥土块。',
    },
    stone: {
      name: '石块', kind: 'block', block: T.STONE, stack: 999, rarity: 0, icon: 'stone',
      color: '#686873', desc: '坚固的石块，适合建造承重墙和熔炉。',
    },
    sand: {
      name: '沙块', kind: 'block', block: T.SAND, stack: 999, rarity: 0, icon: 'sand',
      color: '#c5a05e', desc: '干燥细碎的沙子。',
    },
    sandstone: {
      name: '砂岩', kind: 'block', block: T.SANDSTONE, stack: 999, rarity: 0, icon: 'sandstone',
      color: '#a98650', desc: '荒漠深处压实的岩层。',
    },
    snow: {
      name: '雪块', kind: 'block', block: T.SNOW, stack: 999, rarity: 0, icon: 'snow',
      color: '#dbe8ee', desc: '冰凉的积雪，踩上去悄无声息。',
    },
    stoneBrick: {
      name: '石砖', kind: 'block', block: T.STONEBRICK, stack: 999, rarity: 0, icon: 'brick',
      color: '#6d6c77', desc: '切割规整的石砖，适合建造体面的屋子。',
    },
    woodPlatform: {
      name: '木平台', kind: 'block', block: T.PLATFORM, stack: 999, rarity: 0, icon: 'platform',
      color: '#a06c3a', desc: '只能从上方站立，按 S + 空格可以跳下。',
    },
    copperOre: {
      name: '铜矿石', kind: 'material', stack: 999, rarity: 0, icon: 'oreCopper',
      color: '#c57a42', desc: '带着橙红色锈迹的矿石。放入熔炉可炼成铜锭。',
    },
    ironOre: {
      name: '铁矿石', kind: 'material', stack: 999, rarity: 0, icon: 'oreIron',
      color: '#cfc8ba', desc: '沉甸甸的灰色矿石。放入熔炉可炼成铁锭。',
    },
    goldOre: {
      name: '金矿石', kind: 'material', stack: 999, rarity: 1, icon: 'oreGold',
      color: '#f0cb5a', desc: '夹杂着金色碎屑的矿石。需要铁镐才能开采。',
    },
    gem: {
      name: '紫晶', kind: 'material', stack: 999, rarity: 2, icon: 'gem',
      color: '#c07bf4', desc: '在地底深处结晶的魔力矿石，散发着微光。',
    },
    heartCrystal: {
      name: '生命水晶', kind: 'consumable', use: 'heart', stack: 99, rarity: 2, icon: 'heartCrystal',
      color: '#ff8ca2', desc: '使用后永久增加 20 点生命上限。',
    },
    copperBar: {
      name: '铜锭', kind: 'material', stack: 999, rarity: 0, icon: 'barCopper',
      color: '#c57a42', desc: '精炼后的铜锭，可用于制作工具与武器。',
    },
    ironBar: {
      name: '铁锭', kind: 'material', stack: 999, rarity: 1, icon: 'barIron',
      color: '#d8d2c6', desc: '坚韧的铁锭，进阶装备的基础。',
    },
    goldBar: {
      name: '金锭', kind: 'material', stack: 999, rarity: 2, icon: 'barGold',
      color: '#f0cb5a', desc: '闪闪发光的金锭，稀有而华贵。',
    },
    gel: {
      name: '凝胶', kind: 'material', stack: 999, rarity: 0, icon: 'gel',
      color: '#76cb8d', desc: '史莱姆留下的黏稠凝胶，可以制作火把。',
    },
    lens: {
      name: '恶魔之眼', kind: 'material', stack: 999, rarity: 1, icon: 'lens',
      color: '#e8dcb4', desc: '还残留着微弱魔力跳动的眼球。',
    },
    woodWall: {
      name: '木墙', kind: 'wall', wall: W.WOOD, stack: 999, rarity: 0, icon: 'wallWood',
      color: '#6f4a2b', desc: '铺在背景层，让洞穴或房屋看起来更完整。',
    },
    stoneWall: {
      name: '石墙', kind: 'wall', wall: W.STONEWALL, stack: 999, rarity: 0, icon: 'wallStone',
      color: '#4b4a55', desc: '厚重的石质背景墙。',
    },
    brickWall: {
      name: '石砖墙', kind: 'wall', wall: W.BRICKWALL, stack: 999, rarity: 0, icon: 'wallBrick',
      color: '#4f4e59', desc: '整整齐齐的石砖背景墙。',
    },
    heart: {
      name: '生命之心', kind: 'consumable', use: 'heal', heal: 20, stack: 99, rarity: 1, icon: 'heart',
      color: '#e76a7c', desc: '立即恢复 20 点生命。击败敌人时偶尔会掉落。',
    },
  };

  // assign ids
  for (const key in ITEMS) ITEMS[key].id = key;

  // ============================================================
  // RECIPES
  // ============================================================
  const RECIPES = [
    // --- survival ---
    { out: ['workbench', 1], cost: [['wood', 10]], station: null, cat: '生存' },
    { out: ['torch', 4], cost: [['wood', 1], ['gel', 1]], station: null, cat: '生存' },
    { out: ['campfire', 1], cost: [['wood', 5], ['stone', 8]], station: 'workbench', cat: '生存' },
    { out: ['furnace', 1], cost: [['stone', 20], ['wood', 4], ['torch', 1]], station: 'workbench', cat: '生存' },
    { out: ['anvil', 1], cost: [['ironBar', 3]], station: 'workbench', cat: '生存' },

    // --- tools ---
    { out: ['copperPick', 1], cost: [['copperBar', 6], ['wood', 3]], station: 'workbench', cat: '工具' },
    { out: ['copperAxe', 1], cost: [['copperBar', 4], ['wood', 3]], station: 'workbench', cat: '工具' },
    { out: ['ironAxe', 1], cost: [['ironBar', 6], ['wood', 3]], station: 'anvil', cat: '工具' },
    { out: ['ironPick', 1], cost: [['ironBar', 8], ['wood', 3]], station: 'anvil', cat: '工具' },
    { out: ['goldPick', 1], cost: [['goldBar', 10], ['wood', 3]], station: 'anvil', cat: '工具' },

    // --- weapons ---
    { out: ['woodSword', 1], cost: [['wood', 7]], station: 'workbench', cat: '武器' },
    { out: ['ironBroadsword', 1], cost: [['ironBar', 7]], station: 'anvil', cat: '武器' },
    { out: ['goldBroadsword', 1], cost: [['goldBar', 8]], station: 'anvil', cat: '武器' },
    { out: ['woodBow', 1], cost: [['wood', 10]], station: 'workbench', cat: '武器' },
    { out: ['arrow', 15], cost: [['wood', 1], ['stone', 1]], station: 'workbench', cat: '武器' },
    { out: ['gemStaff', 1], cost: [['gem', 8], ['lens', 2], ['wood', 10]], station: 'anvil', cat: '武器' },

    // --- building ---
    { out: ['woodPlatform', 2], cost: [['wood', 1]], station: 'workbench', cat: '建筑' },
    { out: ['stoneBrick', 2], cost: [['stone', 2]], station: 'workbench', cat: '建筑' },
    { out: ['woodWall', 4], cost: [['wood', 1]], station: 'workbench', cat: '建筑' },
    { out: ['stoneWall', 4], cost: [['stone', 1]], station: 'workbench', cat: '建筑' },
    { out: ['brickWall', 4], cost: [['stoneBrick', 1]], station: 'workbench', cat: '建筑' },

    // --- furniture ---
    { out: ['table', 1], cost: [['wood', 8]], station: 'workbench', cat: '家具' },
    { out: ['chair', 1], cost: [['wood', 4]], station: 'workbench', cat: '家具' },
    { out: ['door', 1], cost: [['wood', 6]], station: 'workbench', cat: '家具' },

    // --- smelting ---
    { out: ['copperBar', 1], cost: [['copperOre', 2]], station: 'furnace', cat: '熔炼' },
    { out: ['ironBar', 1], cost: [['ironOre', 3]], station: 'furnace', cat: '熔炼' },
    { out: ['goldBar', 1], cost: [['goldOre', 3]], station: 'furnace', cat: '熔炼' },
  ];
  RECIPES.forEach((r, i) => { r.id = 'r' + i; });

  const STARTING_INVENTORY = [
    { id: 'copperPick', count: 1 },
    { id: 'copperAxe', count: 1 },
    { id: 'copperShortsword', count: 1 },
    { id: 'torch', count: 12 },
    null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null,
  ];

  // ============================================================
  // ENEMIES
  // ============================================================
  const ENEMY_DEFS = {
    slime: {
      name: '绿史莱姆', hp: 28, damage: 7, speed: 42, width: 24, height: 16,
      knockbackResist: 0.2, color: '#63b96d', loot: [['gel', 0.92, 1, 2], ['heart', 0.05, 1, 1]],
      xp: 1,
    },
    zombie: {
      name: '僵尸', hp: 48, damage: 11, speed: 52, width: 16, height: 38,
      knockbackResist: 0.48, color: '#7e9b5a', loot: [['gel', 0.35, 1, 1], ['heart', 0.08, 1, 1], ['lens', 0.04, 1, 1]],
      xp: 2, night: true,
    },
    demonEye: {
      name: '恶魔眼', hp: 38, damage: 9, speed: 78, width: 22, height: 16,
      fly: true, knockbackResist: 0.3, color: '#b95660', loot: [['lens', 0.7, 1, 1], ['gel', 0.45, 1, 1], ['heart', 0.05, 1, 1]],
      xp: 2, night: true,
    },
  };

  const BIOME_NAMES = ['森林', '荒漠', '雪原'];

  // ============================================================
  // ITEM ICON ART
  // ============================================================
  const ICON = 16;

  function px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function rock(ctx, colors) {
    px(ctx, 3, 5, 10, 9, colors.dark || '#4a4954');
    px(ctx, 4, 4, 8, 10, colors.base || '#686873');
    px(ctx, 5, 3, 6, 2, colors.light || '#85838c');
    px(ctx, 5, 4, 2, 2, colors.light || '#85838c');
    px(ctx, 4, 10, 2, 2, colors.dark || '#4a4954');
    px(ctx, 11, 8, 1, 3, colors.dark || '#4a4954');
    if (colors.accent) {
      px(ctx, 7, 6, 2, 2, colors.accent);
      px(ctx, 10, 9, 2, 2, colors.accent);
      px(ctx, 5, 9, 2, 1, colors.accent);
      if (colors.accent2) {
        px(ctx, 8, 6, 1, 1, colors.accent2);
        px(ctx, 11, 9, 1, 1, colors.accent2);
      }
    }
  }

  function blockIcon(ctx, pal) {
    px(ctx, 2, 2, 12, 12, pal.dark);
    px(ctx, 3, 3, 10, 10, pal.base);
    px(ctx, 3, 3, 10, 2, pal.light);
    px(ctx, 3, 3, 2, 10, pal.light);
    px(ctx, 4, 12, 9, 1, pal.dark);
    px(ctx, 12, 5, 1, 8, pal.dark);
    // speckles
    px(ctx, 6, 7, 2, 1, pal.detail);
    px(ctx, 9, 10, 1, 1, pal.detail);
    px(ctx, 5, 10, 1, 1, pal.light);
  }

  function drawTool(ctx, color, kind) {
    // handle
    px(ctx, 4, 10, 2, 2, '#5b3a1f');
    px(ctx, 5, 9, 2, 2, '#6d4827');
    px(ctx, 6, 8, 2, 2, '#7d552f');
    px(ctx, 7, 7, 2, 2, '#7d552f');
    px(ctx, 8, 6, 2, 2, '#6d4827');
    if (kind === 'pick') {
      px(ctx, 4, 3, 2, 2, color);
      px(ctx, 6, 2, 4, 2, color);
      px(ctx, 10, 3, 2, 2, color);
      px(ctx, 3, 4, 2, 2, color);
      px(ctx, 11, 4, 2, 2, color);
      px(ctx, 4, 3, 1, 1, '#f1d7a0');
    } else {
      // axe head
      px(ctx, 5, 2, 4, 2, '#b8b4aa');
      px(ctx, 4, 3, 6, 4, color);
      px(ctx, 3, 4, 2, 3, color);
      px(ctx, 9, 4, 2, 3, '#8d8980');
      px(ctx, 4, 3, 4, 1, '#f0dca8');
    }
    px(ctx, 10, 13, 2, 1, '#4d321b');
  }

  function drawSword(ctx, color) {
    px(ctx, 10, 2, 2, 2, '#f2e7c4');
    px(ctx, 9, 3, 2, 2, '#e8d9b3');
    px(ctx, 8, 4, 2, 2, '#d9c9a3');
    px(ctx, 7, 5, 2, 2, color);
    px(ctx, 6, 6, 2, 2, color);
    px(ctx, 5, 7, 2, 2, color);
    px(ctx, 10, 3, 1, 1, '#ffffff');
    px(ctx, 4, 8, 4, 2, '#5a3a1e');
    px(ctx, 3, 9, 4, 2, '#8f6a37');
    px(ctx, 2, 10, 3, 2, '#5a3a1e');
    px(ctx, 4, 7, 2, 1, '#e8c76d');
  }

  function drawBow(ctx, color) {
    // curved wooden limbs, seen from the side
    const limb = [
      [9, 2], [10, 2], [10, 3], [11, 4], [11, 5], [12, 6], [12, 7],
      [12, 8], [11, 9], [11, 10], [10, 11], [10, 12], [9, 12],
    ];
    for (const [x, y] of limb) px(ctx, x, y, 2, 1, '#5b3a1f');
    for (const [x, y] of limb) px(ctx, x, y, 1, 1, color);
    px(ctx, 9, 2, 1, 1, '#e0c28c');
    px(ctx, 9, 12, 1, 1, '#e0c28c');
    // string pulled toward the archer
    ctx.strokeStyle = '#d9d0b0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(9, 3);
    ctx.lineTo(5, 8);
    ctx.lineTo(9, 12);
    ctx.stroke();
    // nocked arrow
    px(ctx, 3, 12, 2, 2, '#5b3a1f');
    px(ctx, 4, 11, 3, 2, '#b7a37a');
    px(ctx, 6, 10, 4, 2, '#d9c9a3');
    px(ctx, 9, 8, 3, 2, '#e8dfc5');
    px(ctx, 12, 6, 2, 2, '#f2ecd9');
    px(ctx, 11, 4, 2, 1, '#c7c0ac');
    px(ctx, 3, 11, 1, 1, '#8e6b3d');
    px(ctx, 3, 14, 1, 1, '#8e6b3d');
    px(ctx, 5, 12, 1, 1, '#cdb68f');
  }

  function drawStaff(ctx, color) {
    px(ctx, 4, 12, 2, 2, '#5b3a1f');
    px(ctx, 5, 10, 2, 2, '#79512b');
    px(ctx, 6, 8, 2, 2, '#79512b');
    px(ctx, 7, 6, 2, 2, '#5b3a1f');
    // crystal
    px(ctx, 8, 1, 3, 2, color);
    px(ctx, 7, 2, 5, 4, color);
    px(ctx, 8, 3, 3, 3, '#e2b4ff');
    px(ctx, 9, 4, 1, 1, '#ffffff');
    px(ctx, 7, 3, 1, 1, '#d391ff');
    px(ctx, 6, 4, 1, 2, '#8e47bb');
  }

  function drawBlockItem(ctx, id, pal) {
    if (id === 'stoneBrick' || id === 'brick') {
      const p = TILE_DEFS[T.STONEBRICK].palette;
      px(ctx, 2, 2, 12, 12, p.dark);
      px(ctx, 3, 3, 10, 10, p.base);
      px(ctx, 3, 3, 10, 1, p.light);
      px(ctx, 3, 3, 1, 10, p.light);
      // brick lines
      px(ctx, 3, 7, 10, 1, p.dark);
      px(ctx, 7, 3, 1, 4, p.dark);
      px(ctx, 10, 8, 1, 5, p.dark);
      return;
    }
    blockIcon(ctx, pal || TILE_DEFS[T.DIRT].palette);
  }

  function drawFurniture(ctx, kind) {
    if (kind === 'bench') {
      px(ctx, 2, 6, 13, 3, '#8b5b2f');
      px(ctx, 1, 5, 14, 2, '#b57f45');
      px(ctx, 1, 5, 14, 1, '#d09a5c');
      px(ctx, 3, 9, 2, 5, '#664222');
      px(ctx, 12, 9, 2, 5, '#664222');
      px(ctx, 6, 9, 1, 3, '#5a3a1e');
      px(ctx, 10, 7, 4, 1, '#d9d3c4');
      px(ctx, 11, 7, 1, 1, '#edf0e2');
    } else if (kind === 'furnace') {
      px(ctx, 2, 3, 12, 12, '#45434a');
      px(ctx, 3, 4, 10, 10, '#68666f');
      px(ctx, 3, 4, 10, 1, '#86848c');
      px(ctx, 5, 8, 6, 5, '#2a1d18');
      px(ctx, 6, 9, 4, 4, '#e9782e');
      px(ctx, 7, 9, 2, 2, '#ffd36b');
      px(ctx, 7, 2, 2, 2, '#59575f');
      px(ctx, 10, 1, 1, 2, '#8e8a90');
    } else if (kind === 'anvil') {
      px(ctx, 3, 4, 10, 3, '#6f6e78');
      px(ctx, 2, 3, 5, 2, '#56555f');
      px(ctx, 11, 3, 3, 2, '#484750');
      px(ctx, 4, 4, 8, 1, '#a09daa');
      px(ctx, 7, 7, 3, 4, '#4d4c55');
      px(ctx, 5, 11, 7, 3, '#5d5c66');
      px(ctx, 5, 13, 7, 1, '#393842');
    } else if (kind === 'table') {
      px(ctx, 2, 5, 12, 2, '#b57f45');
      px(ctx, 2, 5, 12, 1, '#d09a5c');
      px(ctx, 3, 7, 2, 7, '#6b4525');
      px(ctx, 11, 7, 2, 7, '#6b4525');
      px(ctx, 5, 7, 1, 4, '#8b5b2f');
    } else if (kind === 'chair') {
      px(ctx, 4, 2, 2, 10, '#8b5b2f');
      px(ctx, 4, 2, 2, 1, '#c08a50');
      px(ctx, 4, 7, 8, 2, '#a5733d');
      px(ctx, 6, 9, 2, 5, '#6b4525');
      px(ctx, 11, 9, 2, 5, '#6b4525');
      px(ctx, 10, 9, 1, 3, '#8b5b2f');
    } else if (kind === 'door') {
      px(ctx, 3, 1, 10, 14, '#5e3b20');
      px(ctx, 4, 2, 8, 12, '#9a6a39');
      px(ctx, 4, 2, 8, 1, '#b9854b');
      px(ctx, 4, 7, 8, 1, '#76502c');
      px(ctx, 7, 3, 1, 4, '#7b512b');
      px(ctx, 10, 8, 1, 1, '#e5c76f');
    } else if (kind === 'campfire') {
      px(ctx, 2, 11, 12, 2, '#5b3d26');
      px(ctx, 4, 10, 8, 1, '#7a5333');
      px(ctx, 5, 7, 2, 5, '#8a5029');
      px(ctx, 9, 6, 2, 6, '#75411f');
      px(ctx, 7, 4, 3, 6, '#ff8c3b');
      px(ctx, 7, 5, 2, 3, '#ffd168');
      px(ctx, 8, 2, 1, 2, '#ffb04a');
    }
  }

  function drawItemIcon(ctx, id, s = 16) {
    const item = ITEMS[id];
    ctx.save();
    ctx.clearRect(0, 0, s, s);
    if (!item) { ctx.restore(); return; }
    ctx.scale(s / ICON, s / ICON);
    ctx.imageSmoothingEnabled = false;
    const kind = item.icon;
    const color = item.color || '#ccc';

    if (kind === 'pick' || kind === 'axe') drawTool(ctx, color, kind);
    else if (kind === 'sword') drawSword(ctx, color);
    else if (kind === 'bow') drawBow(ctx, color);
    else if (kind === 'staff') drawStaff(ctx, color);
    else if (kind === 'arrow') {
      px(ctx, 3, 12, 2, 2, '#b7a37a');
      px(ctx, 4, 11, 2, 2, '#d9c9a3');
      px(ctx, 6, 9, 2, 2, '#e6dcc0');
      px(ctx, 8, 7, 2, 2, '#f1e9d0');
      px(ctx, 10, 4, 3, 2, '#d8d2c6');
      px(ctx, 12, 3, 2, 1, '#f4f0df');
      px(ctx, 6, 4, 2, 6, '#b7a37a');
      px(ctx, 5, 3, 1, 3, '#8e6b3d');
      px(ctx, 9, 3, 1, 3, '#8e6b3d');
    } else if (kind === 'torch') {
      px(ctx, 7, 8, 2, 6, '#7d512b');
      px(ctx, 7, 12, 2, 1, '#57381e');
      px(ctx, 6, 4, 4, 4, '#ff8e3c');
      px(ctx, 7, 2, 2, 4, '#ffd168');
      px(ctx, 7, 5, 2, 2, '#fff4b5');
      px(ctx, 5, 5, 1, 2, '#e36e2d');
      px(ctx, 10, 5, 1, 2, '#e36e2d');
    } else if (kind === 'bench' || kind === 'furnace' || kind === 'anvil' || kind === 'table' || kind === 'chair' || kind === 'door' || kind === 'campfire') {
      drawFurniture(ctx, kind);
    } else if (kind === 'wood') {
      px(ctx, 2, 7, 12, 7, '#6b4525');
      px(ctx, 3, 6, 11, 6, '#9a693a');
      px(ctx, 4, 7, 9, 1, '#c08a50');
      px(ctx, 3, 9, 11, 1, '#7d5029');
      px(ctx, 2, 12, 12, 2, '#5a371d');
      px(ctx, 8, 4, 5, 4, '#8b5b2f');
      px(ctx, 9, 3, 3, 4, '#b57f45');
      px(ctx, 10, 4, 1, 1, '#d7ab6d');
    } else if (kind === 'dirt') {
      drawBlockItem(ctx, 'dirt', TILE_DEFS[T.DIRT].palette);
    } else if (kind === 'stone') {
      drawBlockItem(ctx, 'stone', TILE_DEFS[T.STONE].palette);
    } else if (kind === 'sand') {
      drawBlockItem(ctx, 'sand', TILE_DEFS[T.SAND].palette);
    } else if (kind === 'sandstone') {
      drawBlockItem(ctx, 'sandstone', TILE_DEFS[T.SANDSTONE].palette);
    } else if (kind === 'snow') {
      drawBlockItem(ctx, 'snow', TILE_DEFS[T.SNOW].palette);
    } else if (kind === 'brick') {
      drawBlockItem(ctx, 'stoneBrick', TILE_DEFS[T.STONEBRICK].palette);
    } else if (kind === 'platform') {
      px(ctx, 1, 6, 14, 3, '#704826');
      px(ctx, 1, 6, 14, 2, '#a06c3a');
      px(ctx, 1, 6, 14, 1, '#c18a4f');
      px(ctx, 3, 9, 2, 2, '#5e3c20');
      px(ctx, 11, 9, 2, 2, '#5e3c20');
      px(ctx, 5, 6, 1, 1, '#d09a5c');
      px(ctx, 9, 6, 1, 1, '#d09a5c');
    } else if (kind.startsWith('ore')) {
      const p = TILE_DEFS[kind === 'oreCopper' ? T.COPPER : kind === 'oreIron' ? T.IRON : T.GOLD].palette;
      rock(ctx, p);
    } else if (kind.startsWith('bar')) {
      const col = kind === 'barCopper' ? '#c57a42' : kind === 'barIron' ? '#d8d2c6' : '#e8c253';
      px(ctx, 3, 8, 11, 5, '#6b4a2c');
      px(ctx, 3, 7, 10, 5, col);
      px(ctx, 3, 7, 10, 2, '#fff1c9');
      px(ctx, 3, 11, 10, 1, '#6e5e50');
      px(ctx, 5, 6, 8, 2, col);
      px(ctx, 5, 6, 7, 1, '#fff9e2');
    } else if (kind === 'gem') {
      px(ctx, 7, 2, 2, 2, '#e4b4ff');
      px(ctx, 5, 4, 6, 3, '#b46be0');
      px(ctx, 4, 7, 8, 5, '#9149bc');
      px(ctx, 6, 8, 2, 2, '#e0acff');
      px(ctx, 7, 3, 1, 1, '#ffffff');
      px(ctx, 11, 8, 1, 2, '#6e2e91');
    } else if (kind === 'heartCrystal') {
      px(ctx, 6, 2, 2, 3, '#ffadbd');
      px(ctx, 4, 5, 6, 4, '#dc6176');
      px(ctx, 7, 9, 3, 3, '#c24a63');
      px(ctx, 5, 10, 3, 2, '#9c3550');
      px(ctx, 6, 4, 1, 1, '#fff0f4');
      px(ctx, 3, 11, 10, 2, '#514e5a');
    } else if (kind === 'gel') {
      px(ctx, 4, 5, 8, 8, '#5fae76');
      px(ctx, 5, 4, 6, 7, '#7fce94');
      px(ctx, 6, 5, 2, 2, '#c4f3cd');
      px(ctx, 3, 9, 1, 3, '#4f9163');
      px(ctx, 12, 8, 1, 2, '#4f9163');
    } else if (kind === 'lens') {
      px(ctx, 5, 4, 6, 7, '#d8cfb0');
      px(ctx, 6, 3, 5, 2, '#e8dfc5');
      px(ctx, 7, 6, 3, 3, '#8f5960');
      px(ctx, 8, 7, 1, 1, '#3b1d22');
      px(ctx, 5, 10, 2, 1, '#b3a88b');
      px(ctx, 10, 9, 1, 1, '#a2333f');
    } else if (kind === 'heart') {
      px(ctx, 4, 4, 8, 3, '#cf4258');
      px(ctx, 3, 6, 10, 4, '#e75f72');
      px(ctx, 4, 9, 8, 3, '#cf4258');
      px(ctx, 6, 11, 4, 2, '#b7364d');
      px(ctx, 7, 12, 2, 1, '#902639');
      px(ctx, 5, 5, 2, 2, '#ffb5c0');
    } else if (kind === 'wallWood' || kind === 'wallStone' || kind === 'wallBrick') {
      const pal = kind === 'wallWood' ? WALL_DEFS[W.WOOD].palette : kind === 'wallStone' ? WALL_DEFS[W.STONEWALL].palette : WALL_DEFS[W.BRICKWALL].palette;
      px(ctx, 2, 2, 12, 12, pal.dark);
      px(ctx, 3, 3, 10, 10, pal.base);
      if (kind === 'wallWood') {
        px(ctx, 3, 5, 10, 1, pal.dark);
        px(ctx, 3, 9, 10, 1, pal.dark);
        px(ctx, 7, 3, 1, 10, pal.dark);
      } else {
        px(ctx, 3, 7, 10, 1, pal.dark);
        px(ctx, 7, 3, 1, 4, pal.dark);
        px(ctx, 10, 8, 1, 5, pal.dark);
      }
      px(ctx, 2, 2, 12, 1, pal.light);
    } else {
      rock(ctx, TILE_DEFS[T.STONE].palette);
    }
    ctx.restore();
  }

  function itemIconCanvas(id, size = 32) {
    const c = U.makeCanvas(size, size);
    drawItemIcon(U.ctx2d(c), id, size);
    return c;
  }

  function tileDrop(tileId) {
    const d = TILE_DEFS[tileId];
    if (!d || !d.drop) return null;
    return { id: d.drop, count: d.dropCount || 1 };
  }

  TF.T = T;
  TF.W = W;
  TF.TILE_DEFS = TILE_DEFS;
  TF.WALL_DEFS = WALL_DEFS;
  TF.OBJECT_DEFS = OBJECT_DEFS;
  TF.ITEMS = ITEMS;
  TF.RECIPES = RECIPES;
  TF.STARTING_INVENTORY = STARTING_INVENTORY;
  TF.ENEMY_DEFS = ENEMY_DEFS;
  TF.BIOME_NAMES = BIOME_NAMES;
  TF.SOLID = SOLID;
  TF.PLATFORM = PLATFORM;
  TF.drawItemIcon = drawItemIcon;
  TF.itemIconCanvas = itemIconCanvas;
  TF.tileDrop = tileDrop;
  TF.getItem = id => ITEMS[id] || null;
  TF.RARITY_COLORS = ['#e9e3cf', '#79b5dd', '#88d47b', '#e9bd62', '#e3735e', '#c88be8'];
})();
