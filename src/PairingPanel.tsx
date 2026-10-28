import { useEffect, useState } from 'react'
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Participant, WorkerStatus } from '../shared/protocol'
import { getWorkerSession } from './worker/runtime'
import { createListRefresher } from './worker/client'

export function PairingPanel({ status }: { status: WorkerStatus }) {
  const [open, setOpen] = useState(false)
  const [invite, setInvite] = useState('')
  const [incoming, setIncoming] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const visible = open || status.state === 'idle' || status.state === 'joining'

  useEffect(() => {
    if (!visible || status.state !== 'ready') return
    const { client } = getWorkerSession()
    const refresh = createListRefresher(
      () => client.request('participants.list', {}),
      (result) => setParticipants(result.participants),
      () => setError('Could not load participant records. Check worker status.')
    )
    refresh.refresh()
    const unsubscribe = client.subscribe((event) => {
      if (event.event === 'changed') {
        refresh.refresh()
      }
      if (event.event === 'error') setError(event.payload.message)
    })
    return () => {
      unsubscribe()
      refresh.close()
    }
  }, [visible, status.state])

  async function action(run: () => Promise<unknown>, success: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await run()
      setFeedback(success)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing operation failed.')
    } finally {
      setBusy(false)
    }
  }

  const button = (label: string, onPress: () => void, disabled = busy) => (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text>{label}</Text>
    </Pressable>
  )

  return (
    <View style={styles.panel}>
      {button(open ? 'Hide pairing and access' : 'Pairing and access', () => setOpen(!open), false)}
      {visible && (
        <>
          <Text>Invite possession grants access. Share only through a trusted channel.</Text>
          <Text>
            Contributor: can add and remove entries. Viewer: can read but cannot modify entries.
          </Text>
          <Text>Participant names and device labels are not verified identities.</Text>
          <Text>Pairing: {status.pairing ?? 'idle'}</Text>
          {status.state === 'ready' && (
            <Text>Actual local access: {status.writable ? 'Contributor' : 'Viewer'}</Text>
          )}
          {!!error && (
            <Text accessibilityRole='alert' style={styles.error}>
              {error}
            </Text>
          )}
          {!!feedback && <Text accessibilityLiveRegion='polite'>{feedback}</Text>}
          {status.state === 'idle' && (
            <>
              {button('Create notebook', () =>
                action(
                  () => getWorkerSession().client.request('notebook.create', {}),
                  'Notebook created.'
                )
              )}
              <TextInput
                accessibilityLabel='Invitation to join'
                placeholder='Paste invitation'
                autoCapitalize='none'
                autoCorrect={false}
                value={incoming}
                onChangeText={setIncoming}
                maxLength={512}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel='Device label'
                placeholder='Device label (unverified, optional)'
                value={name}
                onChangeText={setName}
                maxLength={80}
                style={styles.input}
              />
              {button('Join notebook', () =>
                action(async () => {
                  await getWorkerSession().client.request('pair.start', {
                    invite: incoming.trim(),
                    name
                  })
                  setIncoming('')
                }, 'Joining started. Keep both peers foregrounded and connected.')
              )}
            </>
          )}
          {status.state === 'joining' && (
            <>
              <Text>
                Joining. Keep the inviting peer open. A timeout does not prove remote access was
                never granted.
              </Text>
              {button('Cancel join', () =>
                action(
                  () => getWorkerSession().client.request('pair.cancel', {}),
                  'Local join closed. Partial data was retained.'
                )
              )}
            </>
          )}
          {status.state === 'ready' && (
            <>
              {status.writable && (
                <>
                  {button('Create Contributor invite', () =>
                    action(async () => {
                      const result = await getWorkerSession().client.request('invite.create', {
                        readOnly: false
                      })
                      setInvite(result.invite)
                    }, 'Contributor invitation created. Possession grants write access.')
                  )}
                  {button('Create Viewer invite', () =>
                    action(async () => {
                      const result = await getWorkerSession().client.request('invite.create', {
                        readOnly: true
                      })
                      setInvite(result.invite)
                    }, 'Viewer invitation created. Actual access is checked after joining.')
                  )}
                  {invite && (
                    <>
                      <Text selectable testID='created-invite'>
                        {invite}
                      </Text>
                      {button('Share invitation', () =>
                        action(() => Share.share({ message: invite }), 'Share sheet closed.')
                      )}
                    </>
                  )}
                  {button('Cancel invitation', () =>
                    action(async () => {
                      await getWorkerSession().client.request('invite.cancel', {})
                      setInvite('')
                    }, 'Invitation removed locally. This cannot erase access already granted.')
                  )}
                </>
              )}
              <Text>
                Known participant records (the initial creator may be absent from the API roster):
              </Text>
              {participants.map((p) => (
                <Text key={p.key} selectable>
                  {p.isLocal ? 'This device' : p.name || 'Unnamed device'} ·{' '}
                  {p.readOnly ? 'Viewer' : 'Contributor'} · {p.key.slice(0, 12)}
                </Text>
              ))}
              <Text>
                Existing notebooks cannot be replaced by this screen. Use a fresh peer to join.
              </Text>
            </>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { gap: 12, borderBottomWidth: 1, borderColor: '#aaa', paddingBottom: 12 },
  input: { borderWidth: 1, borderColor: '#777', padding: 12, color: '#111' },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', backgroundColor: '#e5e7eb' },
  disabled: { opacity: 0.5 },
  error: { color: '#a00000' }
})
