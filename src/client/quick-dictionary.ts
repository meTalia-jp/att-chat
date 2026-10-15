export type QuickDictionaryResult = {
  word: string;
  meaning: string;
  source: 'EJDict-hand';
  status: 'loading' | 'found' | 'not-found' | 'invalid' | 'missing-asset' | 'unavailable';
};

export interface QuickDictionaryService {
  lookup(text: string): Promise<QuickDictionaryResult>;
}

class MissingDictionaryAsset extends Error {}

export function createQuickDictionaryService(load: () => Promise<unknown> = async () => {
  let response: Response;
  try { response = await fetch('/dictionaries/ejdict-hand/ejdict.json'); }
  catch { throw new MissingDictionaryAsset(); }
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new MissingDictionaryAsset();
  return response.json();
}): QuickDictionaryService {
  let cached: Promise<Map<string, string>> | undefined;
  function entries() {
    return cached ??= load().then(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid dictionary');
      const result = new Map<string, string>();
      for (const [word, meaning] of Object.entries(value)) {
        if (typeof meaning !== 'string') throw new Error('Invalid dictionary meaning');
        const key = word.toLowerCase();
        const previous = result.get(key);
        result.set(key, previous && previous !== meaning ? `${previous}\n${meaning}` : meaning);
      }
      if (!result.size) throw new Error('Empty dictionary');
      return result;
    }).catch(error => { cached = undefined; throw error; });
  }
  return { async lookup(text) {
    const input = text.trim(), word = input.toLowerCase();
    const base = { word, meaning: '', source: 'EJDict-hand' as const };
    if (!/^[A-Za-z]+$/.test(input)) return { ...base, status: 'invalid' as const };
    try {
      const dictionary = await entries();
      return dictionary.has(word)
        ? { ...base, meaning: dictionary.get(word)!, status: 'found' as const }
        : { ...base, status: 'not-found' as const };
    } catch (error) {
      return { ...base, status: error instanceof MissingDictionaryAsset ? 'missing-asset' as const : 'unavailable' as const };
    }
  } };
}

export const quickDictionaryService = createQuickDictionaryService();
