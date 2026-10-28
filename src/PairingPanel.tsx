import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import type { Participant, WorkerStatus } from '../shared/protocol'
import { getWorkerSession } from './worker/runtime'
import { createListRefresher } from './worker/client'
import { Button, Notice, colors, ui } from './ui'

export function PairingPanel({
  status,
  mode,
  onJoin
}: {
  status: WorkerStatus
  mode: 'welcome' | 'join' | 'sharing'
  onJoin?: () => void
}) {
  const [invite, setInvite] = useState('')
  const [incoming, setIncoming] = useState('')
  const [name, setName] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loaded, setLoaded] = useState(false)
  const [rosterRefresh, setRosterRefresh] = useState<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (status.state !== 'ready') return
    const { client } = getWorkerSession()
    const refresh = createListRefresher(
      () => client.request('participants.list', {}),
      (result) => {
        setParticipants(result.participants)
        setLoaded(true)
      },
      () => setError('Participant records could not be loaded. Try again.')
    )
    setRosterRefresh(() => refresh.refresh)
    refresh.refresh()
    const unsubscribe = client.subscribe((event) => {
      if (event.event === 'changed') refresh.refresh()
      if (event.event === 'error') setError(event.payload.message)
    })
    return () => {
      unsubscribe()
      refresh.close()
    }
  }, [status.state])

  async function action(run: () => Promise<unknown>, success: string) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await run()
      setFeedback(success)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This action could not be completed.')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const notices = (
    <>
      {!!error && <Notice text={error} error />}
      {!!feedback && <Notice text={feedback} />}
    </>
  )
  if (mode === 'welcome') {
    return (
      <View style={ui.stack}>
        {notices}
        <Button
          label='Create notebook'
          testID='create-notebook'
          pending={busy}
          onPress={() =>
            action(
              () => getWorkerSession().client.request('notebook.create', {}),
              'Notebook created on this device.'
            )
          }
        />
        <Button
          label='Join notebook'
          variant='secondary'
          onPress={() => onJoin?.()}
          disabled={busy}
        />
      </View>
    )
  }
  if (status.state === 'joining') {
    return (
      <View style={ui.stack}>
        <View style={ui.card}>
          <ActivityIndicator color={colors.teal} />
          <Text style={ui.title}>
            {status.pairing === 'cancelling' ? 'Closing the local join…' : 'Waiting for your peer'}
          </Text>
          <Text style={ui.body}>
            Keep the inviting device connected with Relay open. This can take up to a minute.
          </Text>
          <Text style={ui.caption}>
            Cancel closes this local attempt. It cannot revoke access that may already have been
            granted.
          </Text>
        </View>
        {notices}
        <Button
          label='Cancel join'
          variant='secondary'
          pending={busy || status.pairing === 'cancelling'}
          onPress={() =>
            action(
              () => getWorkerSession().client.request('pair.cancel', {}),
              'Local join closed. Partial data was retained.'
            )
          }
        />
      </View>
    )
  }
  if (status.state === 'idle') {
    return (
      <View style={ui.stack}>
        <Text style={ui.body}>
          Ask a Contributor for an invitation. It grants notebook access to whoever has it.
        </Text>
        <Text style={ui.label}>Invitation</Text>
        <TextInput
          accessibilityLabel='Invitation to join'
          testID='join-invite'
          placeholder='Paste an invitation'
          placeholderTextColor={colors.muted}
          autoCapitalize='none'
          autoCorrect={false}
          value={incoming}
          onChangeText={setIncoming}
          maxLength={512}
          multiline
          style={[ui.input, { minHeight: 120, textAlignVertical: 'top' }]}
        />
        <Text style={ui.label}>Device label · optional</Text>
        <TextInput
          accessibilityLabel='Device label'
          placeholder='For example, North team'
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
          maxLength={80}
          style={ui.input}
        />
        <Text style={ui.caption}>
          Labels help recognition. They do not verify anyone’s identity.
        </Text>
        {notices}
        <Button
          label={busy ? 'Starting…' : 'Join notebook'}
          testID='join-notebook'
          disabled={!incoming.trim()}
          pending={busy}
          onPress={() =>
            action(async () => {
              await getWorkerSession().client.request('pair.start', {
                invite: incoming.trim(),
                name
              })
              setIncoming('')
            }, 'Joining started.')
          }
        />
      </View>
    )
  }
  if (status.state !== 'ready') return null
  return (
    <View style={{ gap: 28 }}>
      <View style={ui.stack}>
        <Text style={ui.eyebrow}>PEOPLE & PERMISSIONS</Text>
        <Text accessibilityRole='header' style={ui.heading}>
          Better together.
        </Text>
        <Text style={ui.body}>Share context directly. Choose what the next device can do.</Text>
        <Text style={ui.badge}>This device · {status.writable ? 'Contributor' : 'Viewer'}</Text>
      </View>
      {notices}
      {status.writable ? (
        <View style={ui.card}>
          <Text style={ui.title}>Invite a device</Text>
          <Text style={ui.caption}>Possession grants access. Use a trusted channel.</Text>
          {(
            [
              {
                value: false,
                label: 'Contributor',
                description: 'Add, remove, and acknowledge entries.'
              },
              {
                value: true,
                label: 'Viewer',
                description: 'Read entries and acknowledgments. No changes.'
              }
            ] as const
          ).map((role) => (
            <Pressable
              key={role.label}
              accessibilityRole='radio'
              accessibilityState={{ checked: readOnly === role.value, disabled: busy || !!invite }}
              disabled={busy || !!invite}
              onPress={() => setReadOnly(role.value)}
              testID={`role-${role.label.toLowerCase()}`}
              style={[styles.role, readOnly === role.value && styles.selected]}
            >
              <View style={ui.row}>
                <Text accessible={false} style={styles.radio}>
                  {readOnly === role.value ? '●' : '○'}
                </Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={ui.label}>{role.label}</Text>
                  <Text style={ui.caption}>{role.description}</Text>
                </View>
              </View>
            </Pressable>
          ))}
          {!invite ? (
            <Button
              label='Generate invitation'
              pending={busy}
              testID='generate-invite'
              onPress={() =>
                action(async () => {
                  const result = await getWorkerSession().client.request('invite.create', {
                    readOnly
                  })
                  setInvite(result.invite)
                }, '')
              }
            />
          ) : (
            <>
              <Notice
                text={`${readOnly ? 'Viewer' : 'Contributor'} invitation ready. Treat it like an access key. Keep this device open while the other joins.`}
              />
              <Button
                label='Share or copy invitation'
                pending={busy}
                onPress={() =>
                  action(async () => {
                    await Share.share({ message: invite })
                  }, 'Share sheet closed. This does not confirm another device joined.')
                }
              />
              <Text style={ui.caption}>
                In the Android share sheet, choose Copy text or a trusted app. Your device handles
                clipboard feedback; Relay cannot confirm who received an invitation.
              </Text>
            </>
          )}
          <Button
            label='Cancel invitation'
            variant='quiet'
            disabled={busy}
            onPress={() =>
              action(async () => {
                await getWorkerSession().client.request('invite.cancel', {})
                setInvite('')
              }, 'Invitation canceled locally. Existing participant access is unchanged.')
            }
          />
          <Text style={ui.caption}>
            Leaving this screen does not cancel an invitation. Canceling closes this device’s
            invitation. Existing access remains, and other peers may not have received the
            cancellation yet.
          </Text>
        </View>
      ) : (
        <Notice text='Viewers can read this notebook. Ask a Contributor to invite more devices.' />
      )}
      <View style={ui.stack}>
        <View style={ui.between}>
          <Text accessibilityRole='header' style={ui.title}>
            Participant records
          </Text>
          <Button label='Reload' variant='quiet' onPress={() => rosterRefresh?.()} />
        </View>
        {!loaded && <ActivityIndicator color={colors.teal} />}
        {participants.map((p) => (
          <View key={p.key} style={styles.participant}>
            <View style={styles.avatar} accessible={false}>
              <Text style={ui.label}>{p.isLocal ? 'R' : '↗'}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ui.label}>{p.isLocal ? 'This device' : p.name || 'Unnamed device'}</Text>
              <Text style={ui.caption}>
                {p.readOnly ? 'Viewer' : 'Contributor'} · {p.key.slice(0, 12)}
              </Text>
            </View>
          </View>
        ))}
        <Text style={ui.caption}>
          Names and device keys are not verified human identities. This roster may omit the original
          creator and does not indicate who is online.
        </Text>
      </View>
      <Text style={ui.caption}>
        Relay keeps one notebook on this device. Use another device to join a different notebook.
        Existing data is never replaced here.
      </Text>
    </View>
  )
}
const styles = StyleSheet.create({
  role: { padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12, minHeight: 72 },
  selected: { borderColor: colors.teal, backgroundColor: colors.pale },
  radio: { fontSize: 20, color: colors.teal },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.line
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pale,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
