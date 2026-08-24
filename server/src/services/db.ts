import fs from 'fs';
import path from 'path';
import { UserPreferences, FavoriteItem, IngredientIdea, SavedShop } from '../types.js';
import { DEFAULT_INGREDIENT_IDEAS } from './catalogData.js';

interface DatabaseSchema {
  preferences: UserPreferences;
  history: SavedShop[];
  favorites: FavoriteItem[];
  ingredientIdeas: IngredientIdea[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'trolleywise_db.json');

const INITIAL_PREFERENCES: UserPreferences = {
  healthierDefault: true,
  fatPercentagePreference: 5,
  preferWholewheat: true,
  preferFreeRange: true,
  preferOrganic: false,
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland'],
};

export class DatabaseService {
  private static data: DatabaseSchema;

  public static init(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.data = {
          preferences: INITIAL_PREFERENCES,
          history: [],
          favorites: [],
          ingredientIdeas: DEFAULT_INGREDIENT_IDEAS,
        };
        this.save();
      }
    } catch (err) {
      console.error('Error initializing database, using defaults:', err);
      this.data = {
        preferences: INITIAL_PREFERENCES,
        history: [],
        favorites: [],
        ingredientIdeas: DEFAULT_INGREDIENT_IDEAS,
      };
    }
  }

  private static save(): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }

  // Preferences
  public static getPreferences(): UserPreferences {
    return this.data?.preferences || INITIAL_PREFERENCES;
  }

  public static updatePreferences(prefs: Partial<UserPreferences>): UserPreferences {
    this.data.preferences = { ...this.data.preferences, ...prefs };
    this.save();
    return this.data.preferences;
  }

  // History / Archives
  public static getHistory(): SavedShop[] {
    return this.data?.history || [];
  }

  public static addHistoryShop(shop: Omit<SavedShop, 'id' | 'createdAt'>): SavedShop {
    const newShop: SavedShop = {
      ...shop,
      id: `shop-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.history.unshift(newShop);
    // Keep last 100 shops
    if (this.data.history.length > 100) {
      this.data.history = this.data.history.slice(0, 100);
    }
    this.save();
    return newShop;
  }

  public static deleteHistoryShop(id: string): boolean {
    const initialLen = this.data.history.length;
    this.data.history = this.data.history.filter(s => s.id !== id);
    if (this.data.history.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Favorites
  public static getFavorites(): FavoriteItem[] {
    return this.data?.favorites || [];
  }

  public static addFavorite(fav: Omit<FavoriteItem, 'id' | 'createdAt'>): FavoriteItem {
    const newFav: FavoriteItem = {
      ...fav,
      id: `fav-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.favorites.push(newFav);
    this.save();
    return newFav;
  }

  public static removeFavorite(id: string): boolean {
    const initialLen = this.data.favorites.length;
    this.data.favorites = this.data.favorites.filter(f => f.id !== id);
    if (this.data.favorites.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Ingredient Ideas ("Word Window")
  public static getIngredientIdeas(): IngredientIdea[] {
    return this.data?.ingredientIdeas || DEFAULT_INGREDIENT_IDEAS;
  }

  public static addIngredientIdea(idea: Omit<IngredientIdea, 'id'>): IngredientIdea {
    const newIdea: IngredientIdea = {
      ...idea,
      id: `idea-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    this.data.ingredientIdeas.push(newIdea);
    this.save();
    return newIdea;
  }

  public static removeIngredientIdea(id: string): boolean {
    const initialLen = this.data.ingredientIdeas.length;
    this.data.ingredientIdeas = this.data.ingredientIdeas.filter(i => i.id !== id);
    if (this.data.ingredientIdeas.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }
}
