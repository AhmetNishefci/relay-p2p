import { memo, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { activityEmptyState, formatActivityTime, projectActivity } from './activity'
import type { ActivityFilter, ActivityItem } from './activity'
import type { Entry, Acknowledgment } from '../shared/protocol'
import { colors, Header, Notice, ui } from './ui'

const filters: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'acknowledgments', label: 'Acknowledgments' },
  { key: 'unacknowledged', label: 'No acknowledgment' }
]
const keyOf = (item: ActivityItem) => item.id

const ActivityRow = memo(function ActivityRow({
  id,
  entryId,
  title,
  type,
  recordedAt,
  writerKey,
  onOpen
}: ActivityItem & { onOpen: (entryId: string) => void }) {
  const time = formatActivityTime(recordedAt)
  const label = type === 'ack' ? 'Acknowledgment record' : 'Entry record'
  const device = writerKey ? `Device key ${writerKey.slice(0, 12)}` : ''
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${label}: ${title}. Device-recorded time: ${time}. ${device}. Open entry.`}
      testID={`activity-${id}`}
      onPress={() => onOpen(entryId)}
      style={({ pressed }) => [styles.record, pressed && styles.pressed]}
    >
      <View style={styles.recordHeader}>
        <View style={[styles.dot, type === 'ack' && styles.ackDot]} accessible={false} />
        <Text style={ui.eyebrow}>{label.toUpperCase()}</Text>
      </View>
      <Text style={styles.recordTitle} numberOfLines={3}>
        {title}
      </Text>
      {!!device && <Text style={ui.caption}>{device}</Text>}
      <View style={ui.between}>
        <Text style={ui.caption}>{time}</Text>
        <Text style={styles.open} accessible={false}>
          Open entry ↗
        </Text>
      </View>
    </Pressable>
  )
})

export function NotebookActivity({
  entries,
  acknowledgments,
  loaded,
  writable,
  filter,
  onFilter,
  onBack,
  onOpen,
  refreshing,
  onRefresh,
  notices,
  hasSkipped
}: {
  entries: Entry[]
  acknowledgments: Acknowledgment[]
  loaded: boolean
  writable: boolean
  filter: ActivityFilter
  onFilter: (filter: ActivityFilter) => void
  onBack: () => void
  onOpen: (entryId: string) => void
  refreshing: boolean
  onRefresh: () => void
  notices: ReactNode
  hasSkipped: boolean
}) {
  const projection = useMemo(
    () => projectActivity(entries, acknowledgments),
    [entries, acknowledgments]
  )
  const rows = projection[filter]
  const empty = activityEmptyState(filter, entries.length)
  const renderItem = useCallback(
    ({ item }: { item: ActivityItem }) => <ActivityRow {...item} onOpen={onOpen} />,
    [onOpen]
  )
  return (
    <>
      <Header title='Notebook activity' onBack={onBack} />
      <FlatList
        testID='activity-list'
        data={loaded ? rows : []}
        keyExtractor={keyOf}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.teal}
            colors={[colors.teal]}
          />
        }
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={ui.eyebrow}>THE WORK, TAKING SHAPE</Text>
            <Text accessibilityRole='header' style={ui.heading}>
              Notebook activity
            </Text>
            <Text style={ui.body}>
              Current entries and explicit acknowledgment records, together in one place.
            </Text>
            <Text style={ui.caption}>
              Times are recorded by devices, not verified delivery or read events. Removed entries
              disappear from this view.
            </Text>
            <View style={ui.between}>
              <Text style={ui.caption} testID='activity-count'>
                {loaded
                  ? `${rows.length} current record${rows.length === 1 ? '' : 's'} on this device`
                  : 'Opening current records…'}
              </Text>
              <Text style={ui.badge} testID='activity-access'>
                {writable ? 'Contributor' : 'Viewer'}
              </Text>
            </View>
            <View style={styles.filters}>
              {filters.map(({ key, label }) => (
                <Pressable
                  key={key}
                  testID={`activity-filter-${key}`}
                  accessibilityRole='tab'
                  accessibilityState={{ selected: filter === key }}
                  onPress={() => onFilter(key)}
                  style={({ pressed }) => [
                    styles.filter,
                    filter === key && styles.selected,
                    pressed && styles.pressed
                  ]}
                >
                  <Text style={[styles.filterText, filter === key && styles.selectedText]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {notices}
            {hasSkipped && <Notice error text='Some unsupported records cannot be displayed.' />}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty} testID='activity-empty'>
            {loaded ? (
              <>
                <Text style={ui.title}>{empty.title}</Text>
                <Text style={ui.body}>{empty.body}</Text>
              </>
            ) : (
              <>
                <ActivityIndicator color={colors.teal} />
                <Text style={ui.caption}>Opening current records…</Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.end}>
            <Text style={ui.caption}>
              Works with records stored here. New peer records appear when a connection is
              available.
            </Text>
            <Text style={ui.caption}>
              Device keys are not verified identities. Other Contributors can change these records.
              This view is not a permanent history.
            </Text>
          </View>
        }
      />
    </>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 24, paddingBottom: 32 },
  intro: { gap: 16, paddingTop: 20, paddingBottom: 12 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: 'center'
  },
  selected: { backgroundColor: colors.teal, borderColor: colors.teal },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.teal },
  selectedText: { color: colors.white },
  pressed: { opacity: 0.75 },
  record: { paddingVertical: 22, gap: 10, borderBottomWidth: 1, borderColor: colors.line },
  recordHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderWidth: 1, borderColor: colors.teal, borderRadius: 4 },
  ackDot: { backgroundColor: colors.teal },
  recordTitle: { fontFamily: 'serif', fontSize: 25, lineHeight: 33, color: colors.ink },
  open: { color: colors.teal, fontSize: 14, fontWeight: '600' },
  empty: { paddingVertical: 32, gap: 12 },
  end: { paddingTop: 28, gap: 12 }
})
