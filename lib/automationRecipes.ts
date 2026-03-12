import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export type TriggerType = 'schedule' | 'keyword' | 'entity_created';

export interface ScheduleTriggerConfig {
  intervalMinutes?: number;
  dailyAtTime?: string;
  weekdays?: number[];
}

export interface KeywordTriggerConfig {
  keyword: string;
  caseSensitive?: boolean;
}

export interface EntityCreatedTriggerConfig {
  entityType: 'task' | 'memory' | 'event' | 'contact';
}

export type TriggerConfig = ScheduleTriggerConfig | KeywordTriggerConfig | EntityCreatedTriggerConfig;

export interface RecipeTrigger {
  type: TriggerType;
  config: TriggerConfig;
}

export type ActionType = 'send_chat' | 'create_task' | 'create_memory' | 'notify' | 'gateway_command';

export interface SendChatActionConfig {
  message: string;
  sessionKey?: string;
}

export interface CreateTaskActionConfig {
  title: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  description?: string;
}

export interface CreateMemoryActionConfig {
  title: string;
  content: string;
  type?: 'note' | 'summary' | 'document';
  tags?: string[];
}

export interface NotifyActionConfig {
  title: string;
  body: string;
}

export interface GatewayCommandActionConfig {
  command: string;
  args?: Record<string, string>;
}

export type ActionConfig =
  | SendChatActionConfig
  | CreateTaskActionConfig
  | CreateMemoryActionConfig
  | NotifyActionConfig
  | GatewayCommandActionConfig;

export interface RecipeAction {
  type: ActionType;
  config: ActionConfig;
}

export interface AutomationRecipe {
  id: string;
  name: string;
  trigger: RecipeTrigger;
  actions: RecipeAction[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRun?: number;
  runCount: number;
}

const STORAGE_KEY = '@clawbase:automation_recipes';

async function loadRecipes(): Promise<AutomationRecipe[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[automationRecipes] Failed to load recipes:', e);
    return [];
  }
}

