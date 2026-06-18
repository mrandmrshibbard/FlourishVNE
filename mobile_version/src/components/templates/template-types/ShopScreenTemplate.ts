/**
 * Shop Screen Template for FlourishVNE
 * 
 * Purpose: Pre-built template for creating in-game shop/store systems
 * Features: Item browsing, currency system, purchase transactions, inventory integration
 * 
 * User Story: US1 - Simplified Visual Novel Template Creation
 * Task: T021
 */

import { Template, TemplateConfig, TemplatePreview, CustomizationBounds, TemplateLayoutConfig, TemplateItemConfig } from '../../../types/template';
import { VNUIScreen } from '../../../features/ui/types';
import { VNID } from '../../../types';

/**
 * Shop Screen specific configuration
 */
export interface ShopScreenConfig extends TemplateConfig {
  // Shop information
  shopInfo: {
    name: string;
    description: string;
    keeper?: {
      name: string;
      greeting: string;
      characterId?: VNID;
    };
  };
  
  // Currency system
  currency: {
    name: string; // e.g., "Gold", "Coins", "Credits"
    symbol: string; // e.g., "$", "₡", "💰"
    variableName: string; // Variable tracking player currency
  };
  
  // Shop inventory
  items: (TemplateItemConfig & {
    stock?: number; // -1 for unlimited
    requirements?: {
      level?: number;
      questComplete?: string;
      itemOwned?: string;
    };
    discount?: number; // Percentage discount (0-100)
    bundle?: {
      items: string[]; // Item IDs included in bundle
      savingsPercent: number;
    };
  })[];
  
  // Item categories/tabs
  categories?: {
    id: string;
    name: string;
    icon: string;
    filter: (item: TemplateItemConfig) => boolean;
  }[];
  
  // Shop features
  features: {
    showStock: boolean;
    allowSellback: boolean; // Can sell items back to shop
    sellbackPercent: number; // % of original price when selling
    showDiscount: boolean;
    confirmPurchase: boolean;
    bulkPurchase: boolean; // Allow buying multiple at once
    wishlist: boolean; // Save items for later
  };
  
  // UI customization
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    priceTag: string;
    soldOut: string;
    discount: string;
  };
  
  layout: TemplateLayoutConfig & {
    viewMode: 'grid' | 'list' | 'table';
    itemsPerPage: number;
    showCategories: boolean;
    sortOptions: ('price-asc' | 'price-desc' | 'name' | 'rarity' | 'newest')[];
  };
  
  // Transaction messages
  messages: {
    purchaseSuccess: string;
    purchaseFailed: string;
    insufficientFunds: string;
    soldOut: string;
    sellSuccess: string;
  };
  
  // Output configuration
  output: {
    inventoryVariable: string; // Variable storing player inventory
    transactionHistory: string; // Variable tracking purchase history
  };
}

/**
 * Default configuration for Shop Screen template
 */
export const defaultShopScreenConfig: ShopScreenConfig = {
  shopInfo: {
    name: 'The Trading Post',
    description: 'Your one-stop shop for adventure supplies',
    keeper: {
      name: 'Marcus',
      greeting: 'Welcome, traveler! Take a look at my wares.'
    }
  },
  
  currency: {
    name: 'Gold',
    symbol: '💰',
    variableName: 'playerGold'
  },
  
  items: [
    // Consumables
    { id: 'health_potion', name: 'Health Potion', price: 50, category: 'consumables', rarity: 'common', 
      description: 'Restores 50 HP', stock: -1 },
    { id: 'mana_potion', name: 'Mana Potion', price: 60, category: 'consumables', rarity: 'common', 
      description: 'Restores 30 MP', stock: -1 },
    { id: 'elixir', name: 'Full Elixir', price: 200, category: 'consumables', rarity: 'rare', 
      description: 'Fully restores HP and MP', stock: 5 },
    
    // Equipment
    { id: 'iron_sword', name: 'Iron Sword', price: 300, category: 'weapons', rarity: 'common', 
      description: 'A sturdy iron blade (+5 Attack)', stock: 3 },
    { id: 'steel_shield', name: 'Steel Shield', price: 250, category: 'armor', rarity: 'uncommon', 
      description: 'Reliable defensive equipment (+8 Defense)', stock: 2 },
    { id: 'leather_boots', name: 'Leather Boots', price: 180, category: 'armor', rarity: 'common', 
      description: 'Comfortable footwear (+3 Speed)', stock: 5 },
    
    // Special items
    { id: 'treasure_map', name: 'Treasure Map', price: 500, category: 'special', rarity: 'rare', 
      description: 'Reveals hidden treasure location', stock: 1, 
      requirements: { level: 10 } },
    { id: 'starter_bundle', name: 'Adventurer\'s Bundle', price: 400, category: 'bundles', rarity: 'common',
      description: 'Essential items for new adventurers', 
      bundle: { items: ['health_potion', 'health_potion', 'iron_sword'], savingsPercent: 20 },
      stock: -1 }
  ],
  
  categories: [
    { id: 'all', name: 'All Items', icon: '🏪', filter: () => true },
    { id: 'consumables', name: 'Consumables', icon: '🧪', filter: (item) => item.category === 'consumables' },
    { id: 'equipment', name: 'Equipment', icon: '⚔️', filter: (item) => ['weapons', 'armor'].includes(item.category) },
    { id: 'special', name: 'Special', icon: '✨', filter: (item) => item.category === 'special' }
  ],
  
  features: {
    showStock: true,
    allowSellback: true,
    sellbackPercent: 50,
    showDiscount: true,
    confirmPurchase: true,
    bulkPurchase: true,
    wishlist: true
  },
  
  colors: {
    primary: '#2ECC71',
    secondary: '#27AE60',
    accent: '#F39C12',
    background: '#ECF0F1',
    text: '#2C3E50',
    priceTag: '#E67E22',
    soldOut: '#95A5A6',
    discount: '#E74C3C'
  },
  
  layout: {
    columns: 3,
    spacing: 'normal',
    alignment: 'left',
    responsive: true,
    viewMode: 'grid',
    itemsPerPage: 12,
    showCategories: true,
    sortOptions: ['name', 'price-asc', 'price-desc', 'rarity']
  },
  
  messages: {
    purchaseSuccess: 'Purchase successful!',
    purchaseFailed: 'Purchase failed.',
    insufficientFunds: 'You don\'t have enough gold.',
    soldOut: 'This item is sold out.',
    sellSuccess: 'Item sold successfully.'
  },
  
  output: {
    inventoryVariable: 'playerInventory',
    transactionHistory: 'shopTransactions'
  }
};

