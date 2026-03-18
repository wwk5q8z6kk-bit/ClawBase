import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const C = Colors.dark;

interface Column<T> {
  key: string;
  label: string;
  width?: number;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  searchable?: boolean;
  searchKeys?: string[];
  pageSize?: number;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  searchable = true,
  searchKeys,
  pageSize = 10,
  selectable = false,
  onSelectionChange,
  emptyMessage = 'No data',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let result = data;
    if (search.trim()) {
      const q = search.toLowerCase();
      const keys = searchKeys || columns.map(c => c.key);
      result = result.filter(item =>
        keys.some(k => String(item[k] || '').toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [data, search, sortKey, sortDir, searchKeys, columns]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }, [sortKey]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      onSelectionChange?.(Array.from(next));
      return next;
    });
  }, [onSelectionChange]);

  const toggleAll = useCallback(() => {
    if (selected.size === paged.length) {
      setSelected(new Set());
      onSelectionChange?.([]);
    } else {
      const all = new Set(paged.map(keyExtractor));
      setSelected(all);
      onSelectionChange?.(Array.from(all));
    }
  }, [paged, selected.size, keyExtractor, onSelectionChange]);

  return (
    <View style={styles.container}>
      {searchable && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={14} color={C.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={C.textTertiary}
            value={search}
            onChangeText={t => { setSearch(t); setPage(0); }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={14} color={C.textTertiary} />
            </Pressable>
          )}
        </View>
      )}

      {selectable && selected.size > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{selected.size} selected</Text>
          <Pressable onPress={() => { setSelected(new Set()); onSelectionChange?.([]); }}>
            <Text style={[styles.bulkText, { color: C.primary }]}>Clear</Text>
          </Pressable>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.headerRow}>
            {selectable && (
              <Pressable style={styles.checkCell} onPress={toggleAll}>
                <Ionicons
                  name={selected.size === paged.length && paged.length > 0 ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={selected.size === paged.length && paged.length > 0 ? C.accent : C.textTertiary}
                />
              </Pressable>
            )}
            {columns.map(col => (
              <Pressable
                key={col.key}
                style={[styles.headerCell, { width: col.width || 100 }]}
                onPress={() => col.sortable !== false && handleSort(col.key)}
              >
                <Text style={styles.headerText} numberOfLines={1}>{col.label}</Text>
                {sortKey === col.key && (
                  <Ionicons name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={10} color={C.accent} />
                )}
              </Pressable>
            ))}
          </View>

          {paged.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          ) : (
            paged.map((item, ri) => {
              const id = keyExtractor(item);
              return (
                <View key={id} style={[styles.dataRow, ri % 2 === 0 && styles.dataRowAlt]}>
                  {selectable && (
                    <Pressable style={styles.checkCell} onPress={() => toggleSelect(id)}>
                      <Ionicons
                        name={selected.has(id) ? 'checkbox' : 'square-outline'}
                        size={16}
                        color={selected.has(id) ? C.accent : C.textTertiary}
                      />
                    </Pressable>
                  )}
                  {columns.map(col => (
                    <View key={col.key} style={[styles.dataCell, { width: col.width || 100 }]}>
                      {col.render ? col.render(item) : (
                        <Text style={styles.dataText} numberOfLines={1}>
                          {String(item[col.key] ?? '-')}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {totalPages > 1 && (
        <View style={styles.pagination}>
          <Pressable
            style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
            onPress={() => page > 0 && setPage(page - 1)}
          >
            <Ionicons name="chevron-back" size={14} color={page === 0 ? C.textTertiary : C.text} />
          </Pressable>
          <Text style={styles.pageText}>{page + 1} / {totalPages}</Text>
          <Pressable
            style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
            onPress={() => page < totalPages - 1 && setPage(page + 1)}
          >
            <Ionicons name="chevron-forward" size={14} color={page >= totalPages - 1 ? C.textTertiary : C.text} />
          </Pressable>
          <Text style={styles.totalText}>{filtered.length} items</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.text,
    padding: 0,
  },
  bulkBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.accentMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 6,
  },
  bulkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.accent,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: C.textSecondary,
    textTransform: 'uppercase',
  },
  checkCell: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  dataRowAlt: {
    backgroundColor: C.surface + '40',
  },
  dataCell: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  dataText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.text,
  },
  emptyRow: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  pageBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.text,
  },
  totalText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
});
