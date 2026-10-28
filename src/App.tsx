import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useNotebook } from './useNotebook'
import { PairingPanel } from './PairingPanel'
import { Acknowledgments } from './Acknowledgments'
import { Brand, Button, Header, Notice, colors, ui } from './ui'
import type { Entry } from '../shared/protocol'

const ScreenRoot = Platform.OS === 'ios' ? SafeAreaView : View

type Screen = 'home' | 'editor' | 'detail' | 'sharing' | 'join'
const dateOf = (date: number) =>
  new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function App() {
  const notebook = useNotebook()
  const { worker, entries, acknowledgments, localWriterKey, busy } = notebook
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const ready = worker.state === 'ready'
  const selected = entries.find((entry) => entry.id === selectedId)
  const dirty = title.length > 0 || body.length > 0

  function go(next: Screen) {
    Keyboard.dismiss()
    notebook.clearFeedback()
    setScreen(next)
  }
  function back() {
    if (busy) return
    if (screen === 'editor' && dirty) {
      Alert.alert(
        'Discard this draft?',
        'This only discards the text on this screen. Notebook entries are kept.',
        [
          { text: 'Keep writing', style: 'cancel' },
          {
            text: 'Discard draft',
            style: 'destructive',
            onPress: () => {
              setTitle('')
              setBody('')
              go('home')
            }
          }
        ]
      )
    } else go('home')
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false
      back()
      return true
    })
    return () => subscription.remove()
  })

  function openEntry(entry: Entry) {
    setSelectedId(entry.id)
    go('detail')
  }
  async function save() {
    if (!title.trim() || busy) return
    Keyboard.dismiss()
    const entry = await notebook.addEntry(title, body)
    if (entry) {
      setTitle('')
      setBody('')
      setSelectedId(entry.id)
      setScreen('detail')
    }
  }
  function remove(entry: Entry) {
    Alert.alert(
      'Remove this entry?',
      'It will disappear from this shared notebook. Retained copies and acknowledgment records are not erased.',
      [
        { text: 'Keep entry', style: 'cancel' },
        {
          text: 'Remove entry',
          style: 'destructive',
          onPress: async () => {
            if (await notebook.removeEntry(entry.id)) setScreen('home')
          }
        }
      ]
    )
  }
  const notices = (
    <View style={styles.notices}>
      {(!!notebook.error || notebook.mutationUnknown) && (
        <View style={ui.stack}>
          <Notice
            text={
              notebook.error ||
              'An earlier change may already be recorded. Check again to review the notebook before retrying.'
            }
            error
          />
          <Button
            label='Check again'
            variant='quiet'
            onPress={async () => {
              if (await notebook.checkStatus()) {
                Keyboard.dismiss()
                setScreen('home')
              }
            }}
            disabled={busy}
          />
        </View>
      )}
      {!!notebook.feedback && <Notice text={notebook.feedback} />}
    </View>
  )
  const updateNotice = notebook.pearStatus && (
    <View style={ui.content}>
      <Notice
        text={
          notebook.pearStatus === 'incompatible'
            ? `Get the latest Relay version from the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'}.`
            : notebook.pearStatus === 'failed'
              ? notebook.pearError
              : notebook.pearStatus === 'updated'
                ? 'An app update is ready.'
                : 'Preparing an app update…'
        }
        error={notebook.pearStatus === 'failed'}
      />
      {(notebook.pearStatus === 'updated' || notebook.pearStatus === 'applying') && (
        <Button
          label={notebook.pearStatus === 'applying' ? 'Updating…' : 'Apply update'}
          pending={notebook.pearStatus === 'applying'}
          onPress={notebook.applyUpdate}
        />
      )}
    </View>
  )

  let content
  if (worker.state === 'starting') {
    content = (
      <View style={[ui.content, styles.center]}>
        <Brand />
        <ActivityIndicator color={colors.teal} />
        <Text style={ui.body}>Opening your notebook…</Text>
        {notices}
      </View>
    )
  } else if (!ready) {
    content = (
      <>
        {screen === 'join' && worker.state === 'idle' && (
          <Header title='Join a notebook' onBack={back} />
        )}
        <ScrollView
          contentContainerStyle={[ui.content, { flexGrow: 1 }]}
          keyboardShouldPersistTaps='handled'
        >
          <Brand />
          {worker.state === 'idle' && screen !== 'join' ? (
            <>
              <View style={styles.welcomeArt} accessible={false}>
                <View style={styles.paperBack} />
                <View style={styles.paperFront}>
                  <Text style={ui.eyebrow}>FIELD NOTE / 001</Text>
                  <Text style={[ui.heading, { fontSize: 32 }]}>
                    A little context.{'\n'}A clear handoff.
                  </Text>
                  <View style={ui.divider} />
                  <Text style={ui.caption}>Captured here. Shared directly.</Text>
                </View>
              </View>
              <Text
                accessibilityRole='header'
                style={[ui.heading, { fontSize: 44, lineHeight: 50 }]}
              >
                Good work,{'\n'}passed along.
              </Text>
              <Text style={ui.body}>
                A shared field notebook with direct peer exchange and explicit acknowledgments.
              </Text>
              <Text style={ui.caption}>
                Save on your device, even offline. Peer exchange needs a connection and both apps
                open.
              </Text>
              <PairingPanel status={worker} mode='welcome' onJoin={() => go('join')} />
            </>
          ) : (
            <>
              <Text accessibilityRole='header' style={ui.heading}>
                {worker.state === 'joining'
                  ? 'Making a connection.'
                  : worker.state === 'idle'
                    ? 'Bring your notebook.'
                    : 'Your notes are retained.'}
              </Text>
              <PairingPanel status={worker} mode='join' />
              {worker.state === 'failed' || worker.state === 'closed' ? (
                <Text style={ui.body}>
                  Close and reopen Relay to start again. Existing notebook data will be kept.
                </Text>
              ) : null}
            </>
          )}
          {notices}
          {!ready && worker.state !== 'idle' && worker.state !== 'joining' && (
            <Button label='Check again' variant='secondary' onPress={notebook.checkStatus} />
          )}
        </ScrollView>
      </>
    )
  } else if (screen === 'sharing') {
    content = (
      <>
        <Header title='Sharing & access' onBack={back} />
        <ScrollView keyboardShouldPersistTaps='handled' contentContainerStyle={ui.content}>
          <PairingPanel status={worker} mode='sharing' />
          {updateNotice}
        </ScrollView>
      </>
    )
  } else if (screen === 'editor') {
    content = (
      <>
        <Header title='New entry' onBack={back} />
        <ScrollView keyboardShouldPersistTaps='handled' contentContainerStyle={ui.content}>
          <Text style={ui.eyebrow}>CAPTURE THE CONTEXT</Text>
          <Text style={ui.caption}>What should the next person know?</Text>
          <Text style={ui.label}>Title · required</Text>
          <TextInput
            accessibilityLabel='Entry title'
            testID='entry-title'
            placeholder='Give it a clear title'
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            autoFocus
            editable={!busy}
            style={[styles.editorTitle, { minHeight: 64 }]}
            multiline
          />
          <View style={ui.divider} />
          <Text style={ui.label}>Field notes</Text>
          <TextInput
            accessibilityLabel='Entry body'
            testID='entry-body'
            placeholder='Observations, decisions, and details…'
            placeholderTextColor={colors.muted}
            value={body}
            onChangeText={setBody}
            maxLength={8000}
            multiline
            textAlignVertical='top'
            editable={!busy}
            style={styles.editorBody}
          />
          <Text style={ui.caption}>
            {title.length}/120 title · {body.length}/8,000 notes
          </Text>
          {notices}
        </ScrollView>
        <View style={ui.footer}>
          <Button
            label={busy ? 'Saving…' : 'Save entry'}
            pending={busy}
            disabled={!title.trim() || !worker.writable || notebook.mutationUnknown}
            onPress={save}
            testID='add-entry'
          />
          <Text style={[ui.caption, { textAlign: 'center' }]}>
            Saves on this device. Acknowledgment is a separate action.
          </Text>
        </View>
      </>
    )
  } else if (screen === 'detail') {
    content = (
      <>
        <Header title='Field entry' onBack={back} />
        <ScrollView contentContainerStyle={ui.content}>
          {selected ? (
            <>
              <Text style={ui.eyebrow}>
                FIELD NOTE · {dateOf(selected.createdAt).toUpperCase()}
              </Text>
              <Text accessibilityRole='header' selectable style={ui.heading} testID='detail-title'>
                {selected.title}
              </Text>
              <View style={ui.divider} />
              <Text selectable style={styles.detailBody}>
                {selected.body || 'No additional notes.'}
              </Text>
              {notices}
              <Acknowledgments
                entryId={selected.id}
                title={selected.title}
                records={acknowledgments.filter((ack) => ack.entryId === selected.id)}
                localWriterKey={localWriterKey}
                writable={worker.writable}
                busy={busy || notebook.mutationUnknown}
                pending={notebook.pendingAcknowledgment === selected.id}
                onAcknowledge={() => notebook.acknowledgeEntry(selected.id)}
              />
              {worker.writable && (
                <Button
                  label='Remove entry'
                  variant='danger'
                  disabled={busy || notebook.mutationUnknown}
                  onPress={() => remove(selected)}
                  testID='remove-entry'
                />
              )}
            </>
          ) : (
            <View style={ui.card}>
              <Text style={ui.title}>This entry is no longer here.</Text>
              <Text style={ui.body}>It may have been removed from the shared notebook.</Text>
              <Button label='Back to notebook' onPress={() => go('home')} />
            </View>
          )}
        </ScrollView>
      </>
    )
  } else {
    content = (
      <>
        <View style={[ui.between, styles.homeHeader]}>
          <Brand />
          <Button
            label='Share'
            variant='secondary'
            onPress={() => go('sharing')}
            testID='open-sharing'
          />
        </View>
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              tintColor={colors.teal}
              colors={[colors.teal]}
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true)
                try {
                  await notebook.refresh()
                } finally {
                  setRefreshing(false)
                }
              }}
            />
          }
          ListHeaderComponent={
            <View style={styles.listIntro}>
              <Text style={ui.eyebrow}>YOUR SHARED FIELD BOOK</Text>
              <Text accessibilityRole='header' style={ui.heading}>
                Field notebook
              </Text>
              <View style={ui.between}>
                <Text style={ui.caption}>
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · Stored on this
                  device
                </Text>
                <Text testID='access-role' style={ui.badge}>
                  {worker.writable ? 'Contributor' : 'Viewer'}
                </Text>
              </View>
              {notices}
              {(notebook.skipped > 0 || notebook.skippedAcknowledgments > 0) && (
                <Notice
                  error
                  text='Some records use an unsupported format and cannot be displayed.'
                />
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              {notebook.loaded ? (
                <>
                  <Text style={styles.emptyNumber}>01</Text>
                  <Text style={ui.title}>Every handoff starts with a note.</Text>
                  <Text style={[ui.body, { textAlign: 'center' }]}>
                    {worker.writable
                      ? 'Capture an observation, add context, and invite someone to carry it forward.'
                      : 'Entries from Contributors will appear here when exchanged with this device.'}
                  </Text>
                </>
              ) : (
                <>
                  <ActivityIndicator color={colors.teal} />
                  <Text style={ui.caption}>Opening entries…</Text>
                </>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            const count = acknowledgments.filter((ack) => ack.entryId === item.id).length
            return (
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={`Open entry: ${item.title}. ${count} acknowledgments recorded.`}
                onPress={() => openEntry(item)}
                testID={`entry-${item.id}`}
                style={({ pressed }) => [
                  styles.entryCard,
                  pressed && { backgroundColor: colors.pale }
                ]}
              >
                <View style={ui.between}>
                  <Text style={ui.eyebrow}>NOTE {String(index + 1).padStart(2, '0')}</Text>
                  <Text style={ui.caption}>{dateOf(item.createdAt)}</Text>
                </View>
                <Text style={styles.entryTitle} numberOfLines={3}>
                  {item.title}
                </Text>
                {!!item.body && (
                  <Text numberOfLines={2} style={ui.caption}>
                    {item.body}
                  </Text>
                )}
                <View style={ui.between}>
                  <Text style={[ui.caption, count > 0 && { color: colors.teal }]}>
                    {count
                      ? `${count} acknowledgment${count === 1 ? '' : 's'} recorded`
                      : 'No acknowledgments yet'}
                  </Text>
                  <Text style={ui.caption} accessible={false}>
                    ↗
                  </Text>
                </View>
              </Pressable>
            )
          }}
          ListFooterComponent={
            <View style={styles.listEnd}>
              <Text style={ui.caption}>Made for the work between people.</Text>
              <Text style={[ui.caption, { textAlign: 'center' }]}>
                Peer exchange happens while connected. Acknowledgments are explicit actions, not
                delivery receipts.
              </Text>
              {updateNotice}
            </View>
          }
        />
        <View style={ui.footer}>
          {worker.writable ? (
            <Button label='+ New entry' onPress={() => go('editor')} testID='new-entry' />
          ) : (
            <Text style={[ui.body, { textAlign: 'center' }]}>Viewer access · Read only</Text>
          )}
        </View>
      </>
    )
  }
  return (
    <ScreenRoot style={styles.safe}>
      <StatusBar style='dark' />
      <KeyboardAvoidingView
        key={ready ? screen : 'welcome'}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={ui.page}
      >
        {content}
      </KeyboardAvoidingView>
    </ScreenRoot>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 24) : 0,
    paddingBottom: Platform.OS === 'android' ? 28 : 0
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  homeHeader: { paddingHorizontal: 24, paddingVertical: 16 },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  listIntro: { gap: 14, paddingTop: 20, paddingBottom: 28 },
  notices: { gap: 12 },
  entryCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
    gap: 14
  },
  entryTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 25,
    lineHeight: 33,
    color: colors.ink
  },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 18 },
  emptyNumber: { fontFamily: 'serif', fontSize: 76, color: colors.teal },
  listEnd: { paddingVertical: 28, gap: 10, alignItems: 'center' },
  editorTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 32,
    lineHeight: 40,
    color: colors.ink,
    padding: 0
  },
  editorBody: { fontSize: 18, lineHeight: 29, color: colors.ink, minHeight: 250, padding: 0 },
  detailBody: { fontSize: 18, lineHeight: 30, color: colors.ink },
  welcomeArt: { minHeight: 235, justifyContent: 'center', padding: 10, marginVertical: 16 },
  paperBack: {
    position: 'absolute',
    backgroundColor: colors.pale,
    borderRadius: 18,
    width: '92%',
    height: 200,
    alignSelf: 'center',
    transform: [{ rotate: '-5deg' }]
  },
  paperFront: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 24,
    gap: 16
  }
})
