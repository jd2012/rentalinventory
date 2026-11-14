import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

export function BarcodeScanner({
  title,
  onScan,
  onCancel,
  statusMessage,
  singleShot = false,
}: {
  title: string;
  onScan: (barcode: string) => void | Promise<void>;
  onCancel: () => void;
  statusMessage?: string | null;
  singleShot?: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  async function handleScan(data: string) {
    const barcode = data.trim();
    if (!barcode || locked) return;

    setLocked(true);
    setLastScan(barcode);
    setLocalStatus(singleShot ? `Pass read: ${barcode}. Contacting rental system…` : null);

    try {
      await Promise.race([
        Promise.resolve(onScan(barcode)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Scanner callback timed out after 8 seconds.')), 8000)
        ),
      ]);

      if (singleShot) {
        // If the parent did not navigate away, allow its status message to become visible.
        setLocalStatus(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scan error';
      setLocalStatus(message);
      setLocked(false);
    } finally {
      if (!singleShot) {
        // Gear/lookup screens may intentionally scan multiple items.
        setTimeout(() => setLocked(false), 900);
      }
    }
  }

  function openManualEntry() {
    if (locked) return;
    setBarcodeInput('');
    setLocalStatus(null);
    setManualEntry(true);
  }

  if (manualEntry) {
    return (
      <SafeAreaView style={styles.manualRoot}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.manualPage} keyboardShouldPersistTaps="handled">
            <Text style={styles.manualTitle}>{title}</Text>
            <Text style={styles.message}>Type the barcode exactly as printed on the pass or equipment.</Text>
            <TextInput
              accessibilityLabel="Barcode"
              placeholder="Barcode"
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              editable={!locked}
              returnKeyType="done"
              onSubmitEditing={() => { void handleScan(barcodeInput); }}
              style={styles.input}
            />
            {localStatus || statusMessage ? <Text style={styles.message}>{localStatus || statusMessage}</Text> : null}
            <Pressable accessibilityRole="button" disabled={locked || !barcodeInput.trim()} style={[styles.button, (locked || !barcodeInput.trim()) && styles.disabled]} onPress={() => { void handleScan(barcodeInput); }}>
              <Text style={styles.buttonText}>{locked ? 'Processing…' : 'Use barcode'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={locked} style={styles.link} onPress={() => setManualEntry(false)}><Text>Back to scanner</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.link} onPress={onCancel}><Text>Cancel</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (!permission || !permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{!permission ? 'Checking camera permission…' : 'Camera access is required to scan barcodes.'}</Text>
        {permission && <Pressable style={styles.button} onPress={requestPermission}><Text style={styles.buttonText}>Allow camera</Text></Pressable>}
        <Pressable accessibilityRole="button" style={styles.button} onPress={openManualEntry}><Text style={styles.buttonText}>Type barcode</Text></Pressable>
        <Pressable style={styles.link} onPress={onCancel}><Text>Cancel</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={locked ? undefined : ({ data }) => {
          void handleScan(data);
        }}
      />
      <View style={styles.overlay}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.target} />
        <Text style={styles.help}>
          {localStatus ||
            statusMessage ||
            (locked
              ? `Read ${lastScan ?? 'barcode'} — processing…`
              : 'Center the barcode inside the box.')}
        </Text>
        <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={locked} style={[styles.cancel, locked && styles.disabled]} onPress={openManualEntry}><Text style={styles.cancelText}>Type barcode</Text></Pressable>
        <Pressable style={styles.cancel} onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  manualRoot: { flex: 1, backgroundColor: '#f6f7f9' },
  manualPage: { flexGrow: 1, padding: 24, gap: 18, justifyContent: 'center' },
  manualTitle: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  input: { backgroundColor: '#fff', color: '#111827', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 16, fontSize: 22 },
  actions: { gap: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 64, paddingHorizontal: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  target: { width: '88%', height: 180, borderWidth: 3, borderColor: '#fff', borderRadius: 18, backgroundColor: 'transparent' },
  help: { color: '#fff', fontSize: 16, textAlign: 'center' },
  cancel: { backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  cancelText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  message: { textAlign: 'center', fontSize: 17 },
  button: { backgroundColor: '#111', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { padding: 10 },
});
