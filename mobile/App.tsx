import { useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BarcodeScanner } from './src/components/BarcodeScanner';
import {
  addGear,
  ensureRental,
  getStats,
  lookupGear,
  returnAllForPass,
  returnScan,
  setAuthToken,
  verifyPin,
} from './src/lib/api';
import type { GearItem, Mode, Rental, Stats } from './src/types';

type Screen = 'login' | 'home' | 'scanPass' | 'scanGear' | 'inventoryResult' | 'returnPass';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<Mode>('checkout');
  const [passId, setPassId] = useState('');
  const [rental, setRental] = useState<Rental | null>(null);
  const [gear, setGear] = useState<GearItem[]>([]);
  const [inventoryItem, setInventoryItem] = useState<GearItem | null>(null);
  const [returnPassItems, setReturnPassItems] = useState<Array<Record<string, unknown>>>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  async function refreshStats() {
    try {
      if (pin.trim()) setAuthToken(pin.trim());
      setStats(await getStats());
    } catch { }
  }

  async function login() {
    if (!pin.trim()) return;
    try {
      setBusy(true);
      await verifyPin(pin.trim());
      await refreshStats();
      setScreen('home');
    } catch (error) {
      Alert.alert('Could not sign in', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  function start(newMode: Mode) {
    setScanStatus(null);
    setMode(newMode);
    setPassId('');
    setRental(null);
    setGear([]);
    setInventoryItem(null);
    setReturnPassItems([]);
    setScreen(newMode === 'checkout' ? 'scanPass' : 'scanGear');
  }

  async function onPassScanned(code: string) {
    if (pin.trim()) setAuthToken(pin.trim());
    setScanStatus(`Pass read: ${code}. Contacting rental system…`);
    try {
      const opened = await Promise.race([
        ensureRental(code),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Guest pass request timed out after 8 seconds.')), 8000)
        ),
      ]);
      if (!opened || !opened.id) {
        throw new Error('Rental API responded without a rental ID.');
      }
      setPassId(code);
      setRental(opened);
      setScanStatus(null);
      setScreen('scanGear');
      await refreshStats();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setScanStatus(`Guest pass error: ${message}`);
      Alert.alert('Could not open rental', message);
      setScreen('scanPass');
    }
  }

  async function onGearScanned(code: string) {
    if (pin.trim()) setAuthToken(pin.trim());
    try {
      if (mode === 'checkout') {
        if (!rental || !passId) throw new Error('Scan a guest pass first.');
        await addGear(rental.id, passId, code);
        const item = await lookupGear(code);
        setGear((current) => current.some((g) => g.barcode === code) ? current : [...current, item]);
        setScreen('scanGear');
        await refreshStats();
        return;
      }

      if (mode === 'return') {
        const result = await returnScan(code);
        if (result.kind === 'gear') {
          setGear((current) => current.some((g) => g.barcode === code) ? current : [...current, { barcode: code, status: 'RETURNED' }]);
          setScreen('scanGear');
          await refreshStats();
          return;
        }
        if (result.kind === 'pass') {
          setPassId(result.passId);
          setReturnPassItems(result.items);
          setScreen('returnPass');
          return;
        }
        Alert.alert('Not found', 'That barcode is not currently checked out.');
        setScreen('scanGear');
        return;
      }

      const item = await lookupGear(code);
      setInventoryItem(item);
      setScreen('inventoryResult');
    } catch (error) {
      Alert.alert('Scan failed', error instanceof Error ? error.message : 'Unknown error');
      setScreen(mode === 'checkout' ? 'scanGear' : 'home');
    }
  }

  async function returnWholePass() {
    if (!passId) return;
    try {
      setBusy(true);
      const result = await returnAllForPass(passId);
      Alert.alert('Return complete', `${result.returned} item${result.returned === 1 ? '' : 's'} returned.`);
      await refreshStats();
      setScreen('home');
    } catch (error) {
      Alert.alert('Could not return items', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (screen === 'scanPass') {
    return (
      <BarcodeScanner
        title="Scan guest pass"
        statusMessage={scanStatus}
        singleShot
        onCancel={() => setScreen('home')}
        onScan={onPassScanned}
      />
    );
  }

  if (screen === 'scanGear') {
    return (
      <BarcodeScanner
        title={mode === 'checkout' ? 'Scan rental equipment' : mode === 'return' ? 'Scan equipment or guest pass' : 'Scan equipment'}
        onCancel={() => setScreen('home')}
        onScan={onGearScanned}
      />
    );
  }

  if (screen === 'returnPass') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.heading}>Return guest rental</Text>
          <Card label="Guest pass" value={passId} />
          <Text style={styles.section}>{returnPassItems.length} item{returnPassItems.length === 1 ? '' : 's'} currently out</Text>
          {returnPassItems.map((item, i) => (
            <View key={`${String(item.gearId ?? i)}-${i}`} style={styles.itemRow}>
              <Text style={styles.itemBarcode}>{String(item.gearId ?? 'Equipment')}</Text>
            </View>
          ))}
          <PrimaryButton label={busy ? 'Returning…' : 'Return all items'} onPress={returnWholePass} disabled={busy} />
          <SecondaryButton label="Cancel" onPress={() => setScreen('home')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'inventoryResult' && inventoryItem) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.heading}>Inventory item</Text>
          <Card label="Barcode" value={inventoryItem.barcode} />
          <Card label="Type" value={inventoryItem.type ?? '—'} />
          <Card label="Size" value={inventoryItem.size ?? '—'} />
          <Card label="Status" value={inventoryItem.status ?? '—'} />
          {inventoryItem.passId && <Card label="Checked out to pass" value={inventoryItem.passId} />}
          {inventoryItem.endOfLifeDate && <Card label="End of life" value={inventoryItem.endOfLifeDate} />}
          <PrimaryButton label="Scan another" onPress={() => { setInventoryItem(null); setScreen('scanGear'); }} />
          <SecondaryButton label="Home" onPress={() => setScreen('home')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'login') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <Text style={styles.logo}>Rental Inventory</Text>
          <Text style={styles.subtitle}>Enter the shop PIN to connect this device to the rental system.</Text>
          <TextInput
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="Shop PIN"
            style={styles.input}
            autoFocus
            onSubmitEditing={login}
          />
          <PrimaryButton label={busy ? 'Connecting…' : 'Connect'} onPress={login} disabled={busy || !pin.trim()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>RENTAL INVENTORY</Text>
        <Text style={styles.heading}>Shop dashboard</Text>
        {stats && (
          <View style={styles.statsRow}>
            <MiniStat label="Items out" value={String(stats.totalOut)} />
            <MiniStat label="Open rentals" value={String(stats.openRentals)} />
          </View>
        )}
        {stats?.lastAction ? <Text style={styles.note}>Last action: {stats.lastAction}</Text> : null}
        <ActionCard title="Check out rental" detail="Scan a guest pass, then scan equipment. Each item saves immediately." onPress={() => start('checkout')} />
        <ActionCard title="Return equipment" detail="Scan equipment to return it, or scan a guest pass to return everything." onPress={() => start('return')} />
        <ActionCard title="Inventory lookup" detail="Scan equipment to see whether it is available or checked out." onPress={() => start('inventory')} />
        {gear.length > 0 && <Text style={styles.note}>Last session processed {gear.length} item{gear.length === 1 ? '' : 's'}.</Text>}
        <SecondaryButton label="Refresh dashboard" onPress={refreshStats} />
        <SecondaryButton label="Disconnect device" onPress={() => { setPin(''); setStats(null); setScreen('login'); }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary, disabled && { opacity: 0.5 }]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
}
function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.secondary}><Text style={styles.secondaryText}>{label}</Text></Pressable>;
}
function ActionCard({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.action}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.muted}>{detail}</Text></Pressable>;
}
function Card({ label, value }: { label: string; value: string }) {
  return <View style={styles.card}><Text style={styles.cardLabel}>{label}</Text><Text style={styles.cardValue}>{value}</Text></View>;
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.miniStat}><Text style={styles.miniValue}>{value}</Text><Text style={styles.miniLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7f9' },
  page: { flexGrow: 1, padding: 22, gap: 14 },
  logo: { fontSize: 34, fontWeight: '800', marginTop: 48 },
  heading: { fontSize: 30, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 17, lineHeight: 24, color: '#4b5563' },
  eyebrow: { marginTop: 28, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: '#6b7280' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, padding: 16, fontSize: 22, marginTop: 14 },
  note: { color: '#6b7280', fontSize: 13, lineHeight: 18 },
  primary: { backgroundColor: '#111827', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  secondary: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, padding: 15, alignItems: 'center' },
  secondaryText: { color: '#111827', fontWeight: '700', fontSize: 16 },
  action: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 7, borderWidth: 1, borderColor: '#e5e7eb' },
  actionTitle: { fontSize: 20, fontWeight: '800' },
  muted: { color: '#6b7280', fontSize: 15, lineHeight: 21 },
  section: { marginTop: 8, fontSize: 16, fontWeight: '800' },
  itemRow: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  itemBarcode: { fontSize: 18, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  cardLabel: { color: '#6b7280', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  cardValue: { color: '#111827', fontSize: 20, fontWeight: '700', marginTop: 5 },
  statsRow: { flexDirection: 'row', gap: 12 },
  miniStat: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  miniValue: { fontSize: 28, fontWeight: '800' },
  miniLabel: { color: '#6b7280', marginTop: 4, fontWeight: '600' },
});
