export type DictionaryResult = {
  word: string;
  meaning: string;
  source: string;
  status: 'loading' | 'found' | 'not-found' | 'invalid' | 'missing-asset' | 'unavailable';
};
export interface DictionaryService { lookup(text: string): Promise<DictionaryResult> }
export const dictionarySource = 'EJDict-hand';
class MissingDictionaryAsset extends Error {}

// The adapter owns the JSON format; panels depend only on DictionaryResult.
export function createDictionaryService(load: () => Promise<unknown> = async () => {
  let response: Response;
  try { response = await fetch('/dictionaries/ejdict-hand/ejdict.json'); }
  catch { throw new MissingDictionaryAsset(); }
  if (!response.ok || response.headers?.get('content-type')?.includes('text/html')) throw new MissingDictionaryAsset();
  return response.json();
}): DictionaryService {
  let cached: Promise<Map<string, string>> | undefined;
  function dictionary() {
    return cached ??= load().then(data => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid dictionary');
      const entries = new Map<string, string>();
      for (const [key, meaning] of Object.entries(data)) {
        if (typeof meaning !== 'string') throw new Error('Invalid meaning');
        const word = key.toLowerCase();
        const previous = entries.get(word);
        entries.set(word, previous && previous !== meaning ? `${previous}\n${meaning}` : meaning);
      }
      if (!entries.size) throw new Error('Empty dictionary');
      return entries;
    }).catch(error => { cached = undefined; throw error; });
  }
  return { async lookup(text) {
    const input = text.trim();
    const word = input.toLowerCase();
    const base = { word, meaning: '', source: dictionarySource };
    if (!/^[A-Za-z]+$/.test(input)) return { ...base, status: 'invalid' };
    try {
      const entries = await dictionary();
      return entries.has(word) ? { ...base, meaning: entries.get(word)!, status: 'found' }
        : { ...base, status: 'not-found' };
    } catch (error) { return { ...base, status: error instanceof MissingDictionaryAsset ? 'missing-asset' : 'unavailable' }; }
  } };
}

// Each consumer owns its request sequence, independently of the shared cache.
export function createDictionarySearch(service: DictionaryService, publish: (result: DictionaryResult) => void) {
  let sequence = 0;
  return {
    async search(text: string) {
      const request = ++sequence;
      publish({ word: text.trim().toLowerCase(), meaning: '', source: dictionarySource, status: 'loading' });
      const result = await service.lookup(text);
      if (request === sequence) publish(result);
    },
    cancel() { sequence++; },
  };
}

export const quickDictionary = createDictionaryService();
