// screens/QuotesListScreen.js
import React, { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { listQuotes, deleteQuote } from '../storage/quotesStore';
import { useSettings } from '../storage/settingsStore';
import { useLanguage } from '../src/i18n/LanguageContext';

// 🔹 Header separado y memoizado
const Header = React.memo(function Header({ logoUri, title, onNewPress, newLabel }) {
  return (
    <View style={styles.headerContainer}>
      <Image
        source={logoUri ? { uri: logoUri } : require('../assets/logo.png')}
        style={[styles.logo, { marginTop: 40, marginBottom: 40 }]}
        resizeMode="contain"
      />
      <View style={styles.headerRight}>
        <Text style={styles.screenTitle}>{title}</Text>
        <TouchableOpacity
          onPress={onNewPress}
          style={styles.newBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.newBtnText}>{newLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function QuotesListScreen({ navigation }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const didInitRef = useRef(false);

  const { settings: liveSettings } = useSettings();
  const { t } = useLanguage();

  // 🔹 LoadData con parámetro opcional
  const loadData = useCallback(async (opts = { showSpinner: false }) => {
    try {
      if (opts.showSpinner) setLoading(true);
      const data = await listQuotes();
      setQuotes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error listQuotes:', err);
      Alert.alert(t('quotes'), t('errorLoadQuotes'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      if (!didInitRef.current) {
        didInitRef.current = true;
        loadData({ showSpinner: true }); // primer load con spinner
      } else {
        loadData({ showSpinner: false }); // refetch silencioso
      }
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData({ showSpinner: true });
  };

  // ➕ NUEVA
  const onNew = useCallback(() => {
    navigation.navigate('CreateQuote', {
      quote: null,
      mode: 'new',
      _ts: Date.now(),
    });
  }, [navigation]);

  // ✏️ EDITAR
  const onEdit = useCallback(
    (q) => {
      navigation.navigate('CreateQuote', {
        quote: q,
        _ts: Date.now(),
      });
    },
    [navigation]
  );

  const onDelete = useCallback(
    async (q) => {
      try {
        await deleteQuote(q.id);
        setQuotes((prev) => prev.filter((x) => x.id !== q.id));
      } catch (e) {
        console.error('removeQuote:', e);
        Alert.alert(t('error'), t('errorDeleteQuote'));
      }
    },
    [t]
  );

  const Empty = () => (
    <View style={{ paddingVertical: 32 }}>
      <Text style={{ color: '#666' }}>{t('emptyQuotes')}</Text>
    </View>
  );

  const Row = ({ item: q }) => {
    const title =
      (q.clientName?.trim?.() ? q.clientName : t('noClient')) +
      (q.quoteNumber ? `  •  #${q.quoteNumber}` : '');

    const docLabel =
      q.docType === 'invoice' ? t('invoice') : t('quoteInvoice');

    const subL =
      docLabel +
      (q.createdAt ? `  •  ${new Date(q.createdAt).toLocaleDateString()}` : '');

    return (
      <TouchableOpacity
        onPress={() => onEdit(q)}
        activeOpacity={0.8}
        style={styles.row}
      >
        <View style={styles.rowLeft}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{subL}</Text>
        </View>

        <View style={styles.rowRight}>
          {q.totals?.total ? (
            <Text style={styles.total}>
              ${Number(q.totals.total).toFixed(2)}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => onEdit(q)}
              style={{ marginRight: 12 }}
            >
              <Text style={{ fontSize: 18 }}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(q)}>
              <Text style={[styles.iconBtn, { color: '#c62' }]}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={quotes}
      keyExtractor={(q) => String(q.id ?? q.quoteNumber)}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <Header
          logoUri={liveSettings?.logoUri}
          title={t('quotes')}
          onNewPress={onNew}
          newLabel={t('newPlus')}
        />
      }
      ListEmptyComponent={!loading ? Empty : null}
      renderItem={Row}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      initialNumToRender={8}
      windowSize={3}
      ListFooterComponent={
        loading ? (
          <View style={{ paddingVertical: 24 }}>
            <ActivityIndicator />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  rowLeft: { flex: 1, paddingRight: 8 },
  rowRight: { alignItems: 'flex-end', minWidth: 90 },
  title: { fontWeight: '700', fontSize: 16 },
  sub: { color: '#666', marginTop: 2 },
  total: { fontWeight: '700', fontSize: 16 },
  iconBtn: { fontSize: 18 },

  container: {
    backgroundColor: '#fff',
    paddingTop: 30,
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newBtn: {
    backgroundColor: '#d06201ff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 10,
  },
  newBtnText: { color: '#fff', fontWeight: 'bold' },

  logo: { width: 160, height: 60 },
  screenTitle: { fontSize: 20, fontWeight: 'bold' },
});
