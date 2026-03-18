import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { Card } from '@/components/Card';
import { ViewSwitcher } from '@/components/ViewSwitcher';

import { LineChart } from '@/components/charts/LineChart';
import { ScatterPlot } from '@/components/charts/ScatterPlot';
import { HeatmapChart } from '@/components/charts/HeatmapChart';
import { RadialGauge } from '@/components/charts/RadialGauge';
import { ProgressBar } from '@/components/charts/ProgressBar';
import { SankeyDiagram } from '@/components/charts/SankeyDiagram';
import { TreemapChart } from '@/components/charts/TreemapChart';
import { WordCloud } from '@/components/charts/WordCloud';
import { NetworkGraph } from '@/components/charts/NetworkGraph';
import { GanttChart } from '@/components/charts/GanttChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { BarChart } from '@/components/charts/BarChart';
import { DataTable } from '@/components/DataTable';
import { TreeView } from '@/components/TreeView';
import { getAllLinks } from '@/lib/entityLinks';

const C = Colors.dark;

type SectionKey = 'kpi' | 'trends' | 'heatmap' | 'scatter' | 'sankey' | 'treemap' | 'wordcloud' | 'network' | 'gantt' | 'table' | 'tree';

const SECTION_LABELS: Record<SectionKey, { label: string; icon: string }> = {
  kpi: { label: 'KPI Scorecards', icon: 'speedometer-outline' },
  trends: { label: 'Activity Trends', icon: 'trending-up-outline' },
  heatmap: { label: 'Activity Heatmap', icon: 'grid-outline' },
  scatter: { label: 'Task Analysis', icon: 'scatter-plot' },
  sankey: { label: 'Task Flow', icon: 'git-merge-outline' },
  treemap: { label: 'Data Distribution', icon: 'apps-outline' },
  wordcloud: { label: 'Word Cloud', icon: 'text-outline' },
  network: { label: 'Entity Graph', icon: 'share-social-outline' },
  gantt: { label: 'Gantt Timeline', icon: 'bar-chart-outline' },
  table: { label: 'Data Table', icon: 'list-outline' },
  tree: { label: 'Data Tree', icon: 'folder-open-outline' },
};

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 48, 360);

  const { tasks, calendarEvents, memoryEntries, crmContacts, conversations } = useApp();

  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(new Set());

  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const now = Date.now();
  const dayMs = 86400000;
  const weekMs = dayMs * 7;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const activeTasks = tasks.filter(t => t.status === 'in_progress').length;
  const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'done' && t.status !== 'archived').length;
  const totalContacts = crmContacts.length;
  const totalMemories = memoryEntries.length;
  const totalEvents = calendarEvents.length;
  const totalConversations = conversations.length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const activeRate = totalTasks > 0 ? Math.round((activeTasks / totalTasks) * 100) : 0;

  const weeklyTrends = useMemo(() => {
    const weeks = 8;
    const labels: string[] = [];
    const taskCounts: number[] = [];
    const eventCounts: number[] = [];
    const memoryCounts: number[] = [];

    for (let w = weeks - 1; w >= 0; w--) {
      const wStart = now - (w + 1) * weekMs;
      const wEnd = now - w * weekMs;
      labels.push(`W${weeks - w}`);
      taskCounts.push(tasks.filter(t => t.createdAt >= wStart && t.createdAt < wEnd).length);
      eventCounts.push(calendarEvents.filter(e => e.startTime >= wStart && e.startTime < wEnd).length);
      memoryCounts.push(memoryEntries.filter(m => m.timestamp >= wStart && m.timestamp < wEnd).length);
    }

    return { labels, taskCounts, eventCounts, memoryCounts };
  }, [tasks, calendarEvents, memoryEntries, now]);

  const heatmapData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = ['6a', '9a', '12p', '3p', '6p', '9p'];
    const grid: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));

    const allTimestamps = [
      ...tasks.map(t => t.createdAt),
      ...calendarEvents.map(e => e.startTime),
      ...memoryEntries.map(m => m.timestamp),
    ];

    allTimestamps.forEach(ts => {
      const d = new Date(ts);
      const day = d.getDay();
      const hour = d.getHours();
      let bucket = 0;
      if (hour >= 6 && hour < 9) bucket = 0;
      else if (hour >= 9 && hour < 12) bucket = 1;
      else if (hour >= 12 && hour < 15) bucket = 2;
      else if (hour >= 15 && hour < 18) bucket = 3;
      else if (hour >= 18 && hour < 21) bucket = 4;
      else bucket = 5;
      grid[day][bucket]++;
    });

    return { data: grid, rowLabels: days, colLabels: hours };
  }, [tasks, calendarEvents, memoryEntries]);

  const scatterData = useMemo(() => {
    const priorityMap: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
    return tasks
      .filter(t => t.status === 'done' && t.createdAt)
      .map(t => {
        const ageHours = Math.round((t.updatedAt - t.createdAt) / 3600000);
        return {
          x: priorityMap[t.priority] || 1,
          y: Math.min(ageHours, 200),
          color: t.priority === 'urgent' ? '#FF4444' : t.priority === 'high' ? C.coral : t.priority === 'medium' ? C.amber : C.secondary,
          size: 5,
        };
      });
  }, [tasks]);

  const sankeyData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    tasks.forEach(t => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });

    const nodes = [
      { id: 'created', label: 'Created', color: C.accent },
      { id: 'todo', label: 'To Do', color: C.amber },
      { id: 'in_progress', label: 'Active', color: C.secondary },
      { id: 'done', label: 'Done', color: '#00D68F' },
      { id: 'deferred', label: 'Deferred', color: C.textTertiary },
    ];

    const total = tasks.length || 1;
    const links = [
      { source: 'created', target: 'todo', value: statusCounts['todo'] || 0 },
      { source: 'created', target: 'in_progress', value: statusCounts['in_progress'] || 0 },
      { source: 'created', target: 'deferred', value: statusCounts['deferred'] || 0 },
      { source: 'todo', target: 'in_progress', value: Math.min(statusCounts['in_progress'] || 0, statusCounts['todo'] || 0) },
      { source: 'in_progress', target: 'done', value: statusCounts['done'] || 0 },
    ].filter(l => l.value > 0);

    return { nodes, links };
  }, [tasks]);

  const treemapData = useMemo(() => {
    return [
      { label: 'Tasks', value: totalTasks, color: C.accent },
      { label: 'Events', value: totalEvents, color: C.secondary },
      { label: 'Memories', value: totalMemories, color: C.purple },
      { label: 'Contacts', value: totalContacts, color: C.coral },
      { label: 'Chats', value: totalConversations, color: C.amber },
    ].filter(i => i.value > 0);
  }, [totalTasks, totalEvents, totalMemories, totalContacts, totalConversations]);

  const wordCloudData = useMemo(() => {
    const freq: Record<string, number> = {};
    memoryEntries.forEach(m => {
      m.tags?.forEach(tag => {
        freq[tag] = (freq[tag] || 0) + 1;
      });
      const words = m.title.split(/\s+/).filter(w => w.length > 3);
      words.forEach(w => {
        const lw = w.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (lw.length > 3) freq[lw] = (freq[lw] || 0) + 1;
      });
    });
    tasks.forEach(t => {
      t.tags?.forEach(tag => {
        freq[tag] = (freq[tag] || 0) + 2;
      });
    });

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([text, weight]) => ({ text, weight }));
  }, [memoryEntries, tasks]);

  const networkData = useMemo(() => {
    const nodes: { id: string; label: string; color: string; size: number }[] = [];
    const edges: { source: string; target: string; weight: number }[] = [];

    const entityTypes = [
      { items: tasks.slice(0, 5), type: 'task', color: C.accent, label: (i: any) => i.title },
      { items: crmContacts.slice(0, 4), type: 'contact', color: C.coral, label: (i: any) => i.name },
      { items: memoryEntries.slice(0, 4), type: 'memory', color: C.purple, label: (i: any) => i.title },
      { items: conversations.slice(0, 3), type: 'chat', color: C.amber, label: (i: any) => i.title },
    ];

    entityTypes.forEach(({ items, type, color, label }) => {
      items.forEach(item => {
        nodes.push({ id: `${type}-${item.id}`, label: label(item), color, size: 6 });
      });
    });

    const allIds = nodes.map(n => n.id);
    for (let i = 0; i < allIds.length; i++) {
      for (let j = i + 1; j < allIds.length; j++) {
        const [typeA] = allIds[i].split('-');
        const [typeB] = allIds[j].split('-');
        if (typeA !== typeB && Math.random() > 0.6) {
          edges.push({ source: allIds[i], target: allIds[j], weight: 1 });
        }
      }
    }

    return { nodes, edges };
  }, [tasks, crmContacts, memoryEntries, conversations]);

  const ganttData = useMemo(() => {
    return tasks
      .filter(t => t.dueDate && t.status !== 'archived')
      .slice(0, 10)
      .map(t => {
        const start = t.createdAt;
        const end = t.dueDate || t.createdAt + dayMs * 3;
        const progress = t.status === 'done' ? 1 : t.status === 'in_progress' ? 0.5 : 0;
        return {
          id: t.id,
          label: t.title,
          start,
          end,
          color: t.priority === 'urgent' ? '#FF4444' : t.priority === 'high' ? C.coral : t.priority === 'medium' ? C.amber : C.accent,
          progress,
          isMilestone: false,
        };
      });
  }, [tasks]);

  const tableColumns = useMemo(() => [
    { key: 'title', label: 'Title', width: 160, sortable: true },
    { key: 'status', label: 'Status', width: 90, sortable: true, render: (t: any) => (
      <View style={[styles.statusBadge, { backgroundColor: t.status === 'done' ? C.successMuted : t.status === 'in_progress' ? C.secondaryMuted : C.cardElevated }]}>
        <Text style={[styles.statusText, { color: t.status === 'done' ? C.success : t.status === 'in_progress' ? C.secondary : C.textSecondary }]}>{t.status}</Text>
      </View>
    )},
    { key: 'priority', label: 'Priority', width: 80, sortable: true, render: (t: any) => (
      <Text style={{ color: t.priority === 'urgent' ? '#FF4444' : t.priority === 'high' ? C.coral : C.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 11 }}>{t.priority}</Text>
    )},
    { key: 'dueDate', label: 'Due', width: 80, sortable: true, render: (t: any) => (
      <Text style={{ color: C.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 11 }}>
        {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
      </Text>
    )},
  ], []);

  const treeData = useMemo(() => {
    const tagMap: Record<string, { tasks: number; memories: number; contacts: number }> = {};

    tasks.forEach(t => {
      t.tags?.forEach(tag => {
        if (!tagMap[tag]) tagMap[tag] = { tasks: 0, memories: 0, contacts: 0 };
        tagMap[tag].tasks++;
      });
    });
    memoryEntries.forEach(m => {
      m.tags?.forEach(tag => {
        if (!tagMap[tag]) tagMap[tag] = { tasks: 0, memories: 0, contacts: 0 };
        tagMap[tag].memories++;
      });
    });
    crmContacts.forEach(c => {
      c.tags?.forEach(tag => {
        if (!tagMap[tag]) tagMap[tag] = { tasks: 0, memories: 0, contacts: 0 };
        tagMap[tag].contacts++;
      });
    });

    return [
      {
        id: 'tasks-root',
        label: 'Tasks',
        icon: 'checkbox-outline',
        color: C.accent,
        count: totalTasks,
        children: [
          { id: 'tasks-todo', label: 'To Do', count: tasks.filter(t => t.status === 'todo').length, color: C.amber },
          { id: 'tasks-active', label: 'In Progress', count: activeTasks, color: C.secondary },
          { id: 'tasks-done', label: 'Completed', count: completedTasks, color: C.success },
          { id: 'tasks-deferred', label: 'Deferred', count: tasks.filter(t => t.status === 'deferred').length, color: C.textTertiary },
        ],
      },
      {
        id: 'events-root',
        label: 'Calendar Events',
        icon: 'calendar-outline',
        color: C.secondary,
        count: totalEvents,
        children: [
          { id: 'events-past', label: 'Past', count: calendarEvents.filter(e => e.endTime < now).length, color: C.textTertiary },
          { id: 'events-upcoming', label: 'Upcoming', count: calendarEvents.filter(e => e.startTime > now).length, color: C.secondary },
        ],
      },
      {
        id: 'mem-root',
        label: 'Memories',
        icon: 'bulb-outline',
        color: C.purple,
        count: totalMemories,
        children: [
          { id: 'mem-unread', label: 'Unread', count: memoryEntries.filter(m => m.reviewStatus === 'unread').length, color: C.coral },
          { id: 'mem-reviewed', label: 'Reviewed', count: memoryEntries.filter(m => m.reviewStatus === 'reviewed').length, color: C.success },
        ],
      },
      {
        id: 'crm-root',
        label: 'Contacts',
        icon: 'people-outline',
        color: C.coral,
        count: totalContacts,
        children: crmContacts.length > 0 ? [
          { id: 'crm-lead', label: 'Leads', count: crmContacts.filter(c => c.stage === 'lead').length, color: C.amber },
          { id: 'crm-prospect', label: 'Prospects', count: crmContacts.filter(c => c.stage === 'prospect').length, color: C.accent },
          { id: 'crm-active', label: 'Active', count: crmContacts.filter(c => c.stage === 'active').length, color: C.secondary },
          { id: 'crm-customer', label: 'Customers', count: crmContacts.filter(c => c.stage === 'customer').length, color: C.success },
        ] : [],
      },
      ...Object.keys(tagMap).length > 0 ? [{
        id: 'tags-root',
        label: 'Tags',
        icon: 'pricetags-outline' as string,
        color: C.amber,
        count: Object.keys(tagMap).length,
        children: Object.entries(tagMap).slice(0, 10).map(([tag, counts]) => ({
          id: `tag-${tag}`,
          label: `#${tag}`,
          count: counts.tasks + counts.memories + counts.contacts,
          color: C.amber,
        })),
      }] : [],
    ];
  }, [tasks, calendarEvents, memoryEntries, crmContacts, totalTasks, totalEvents, totalMemories, totalContacts, activeTasks, completedTasks, now, conversations]);

  const renderSectionHeader = (key: SectionKey) => {
    const info = SECTION_LABELS[key];
    const isCollapsed = collapsedSections.has(key);
    const isScatter = key === 'scatter';
    return (
      <Pressable style={styles.sectionHeader} onPress={() => toggleSection(key)}>
        <View style={styles.sectionHeaderLeft}>
          {isScatter ? (
            <MaterialCommunityIcons name="chart-scatter-plot" size={16} color={C.textSecondary} />
          ) : (
            <Ionicons name={info.icon as any} size={16} color={C.textSecondary} />
          )}
          <Text style={styles.sectionTitle}>{info.label}</Text>
        </View>
        <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={C.textTertiary} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {renderSectionHeader('kpi')}
        {!collapsedSections.has('kpi') && (
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <LinearGradient colors={C.gradient.card} style={styles.kpiGradient}>
                <RadialGauge value={completionRate} size={56} strokeWidth={6} color={C.success} label="Done" />
                <View style={styles.kpiInfo}>
                  <Text style={styles.kpiValue}>{completedTasks}</Text>
                  <Text style={styles.kpiLabel}>Completed</Text>
                </View>
              </LinearGradient>
            </View>
            <View style={styles.kpiCard}>
              <LinearGradient colors={C.gradient.card} style={styles.kpiGradient}>
                <RadialGauge value={activeRate} size={56} strokeWidth={6} color={C.secondary} label="Active" />
                <View style={styles.kpiInfo}>
                  <Text style={styles.kpiValue}>{activeTasks}</Text>
                  <Text style={styles.kpiLabel}>In Progress</Text>
                </View>
              </LinearGradient>
            </View>
            <View style={styles.kpiCard}>
              <LinearGradient colors={C.gradient.card} style={styles.kpiGradient}>
                <RadialGauge value={overdueTasks} max={Math.max(totalTasks, 1)} size={56} strokeWidth={6} color={overdueTasks > 0 ? '#FF4444' : C.textTertiary} label="Late" />
                <View style={styles.kpiInfo}>
                  <Text style={[styles.kpiValue, overdueTasks > 0 && { color: '#FF4444' }]}>{overdueTasks}</Text>
                  <Text style={styles.kpiLabel}>Overdue</Text>
                </View>
              </LinearGradient>
            </View>
            <View style={styles.kpiCard}>
              <LinearGradient colors={C.gradient.card} style={styles.kpiGradient}>
                <RadialGauge value={totalContacts} max={Math.max(totalContacts, 10)} size={56} strokeWidth={6} color={C.coral} label="CRM" />
                <View style={styles.kpiInfo}>
                  <Text style={styles.kpiValue}>{totalContacts}</Text>
                  <Text style={styles.kpiLabel}>Contacts</Text>
                </View>
              </LinearGradient>
            </View>
          </View>
        )}

        <View style={styles.progressSection}>
          <ProgressBar value={completedTasks} max={totalTasks || 1} color={C.success} label="Task Completion" />
          <View style={{ height: 10 }} />
          <ProgressBar value={memoryEntries.filter(m => m.reviewStatus === 'reviewed').length} max={totalMemories || 1} color={C.purple} label="Memory Review" />
        </View>

        {renderSectionHeader('trends')}
        {!collapsedSections.has('trends') && (
          <Card style={styles.chartCard}>
            <LineChart
              series={[
                { label: 'Tasks', data: weeklyTrends.taskCounts, color: C.accent },
                { label: 'Events', data: weeklyTrends.eventCounts, color: C.secondary },
                { label: 'Memories', data: weeklyTrends.memoryCounts, color: C.purple },
              ]}
              labels={weeklyTrends.labels}
              width={chartWidth}
              height={180}
            />
          </Card>
        )}

        {renderSectionHeader('heatmap')}
        {!collapsedSections.has('heatmap') && (
          <Card style={styles.chartCard}>
            <HeatmapChart
              data={heatmapData.data}
              rowLabels={heatmapData.rowLabels}
              colLabels={heatmapData.colLabels}
              width={chartWidth}
              height={180}
              title="Activity by Day & Time"
            />
          </Card>
        )}

        {renderSectionHeader('scatter')}
        {!collapsedSections.has('scatter') && (
          <Card style={styles.chartCard}>
            <Text style={styles.chartSubtitle}>Priority vs. Completion Time (hours)</Text>
            <ScatterPlot
              points={scatterData}
              width={chartWidth}
              height={160}
              xLabel="Priority (1=Low → 4=Urgent)"
              yLabel="Hours to Complete"
            />
          </Card>
        )}

        {renderSectionHeader('sankey')}
        {!collapsedSections.has('sankey') && (
          <Card style={styles.chartCard}>
            <Text style={styles.chartSubtitle}>Task Status Flow</Text>
            <SankeyDiagram
              nodes={sankeyData.nodes}
              links={sankeyData.links}
              width={chartWidth}
              height={160}
            />
          </Card>
        )}

        {renderSectionHeader('treemap')}
        {!collapsedSections.has('treemap') && (
          <Card style={styles.chartCard}>
            <Text style={styles.chartSubtitle}>Data Distribution by Type</Text>
            <TreemapChart items={treemapData} width={chartWidth} height={140} />
          </Card>
        )}

        {renderSectionHeader('wordcloud')}
        {!collapsedSections.has('wordcloud') && (
          <Card style={styles.chartCard}>
            <Text style={styles.chartSubtitle}>Tags & Keywords</Text>
            {wordCloudData.length > 0 ? (
              <WordCloud words={wordCloudData} width={chartWidth} height={140} />
            ) : (
              <Text style={styles.emptyChartText}>Add tags to tasks and memories to see your word cloud</Text>
            )}
          </Card>
        )}

        {renderSectionHeader('network')}
        {!collapsedSections.has('network') && (
          <Card style={styles.chartCard}>
            <Text style={styles.chartSubtitle}>Entity Relationships</Text>
            <NetworkGraph
              nodes={networkData.nodes}
              edges={networkData.edges}
              width={chartWidth}
              height={200}
            />
          </Card>
        )}

        {renderSectionHeader('gantt')}
        {!collapsedSections.has('gantt') && (
          <Card style={styles.chartCard}>
            <Text style={styles.chartSubtitle}>Task Timeline</Text>
            {ganttData.length > 0 ? (
              <GanttChart tasks={ganttData} width={Math.max(chartWidth + 100, 500)} />
            ) : (
              <Text style={styles.emptyChartText}>Add due dates to tasks to see your Gantt chart</Text>
            )}
          </Card>
        )}

        {renderSectionHeader('table')}
        {!collapsedSections.has('table') && (
          <Card style={styles.chartCard}>
            <DataTable
              data={tasks}
              columns={tableColumns}
              keyExtractor={t => t.id}
              searchable
              searchKeys={['title', 'status', 'priority']}
              pageSize={8}
              selectable
            />
          </Card>
        )}

        {renderSectionHeader('tree')}
        {!collapsedSections.has('tree') && (
          <Card style={styles.chartCard}>
            <TreeView nodes={treeData} defaultExpanded />
          </Card>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: C.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.text,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  kpiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  kpiInfo: {
    flex: 1,
  },
  kpiValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: C.text,
  },
  kpiLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 2,
  },
  progressSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  chartCard: {
    padding: 16,
    marginBottom: 8,
  },
  chartSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: 10,
  },
  emptyChartText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
});
