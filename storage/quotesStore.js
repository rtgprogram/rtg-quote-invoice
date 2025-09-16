// storage/quotesStore.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'RTG_QUOTES_V1';

/** Lee todas las quotes guardadas */
export async function listQuotes() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.log('listQuotes parse error:', e);
    return [];
  }
}

/** Crea o actualiza una quote (si existe por id/quoteNumber) */
export async function upsertQuote(quote) {
  const list = await listQuotes();
  const id = quote.id ?? quote.quoteNumber;
  const idx = list.findIndex(q => (q.id ?? q.quoteNumber) === id);

  const toSave = {
    ...quote,
    id,
    updatedAt: Date.now(),
    createdAt: quote.createdAt ?? Date.now(),
    clientName: (quote.clientName ?? '').trim() || 'Sin cliente',
  };

  if (idx >= 0) list[idx] = toSave; else list.unshift(toSave);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  return toSave;
}

/** Borra una quote por id o quoteNumber */
export async function deleteQuote(idOrNumber) {
  const list = await listQuotes();
  const filtered = list.filter(q => (q.id ?? q.quoteNumber) !== idOrNumber);
  await AsyncStorage.setItem(KEY, JSON.stringify(filtered));
}

/** Obtiene una quote existente por id o quoteNumber (para editar) */
export async function getQuoteById(idOrNumber) {
  const list = await listQuotes();
  return list.find(q => (q.id ?? q.quoteNumber) === idOrNumber) || null;
}
// para editar quotes salvadas
export async function getQuote(id) {
  const arr = await listQuotes();
  return arr.find(q => q.id === id) || null;
}
