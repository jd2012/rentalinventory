import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  if (!permission) {
    return <View style={styles.center}><Text>Checking camera permission…</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Camera access is required to scan barcodes.</Text>
        <Pressable style={styles.button} onPress={requestPermission}><Text style={styles.buttonText}>Allow camera</Text></Pressable>
        <Pressable style={styles.link} onPress={onCancel}><Text>Cancel</Text></Pressable>
      </View>
    );
  }

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scan error';
      setLocalStatus(`Scan error: ${message}`);
      setTimeout(() => {
        setLocked(false);
        setLocalStatus(null);
      }, 2500);
    } finally {
      if (!singleShot) {
        // Gear/lookup screens may intentionally scan multiple items.
        setTimeout(() => setLocked(false), 900);
      }
    }
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
        <Pressable style={styles.cancel} onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
