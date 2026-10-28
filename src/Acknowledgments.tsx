import { StyleSheet, Text, View } from 'react-native'
import type { Acknowledgment } from '../shared/protocol'
import { Button, colors, ui } from './ui'

type Props = {
  entryId: string
  title: string
  records: Acknowledgment[]
  localWriterKey: string
  writable: boolean
  busy: boolean
  pending: boolean
  onAcknowledge: () => void
}
export function Acknowledgments({
  entryId,
  title,
  records,
  localWriterKey,
  writable,
  busy,
  pending,
  onAcknowledge
}: Props) {
  const local = records.some((record) => record.writerKey === localWriterKey)
  return (
    <View style={styles.card} testID={`acknowledgments-${entryId}`}>
      <Text style={ui.eyebrow}>THE HANDOFF</Text>
      <Text accessibilityRole='header' style={ui.title} testID={`ack-count-${entryId}`}>
        {records.length} acknowledgment{records.length === 1 ? '' : 's'} recorded
      </Text>
      <Text style={ui.body}>
        Leave an explicit acknowledgment for the people sharing this notebook.
      </Text>
      {local && (
        <Text
          style={styles.receipt}
          accessibilityLiveRegion='polite'
          testID={`ack-local-${entryId}`}
        >
          ✓ Acknowledgment recorded for this device
        </Text>
      )}
      {records
        .filter((record) => record.writerKey !== localWriterKey)
        .map((record) => (
          <Text key={record.writerKey} style={ui.caption}>
            Observed for device {record.writerKey.slice(0, 12)}
          </Text>
        ))}
      {!writable && (
        <Text style={ui.caption}>
          Viewer access lets you read entries. Only Contributors can acknowledge.
        </Text>
      )}
      {!local && writable && (
        <Button
          label={pending ? 'Recording…' : 'Acknowledge'}
          accessibilityLabel={`Acknowledge ${title}`}
          pending={pending}
          disabled={busy}
          onPress={onAcknowledge}
          testID={`ack-${entryId}`}
        />
      )}
      <Text style={ui.caption}>
        A record is a shared claim, not proof of identity or reading. Other Contributors can change
        these records.
      </Text>
    </View>
  )
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.pale, borderRadius: 20, padding: 22, gap: 16 },
  receipt: { fontSize: 16, lineHeight: 24, color: colors.teal, fontWeight: '600' }
})
