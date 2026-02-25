import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  FlatList,
  Modal,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { CRMContact, CRMInteraction } from '@/lib/types';
import { getLinksFor, type EntityLink } from '@/lib/entityLinks';

const C = Colors.dark;

const LINK_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  conversation: { icon: 'chatbubbles', color: '#5B7FFF', label: 'Chat' },
  task: { icon: 'checkmark-circle', color: '#FFB020', label: 'Task' },
  memory: { icon: 'book', color: '#8B7FFF', label: 'Memory' },
  calendar: { icon: 'calendar', color: '#FF7B5C', label: 'Event' },
  contact: { icon: 'person', color: '#9CA3AF', label: 'Contact' },
};

function ContactLinksSection({ contactId }: { contactId: string }) {
  const [links, setLinks] = React.useState<EntityLink[]>([]);
  const { tasks, memoryEntries, calendarEvents } = useApp();

  React.useEffect(() => {
    getLinksFor('contact', contactId).then(setLinks).catch(() => {});
  }, [contactId]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      getLinksFor('contact', contactId).then(setLinks).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [contactId]);

  if (links.length === 0) return null;

  const getLinkLabel = (link: EntityLink): string => {
    const isSource = link.sourceType === 'contact' && link.sourceId === contactId;
    const otherType = isSource ? link.targetType : link.sourceType;
    const otherId = isSource ? link.targetId : link.sourceId;
    if (otherType === 'task') {
      const t = tasks.find(t => t.id === otherId);
      return t ? t.title : 'Task';
    }
    if (otherType === 'memory') {
      const m = memoryEntries.find(m => m.id === otherId);
      return m ? m.title : 'Memory';
    }
    if (otherType === 'calendar') {
      const e = calendarEvents.find(e => e.id === otherId);
      return e ? e.title : 'Event';
    }
    return LINK_TYPE_CONFIG[otherType]?.label || otherType;
  };

  const handlePress = (link: EntityLink) => {
    const isSource = link.sourceType === 'contact' && link.sourceId === contactId;
    const otherType = isSource ? link.targetType : link.sourceType;
    const otherId = isSource ? link.targetId : link.sourceId;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (otherType === 'conversation') router.push(`/chat/${otherId}`);
    else if (otherType === 'task' || otherType === 'memory') router.push('/(tabs)/vault');
    else if (otherType === 'calendar') router.push('/(tabs)/calendar');
  };

  return (
    <View style={{ gap: 6, marginTop: 12, marginBottom: 8 }}>
      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary }}>Linked Items</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {links.map(link => {
          const isSource = link.sourceType === 'contact' && link.sourceId === contactId;
          const otherType = isSource ? link.targetType : link.sourceType;
          const cfg = LINK_TYPE_CONFIG[otherType] || LINK_TYPE_CONFIG.task;
          return (
            <Pressable
              key={link.id}
              onPress={() => handlePress(link)}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                borderWidth: 1, borderColor: cfg.color + '40',
                backgroundColor: 'rgba(255,255,255,0.03)',
              }, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: cfg.color, maxWidth: 140 }} numberOfLines={1}>
                {getLinkLabel(link)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type ViewMode = 'list' | 'pipeline';
type StageFilter = 'all' | CRMContact['stage'];

const STAGES: { key: CRMContact['stage']; label: string; color: string }[] = [
  { key: 'lead', label: 'Lead', color: C.amber },
  { key: 'prospect', label: 'Prospect', color: C.accent },
  { key: 'active', label: 'Active', color: C.secondary },
  { key: 'customer', label: 'Customer', color: C.coral },
  { key: 'archived', label: 'Archived', color: C.textTertiary },
];

const INTERACTION_ICONS: Record<CRMInteraction['type'], { icon: string; color: string }> = {
  email: { icon: 'mail-outline', color: C.accent },
  meeting: { icon: 'people-outline', color: C.secondary },
  call: { icon: 'call-outline', color: C.coral },
  note: { icon: 'document-text-outline', color: C.amber },
  task: { icon: 'checkbox-outline', color: '#8B7FFF' },
};

function formatTimeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function getContactHealth(contact: CRMContact): { score: number; label: string; color: string; icon: string } {
  const daysSinceLastInteraction = contact.lastInteraction
    ? Math.floor((Date.now() - contact.lastInteraction) / 86400000)
    : 999;
  const interactionCount = contact.interactions.length;
  
  let score = 100;
  if (daysSinceLastInteraction > 30) score -= 40;
  else if (daysSinceLastInteraction > 14) score -= 25;
  else if (daysSinceLastInteraction > 7) score -= 10;
  
  if (interactionCount < 2) score -= 20;
  else if (interactionCount < 5) score -= 10;
  
  if (contact.stage === 'active' || contact.stage === 'customer') score = Math.min(100, score + 10);
  
  score = Math.max(0, Math.min(100, score));
  
  if (score >= 80) return { score, label: 'Strong', color: C.success, icon: 'heart' };
  if (score >= 50) return { score, label: 'Good', color: C.amber, icon: 'heart-half' };
  if (score >= 30) return { score, label: 'Cooling', color: '#FF9F5A', icon: 'heart-dislike' };
  return { score, label: 'At Risk', color: C.primary, icon: 'alert-circle' };
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function ContactAvatar({ name, color, size = 42 }: { name: string; color: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '25' }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35, color }]}>{getInitials(name)}</Text>
    </View>
  );
}