/**
 * Customization bounds for Shop Screen template
 */
export const shopScreenCustomizationBounds: CustomizationBounds = {
  allowStructureChanges: false,
  allowNewComponents: true,
  allowVariableModification: true,
  allowLogicChanges: true,
  maxItems: 200,
  requiredFields: ['shopInfo', 'currency', 'items', 'features', 'output'],
  lockedComponents: ['transaction-processor', 'inventory-manager']
};

/**
 * Preview information for Shop Screen template
 */
export const shopScreenPreview: TemplatePreview = {
  features: [
    'Customizable shop with name and keeper dialogue',
    'Flexible currency system (gold, coins, credits, etc.)',
    'Item categories and filtering',
    'Stock management (limited or unlimited)',
    'Purchase requirements (level, quest completion)',
    'Discount and bundle systems',
    'Sellback functionality',
    'Bulk purchasing',
    'Wishlist feature',
    'Transaction history tracking',
    'Multiple view modes (grid, list, table)',
    'Sort options (price, name, rarity)'
  ],
  estimatedTime: 7,
  complexity: 'beginner'
};

/**
 * UI generator function for Shop Screen template
 */
export function generateShopScreenUI(config: TemplateConfig): VNUIScreen[] {
  const typedConfig = config as unknown as ShopScreenConfig;
  
  const screen: VNUIScreen = {
    id: `shop_screen_${Date.now()}` as VNID,
    name: typedConfig.shopInfo.name,
    background: { type: 'color', value: typedConfig.colors.background },
    music: { audioId: null, policy: 'continue' },
    ambientNoise: { audioId: null, policy: 'continue' },
    elements: {},
    showDialogue: true
  };
  
  return [screen];
}

/**
 * Shop Screen Template Definition
 */
export const ShopScreenTemplate: Template = {
  id: 'template_shop_screen' as VNID,
  name: 'Shop Screen',
  description: 'Create a functional in-game shop with currency, inventory, transactions, and item management',
  category: 'shop-system',
  state: 'published',
  configSchema: {
    type: 'object',
    properties: {
      shopInfo: { type: 'object' },
      currency: { type: 'object' },
      items: { type: 'array' },
      categories: { type: 'array' },
      features: { type: 'object' },
      colors: { type: 'object' },
      layout: { type: 'object' },
      messages: { type: 'object' },
      output: { type: 'object' }
    },
    required: ['shopInfo', 'currency', 'items', 'features', 'output']
  },
  defaultConfig: defaultShopScreenConfig,
  uiGenerator: generateShopScreenUI,
  previewImage: '/templates/shop-screen-preview.png',
  preview: shopScreenPreview,
  tags: ['shop', 'store', 'commerce', 'inventory', 'currency', 'rpg'],
  version: '1.0.0',
  customizationLimits: shopScreenCustomizationBounds,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  author: 'FlourishVNE',
  isUserTemplate: false,
  usageCount: 0,
  rating: 4.9
};

export default ShopScreenTemplate;
