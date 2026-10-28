/* global __DEV__ */

import { useState, useEffect, useRef } from 'react'
import { reloadAppAsync } from 'expo-modules-core'
import { StatusBar } from 'expo-status-bar'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { version } from '../package.json'
import type { Entry, WorkerStatus } from '../shared/protocol'
import { getWorkerSession } from './worker/runtime'
import { createListRefresher } from './worker/client'
import { PairingPanel } from './PairingPanel'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Operation failed.')

export default function App() {
  const [worker, setWorker] = useState<WorkerStatus>({ state: 'starting', writable: false })
  const [entries, setEntries] = useState<Entry[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [updates, setUpdates] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [pearStatus, setPearStatus] = useState('')
  const [pearError, setPearError] = useState('')
  const shouldReload = useRef(false)
  const refreshRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    let disposed = false
    let ready = false
    let startupTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const { client, subscribeControl } = getWorkerSession()
      const refresher = createListRefresher(
        () => client.request('entries.list', {}),
        (result) => {
          setEntries(result.entries)
          setSkipped(result.skipped)
        },
        (err) => setError(messageOf(err))
      )
      refreshRef.current = refresher.refresh
      const onReady = (status: WorkerStatus) => {
        ready = status.state === 'ready'
        clearTimeout(startupTimer)
        setWorker(status)
        if (ready) setError('')
        if (ready) refresher.refresh()
        else {
          setEntries([])
          setSkipped(0)
        }
      }
      const unsubscribe = client.subscribe((event) => {
        if (event.event === 'ready') onReady(event.payload)
        else if (event.event === 'changed') {
          setUpdates((count) => count + 1)
          if (ready) refresher.refresh()
        } else {
          setError(event.payload.message)
          if (
            event.payload.code === 'DISCONNECTED' ||
            event.payload.code === 'INIT_FAILED' ||
            event.payload.code === 'STORAGE_ERROR'
          ) {
            setWorker({ state: 'failed', writable: false })
          }
        }
      })
      const unsubscribeControl = subscribeControl((parsed) => {
        if (parsed === 'updating' || parsed === 'updated') setPearStatus(parsed)
        if (parsed === 'minver-required') setPearStatus('incompatible')
        if (parsed.startsWith('pear:updateFailed')) {
          shouldReload.current = false
          setPearError(parsed.slice('pear:updateFailed '.length) || 'Update failed')
          setPearStatus('failed')
        }
        if (parsed === 'pear:updateApplied') {
          if (shouldReload.current) {
            reloadAppAsync('Pear update applied').catch((err) => {
              setPearError(messageOf(err))
              setPearStatus('failed')
            })
          } else setPearStatus('')
        }
      })
      startupTimer = setTimeout(() => {
        if (!ready) setError('Worker startup timed out. Check status or restart the app.')
      }, 30_000)
      client
        .request('status', {})
        .then((status) => {
          if (disposed) return
          if (!ready || status.state === 'ready') onReady(status)
        })
        .catch((err) => {
          if (!disposed) setError(messageOf(err))
        })
      return () => {
        disposed = true
        clearTimeout(startupTimer)
        unsubscribe()
        unsubscribeControl()
        refresher.close()
        refreshRef.current = null
        // Session lifetime belongs to the application, not a React component mount.
      }
    } catch (err) {
      setWorker({ state: 'failed', writable: false })
      setError(messageOf(err))
    }
  }, [])

  async function addEntry() {
    if (busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await getWorkerSession().client.request('entries.add', { title, body })
      setTitle('')
      setBody('')
      setFeedback('Saved on this device.')
      await refreshRef.current?.()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeEntry(id: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await getWorkerSession().client.request('entries.remove', { id })
      setFeedback('Removed from this notebook view. Retained copies are not erased.')
      await refreshRef.current?.()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function checkStatus() {
    setError('')
    try {
      const status = await getWorkerSession().client.request('status', {})
      setWorker(status)
      if (status.state === 'ready') await refreshRef.current?.()
      if (status.state === 'failed') {
        setError('Notebook failed to initialize. Restart the app; data is retained.')
      }
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const pearLabel =
    pearStatus === 'incompatible'
      ? `Update available on the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'}`
      : pearStatus === 'failed'
        ? pearError
        : `Pear v${version} ${pearStatus}`

  return (
    <View style={styles.container}>
      <StatusBar style='dark' />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps='handled'>
        <Text style={styles.heading}>Relay foundation</Text>
        <Text testID='worker-status'>
          Worker: {worker.state} · {worker.writable ? 'writable' : 'not writable'}
        </Text>
        <Text testID='update-count'>
          Updates: {updates} · Entries: {entries.length}
        </Text>
        <Text>No remote delivery status is available.</Text>
        <PairingPanel status={worker} />
        <Pressable accessibilityRole='button' onPress={checkStatus} style={styles.button}>
          <Text>Check worker</Text>
        </Pressable>
        {!!error && (
          <Text accessibilityRole='alert' style={styles.error} testID='error'>
            {error}
          </Text>
        )}
        {!!feedback && (
          <Text accessibilityLiveRegion='polite' testID='feedback'>
            {feedback}
          </Text>
        )}
        <TextInput
          accessibilityLabel='Entry title'
          testID='entry-title'
          placeholder='Title'
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel='Entry body'
          testID='entry-body'
          placeholder='Body'
          value={body}
          onChangeText={setBody}
          maxLength={8000}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole='button'
          testID='add-entry'
          disabled={busy || worker.state !== 'ready' || !worker.writable}
          onPress={addEntry}
          style={styles.button}
        >
          <Text>{busy ? 'Working…' : 'Add entry'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole='button'
          onPress={() => {
            setError('')
            refreshRef.current?.()
          }}
          disabled={worker.state !== 'ready'}
          style={styles.button}
        >
          <Text>Refresh list</Text>
        </Pressable>
        {skipped > 0 && (
          <Text style={styles.error}>{skipped} unsupported or malformed entries were skipped.</Text>
        )}
        {entries.length === 0 && <Text>No entries.</Text>}
        {entries.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Text style={styles.entryTitle}>{entry.title}</Text>
            <Text>{entry.body}</Text>
            <Text selectable>{entry.id}</Text>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={`Remove ${entry.title}`}
              disabled={busy || !worker.writable}
              onPress={() => removeEntry(entry.id)}
              style={styles.button}
            >
              <Text>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Text>{pearLabel}</Text>
        {(pearStatus === 'updated' || pearStatus === 'applying') && (
          <Pressable
            accessibilityRole='button'
            disabled={pearStatus === 'applying'}
            style={styles.button}
            onPress={() => {
              setPearStatus('applying')
              try {
                shouldReload.current = true
                getWorkerSession().writeControl('pear:applyUpdate')
              } catch (err) {
                shouldReload.current = false
                setPearError(messageOf(err))
                setPearStatus('failed')
              }
            }}
          >
            <Text>{pearStatus === 'applying' ? 'Updating…' : 'Apply update'}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 48, gap: 12 },
  heading: { fontSize: 24, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#777', borderRadius: 4, padding: 12, color: '#111' },
  button: { minHeight: 48, padding: 12, backgroundColor: '#e5e7eb', justifyContent: 'center' },
  error: { color: '#a00000' },
  entry: { borderTopWidth: 1, borderColor: '#aaa', paddingTop: 12, gap: 8 },
  entryTitle: { fontSize: 18, fontWeight: '600' }
})