async function saveRecipes(recipes: AutomationRecipe[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

export async function getAllRecipes(): Promise<AutomationRecipe[]> {
  return loadRecipes();
}

export async function getRecipe(id: string): Promise<AutomationRecipe | null> {
  const recipes = await loadRecipes();
  return recipes.find((r) => r.id === id) || null;
}

export async function createRecipe(
  name: string,
  trigger: RecipeTrigger,
  actions: RecipeAction[],
): Promise<AutomationRecipe> {
  const recipes = await loadRecipes();
  const now = Date.now();
  const recipe: AutomationRecipe = {
    id: Crypto.randomUUID(),
    name,
    trigger,
    actions,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    runCount: 0,
  };
  recipes.push(recipe);
  await saveRecipes(recipes);
  return recipe;
}

export async function updateRecipe(
  id: string,
  updates: Partial<Omit<AutomationRecipe, 'id' | 'createdAt'>>,
): Promise<AutomationRecipe | null> {
  const recipes = await loadRecipes();
  const idx = recipes.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  recipes[idx] = { ...recipes[idx], ...updates, updatedAt: Date.now() };
  await saveRecipes(recipes);
  return recipes[idx];
}

export async function toggleRecipe(id: string): Promise<AutomationRecipe | null> {
  const recipes = await loadRecipes();
  const idx = recipes.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  recipes[idx] = { ...recipes[idx], enabled: !recipes[idx].enabled, updatedAt: Date.now() };
  await saveRecipes(recipes);
  return recipes[idx];
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const recipes = await loadRecipes();
  const filtered = recipes.filter((r) => r.id !== id);
  if (filtered.length === recipes.length) return false;
  await saveRecipes(filtered);
  return true;
}

export async function recordRun(id: string): Promise<AutomationRecipe | null> {
  const recipes = await loadRecipes();
  const idx = recipes.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  recipes[idx] = {
    ...recipes[idx],
    lastRun: Date.now(),
    runCount: recipes[idx].runCount + 1,
    updatedAt: Date.now(),
  };
  await saveRecipes(recipes);
  return recipes[idx];
}

export async function getEnabledRecipes(): Promise<AutomationRecipe[]> {
  const recipes = await loadRecipes();
  return recipes.filter((r) => r.enabled);
}

export async function getRecipesByTriggerType(type: TriggerType): Promise<AutomationRecipe[]> {
  const recipes = await loadRecipes();
  return recipes.filter((r) => r.enabled && r.trigger.type === type);
}

export function shouldScheduleTriggerFire(config: ScheduleTriggerConfig, lastRun?: number): boolean {
  const now = Date.now();

  if (config.intervalMinutes && config.intervalMinutes > 0) {
    if (!lastRun) return true;
    const elapsed = (now - lastRun) / 60000;
    return elapsed >= config.intervalMinutes;
  }

  if (config.dailyAtTime) {
    const [hours, minutes] = config.dailyAtTime.split(':').map(Number);
    const today = new Date();
    const targetToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0);
    const targetMs = targetToday.getTime();

    if (config.weekdays && config.weekdays.length > 0) {
      const dayOfWeek = today.getDay();
      if (!config.weekdays.includes(dayOfWeek)) return false;
    }

    const windowMs = 90000;
    if (Math.abs(now - targetMs) > windowMs) return false;
    if (lastRun && lastRun > targetMs - windowMs) return false;
    return true;
  }

  return false;
}

export function doesKeywordMatch(config: KeywordTriggerConfig, message: string): boolean {
  if (!config.keyword || !message) return false;
  if (config.caseSensitive) {
    return message.includes(config.keyword);
  }
  return message.toLowerCase().includes(config.keyword.toLowerCase());
}

export function doesEntityCreatedMatch(config: EntityCreatedTriggerConfig, entityType: string): boolean {
  return config.entityType === entityType;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ActionExecutor {
  createTask: (title: string, status?: string, priority?: TaskPriority, description?: string) => Promise<{ id: string }>;
  createMemoryEntry: (entry: { type: string; title: string; content: string; source?: string; tags?: string[]; reviewStatus?: string }) => Promise<{ id: string } | void>;
  sendGatewayChat: (message: string, sessionKey?: string) => Promise<void>;
  showNotification: (title: string, body: string) => void;
  sendGatewayCommand?: (command: string, args?: Record<string, string>) => Promise<void>;
  rollbackEntity?: (entityType: 'task' | 'memory', entityId: string) => Promise<void>;
}

export async function executeRecipeActions(
  recipe: AutomationRecipe,
  executor: ActionExecutor,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  const completedActions: Array<{ type: string; entityId?: string }> = [];

  for (const action of recipe.actions) {
    try {
      switch (action.type) {
        case 'send_chat': {
          const cfg = action.config as SendChatActionConfig;
          await executor.sendGatewayChat(cfg.message, cfg.sessionKey);
          completedActions.push({ type: 'send_chat' });
          break;
        }
        case 'create_task': {
          const cfg = action.config as CreateTaskActionConfig;
          const task = await executor.createTask(cfg.title, 'todo', cfg.priority || 'medium', cfg.description);
          completedActions.push({ type: 'create_task', entityId: task.id });
          break;
        }
        case 'create_memory': {
          const cfg = action.config as CreateMemoryActionConfig;
          const memResult = await executor.createMemoryEntry({
            type: cfg.type || 'note',
            title: cfg.title,
            content: cfg.content,
            tags: cfg.tags || [],
            source: 'automation',
          });
          completedActions.push({ type: 'create_memory', entityId: memResult && typeof memResult === 'object' ? memResult.id : undefined });
          break;
        }
        case 'notify': {
          const cfg = action.config as NotifyActionConfig;
          executor.showNotification(cfg.title, cfg.body);
          completedActions.push({ type: 'notify' });
          break;
        }
        case 'gateway_command': {
          const cfg = action.config as GatewayCommandActionConfig;
          if (executor.sendGatewayCommand) {
            await executor.sendGatewayCommand(cfg.command, cfg.args);
          }
          completedActions.push({ type: 'gateway_command' });
          break;
        }
      }
      succeeded++;
    } catch (err) {
      failed++;
      console.warn(`[AutomationEngine] Action ${action.type} failed for recipe "${recipe.name}":`, err);
      if (executor.rollbackEntity) {
        for (const completed of completedActions) {
          if (completed.entityId) {
            try {
              await executor.rollbackEntity(completed.type === 'create_task' ? 'task' : 'memory', completed.entityId);
            } catch (rollbackErr) {
              console.warn(`[AutomationEngine] Rollback failed for ${completed.type}:`, rollbackErr);
            }
          }
        }
      }
      break;
    }
  }
  if (succeeded > 0 || failed === 0) {
    await recordRun(recipe.id);
  } else {
    console.warn(`[AutomationEngine] All actions failed for recipe "${recipe.name}", run not recorded`);
  }
  return { succeeded, failed };
}
