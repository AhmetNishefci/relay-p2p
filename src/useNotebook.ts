import { useState, useEffect, useRef } from 'react'
import { reloadAppAsync } from 'expo-modules-core'
import type { Entry, Acknowledgment, WorkerStatus } from '../shared/protocol'
import { getWorkerSession } from './worker/runtime'
import { createListRefresher } from './worker/client'
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Operation failed.')

export function useNotebook() {
  const [worker, setWorker] = useState<WorkerStatus>({ state: 'starting', writable: false })
  const [entries, setEntries] = useState<Entry[]>([])
  const [acknowledgments, setAcknowledgments] = useState<Acknowledgment[]>([])
  const [localWriterKey, setLocalWriterKey] = useState('')
  const [pendingAcknowledgment, setPendingAcknowledgment] = useState<string | null>(null)
  const [skippedAcknowledgments, setSkippedAcknowledgments] = useState(0)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [loaded, setLoaded] = useState(false)
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
          setLoaded(true)
          setEntries(result.entries)
          setSkipped(result.skipped)
          setAcknowledgments(result.acknowledgments)
          setLocalWriterKey(result.localWriterKey)
          setSkippedAcknowledgments(result.skippedAcknowledgments)
        },
        (err) => setError(messageOf(err))
      )
      refreshRef.current = refresher.refresh
      const onReady = (status: WorkerStatus) => {
        ready = status.state === 'ready'
        if (status.state !== 'starting') clearTimeout(startupTimer)
        setWorker(status)
        if (ready) setError('')
        if (ready) refresher.invalidate()
        else {
          setLoaded(false)
          setEntries([])
          setSkipped(0)
          setAcknowledgments([])
          setLocalWriterKey('')
          setSkippedAcknowledgments(0)
        }
      }
      const unsubscribe = client.subscribe((event) => {
        if (event.event === 'ready') onReady(event.payload)
        else if (event.event === 'changed') {
          if (ready) refresher.invalidate()
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
        if (!ready) {
          setError('Opening the notebook took too long. Check again or close and reopen Relay.')
        }
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

  async function refreshAfterWrite() {
    try {
      await refreshRef.current?.()
    } catch {
      // The write already succeeded. A snapshot failure does not undo it.
      setError('The change was recorded locally, but the view could not refresh. Check again.')
    }
  }

  async function refresh() {
    try {
      await refreshRef.current?.()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function addEntry(title: string, body: string) {
    if (locked.current) return null
    locked.current = true
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      const entry = await getWorkerSession().client.request('entries.add', { title, body })
      setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)])
      setFeedback('Saved on this device.')
      await refreshAfterWrite()
      return entry
    } catch (err) {
      setError(messageOf(err))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  async function removeEntry(id: string) {
    if (locked.current) return null
    locked.current = true
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await getWorkerSession().client.request('entries.remove', { id })
      setFeedback('Entry removed from the notebook.')
      await refreshAfterWrite()
      return true
    } catch (err) {
      setError(messageOf(err))
    } finally {
      locked.current = false
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

  async function acknowledgeEntry(entryId: string) {
    if (locked.current) return null
    locked.current = true
    setBusy(true)
    setPendingAcknowledgment(entryId)
    setError('')
    setFeedback('')
    try {
      const result = await getWorkerSession().client.request('entries.acknowledge', { entryId })
      const acknowledgment = result.acknowledgment
      setAcknowledgments((current) => [
        ...current.filter(
          (record) =>
            record.entryId !== acknowledgment.entryId ||
            record.writerKey !== acknowledgment.writerKey
        ),
        acknowledgment
      ])
      setFeedback(
        result.alreadyRecorded
          ? 'Acknowledgment already recorded for this device.'
          : 'Acknowledgment recorded on this device.'
      )
      await refreshAfterWrite()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setPendingAcknowledgment(null)
      locked.current = false
      setBusy(false)
    }
  }

  function applyUpdate() {
    setPearStatus('applying')
    try {
      shouldReload.current = true
      getWorkerSession().writeControl('pear:applyUpdate')
    } catch (err) {
      shouldReload.current = false
      setPearError(messageOf(err))
      setPearStatus('failed')
    }
  }
  return {
    worker,
    entries,
    acknowledgments,
    localWriterKey,
    busy,
    loaded,
    pendingAcknowledgment,
    skipped,
    skippedAcknowledgments,
    error,
    feedback,
    addEntry,
    removeEntry,
    acknowledgeEntry,
    checkStatus,
    refresh,
    clearFeedback: () => {
      setError('')
      setFeedback('')
    },
    pearStatus,
    pearError,
    applyUpdate
  }
}