export default function CRMScreen() {
  const insets = useSafeAreaInsets();
  const { crmContacts, createCRMContact, updateCRMContact, deleteCRMContact, addCRMInteraction } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [selectedContact, setSelectedContact] = useState<CRMContact | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newStage, setNewStage] = useState<CRMContact['stage']>('lead');
  const [newInteractionType, setNewInteractionType] = useState<CRMInteraction['type']>('note');
  const [newInteractionTitle, setNewInteractionTitle] = useState('');
  const [newInteractionContent, setNewInteractionContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editStage, setEditStage] = useState<CRMContact['stage']>('lead');

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const filteredContacts = useMemo(() => {
    let contacts = crmContacts;
    if (stageFilter !== 'all') {
      contacts = contacts.filter((c) => c.stage === stageFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      contacts = contacts.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.role && c.role.toLowerCase().includes(q))
      );
    }
    return contacts;
  }, [crmContacts, stageFilter, searchQuery]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGES) {
      counts[s.key] = crmContacts.filter((c) => c.stage === s.key).length;
    }
    return counts;
  }, [crmContacts]);

  const handleCreateContact = useCallback(async () => {
    if (!newName.trim()) return;
    await createCRMContact({
      name: newName.trim(),
      email: newEmail.trim() || undefined,
      company: newCompany.trim() || undefined,
      role: newRole.trim() || undefined,
      stage: newStage,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewName('');
    setNewEmail('');
    setNewCompany('');
    setNewRole('');
    setNewStage('lead');
    setShowAddModal(false);
  }, [newName, newEmail, newCompany, newRole, newStage, createCRMContact]);

  const handleAddInteraction = useCallback(async () => {
    if (!selectedContact || !newInteractionTitle.trim()) return;
    await addCRMInteraction(selectedContact.id, {
      type: newInteractionType,
      title: newInteractionTitle.trim(),
      content: newInteractionContent.trim() || undefined,
      timestamp: Date.now(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewInteractionTitle('');
    setNewInteractionContent('');
    setShowInteractionModal(false);
    const updated = crmContacts.find((c) => c.id === selectedContact.id);
    if (updated) setSelectedContact(updated);
  }, [selectedContact, newInteractionType, newInteractionTitle, newInteractionContent, addCRMInteraction, crmContacts]);

  const handleEditToggle = useCallback(() => {
    if (!selectedContact) return;
    if (!editMode) {
      setEditName(selectedContact.name);
      setEditEmail(selectedContact.email || '');
      setEditCompany(selectedContact.company || '');
      setEditRole(selectedContact.role || '');
      setEditStage(selectedContact.stage);
    }
    setEditMode(!editMode);
  }, [selectedContact, editMode]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedContact || !editName.trim()) return;
    const updates: Partial<CRMContact> = {
      name: editName.trim(),
      email: editEmail.trim() || undefined,
      company: editCompany.trim() || undefined,
      role: editRole.trim() || undefined,
      stage: editStage,
    };
    await updateCRMContact(selectedContact.id, updates);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedContact({ ...selectedContact, ...updates });
    setEditMode(false);
  }, [selectedContact, editName, editEmail, editCompany, editRole, editStage, updateCRMContact]);

  const handleDeleteContact = useCallback(() => {
    if (!selectedContact) return;
    const doDelete = async () => {
      await deleteCRMContact(selectedContact.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedContact(null);
      setEditMode(false);
    };
    if (Platform.OS === 'web') {
      doDelete();
    } else {
      Alert.alert(
        'Delete Contact',
        `Are you sure you want to delete ${selectedContact.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  }, [selectedContact, deleteCRMContact]);

  const renderContactCard = (contact: CRMContact) => {
    const stage = STAGES.find((s) => s.key === contact.stage);
    return (
      <Pressable
        key={contact.id}
        style={[styles.contactCard, C.shadow.card]}
        onPress={() => setSelectedContact(contact)}
      >
        <ContactAvatar name={contact.name} color={stage?.color || C.coral} />
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{contact.name}</Text>
          <Text style={styles.contactDetail} numberOfLines={1}>
            {[contact.role, contact.company].filter(Boolean).join(' at ') || contact.email || 'No details'}
          </Text>
          {contact.lastInteraction && (
            <Text style={styles.contactTime}>Last: {formatTimeAgo(contact.lastInteraction)}</Text>
          )}
          {(() => {
            const health = getContactHealth(contact);
            return (
              <View style={styles.healthRow}>
                <Ionicons name={health.icon as any} size={12} color={health.color} />
                <View style={styles.healthBar}>
                  <View style={[styles.healthBarFill, { width: `${health.score}%`, backgroundColor: health.color }]} />
                </View>
              </View>
            );
          })()}
        </View>
        <View style={[styles.stageBadge, { backgroundColor: (stage?.color || C.coral) + '20' }]}>
          <Text style={[styles.stageText, { color: stage?.color || C.coral }]}>{stage?.label || contact.stage}</Text>
        </View>
      </Pressable>
    );
  };

  const renderPipelineView = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineScroll}>
      {STAGES.filter((s) => s.key !== 'archived').map((stage) => {
        const stageContacts = crmContacts.filter((c) => c.stage === stage.key);
        return (
          <View key={stage.key} style={styles.pipelineColumn}>
            <LinearGradient
              colors={[stage.color + '20', stage.color + '08']}
              style={styles.pipelineHeaderGradient}
            >
              <View style={[styles.pipelineDot, { backgroundColor: stage.color }]} />
              <Text style={styles.pipelineTitle}>{stage.label}</Text>
              <View style={[styles.pipelineCount, { backgroundColor: stage.color + '20' }]}>
                <Text style={[styles.pipelineCountText, { color: stage.color }]}>{stageContacts.length}</Text>
              </View>
            </LinearGradient>
            <ScrollView showsVerticalScrollIndicator={false}>
              {stageContacts.map((contact) => (
                <Pressable
                  key={contact.id}
                  style={[styles.pipelineCard, { borderLeftColor: stage.color }]}
                  onPress={() => setSelectedContact(contact)}
                >
                  <ContactAvatar name={contact.name} color={stage.color} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pipelineCardName} numberOfLines={1}>{contact.name}</Text>
                    <Text style={styles.pipelineCardDetail} numberOfLines={1}>
                      {contact.company || contact.email || ''}
                    </Text>
                  </View>
                  <Text style={styles.pipelineCardInteractions}>{contact.interactions.length}</Text>
                  <View style={[styles.pipelineHealthDot, { backgroundColor: getContactHealth(contact).color }]} />
                </Pressable>
              ))}
              {stageContacts.length === 0 && (
                <View style={styles.pipelineEmpty}>
                  <Text style={styles.pipelineEmptyText}>No contacts</Text>
                </View>
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );

  const renderContactDetail = () => {
    if (!selectedContact) return null;
    const stage = STAGES.find((s) => s.key === selectedContact.stage);
    const sortedInteractions = [...selectedContact.interactions].sort((a, b) => b.timestamp - a.timestamp);

    return (
      <Modal visible={!!selectedContact} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.detailSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.detailHeader}>
              <Pressable onPress={() => { setSelectedContact(null); setEditMode(false); }} style={styles.detailClose}>
                <Ionicons name="chevron-down" size={24} color={C.textSecondary} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={handleEditToggle} style={styles.detailClose}>
                  <Ionicons name={editMode ? 'close' : 'pencil'} size={18} color={editMode ? C.coral : C.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowInteractionModal(true);
                  }}
                >
                  <LinearGradient colors={C.gradient.lobster} style={styles.detailAddBtn}>
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.detailAddText}>Log</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>

            {editMode ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={C.textTertiary}
                  value={editName}
                  onChangeText={setEditName}
                />
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={C.textTertiary}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  keyboardType="email-address"
                />
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Company</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Company"
                      placeholderTextColor={C.textTertiary}
                      value={editCompany}
                      onChangeText={setEditCompany}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Role</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Role"
                      placeholderTextColor={C.textTertiary}
                      value={editRole}
                      onChangeText={setEditRole}
                    />
                  </View>
                </View>
                <Text style={styles.fieldLabel}>Stage</Text>
                <View style={styles.stageSelector}>
                  {STAGES.filter((s) => s.key !== 'archived').map((s) => (
                    <Pressable
                      key={s.key}
                      style={[styles.stageOption, editStage === s.key && { backgroundColor: s.color + '25', borderColor: s.color }]}
                      onPress={() => setEditStage(s.key)}
                    >
                      <View style={[styles.stageOptionDot, { backgroundColor: s.color }]} />
                      <Text style={[styles.stageOptionText, editStage === s.key && { color: s.color }]}>{s.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={handleSaveEdit}>
                  <LinearGradient colors={C.gradient.lobster} style={styles.createBtn}>
                    <Text style={styles.createBtnText}>Save Changes</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={handleDeleteContact} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={C.error} />
                  <Text style={styles.deleteBtnText}>Delete Contact</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <>
                <View style={styles.detailProfile}>
                  <ContactAvatar name={selectedContact.name} color={stage?.color || C.coral} size={56} />
                  <View style={styles.detailProfileInfo}>
                    <Text style={styles.detailName}>{selectedContact.name}</Text>
                    <Text style={styles.detailRole}>
                      {[selectedContact.role, selectedContact.company].filter(Boolean).join(' at ')}
                    </Text>
                    {selectedContact.email && (
                      <Text style={styles.detailEmail}>{selectedContact.email}</Text>
                    )}
                  </View>
                  <View style={[styles.stageBadge, { backgroundColor: (stage?.color || C.coral) + '20' }]}>
                    <Text style={[styles.stageText, { color: stage?.color || C.coral }]}>{stage?.label}</Text>
                  </View>
                </View>

                <View style={styles.detailStats}>
                  <View style={styles.detailStat}>
                    <Text style={[styles.detailStatVal, { color: C.coral }]}>{sortedInteractions.length}</Text>
                    <Text style={styles.detailStatLabel}>Interactions</Text>
                  </View>
                  <View style={styles.detailStatDivider} />
                  <View style={styles.detailStat}>
                    <Text style={[styles.detailStatVal, { color: C.accent }]}>
                      {sortedInteractions.filter((i) => i.type === 'email').length}
                    </Text>
                    <Text style={styles.detailStatLabel}>Emails</Text>
                  </View>
                  <View style={styles.detailStatDivider} />
                  <View style={styles.detailStat}>
                    <Text style={[styles.detailStatVal, { color: C.secondary }]}>
                      {sortedInteractions.filter((i) => i.type === 'meeting').length}
                    </Text>
                    <Text style={styles.detailStatLabel}>Meetings</Text>
                  </View>
                </View>

                {(() => {
                  const health = getContactHealth(selectedContact);
                  return (
                    <View style={styles.healthSection}>
                      <View style={styles.healthScoreRow}>
                        <Ionicons name={health.icon as any} size={18} color={health.color} />
                        <Text style={[styles.healthScoreLabel, { color: health.color }]}>
                          {health.label} Relationship
                        </Text>
                        <Text style={[styles.healthScoreValue, { color: health.color }]}>{health.score}%</Text>
                      </View>
                      <View style={styles.healthBarLarge}>
                        <View style={[styles.healthBarLargeFill, { width: `${health.score}%`, backgroundColor: health.color }]} />
                      </View>
                    </View>
                  );
                })()}

                <Text style={styles.timelineTitle}>Interaction Timeline</Text>

                <ScrollView showsVerticalScrollIndicator={false} style={styles.timelineScroll}>
                  {sortedInteractions.length === 0 ? (
                    <View style={styles.emptyTimeline}>
                      <MaterialCommunityIcons name="timeline-outline" size={32} color={C.textTertiary} />
                      <Text style={styles.emptyTimelineText}>No interactions yet</Text>
                    </View>
                  ) : (
                    sortedInteractions.map((interaction, i) => {
                      const config = INTERACTION_ICONS[interaction.type];
                      return (
                        <View key={interaction.id} style={styles.timelineItem}>
                          <View style={styles.timelineLine}>
                            <View style={[styles.timelineIcon, { backgroundColor: config.color + '20' }]}>
                              <Ionicons name={config.icon as any} size={14} color={config.color} />
                            </View>
                            {i < sortedInteractions.length - 1 && <View style={styles.timelineConnector} />}
                          </View>
                          <View style={styles.timelineContent}>
                            <View style={styles.timelineContentHeader}>
                              <Text style={styles.timelineContentTitle}>{interaction.title}</Text>
                              <Text style={styles.timelineContentTime}>{formatTimeAgo(interaction.timestamp)}</Text>
                            </View>
                            {interaction.content && (
                              <Text style={styles.timelineContentText} numberOfLines={3}>{interaction.content}</Text>
                            )}
                            <View style={[styles.interactionTypeBadge, { backgroundColor: config.color + '15' }]}>
                              <Ionicons name={config.icon as any} size={10} color={config.color} style={{ marginRight: 4 }} />
                              <Text style={[styles.interactionTypeText, { color: config.color }]}>{interaction.type}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                <Pressable onPress={handleDeleteContact} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={C.error} />
                  <Text style={styles.deleteBtnText}>Delete Contact</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.headerGradient}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="crm-back">
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Contacts</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowAddModal(true);
            }}
            testID="crm-add"
          >
            <LinearGradient colors={C.gradient.lobster} style={styles.addBtnGrad}>
              <Ionicons name="person-add" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.viewToggle}>
        <Pressable
          style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
          onPress={() => { setViewMode('list'); Haptics.selectionAsync(); }}
        >
          <Ionicons name="list" size={16} color={viewMode === 'list' ? C.coral : C.textSecondary} />
          <Text style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}>List</Text>
        </Pressable>
        <Pressable
          style={[styles.viewToggleBtn, viewMode === 'pipeline' && styles.viewToggleBtnActive]}
          onPress={() => { setViewMode('pipeline'); Haptics.selectionAsync(); }}
        >
          <Ionicons name="git-branch" size={16} color={viewMode === 'pipeline' ? C.coral : C.textSecondary} />
          <Text style={[styles.viewToggleText, viewMode === 'pipeline' && styles.viewToggleTextActive]}>Pipeline</Text>
        </Pressable>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: C.text }]}>{crmContacts.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        {STAGES.filter((s) => s.key !== 'archived').map((s) => (
          <View key={s.key} style={styles.statItem}>
            <Text style={[styles.statNumber, { color: s.color }]}>{stageCounts[s.key] || 0}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor={C.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={C.textTertiary} />
          </Pressable>
        )}
      </View>

      {viewMode === 'list' && (
        <FlatList
          horizontal
          data={[{ key: 'all', label: 'All', color: C.text }, ...STAGES]}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.filterChip, stageFilter === item.key && { backgroundColor: (item.color || C.coral) + '20' }]}
              onPress={() => { setStageFilter(item.key as StageFilter); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.filterChipText, stageFilter === item.key && { color: item.color || C.coral }]}>
                {item.label}
              </Text>
            </Pressable>
          )}
          scrollEnabled={true}
        />
      )}

      {viewMode === 'list' ? (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!filteredContacts.length}
        >
          {filteredContacts.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-group-outline" size={40} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>No contacts yet</Text>
              <Text style={styles.emptySubtitle}>Add contacts to track relationships and interactions</Text>
              <Pressable onPress={() => setShowAddModal(true)} style={styles.emptyAddBtn}>
                <Text style={styles.emptyAddText}>Add Contact</Text>
              </Pressable>
            </View>
          ) : (
            filteredContacts.map(renderContactCard)
          )}
        </ScrollView>
      ) : (
        renderPipelineView()
      )}

      {renderContactDetail()}

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Contact</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={C.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={C.textTertiary}
              value={newName}
              onChangeText={setNewName}
              testID="contact-name-input"
            />
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor={C.textTertiary}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
            />
            <View style={styles.rowInputs}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Company"
                placeholderTextColor={C.textTertiary}
                value={newCompany}
                onChangeText={setNewCompany}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Role"
                placeholderTextColor={C.textTertiary}
                value={newRole}
                onChangeText={setNewRole}
              />
            </View>

            <Text style={styles.fieldLabel}>Stage</Text>
            <View style={styles.stageSelector}>
              {STAGES.filter((s) => s.key !== 'archived').map((stage) => (
                <Pressable
                  key={stage.key}
                  style={[styles.stageOption, newStage === stage.key && { backgroundColor: stage.color + '25', borderColor: stage.color }]}
                  onPress={() => setNewStage(stage.key)}
                >
                  <View style={[styles.stageOptionDot, { backgroundColor: stage.color }]} />
                  <Text style={[styles.stageOptionText, newStage === stage.key && { color: stage.color }]}>{stage.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={handleCreateContact} testID="create-contact-btn">
              <LinearGradient colors={C.gradient.lobster} style={styles.createBtn}>
                <Text style={styles.createBtnText}>Create Contact</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showInteractionModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Interaction</Text>
              <Pressable onPress={() => setShowInteractionModal(false)}>
                <Ionicons name="close" size={24} color={C.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.interactionTypes}>
              {(Object.keys(INTERACTION_ICONS) as CRMInteraction['type'][]).map((type) => {
                const config = INTERACTION_ICONS[type];
                const isSelected = newInteractionType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.interactionTypeBtn, isSelected && { backgroundColor: config.color + '20', borderColor: config.color }]}
                    onPress={() => setNewInteractionType(type)}
                  >
                    <Ionicons name={config.icon as any} size={18} color={isSelected ? config.color : C.textSecondary} />
                    <Text style={[styles.interactionTypeBtnText, isSelected && { color: config.color }]}>{type}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor={C.textTertiary}
              value={newInteractionTitle}
              onChangeText={setNewInteractionTitle}
            />
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder="Notes (optional)"
              placeholderTextColor={C.textTertiary}
              value={newInteractionContent}
              onChangeText={setNewInteractionContent}
              multiline
            />

            <Pressable onPress={handleAddInteraction}>
              <LinearGradient colors={C.gradient.lobster} style={styles.createBtn}>
                <Text style={styles.createBtnText}>Log Interaction</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  headerGradient: { paddingBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  addBtnGrad: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  viewToggle: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.card, borderRadius: 10, padding: 3, marginBottom: 8 },
  viewToggleBtn: { flex: 1, flexDirection: 'row', paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 8, gap: 6 },
  viewToggleBtnActive: { backgroundColor: C.coral + '20' },
  viewToggleText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  viewToggleTextActive: { color: C.coral },
  statsCard: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 2 },
  statNumber: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.borderLight, height: 44, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, height: 44 },
  filterScroll: { paddingHorizontal: 16, gap: 6, marginBottom: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: C.card },
  filterChipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  listContent: { paddingHorizontal: 16 },
  contactCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.borderLight, gap: 12 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold' },
  contactInfo: { flex: 1, gap: 2 },
  contactName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text },
  contactDetail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary },
  contactTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  stageBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  stageText: { fontFamily: 'Inter_500Medium', fontSize: 11, textTransform: 'capitalize' as const },
  pipelineScroll: { paddingHorizontal: 12, gap: 8, paddingBottom: 100 },
  pipelineColumn: { width: 220, backgroundColor: C.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.borderLight },
  pipelineHeaderGradient: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingBottom: 8, paddingHorizontal: 4, paddingTop: 4, borderRadius: 8 },
  pipelineDot: { width: 8, height: 8, borderRadius: 4 },
  pipelineTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text, flex: 1 },
  pipelineCount: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pipelineCountText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  pipelineCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, padding: 10, marginBottom: 6, gap: 8, borderLeftWidth: 3 },
  pipelineCardName: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text },
  pipelineCardDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  pipelineCardInteractions: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.textTertiary },
  pipelineEmpty: { alignItems: 'center', paddingVertical: 20 },
  pipelineEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.textSecondary, marginTop: 6 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center' as const },
  emptyAddBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.coral + '20', borderRadius: 8 },
  emptyAddText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.coral },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  detailSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  detailClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  detailAddBtn: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: 'center', gap: 4 },
  detailAddText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#fff' },
  detailProfile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  detailProfileInfo: { flex: 1 },
  detailName: { fontFamily: 'Inter_700Bold', fontSize: 18, color: C.text },
  detailRole: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary, marginTop: 2 },
  detailEmail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.accent, marginTop: 2 },
  detailStats: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 16 },
  detailStat: { flex: 1, alignItems: 'center' },
  detailStatVal: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  detailStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary, marginTop: 2 },
  detailStatDivider: { width: 1, height: 28, backgroundColor: C.borderLight, alignSelf: 'center' as const },
  timelineTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text, marginBottom: 12 },
  timelineScroll: { flex: 1 },
  emptyTimeline: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyTimelineText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary },
  timelineItem: { flexDirection: 'row', marginBottom: 4 },
  timelineLine: { width: 36, alignItems: 'center' },
  timelineIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  timelineConnector: { width: 2, flex: 1, backgroundColor: C.borderLight, marginVertical: 4 },
  timelineContent: { flex: 1, backgroundColor: C.card, borderRadius: 10, padding: 10, marginLeft: 8, marginBottom: 8, borderWidth: 1, borderColor: C.borderLight },
  timelineContentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineContentTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text, flex: 1 },
  timelineContentTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  timelineContentText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 4 },
  interactionTypeBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 6 },
  interactionTypeText: { fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'capitalize' as const },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: C.text },
  input: { backgroundColor: C.card, borderRadius: 10, padding: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, marginBottom: 12, borderWidth: 1, borderColor: C.borderLight },
  rowInputs: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary, marginBottom: 8 },
  stageSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  stageOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
  stageOptionDot: { width: 6, height: 6, borderRadius: 3 },
  stageOptionText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  interactionTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  interactionTypeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
  interactionTypeBtnText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary, textTransform: 'capitalize' as const },
  createBtn: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  createBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 8 },
  deleteBtnText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.error },
  healthRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 3 },
  healthBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: C.border, maxWidth: 60 },
  healthBarFill: { height: 3, borderRadius: 2 },
  healthSection: { backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.borderLight, gap: 8, marginBottom: 8 },
  healthScoreRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  healthScoreLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1 },
  healthScoreValue: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  healthBarLarge: { height: 6, borderRadius: 3, backgroundColor: C.border },
  healthBarLargeFill: { height: 6, borderRadius: 3 },
  pipelineHealthDot: { width: 8, height: 8, borderRadius: 4 },
});
