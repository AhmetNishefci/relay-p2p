import { useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native'

export const colors = {
  paper: '#F7F5EF',
  ink: '#242D2A',
  muted: '#626C66',
  teal: '#285C50',
  pale: '#E5EDE7',
  line: '#DADFD5',
  white: '#FFFFFF',
  amber: '#76531C',
  amberPale: '#F5ECD9',
  danger: '#943B32'
}
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 24, gap: 24, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  stack: { gap: 12 },
  eyebrow: { fontSize: 12, letterSpacing: 1.8, fontWeight: '700', color: colors.teal },
  heading: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 38,
    lineHeight: 45,
    color: colors.ink
  },
  title: { fontSize: 21, fontWeight: '600', color: colors.ink, lineHeight: 29 },
  body: { fontSize: 16, lineHeight: 25, color: colors.ink },
  caption: { fontSize: 14, lineHeight: 21, color: colors.muted },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 20,
    gap: 12
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.ink,
    minHeight: 52
  },
  divider: { height: 1, backgroundColor: colors.line },
  badge: {
    color: colors.teal,
    backgroundColor: colors.pale,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden'
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    gap: 8
  }
})

export function Button({
  label,
  onPress,
  disabled = false,
  pending = false,
  variant = 'primary',
  accessibilityLabel,
  testID
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  pending?: boolean
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  accessibilityLabel?: string
  testID?: string
}) {
  const blocked = disabled || pending
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: pending }}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        s.button,
        variant === 'primary' ? s.primary : variant === 'secondary' ? s.secondary : s.quiet,
        blocked && s.disabled,
        pressed && s.pressed
      ]}
    >
      {pending && <ActivityIndicator color={variant === 'primary' ? colors.white : colors.teal} />}
      <Text
        style={[
          s.buttonText,
          {
            color:
              variant === 'primary'
                ? colors.white
                : variant === 'danger'
                  ? colors.danger
                  : colors.teal
          }
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function Brand() {
  return (
    <View style={ui.row} accessible accessibilityLabel='Relay'>
      <View style={s.mark} accessible={false}>
        <View style={s.markLine} />
        <View style={[s.markLine, { marginTop: 8 }]} />
      </View>
      <Text style={s.brand}>relay</Text>
    </View>
  )
}

export function Notice({ text, error = false }: { text: string; error?: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    let active = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active || reduced) return
        opacity.setValue(0.4)
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start()
      })
      .catch(() => {})
    return () => {
      active = false
      opacity.stopAnimation()
      opacity.setValue(1)
    }
  }, [text, opacity])
  return (
    <Animated.View style={[s.notice, error && s.warning, { opacity }]}>
      <Text
        accessibilityRole={error ? 'alert' : undefined}
        accessibilityLiveRegion='polite'
        testID={error ? 'error' : 'feedback'}
        style={[ui.caption, { color: error ? colors.danger : colors.teal }]}
      >
        {text}
      </Text>
    </Animated.View>
  )
}

export function Header({
  title,
  onBack,
  action
}: {
  title: string
  onBack: () => void
  action?: React.ReactNode
}) {
  return (
    <View style={s.header}>
      <Button label='Back' variant='quiet' onPress={onBack} />
      <Text accessibilityRole='header' style={[ui.label, { flex: 1, textAlign: 'center' }]}>
        {title}
      </Text>
      {action ?? <View style={{ width: 64 }} />}
    </View>
  )
}

const s = StyleSheet.create({
  button: {
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primary: { backgroundColor: colors.teal },
  secondary: { backgroundColor: colors.pale },
  quiet: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  mark: {
    backgroundColor: colors.teal,
    borderRadius: 13,
    width: 40,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5
  },
  markLine: { height: 18, width: 4, borderRadius: 2, backgroundColor: colors.paper },
  brand: { fontSize: 27, letterSpacing: -1, fontWeight: '700', color: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4
  },
  notice: { borderRadius: 12, padding: 14, backgroundColor: colors.pale },
  warning: { backgroundColor: colors.amberPale }
})
