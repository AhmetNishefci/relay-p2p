import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Acknowledgment } from '../shared/protocol'

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
  const other = records.filter((record) => record.writerKey !== localWriterKey)
  return (
    <View style={styles.container} testID={`acknowledgments-${entryId}`}>
      <Text testID={`ack-count-${entryId}`}>
        {records.length} acknowledgment{records.length === 1 ? '' : 's'} recorded
      </Text>
      {local && <Text testID={`ack-local-${entryId}`}>Acknowledgment record for this device</Text>}
      {other.map((record) => (
        <Text key={record.writerKey}>Observed for device key {record.writerKey.slice(0, 12)}</Text>
      ))}
      {!writable && <Text>Viewer access cannot acknowledge.</Text>}
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`Acknowledge ${title}`}
        testID={`ack-${entryId}`}
        disabled={busy || !writable || local}
        onPress={onAcknowledge}
        style={[styles.button, (busy || !writable || local) && styles.disabled]}
      >
        <Text>{pending ? 'Recording…' : local ? 'Recorded for this device' : 'Acknowledge'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', backgroundColor: '#e5e7eb' },
  disabled: { opacity: 0.5 }
})
