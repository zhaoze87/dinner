import { v4 as uuid } from 'uuid';
import { WEIGHT_RULES } from './engine.js';

export const STARTER_MENUS = [
  { emoji: '🍖', name: '红烧肉', category: '硬菜', desc: '肥瘦相间，入口即化' },
  { emoji: '🍗', name: '宫保鸡丁', category: '硬菜', desc: '荔枝味，花生 crunch' },
  { emoji: '🥘', name: '麻婆豆腐', category: '下饭', desc: '麻辣鲜香，一碗白饭不够' },
  { emoji: '🥚', name: '番茄炒蛋', category: '家常', desc: '永远不会错的选择' },
  { emoji: '🐟', name: '酸菜鱼', category: '汤菜', desc: '酸辣开胃，适合分享' },
  { emoji: '🍜', name: '兰州拉面', category: '主食', desc: '一清二白三红四绿五黄' },
  { emoji: '🍲', name: '重庆火锅', category: '聚餐', desc: '团建杀手锏' },
  { emoji: '🍛', name: '黄焖鸡米饭', category: '主食', desc: '快、香、能喂饱一桌' },
  { emoji: '🥟', name: '猪肉白菜饺', category: '主食', desc: '一口一个，安静吃饭' },
  { emoji: '🥗', name: '凉皮', category: '小吃', desc: '夏天的正确答案' },
];

export function createStarterMenus() {
  return STARTER_MENUS.map((item) => ({
    id: uuid(),
    ...item,
    baseWeight: WEIGHT_RULES.BASE_WEIGHT,
    createdAt: Date.now(),
  }));
}

export function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
