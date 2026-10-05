import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

export function BarcodeScanner({
  title,
  onScan,
  onCancel,
}: {
  title: string;
  onScan: (barcode: string) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

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

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={locked ? undefined : ({ data }) => {
          setLocked(true);
          onScan(data.trim());
        }}
      />
      <View style={styles.overlay}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.target} />
        <Text style={styles.help}>Center the barcode inside the box.</Text>
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
