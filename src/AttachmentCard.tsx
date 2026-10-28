import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import type { Attachment } from '../shared/protocol'
import { shareAttachment } from './attachments'
import { fileSize, fileType } from './attachment-selection'
import { Button, Notice, ui } from './ui'

export function AttachmentCard({
  entryId,
  attachment
}: {
  entryId: string
  attachment: Attachment
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Prepared only when you request it.')
  const mounted = useRef(true)
  const locked = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function open() {
    if (locked.current) return
    locked.current = true
    setPending(true)
    setError('')
    setStatus('Retrieving and verifying on this device…')
    try {
      await shareAttachment(
        entryId,
        attachment,
        () => mounted.current,
        () => {
          if (mounted.current) {
            setStatus('File verified on this device. Choose an app to open or share it.')
          }
        }
      )
      if (mounted.current) {
        setStatus('Share sheet closed. Relay cannot confirm another app opened or saved the file.')
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Could not prepare this attachment.')
        setStatus('Not prepared. Try again after refreshing.')
      }
    } finally {
      locked.current = false
      if (mounted.current) setPending(false)
    }
  }
  return (
    <View style={ui.card} testID='attachment-card'>
      <Text style={ui.eyebrow}>ATTACHMENT</Text>
      <Text accessibilityRole='header' style={ui.title} testID='attachment-filename'>
        {attachment.filename}
      </Text>
      <Text style={ui.caption}>
        {fileType(attachment.mimeType)} · {fileSize(attachment.size)}
      </Text>
      <Text style={ui.caption} accessibilityLiveRegion='polite'>
        {status}
      </Text>
      {!!error && <Notice text={error} error />}
      <Button
        label={pending ? 'Preparing file…' : 'Open or share'}
        accessibilityLabel={`Open or share ${attachment.filename}`}
        onPress={open}
        pending={pending}
        testID='open-attachment'
      />
    </View>
  )
}
