import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Animated,
  Switch,
  ActivityIndicator,
  PanResponder,
  Text,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { getGateway } from '@/lib/gateway';
import { PulsingDot } from '@/components/PulsingDot';
import { Card } from '@/components/Card';
import { Typography } from '@/components/Typography';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  type AutomationRecipe,
  type TriggerType,
  type ActionType,
  type RecipeTrigger,
  type RecipeAction,
  getAllRecipes,
  createRecipe,
  toggleRecipe,
  deleteRecipe,
} from '@/lib/automationRecipes';

const C = Colors.dark;

interface Automation {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  status: 'running' | 'paused' | 'error' | 'idle';
  lastRun?: number;
  lastOutput?: string;
  type: 'heartbeat' | 'cron';
}

interface PendingApproval {
  id: string;
  action: string;
  description: string;
  riskTier: 'P1' | 'P2' | 'P3';
  expiresAt: number;
  source?: string;
}

interface CronOutput {
  id: string;
  automationName: string;
  timestamp: number;
  success: boolean;
  output: string;
  duration?: number;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

const RISK_TIER_CONFIG: Record<string, { color: string; label: string; glowColor: string }> = {
  P1: { color: C.error, label: 'CRITICAL', glowColor: C.error + '40' },
  P2: { color: C.amber, label: 'REVIEW', glowColor: C.amber + '30' },
  P3: { color: C.textSecondary, label: 'LOW', glowColor: C.textSecondary + '15' },
};

const TRIGGER_OPTIONS: { type: TriggerType; icon: string; label: string; desc: string; color: string }[] = [
  { type: 'schedule', icon: 'time-outline', label: 'Schedule', desc: 'Run on a timer or at specific times', color: C.accent },
  { type: 'keyword', icon: 'chatbubble-ellipses-outline', label: 'Keyword Match', desc: 'Fires when a chat message contains text', color: C.coral },
  { type: 'entity_created', icon: 'add-circle-outline', label: 'Entity Created', desc: 'Fires when a new task, memory, or event is created', color: C.secondary },
];

const ACTION_OPTIONS: { type: ActionType; icon: string; label: string; desc: string; color: string }[] = [
  { type: 'send_chat', icon: 'chatbubble-outline', label: 'Send Chat', desc: 'Send a message to the agent', color: C.accent },
  { type: 'create_task', icon: 'checkmark-circle-outline', label: 'Create Task', desc: 'Create a new task', color: C.coral },
  { type: 'create_memory', icon: 'bookmark-outline', label: 'Create Memory', desc: 'Save a new memory entry', color: C.purple },
  { type: 'notify', icon: 'notifications-outline', label: 'Notify', desc: 'Send a notification', color: C.amber },
  { type: 'gateway_command', icon: 'terminal-outline', label: 'Gateway Command', desc: 'Invoke a gateway command', color: C.secondary },
];

const ENTITY_TYPE_OPTIONS: { value: 'task' | 'memory' | 'event' | 'contact'; label: string; icon: string }[] = [
  { value: 'task', label: 'Task', icon: 'checkmark-circle-outline' },
  { value: 'memory', label: 'Memory', icon: 'bookmark-outline' },
  { value: 'event', label: 'Event', icon: 'calendar-outline' },
  { value: 'contact', label: 'Contact', icon: 'person-outline' },
];

function getTriggerIcon(type: TriggerType): string {
  return TRIGGER_OPTIONS.find(t => t.type === type)?.icon || 'flash-outline';
}

function getTriggerColor(type: TriggerType): string {
  return TRIGGER_OPTIONS.find(t => t.type === type)?.color || C.accent;
}

function getTriggerLabel(type: TriggerType): string {
  return TRIGGER_OPTIONS.find(t => t.type === type)?.label || type;
}

function RecipeCard({
  recipe,
  onToggle,
  onDelete,
}: {
  recipe: AutomationRecipe;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const triggerColor = getTriggerColor(recipe.trigger.type);

  return (
    <View style={recipeStyles.recipeItem}>
      <View style={recipeStyles.recipeTop}>
        <View style={[recipeStyles.recipeTriggerIcon, { backgroundColor: triggerColor + '18' }]}>
          <Ionicons name={getTriggerIcon(recipe.trigger.type) as any} size={18} color={triggerColor} />
        </View>
        <View style={recipeStyles.recipeInfo}>
          <Typography weight="600" style={recipeStyles.recipeName}>{recipe.name}</Typography>
          <View style={recipeStyles.recipeMeta}>
            <Typography color="tertiary" style={recipeStyles.recipeMetaText} weight="400">
              {getTriggerLabel(recipe.trigger.type)}
            </Typography>
            <View style={recipeStyles.metaDot} />
            <Typography color="tertiary" style={recipeStyles.recipeMetaText} weight="400">
              {recipe.actions.length} action{recipe.actions.length !== 1 ? 's' : ''}
            </Typography>
            {recipe.runCount > 0 && (
              <>
                <View style={recipeStyles.metaDot} />
                <Typography color="tertiary" style={recipeStyles.recipeMetaText} weight="400">
                  {recipe.runCount} runs
                </Typography>
              </>
            )}
          </View>
        </View>
        <View style={recipeStyles.recipeRight}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDelete(recipe.id);
            }}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={16} color={C.textTertiary} />
          </Pressable>
          <Switch
            value={recipe.enabled}
            onValueChange={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggle(recipe.id);
            }}
            trackColor={{ false: C.border, true: C.success + '40' }}
            thumbColor={recipe.enabled ? C.success : C.textTertiary}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
      </View>
    </View>
  );
}

function RecipeBuilderModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, trigger: RecipeTrigger, actions: RecipeAction[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [triggerType, setTriggerType] = useState<TriggerType | null>(null);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [selectedActions, setSelectedActions] = useState<{ type: ActionType; config: Record<string, any> }[]>([]);
  const [recipeName, setRecipeName] = useState('');
  const [configStep, setConfigStep] = useState<'action_pick' | 'action_config'>('action_pick');
  const [currentActionType, setCurrentActionType] = useState<ActionType | null>(null);
  const [currentActionConfig, setCurrentActionConfig] = useState<Record<string, any>>({});

  const resetState = useCallback(() => {
    setStep(1);
    setTriggerType(null);
    setTriggerConfig({});
    setSelectedActions([]);
    setRecipeName('');
    setConfigStep('action_pick');
    setCurrentActionType(null);
    setCurrentActionConfig({});
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handlePickTrigger = useCallback((type: TriggerType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTriggerType(type);
    setTriggerConfig({});
    setStep(2);
  }, []);

  const handleConfirmTrigger = useCallback(() => {
    setStep(3);
    setConfigStep('action_pick');
  }, []);

  const handlePickAction = useCallback((type: ActionType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentActionType(type);
    setCurrentActionConfig({});
    setConfigStep('action_config');
  }, []);

  const handleConfirmAction = useCallback(() => {
    if (currentActionType) {
      setSelectedActions(prev => [...prev, { type: currentActionType, config: { ...currentActionConfig } }]);
      setCurrentActionType(null);
      setCurrentActionConfig({});
      setConfigStep('action_pick');
    }
  }, [currentActionType, currentActionConfig]);

  const handleRemoveAction = useCallback((idx: number) => {
    setSelectedActions(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleGoToNameStep = useCallback(() => {
    if (selectedActions.length === 0) return;
    setStep(4);
  }, [selectedActions]);

  const handleSave = useCallback(() => {
    if (!triggerType || !recipeName.trim() || selectedActions.length === 0) return;
    const trigger: RecipeTrigger = { type: triggerType, config: triggerConfig as any };
    const actions: RecipeAction[] = selectedActions.map(a => ({ type: a.type, config: a.config as any }));
    onSave(recipeName.trim(), trigger, actions);
    handleClose();
  }, [triggerType, triggerConfig, selectedActions, recipeName, onSave, handleClose]);

  const canProceedStep2 = useMemo(() => {
    if (!triggerType) return false;
    if (triggerType === 'schedule') {
      return !!(triggerConfig.intervalMinutes || triggerConfig.dailyAtTime);
    }
    if (triggerType === 'keyword') {
      return !!(triggerConfig.keyword && triggerConfig.keyword.trim());
    }
    if (triggerType === 'entity_created') {
      return !!triggerConfig.entityType;
    }
    return false;
  }, [triggerType, triggerConfig]);

  const renderStepIndicator = () => (
    <View style={recipeStyles.stepIndicator}>
      {[1, 2, 3, 4].map(s => (
        <View key={s} style={recipeStyles.stepRow}>
          <View style={[recipeStyles.stepDot, s === step && recipeStyles.stepDotActive, s < step && recipeStyles.stepDotDone]} />
          {s < 4 && <View style={[recipeStyles.stepLine, s < step && recipeStyles.stepLineDone]} />}
        </View>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={recipeStyles.stepContent}>
      <Typography variant="h2" weight="700" style={recipeStyles.stepTitle}>Choose Trigger</Typography>
      <Typography color="secondary" style={recipeStyles.stepSubtitle} weight="400">What should start this recipe?</Typography>
      <View style={recipeStyles.optionsList}>
        {TRIGGER_OPTIONS.map(opt => (
          <Pressable
            key={opt.type}
            onPress={() => handlePickTrigger(opt.type)}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}
          >
            <LinearGradient
              colors={C.gradient.cardElevated}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={recipeStyles.optionCard}
            >
              <View style={[recipeStyles.optionIcon, { backgroundColor: opt.color + '18' }]}>
                <Ionicons name={opt.icon as any} size={22} color={opt.color} />
              </View>
              <View style={recipeStyles.optionInfo}>
                <Typography weight="600" style={recipeStyles.optionLabel}>{opt.label}</Typography>
                <Typography color="secondary" style={recipeStyles.optionDesc} weight="400">{opt.desc}</Typography>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
            </LinearGradient>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => {
    if (!triggerType) return null;
    return (
      <View style={recipeStyles.stepContent}>
        <Typography variant="h2" weight="700" style={recipeStyles.stepTitle}>Configure Trigger</Typography>
        <Typography color="secondary" style={recipeStyles.stepSubtitle} weight="400">
          Set up your {getTriggerLabel(triggerType).toLowerCase()} trigger
        </Typography>
        <View style={recipeStyles.configSection}>
          {triggerType === 'schedule' && (
            <>
              <View style={recipeStyles.configField}>
                <Typography weight="500" style={recipeStyles.configLabel}>Interval (minutes)</Typography>
                <TextInput
                  style={recipeStyles.configInput}
                  value={triggerConfig.intervalMinutes?.toString() || ''}
                  onChangeText={v => setTriggerConfig(prev => ({ ...prev, intervalMinutes: parseInt(v) || undefined }))}
                  placeholder="e.g. 60"
                  placeholderTextColor={C.textTertiary}
                  keyboardType="numeric"
                />
              </View>
              <View style={recipeStyles.configDivider}>
                <View style={recipeStyles.configDividerLine} />
                <Typography color="tertiary" style={recipeStyles.configDividerText} weight="400">or</Typography>
                <View style={recipeStyles.configDividerLine} />
              </View>
              <View style={recipeStyles.configField}>
                <Typography weight="500" style={recipeStyles.configLabel}>Daily at time (HH:MM)</Typography>
                <TextInput
                  style={recipeStyles.configInput}
                  value={triggerConfig.dailyAtTime || ''}
                  onChangeText={v => setTriggerConfig(prev => ({ ...prev, dailyAtTime: v || undefined }))}
                  placeholder="e.g. 09:00"
                  placeholderTextColor={C.textTertiary}
                />
              </View>
            </>
          )}
          {triggerType === 'keyword' && (
            <>
              <View style={recipeStyles.configField}>
                <Typography weight="500" style={recipeStyles.configLabel}>Keyword or phrase</Typography>
                <TextInput
                  style={recipeStyles.configInput}
                  value={triggerConfig.keyword || ''}
                  onChangeText={v => setTriggerConfig(prev => ({ ...prev, keyword: v }))}
                  placeholder="e.g. urgent"
                  placeholderTextColor={C.textTertiary}
                  autoCapitalize="none"
                />
              </View>
              <Pressable
                onPress={() => setTriggerConfig(prev => ({ ...prev, caseSensitive: !prev.caseSensitive }))}
                style={recipeStyles.configToggleRow}
              >
                <Typography weight="500" style={recipeStyles.configLabel}>Case sensitive</Typography>
                <View style={[recipeStyles.configCheckbox, triggerConfig.caseSensitive && recipeStyles.configCheckboxActive]}>
                  {triggerConfig.caseSensitive && <Ionicons name="checkmark" size={14} color={C.background} />}
                </View>
              </Pressable>
            </>
          )}
          {triggerType === 'entity_created' && (
            <View style={recipeStyles.entityTypeGrid}>
              {ENTITY_TYPE_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTriggerConfig({ entityType: opt.value });
                  }}
                  style={({ pressed }) => [pressed && { opacity: 0.8 }]}
                >
                  <View style={[
                    recipeStyles.entityTypeCard,
                    triggerConfig.entityType === opt.value && { borderColor: C.secondary, backgroundColor: C.secondary + '10' },
                  ]}>
                    <Ionicons
                      name={opt.icon as any}
                      size={20}
                      color={triggerConfig.entityType === opt.value ? C.secondary : C.textSecondary}
                    />
                    <Typography
                      weight={triggerConfig.entityType === opt.value ? '600' : '400'}
                      color={triggerConfig.entityType === opt.value ? 'primary' : 'secondary'}
                      style={recipeStyles.entityTypeLabel}
                    >
                      {opt.label}
                    </Typography>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <View style={recipeStyles.stepActions}>
          <Pressable onPress={() => setStep(1)} style={({ pressed }) => [recipeStyles.backBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="arrow-back" size={18} color={C.textSecondary} />
          </Pressable>
          <Pressable
            onPress={handleConfirmTrigger}
            disabled={!canProceedStep2}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <LinearGradient
              colors={canProceedStep2 ? C.gradient.lobster : [C.surface, C.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[recipeStyles.nextBtn, !canProceedStep2 && { opacity: 0.4 }]}
            >
              <Typography weight="600" style={recipeStyles.nextBtnText}>Next</Typography>
              <Ionicons name="arrow-forward" size={16} color="white" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderActionConfig = () => {
    if (!currentActionType) return null;
    const opt = ACTION_OPTIONS.find(a => a.type === currentActionType);
    return (
      <View style={recipeStyles.configSection}>
        <View style={recipeStyles.actionConfigHeader}>
          <View style={[recipeStyles.optionIcon, { backgroundColor: (opt?.color || C.accent) + '18' }]}>
            <Ionicons name={(opt?.icon || 'flash') as any} size={18} color={opt?.color || C.accent} />
          </View>
          <Typography weight="600" style={recipeStyles.optionLabel}>{opt?.label}</Typography>
        </View>
        {currentActionType === 'send_chat' && (
          <View style={recipeStyles.configField}>
            <Typography weight="500" style={recipeStyles.configLabel}>Message</Typography>
            <TextInput
              style={[recipeStyles.configInput, { height: 72, textAlignVertical: 'top' as const }]}
              value={currentActionConfig.message || ''}
              onChangeText={v => setCurrentActionConfig(prev => ({ ...prev, message: v }))}
              placeholder="Message to send..."
              placeholderTextColor={C.textTertiary}
              multiline
            />
          </View>
        )}
        {currentActionType === 'create_task' && (
          <>
            <View style={recipeStyles.configField}>
              <Typography weight="500" style={recipeStyles.configLabel}>Task title</Typography>
              <TextInput
                style={recipeStyles.configInput}
                value={currentActionConfig.title || ''}
                onChangeText={v => setCurrentActionConfig(prev => ({ ...prev, title: v }))}
                placeholder="Task title..."
                placeholderTextColor={C.textTertiary}
              />
            </View>
            <View style={recipeStyles.configField}>
              <Typography weight="500" style={recipeStyles.configLabel}>Priority</Typography>
              <View style={recipeStyles.priorityRow}>
                {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                  <Pressable
                    key={p}
                    onPress={() => setCurrentActionConfig(prev => ({ ...prev, priority: p }))}
                    style={({ pressed }) => [pressed && { opacity: 0.8 }]}
                  >
                    <View style={[
                      recipeStyles.priorityChip,
                      (currentActionConfig.priority || 'medium') === p && { borderColor: C.accent, backgroundColor: C.accent + '15' },
                    ]}>
                      <Typography
                        weight={(currentActionConfig.priority || 'medium') === p ? '600' : '400'}
                        color={(currentActionConfig.priority || 'medium') === p ? 'primary' : 'secondary'}
                        style={recipeStyles.priorityChipText}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Typography>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
        {currentActionType === 'create_memory' && (
          <>
            <View style={recipeStyles.configField}>
              <Typography weight="500" style={recipeStyles.configLabel}>Title</Typography>
              <TextInput
                style={recipeStyles.configInput}
                value={currentActionConfig.title || ''}
                onChangeText={v => setCurrentActionConfig(prev => ({ ...prev, title: v }))}
                placeholder="Memory title..."
                placeholderTextColor={C.textTertiary}
              />
            </View>
            <View style={recipeStyles.configField}>
              <Typography weight="500" style={recipeStyles.configLabel}>Content</Typography>
              <TextInput
                style={[recipeStyles.configInput, { height: 72, textAlignVertical: 'top' as const }]}
                value={currentActionConfig.content || ''}
                onChangeText={v => setCurrentActionConfig(prev => ({ ...prev, content: v }))}
                placeholder="Memory content..."
                placeholderTextColor={C.textTertiary}
                multiline
              />
            </View>
          </>
        )}
        {currentActionType === 'notify' && (
          <>
            <View style={recipeStyles.configField}>
              <Typography weight="500" style={recipeStyles.configLabel}>Notification title</Typography>
              <TextInput
                style={recipeStyles.configInput}
                value={currentActionConfig.title || ''}
                onChangeText={v => setCurrentActionConfig(prev => ({ ...prev, title: v }))}
                placeholder="Title..."
                placeholderTextColor={C.textTertiary}
              />
            </View>
            <View style={recipeStyles.configField}>
              <Typography weight="500" style={recipeStyles.configLabel}>Body</Typography>
              <TextInput
                style={recipeStyles.configInput}
                value={currentActionConfig.body || ''}
                onChangeText={v => setCurrentActionConfig(prev => ({ ...prev, body: v }))}
                placeholder="Notification body..."
                placeholderTextColor={C.textTertiary}
              />
            </View>
          </>
        )}
        {currentActionType === 'gateway_command' && (
          <View style={recipeStyles.configField}>
            <Typography weight="500" style={recipeStyles.configLabel}>Command</Typography>
            <TextInput
              style={recipeStyles.configInput}
              value={currentActionConfig.command || ''}
              onChangeText={v => setCurrentActionConfig(prev => ({ ...prev, command: v }))}
              placeholder="e.g. daily-brief"
              placeholderTextColor={C.textTertiary}
              autoCapitalize="none"
            />
          </View>
        )}
        <View style={recipeStyles.stepActions}>
          <Pressable
            onPress={() => { setConfigStep('action_pick'); setCurrentActionType(null); }}
            style={({ pressed }) => [recipeStyles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="arrow-back" size={18} color={C.textSecondary} />
          </Pressable>
          <Pressable
            onPress={handleConfirmAction}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <LinearGradient
              colors={C.gradient.lobster}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={recipeStyles.nextBtn}
            >
              <Ionicons name="add" size={16} color="white" />
              <Typography weight="600" style={recipeStyles.nextBtnText}>Add Action</Typography>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderStep3 = () => (
    <View style={recipeStyles.stepContent}>
      <Typography variant="h2" weight="700" style={recipeStyles.stepTitle}>Add Actions</Typography>
      <Typography color="secondary" style={recipeStyles.stepSubtitle} weight="400">What should happen when the trigger fires?</Typography>

      {selectedActions.length > 0 && (
        <View style={recipeStyles.addedActions}>
          <Typography weight="500" color="secondary" style={recipeStyles.addedActionsLabel}>Added actions:</Typography>
          {selectedActions.map((a, idx) => {
            const opt = ACTION_OPTIONS.find(o => o.type === a.type);
            return (
              <View key={idx} style={recipeStyles.addedActionRow}>
                <View style={[recipeStyles.addedActionIcon, { backgroundColor: (opt?.color || C.accent) + '18' }]}>
                  <Ionicons name={(opt?.icon || 'flash') as any} size={14} color={opt?.color || C.accent} />
                </View>
                <Typography weight="500" style={recipeStyles.addedActionText}>{opt?.label}</Typography>
                <Pressable onPress={() => handleRemoveAction(idx)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={C.error} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {configStep === 'action_pick' ? (
        <View style={recipeStyles.optionsList}>
          {ACTION_OPTIONS.map(opt => (
            <Pressable
              key={opt.type}
              onPress={() => handlePickAction(opt.type)}
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <LinearGradient
                colors={C.gradient.cardElevated}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={recipeStyles.optionCard}
              >
                <View style={[recipeStyles.optionIcon, { backgroundColor: opt.color + '18' }]}>
                  <Ionicons name={opt.icon as any} size={22} color={opt.color} />
                </View>
                <View style={recipeStyles.optionInfo}>
                  <Typography weight="600" style={recipeStyles.optionLabel}>{opt.label}</Typography>
                  <Typography color="secondary" style={recipeStyles.optionDesc} weight="400">{opt.desc}</Typography>
                </View>
                <Ionicons name="add-circle-outline" size={18} color={C.textTertiary} />
              </LinearGradient>
            </Pressable>
          ))}
        </View>
      ) : (
        renderActionConfig()
      )}

      {configStep === 'action_pick' && (
        <View style={recipeStyles.stepActions}>
          <Pressable onPress={() => setStep(2)} style={({ pressed }) => [recipeStyles.backBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="arrow-back" size={18} color={C.textSecondary} />
          </Pressable>
          <Pressable
            onPress={handleGoToNameStep}
            disabled={selectedActions.length === 0}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <LinearGradient
              colors={selectedActions.length > 0 ? C.gradient.lobster : [C.surface, C.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[recipeStyles.nextBtn, selectedActions.length === 0 && { opacity: 0.4 }]}
            >
              <Typography weight="600" style={recipeStyles.nextBtnText}>Next</Typography>
              <Ionicons name="arrow-forward" size={16} color="white" />
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={recipeStyles.stepContent}>
      <Typography variant="h2" weight="700" style={recipeStyles.stepTitle}>Name Your Recipe</Typography>
      <Typography color="secondary" style={recipeStyles.stepSubtitle} weight="400">Give this automation a memorable name</Typography>
      <View style={recipeStyles.configSection}>
        <View style={recipeStyles.configField}>
          <TextInput
            style={[recipeStyles.configInput, { fontSize: 16 }]}
            value={recipeName}
            onChangeText={setRecipeName}
            placeholder="My Automation..."
            placeholderTextColor={C.textTertiary}
            autoFocus
          />
        </View>
        <View style={recipeStyles.recipeSummary}>
          <Typography weight="500" color="secondary" style={recipeStyles.summaryLabel}>Summary</Typography>
          <View style={recipeStyles.summaryRow}>
            <Ionicons name={getTriggerIcon(triggerType!) as any} size={14} color={getTriggerColor(triggerType!)} />
            <Typography color="primary" style={recipeStyles.summaryText} weight="400">
              When: {getTriggerLabel(triggerType!)}
            </Typography>
          </View>
          {selectedActions.map((a, idx) => {
            const opt = ACTION_OPTIONS.find(o => o.type === a.type);
            return (
              <View key={idx} style={recipeStyles.summaryRow}>
                <Ionicons name={(opt?.icon || 'flash') as any} size={14} color={opt?.color || C.accent} />
                <Typography color="primary" style={recipeStyles.summaryText} weight="400">
                  Then: {opt?.label}
                </Typography>
              </View>
            );
          })}
        </View>
      </View>
      <View style={recipeStyles.stepActions}>
        <Pressable onPress={() => setStep(3)} style={({ pressed }) => [recipeStyles.backBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="arrow-back" size={18} color={C.textSecondary} />
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={!recipeName.trim()}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <LinearGradient
            colors={recipeName.trim() ? C.gradient.lobster : [C.surface, C.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[recipeStyles.saveBtn, !recipeName.trim() && { opacity: 0.4 }]}
          >
            <Ionicons name="checkmark-circle" size={18} color="white" />
            <Typography weight="700" style={recipeStyles.saveBtnText}>Save Recipe</Typography>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[recipeStyles.modalContainer, { paddingTop: insets.top }]}>
        <View style={recipeStyles.modalHeader}>
          <Typography variant="h2" weight="700" style={recipeStyles.modalTitle}>New Recipe</Typography>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={C.textSecondary} />
          </Pressable>
        </View>
        {renderStepIndicator()}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={20}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[recipeStyles.modalScroll, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const recipeStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: C.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    fontSize: 22,
    color: C.text,
  },
  modalScroll: {
    paddingHorizontal: 20,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 16,
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.border,
  },
  stepDotActive: {
    backgroundColor: C.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepDotDone: {
    backgroundColor: C.success,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: C.border,
    marginHorizontal: 4,
  },
  stepLineDone: {
    backgroundColor: C.success,
  },
  stepContent: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 22,
    color: C.text,
  },
  stepSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: {
    flex: 1,
    gap: 3,
  },
  optionLabel: {
    fontSize: 14,
    color: C.text,
  },
  optionDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  configSection: {
    gap: 14,
  },
  configField: {
    gap: 6,
  },
  configLabel: {
    fontSize: 13,
    color: C.text,
  },
  configInput: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
  },
  configDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  configDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.borderLight,
  },
  configDividerText: {
    fontSize: 12,
  },
  configToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  configCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  configCheckboxActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  entityTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  entityTypeCard: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.surface,
    alignItems: 'center',
    gap: 6,
    minWidth: 90,
  },
  entityTypeLabel: {
    fontSize: 12,
  },
  stepActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  nextBtnText: {
    fontSize: 14,
    color: 'white',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: {
    fontSize: 15,
    color: 'white',
  },
  addedActions: {
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  addedActionsLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  addedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addedActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedActionText: {
    flex: 1,
    fontSize: 13,
    color: C.text,
  },
  actionConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderLight,
    backgroundColor: C.surface,
  },
  priorityChipText: {
    fontSize: 12,
  },
  recipeSummary: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 13,
  },
  recipeItem: {
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  recipeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  recipeTriggerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeInfo: {
    flex: 1,
    gap: 3,
  },
  recipeName: {
    fontSize: 14,
    color: C.text,
  },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeMetaText: {
    fontSize: 11,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.textTertiary,
    marginHorizontal: 2,
  },
  recipeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipesList: {
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
});

function formatTimeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCountdown(expiresAt: number) {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins > 0) return `${mins}m ${secs} s`;
  return `${secs} s`;
}

function formatUptime(ms: number) {
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins} m`;
  return `${mins} m`;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  running: { color: C.success, label: 'Running', icon: 'play-circle' },
  paused: { color: C.amber, label: 'Paused', icon: 'pause-circle' },
  error: { color: C.error, label: 'Error', icon: 'alert-circle' },
  idle: { color: C.textTertiary, label: 'Idle', icon: 'ellipse-outline' },
};

function ToastNotification({ toast, onHide }: { toast: ToastState; onHide: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (toast.visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(translateY, { toValue: -20, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
        ]).start(() => onHide());
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [onHide, opacity, toast.visible, translateY]);

  if (!toast.visible) return null;

  return (
    <Animated.View style={[styles.toastContainer, { opacity, transform: [{ translateY }] }]}>
      <LinearGradient
        colors={toast.type === 'success' ? C.gradient.alertSuccess : [C.error + '25', C.error + '10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.toastInner}
      >
        <Ionicons
          name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
          size={18}
          color={toast.type === 'success' ? C.success : C.error}
        />
        <Typography style={styles.toastText} color={toast.type === 'success' ? C.success : C.error} weight="500">
          {toast.message}
        </Typography>
      </LinearGradient>
    </Animated.View>
  );
}

function QuickActionButton({
  icon,
  label,
  onPress,
  loading,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!loading) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }
      }}
      style={({ pressed }) => [pressed && !loading && { opacity: 0.7 }]}
    >
      <LinearGradient
        colors={C.gradient.cardElevated}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.quickActionPill}
      >
        {loading ? (
          <ActivityIndicator size={16} color={C.accent} />
        ) : (
          <Ionicons name={icon as any} size={16} color={C.accent} />
        )}
        <Typography style={[styles.quickActionText, { marginLeft: 8 }]} color="white" weight="500">{label}</Typography>
      </LinearGradient>
    </Pressable>
  );
}

function QuickActionsBar({
  connected,
  automations,
  onToast,
}: {
  connected: boolean;
  automations: Automation[];
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const executeAction = useCallback(async (actionKey: string, command: string) => {
    if (!connected) {
      onToast('Not connected to gateway', 'error');
      return;
    }
    setLoadingAction(actionKey);
    try {
      await getGateway().invokeCommand(command);
      onToast(`${actionKey} completed`, 'success');
    } catch {
      onToast(`${actionKey} failed`, 'error');
    } finally {
      setLoadingAction(null);
    }
  }, [connected, onToast]);

  const runAll = useCallback(async () => {
    if (!connected) {
      onToast('Not connected to gateway', 'error');
      return;
    }
    setLoadingAction('Run All');
    try {
      const enabled = automations.filter(a => a.enabled);
      const gw = getGateway() as any;
      for (const a of enabled) {
        await gw.rpc('automations.trigger', { id: a.id }).catch(() => { });
      }
      onToast(`Triggered ${enabled.length} automations`, 'success');
    } catch {
      onToast('Run All failed', 'error');
    } finally {
      setLoadingAction(null);
    }
  }, [connected, automations, onToast]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.quickActionsContainer}
    >
      <QuickActionButton
        icon="newspaper"
        label="Daily Brief"
        loading={loadingAction === 'Daily Brief'}
        onPress={() => executeAction('Daily Brief', 'daily-brief')}
      />
      <QuickActionButton
        icon="pulse"
        label="Health Check"
        loading={loadingAction === 'Health Check'}
        onPress={() => executeAction('Health Check', 'health-check')}
      />
      <QuickActionButton
        icon="sync-circle"
        label="Sync Memory"
        loading={loadingAction === 'Sync Memory'}
        onPress={() => executeAction('Sync Memory', 'sync-memory')}
      />
      <QuickActionButton
        icon="play-circle"
        label="Run All"
        loading={loadingAction === 'Run All'}
        onPress={runAll}
      />
    </ScrollView>
  );
}

function SystemHealthBanner() {
  const { gatewayStatus, gatewayInfo } = useApp();
  const connected = gatewayStatus === 'connected';

  const statusLabel = connected ? 'Connected' :
    gatewayStatus === 'connecting' ? 'Connecting...' :
      gatewayStatus === 'authenticating' ? 'Authenticating...' :
        gatewayStatus === 'pairing' ? 'Pairing...' :
          gatewayStatus === 'error' ? 'Error' : 'Disconnected';

  const statusColor = connected ? C.success :
    gatewayStatus === 'error' ? C.error :
      gatewayStatus === 'disconnected' ? C.textTertiary : C.amber;

  return (
    <Card variant="card" style={styles.healthBanner}>
      <View style={styles.healthTop}>
        <View style={styles.healthLeft}>
          <View style={styles.healthDotWrap}>
            {connected ? (
              <PulsingDot color={C.success} size={10} />
            ) : (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor }} />
            )}
          </View>
          <View>
            <Typography style={styles.healthTitle} weight="600">System Health</Typography>
            <Typography style={styles.healthStatus} color={statusColor} weight="500">{statusLabel}</Typography>
          </View>
        </View>
        <View style={[styles.healthBadge, { backgroundColor: statusColor + '20' }]}>
          <Ionicons name={connected ? 'shield-checkmark' : 'shield-outline'} size={14} color={statusColor} />
        </View>
      </View>
      {connected && gatewayInfo.uptime !== undefined && (
        <View style={styles.healthStats}>
          <View style={styles.healthStat}>
            <Ionicons name="time-outline" size={14} color={C.textSecondary} />
            <Typography style={styles.healthStatText} color="secondary" weight="400">Uptime: {formatUptime(gatewayInfo.uptime)}</Typography>
          </View>
          {gatewayInfo.model && (
            <View style={styles.healthStat}>
              <Ionicons name="hardware-chip-outline" size={14} color={C.textSecondary} />
              <Typography style={styles.healthStatText} color="secondary" weight="400">{gatewayInfo.model}</Typography>
            </View>
          )}
        </View>
      )}
      {!connected && gatewayStatus === 'disconnected' && (
        <Typography style={styles.healthHint} color="tertiary" weight="400">Connect to a gateway to manage automations</Typography>
      )}
    </Card>
  );
}

function ApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: PendingApproval;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  const [countdown, setCountdown] = useState(formatCountdown(approval.expiresAt));
  const tierConfig = RISK_TIER_CONFIG[approval.riskTier] || RISK_TIER_CONFIG.P3;
  const swipeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(approval.expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [approval.expiresAt]);

  const isExpired = approval.expiresAt - Date.now() <= 0;
  const isUrgent = approval.expiresAt - Date.now() < 60000 && !isExpired;

  const SWIPE_THRESHOLD = 100;

  const panResponder = React.useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, gs: PanResponderGestureState) => Math.abs(gs.dx) > 15 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
        swipeX.setValue(gs.dx);
      },
      onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          // Swipe right → Approve
          Animated.timing(swipeX, { toValue: 400, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => {
            onApprove(approval.id);
          });
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          // Swipe left → Deny
          Animated.timing(swipeX, { toValue: -400, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => {
            onDeny(approval.id);
          });
        } else {
          // Spring back
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 60, friction: 8 }).start();
        }
      },
    }),
    [approval.id, onApprove, onDeny, swipeX]);

  return (
    <View style={styles.swipeContainer}>
      {/* Background actions revealed on swipe */}
      <View style={styles.swipeBehind}>
        <View style={[styles.swipeAction, styles.swipeApproveAction]}>
          <Ionicons name="checkmark-circle" size={24} color={C.success} />
          <Typography style={styles.swipeActionText} color="success" weight="600">Approve</Typography>
        </View>
        <View style={[styles.swipeAction, styles.swipeDenyAction]}>
          <Typography style={styles.swipeActionText} color="error" weight="600">Deny</Typography>
          <Ionicons name="close-circle" size={24} color={C.error} />
        </View>
      </View>

      <Animated.View
        style={{ transform: [{ translateX: swipeX }] }}
        {...panResponder?.panHandlers}
      >
        <Pressable
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onApprove(approval.id);
          }}
          delayLongPress={800}
          style={({ pressed }) => [pressed && { opacity: 0.95 }]}
        >
          <LinearGradient
            colors={C.gradient.cardElevated}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.approvalCard,
              approval.riskTier === 'P1' && { borderColor: C.error + '40', ...C.shadow.glow },
            ]}
          >
            <View style={styles.approvalTop}>
              <View style={[styles.riskBadge, { backgroundColor: tierConfig.glowColor }]}>
                <Typography style={styles.riskBadgeText} color={tierConfig.color} weight="700">
                  {approval.riskTier} · {tierConfig.label}
                </Typography>
              </View>
              <View style={styles.approvalExpiry}>
                <Ionicons
                  name="timer-outline"
                  size={12}
                  color={isUrgent ? C.error : C.textTertiary}
                />
                <Typography
                  style={[styles.expiryText, isUrgent && { color: C.error }, isExpired && { color: C.error }]}
                  weight="600"
                >
                  {countdown}
                </Typography>
              </View>
            </View>
            <Typography variant="h3" weight="600" style={styles.approvalAction}>{approval.action}</Typography>
            {approval.description ? (
              <Typography color="secondary" numberOfLines={2} style={styles.approvalDesc}>{approval.description}</Typography>
            ) : null}
            {approval.source ? (
              <View style={styles.approvalSource}>
                <Ionicons name="link-outline" size={11} color={C.textTertiary} />
                <Typography color="tertiary" style={styles.approvalSourceText}>{approval.source}</Typography>
              </View>
            ) : null}
            <View style={styles.approvalActions}>
              <Pressable
                style={({ pressed }) => [styles.approvalBtn, styles.denyBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onDeny(approval.id);
                }}
              >
                <Ionicons name="close" size={20} color={C.error} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.approvalBtn, styles.approveBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onApprove(approval.id);
                }}
              >
                <Ionicons name="checkmark" size={20} color={C.success} />
              </Pressable>
            </View>
            {/* Swipe hint */}
            <View style={styles.swipeHint}>
              <Ionicons name="swap-horizontal" size={10} color={C.textTertiary} />
              <Typography color="tertiary" style={styles.swipeHintText} weight="400">Swipe to act</Typography>
            </View>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function AutomationItem({
  automation,
  onToggle,
  expanded,
  onPress,
}: {
  automation: Automation;
  onToggle: (id: string, enabled: boolean) => void;
  expanded: boolean;
  onPress: () => void;
}) {
  const config = STATUS_CONFIG[automation.status];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
      <View style={styles.automationItem}>
        <View style={styles.automationTop}>
          <View style={[styles.automationStatusDot, { backgroundColor: config.color }]} />
          <View style={styles.automationInfo}>
            <Typography variant="h3" weight="600" style={styles.automationName}>{automation.name}</Typography>
            <View style={styles.automationMeta}>
              <Ionicons name="calendar-outline" size={12} color={C.textTertiary} />
              <Typography color="tertiary" style={styles.automationSchedule} weight="400">{automation.schedule}</Typography>
              {automation.lastRun ? (
                <>
                  <View style={styles.metaDivider} />
                  <Ionicons name="time-outline" size={12} color={C.textTertiary} />
                  <Typography color="tertiary" style={styles.automationLastRun} weight="400">{formatTimeAgo(automation.lastRun)}</Typography>
                </>
              ) : null}
            </View>
          </View>
          <View style={styles.automationRight}>
            <View style={[styles.statusPill, { backgroundColor: config.color + '18' }]}>
              <Ionicons name={config.icon as any} size={12} color={config.color} />
              <Typography color={config.color} weight="600" style={styles.statusPillText}>{config.label}</Typography>
            </View>
            <Switch
              value={automation.enabled}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggle(automation.id, val);
              }}
              trackColor={{ false: C.border, true: C.success + '40' }}
              thumbColor={automation.enabled ? C.success : C.textTertiary}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>
        {expanded && automation.lastOutput ? (
          <View style={styles.automationExpanded}>
            <Typography color="secondary" weight="600" style={styles.expandedLabel}>Recent Output</Typography>
            <View style={styles.expandedOutput}>
              <Typography color="primary" numberOfLines={6} style={styles.expandedOutputText} weight="400">{automation.lastOutput}</Typography>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function CronOutputItem({ output }: { output: CronOutput }) {
  return (
    <View style={styles.cronOutputItem}>
      <View style={[styles.cronStatusIcon, { backgroundColor: output.success ? C.success + '18' : C.error + '18' }]}>
        <Ionicons
          name={output.success ? 'checkmark-circle' : 'close-circle'}
          size={16}
          color={output.success ? C.success : C.error}
        />
      </View>
      <View style={styles.cronOutputInfo}>
        <Typography weight="600" style={styles.cronOutputName}>{output.automationName}</Typography>
        <Typography color="secondary" numberOfLines={1} style={styles.cronOutputText} weight="400">{output.output}</Typography>
      </View>
      <View style={styles.cronOutputRight}>
        <Typography color="tertiary" style={styles.cronOutputTime} weight="400">{formatTimeAgo(output.timestamp)}</Typography>
        {output.duration !== undefined && (
          <Typography color="tertiary" style={styles.cronOutputDuration} weight="400">{output.duration}ms</Typography>
        )}
      </View>
    </View>
  );
}

function AnalyticsCard({ cronOutputs }: { cronOutputs: CronOutput[] }) {
  const analytics = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const todayStart = now - (now % dayMs);
    const todayOutputs = cronOutputs.filter(o => o.timestamp >= todayStart);
    const totalToday = todayOutputs.length;
    const successCount = todayOutputs.filter(o => o.success).length;
    const successRate = totalToday > 0 ? Math.round((successCount / totalToday) * 100) : 0;
    const durations = todayOutputs.filter(o => o.duration !== undefined).map(o => o.duration!);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    const weekBars: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - (i * dayMs);
      const dayEnd = dayStart + dayMs;
      weekBars.push(cronOutputs.filter(o => o.timestamp >= dayStart && o.timestamp < dayEnd).length);
    }
    const maxBar = Math.max(...weekBars, 1);

    return { totalToday, successRate, avgDuration, weekBars, maxBar };
  }, [cronOutputs]);

  return (
    <Card variant="card" style={styles.analyticsCard}>
      <View style={styles.analyticsHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="analytics" size={16} color={C.accent} />
          <Typography variant="h3" weight="600">Analytics</Typography>
        </View>
      </View>
      <View style={styles.analyticsGrid}>
        <View style={styles.analyticsStat}>
          <Typography variant="h1" style={styles.analyticsValue} weight="600">{analytics.totalToday}</Typography>
          <Typography color="secondary" style={styles.analyticsLabel} weight="400">Runs Today</Typography>
        </View>
        <View style={styles.analyticsStat}>
          <Typography variant="h1" color="success" style={styles.analyticsValue} weight="600">{analytics.successRate}%</Typography>
          <Typography color="secondary" style={styles.analyticsLabel} weight="400">Success Rate</Typography>
        </View>
        <View style={styles.analyticsStat}>
          <Typography variant="h1" style={styles.analyticsValue} weight="600">{analytics.avgDuration}ms</Typography>
          <Typography color="secondary" style={styles.analyticsLabel} weight="400">Avg Time</Typography>
        </View>
      </View>
      <View style={styles.weekBarContainer}>
        {analytics.weekBars.map((val, idx) => (
          <View key={idx} style={styles.weekBarCol}>
            <View style={styles.weekBarTrack}>
              <LinearGradient
                colors={C.gradient.lobster}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[
                  styles.weekBarFill,
                  { height: `${Math.max((val / analytics.maxBar) * 100, 4)}% ` as any },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.weekLabels}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Typography key={i} color="tertiary" style={styles.weekLabel} weight="400">{d}</Typography>
        ))}
      </View>
    </Card>
  );
}

export default function AutomationsScreen() {
  const insets = useSafeAreaInsets();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const { gatewayStatus } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [cronOutputs, setCronOutputs] = useState<CronOutput[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allPaused, setAllPaused] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const [recipes, setRecipes] = useState<AutomationRecipe[]>([]);
  const [showRecipeBuilder, setShowRecipeBuilder] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const loadRecipes = useCallback(async () => {
    const all = await getAllRecipes();
    setRecipes(all);
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const handleCreateRecipe = useCallback(async (name: string, trigger: RecipeTrigger, actions: RecipeAction[]) => {
    await createRecipe(name, trigger, actions);
    await loadRecipes();
    showToast('Recipe created', 'success');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [loadRecipes, showToast]);

  const handleToggleRecipe = useCallback(async (id: string) => {
    await toggleRecipe(id);
    await loadRecipes();
  }, [loadRecipes]);

  const handleDeleteRecipe = useCallback(async (id: string) => {
    Alert.alert('Delete Recipe', 'Are you sure you want to delete this recipe?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteRecipe(id);
          await loadRecipes();
          showToast('Recipe deleted', 'success');
        },
      },
    ]);
  }, [loadRecipes, showToast]);

  const fetchData = useCallback(async () => {
    if (gatewayStatus !== 'connected') return;

    const gw = getGateway() as any;

    try {
      const automationList = await gw.rpc('automations.list');
      if (Array.isArray(automationList)) {
        setAutomations(automationList.map((a: any) => ({
          id: a.id || a.name,
          name: a.name || a.id,
          schedule: a.schedule || a.cron || 'Manual',
          enabled: a.enabled !== false,
          status: a.status || 'idle',
          lastRun: a.lastRun || a.lastRunAt,
          lastOutput: a.lastOutput || a.output,
          type: a.type || 'cron',
        })));
      }
    } catch { }

    try {
      const approvalList = await gw.rpc('automations.approvals');
      if (Array.isArray(approvalList)) {
        setApprovals(approvalList.map((a: any) => ({
          id: a.id,
          action: a.action || a.title || 'Unknown action',
          description: a.description || '',
          riskTier: a.riskTier || a.tier || 'P3',
          expiresAt: a.expiresAt || Date.now() + 300000,
          source: a.source,
        })));
      }
    } catch { }

    try {
      const outputs = await gw.rpc('automations.outputs', { limit: 5 });
      if (Array.isArray(outputs)) {
        setCronOutputs(outputs.map((o: any) => ({
          id: o.id || String(o.timestamp),
          automationName: o.automationName || o.name || 'Unknown',
          timestamp: o.timestamp || Date.now(),
          success: o.success !== false,
          output: o.output || o.result || '',
          duration: o.duration,
        })));
      }
    } catch { }
  }, [gatewayStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time event subscriptions — approvals appear instantly
  useEffect(() => {
    const gw = getGateway();

    // New approval requested
    const unsubTool = gw.on('tool_call', (event) => {
      const data = event.data;
      if (data?.type === 'exec.approval.requested' || data?.event === 'exec.approval.requested') {
        const payload = data.data || data.payload || data;
        const newApproval: PendingApproval = {
          id: payload.id || 'approval-' + Date.now(),
          action: payload.action || payload.title || 'Unknown action',
          description: payload.description || '',
          riskTier: payload.riskTier || payload.tier || 'P2',
          expiresAt: payload.expiresAt || Date.now() + 300000,
          source: payload.source,
        };
        setApprovals(prev => {
          if (prev.some(a => a.id === newApproval.id)) return prev;
          return [newApproval, ...prev];
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      // Automation status update
      if (data?.type === 'automation.status' || data?.event === 'automation.status') {
        const payload = data.data || data.payload || data;
        if (payload.id) {
          setAutomations(prev =>
            prev.map(a => a.id === payload.id ? {
              ...a,
              status: payload.status || a.status,
              lastRun: payload.lastRun || a.lastRun,
              lastOutput: payload.output || a.lastOutput,
            } : a),
          );
        }
      }
    });

    // Notification events (from push notification system)
    const unsubNotif = gw.on('notification', (event) => {
      const data = event.data;
      if (data?.approvalId) {
        // Re-fetch approvals to get the latest state
        fetchData();
      }
    });

    return () => { unsubTool(); unsubNotif(); };
  }, [fetchData]);

  // Auto-refresh every 30s when connected
  useEffect(() => {
    if (gatewayStatus !== 'connected') return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [gatewayStatus, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), loadRecipes()]);
    setRefreshing(false);
  }, [fetchData, loadRecipes]);

  const handleToggleAutomation = useCallback(async (id: string, enabled: boolean) => {
    setAutomations((prev) =>
      prev.map((a) => a.id === id ? { ...a, enabled } : a),
    );
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.toggle', { id, enabled });
      } catch { }
    }
  }, [gatewayStatus]);

  const handleApprove = useCallback(async (id: string) => {
    // P1 critical actions require biometric authentication
    const approval = approvals.find(a => a.id === id);
    if (approval?.riskTier === 'P1') {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: '🔐 Authenticate to approve critical action',
          fallbackLabel: 'Use passcode',
          disableDeviceFallback: false,
        });
        if (!result.success) {
          showToast('Biometric authentication required for P1 approvals', 'error');
          return;
        }
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.approveAction(id);
      } catch { }
    }
    showToast('Action approved', 'success');
  }, [gatewayStatus, showToast]);

  const handleDeny = useCallback(async (id: string) => {
    // Optimistically remove from UI
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.denyAction(id);
      } catch { }
    }
  }, [gatewayStatus]);

  const handleApproveAllP3 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const p3Approvals = approvals.filter(a => a.riskTier === 'P3');
    // Optimistically remove from UI
    setApprovals(prev => prev.filter(a => a.riskTier !== 'P3'));
    if (gatewayStatus === 'connected') {
      const gw = getGateway() as any;
      for (const a of p3Approvals) {
        try {
          await gw.approveAction(a.id);
        } catch { }
      }
    }
    showToast(`Approved ${p3Approvals.length} low-risk items`, 'success');
  }, [approvals, gatewayStatus, showToast]);

  const handleTogglePauseAll = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const newPaused = !allPaused;
    setAllPaused(newPaused);
    setAutomations(prev =>
      prev.map(a => ({ ...a, enabled: !newPaused, status: newPaused ? 'paused' as const : 'idle' as const })),
    );
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.pauseAll', { paused: newPaused });
      } catch { }
    }
    showToast(newPaused ? 'All automations paused' : 'All automations resumed', newPaused ? 'error' : 'success');
  }, [allPaused, gatewayStatus, showToast]);

  const connected = gatewayStatus === 'connected';
  const hasP3 = approvals.some(a => a.riskTier === 'P3');

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <ToastNotification toast={toast} onHide={hideToast} />

      <View style={styles.header}>
        <Typography style={styles.headerTitle} variant="h1" weight="700">Automations</Typography>
        <View style={styles.headerRight}>
          {connected && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRefresh();
              }}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="refresh" size={20} color={C.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <SystemHealthBanner />

        <QuickActionsBar
          connected={connected}
          automations={automations}
          onToast={showToast}
        />

        {allPaused && (
          <LinearGradient
            colors={C.gradient.alertWarn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pausedBanner}
          >
            <Ionicons name="pause-circle" size={18} color={C.amber} />
            <Typography style={styles.pausedBannerText} weight="500">All automations paused</Typography>
          </LinearGradient>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="shield-checkmark" size={16} color={C.amber} />
              <Typography style={styles.sectionTitle} weight="600">Pending Approvals</Typography>
            </View>
            {approvals.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: C.amber + '20' }]}>
                <Typography style={styles.countText} color={C.amber} weight="600">{approvals.length}</Typography>
              </View>
            )}
          </View>
          {approvals.length > 0 ? (
            <View style={styles.approvalsList}>
              {approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              ))}
              {hasP3 && (
                <Pressable
                  onPress={handleApproveAllP3}
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                >
                  <LinearGradient
                    colors={C.gradient.cardElevated}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.approveAllP3Btn}
                  >
                    <Ionicons name="checkmark-done" size={16} color={C.success} />
                    <Typography style={styles.approveAllP3Text} weight="600">Approve All P3</Typography>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="shield-outline" size={28} color={C.textTertiary} />
              <Typography style={styles.emptyTitle} weight="600">No pending approvals</Typography>
              <Typography style={styles.emptyDesc} color="secondary" weight="400">
                {connected
                  ? 'Risky actions from your automations will appear here for review'
                  : 'Connect to a gateway to see approval requests'}
              </Typography>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flash" size={16} color={C.coral} />
              <Typography style={styles.sectionTitle} weight="600">Active Automations</Typography>
            </View>
            <View style={styles.automationHeaderRight}>
              {automations.length > 0 && (
                <Typography style={styles.automationCount} color="secondary" weight="400">
                  {automations.filter((a) => a.enabled).length}/{automations.length} active
                </Typography>
              )}
              {automations.length > 0 && (
                <Pressable
                  onPress={handleTogglePauseAll}
                  style={({ pressed }) => [styles.pauseAllBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name={allPaused ? 'play' : 'pause'}
                    size={14}
                    color={allPaused ? C.success : C.amber}
                  />
                  <Text style={[styles.pauseAllText, { color: allPaused ? C.success : C.amber }]}>
                    {allPaused ? 'Resume' : 'Pause'} All
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          {automations.length > 0 ? (
            <View style={styles.automationsList}>
              {automations.map((automation) => (
                <AutomationItem
                  key={automation.id}
                  automation={automation}
                  onToggle={handleToggleAutomation}
                  expanded={expandedId === automation.id}
                  onPress={() => setExpandedId(expandedId === automation.id ? null : automation.id)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="flash-outline" size={28} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>No automations configured</Text>
              <Text style={styles.emptyDesc}>
                {connected
                  ? 'Heartbeat checks and cron jobs will appear here when configured on your gateway'
                  : 'Connect to a gateway to view and manage your automations'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="construct" size={16} color={C.accent} />
              <Typography style={styles.sectionTitle} weight="600">My Recipes</Typography>
            </View>
            {recipes.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: C.accent + '20' }]}>
                <Typography style={styles.countText} color={C.accent} weight="600">{recipes.length}</Typography>
              </View>
            )}
          </View>
          {recipes.length > 0 ? (
            <View style={recipeStyles.recipesList}>
              {recipes.map(recipe => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onToggle={handleToggleRecipe}
                  onDelete={handleDeleteRecipe}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="construct-outline" size={28} color={C.textTertiary} />
              <Typography style={styles.emptyTitle} weight="600">No custom recipes</Typography>
              <Typography style={styles.emptyDesc} color="secondary" weight="400">
                Tap the + button to create your first automation recipe
              </Typography>
            </View>
          )}
        </View>

        <AnalyticsCard cronOutputs={cronOutputs} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="terminal" size={16} color={C.purple} />
              <Text style={styles.sectionTitle}>Recent Outputs</Text>
            </View>
          </View>
          {cronOutputs.length > 0 ? (
            <View style={styles.outputsList}>
              {cronOutputs.map((output) => (
                <CronOutputItem key={output.id} output={output} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="terminal-outline" size={28} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>No recent outputs</Text>
              <Text style={styles.emptyDesc}>
                {connected
                  ? 'Results from your cron jobs and automations will appear here'
                  : 'Connect to a gateway to see automation run history'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowRecipeBuilder(true);
        }}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <LinearGradient
          colors={C.gradient.lobster}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[recipeStyles.fab, { bottom: insets.bottom + 24 }]}
        >
          <Ionicons name="add" size={28} color="white" />
        </LinearGradient>
      </Pressable>

      <RecipeBuilderModal
        visible={showRecipeBuilder}
        onClose={() => setShowRecipeBuilder(false)}
        onSave={handleCreateRecipe}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: C.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 20,
  },
  healthBanner: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  healthTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  healthLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  healthDotWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.text,
  },
  healthStatus: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  healthBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  healthStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  healthStatText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
  },
  healthHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 10,
  },
  toastContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    zIndex: 100,
    alignItems: 'center',
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  toastText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  quickActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  quickActionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.text,
  },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.amber + '30',
  },
  pausedBannerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.amber,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  automationCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
  },
  automationHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pauseAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  pauseAllText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  approvalsList: {
    gap: 10,
  },
  approvalCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 10,
  },
  approvalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  riskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  riskBadgeText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  riskText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  approvalExpiry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textTertiary,
  },
  approvalAction: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  approvalDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },
  approvalSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  approvalSourceText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  approvalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  approvalBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  denyBtn: {
    backgroundColor: C.error + '12',
    borderColor: C.error + '30',
  },
  approveBtn: {
    backgroundColor: C.success + '12',
    borderColor: C.success + '30',
  },
  approveAllP3Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.success + '25',
  },
  approveAllP3Text: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.success,
  },
  automationsList: {
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  automationItem: {
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  automationTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  automationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  automationInfo: {
    flex: 1,
    gap: 4,
  },
  automationName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
  },
  automationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  automationSchedule: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  metaDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.textTertiary,
    marginHorizontal: 4,
  },
  automationLastRun: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  automationRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  automationExpanded: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 6,
  },
  expandedLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textSecondary,
  },
  expandedOutput: {
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  expandedOutputText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    lineHeight: 16,
  },
  analyticsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 14,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analyticsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  analyticsStat: {
    alignItems: 'center',
    gap: 4,
  },
  analyticsValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: C.text,
  },
  analyticsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
  },
  weekBarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 32,
    paddingHorizontal: 8,
  },
  weekBarCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%' as any,
  },
  weekBarTrack: {
    width: 10,
    height: '100%' as any,
    borderRadius: 5,
    backgroundColor: C.surface,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  weekBarFill: {
    width: '100%' as any,
    borderRadius: 5,
  },
  weekLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center' as const,
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: C.textTertiary,
  },
  outputsList: {
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  cronOutputItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  cronStatusIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cronOutputInfo: {
    flex: 1,
    gap: 2,
  },
  cronOutputName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
  },
  cronOutputText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  cronOutputRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cronOutputTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
  },
  cronOutputDuration: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textTertiary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.textSecondary,
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  swipeContainer: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    borderRadius: 14,
  },
  swipeBehind: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    borderRadius: 14,
  },
  swipeAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 24,
  },
  swipeApproveAction: {
    backgroundColor: C.success + '15',
    flex: 1,
    height: '100%' as any,
    borderRadius: 14,
    justifyContent: 'flex-start' as const,
    paddingTop: 0,
  },
  swipeDenyAction: {
    backgroundColor: C.error + '15',
    flex: 1,
    height: '100%' as any,
    borderRadius: 14,
    justifyContent: 'flex-end' as const,
    paddingTop: 0,
  },
  swipeActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  swipeHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingTop: 2,
  },
  swipeHintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textTertiary,
  },
});
