/**
 * Demanar «tot» en una sola consulta és una trampa silenciosa.
 *
 * PostgREST talla la resposta a un màxim de files (als projectes de Supabase,
 * 1.000 per defecte) i no ho diu enlloc: arriba un 200 amb menys dades de les
 * que hi ha. Qui rep la resposta es pensa que té l'abast sencer, i aquí això
 * no és només ensenyar l'historial a mitges — `mergeServerScope()` dedueix
 * dels forats que la resta s'ha esborrat des d'un altre dispositiu, i les
 * treu del magatzem local. Un usuari amb prou història es quedava sense la
 * seva pròpia còpia.
 *
 * Per això qualsevol consulta d'abast obert (tot l'historial, tot un
 * exercici) passa per aquí: es demana per trams fins que un tram torna
 * incomplet, que és l'única manera de saber que ja no en queden més.
 *
 * **Cal un ordre total i estable** a la consulta (data + `created_at` + `id`,
 * mai només la data): si dues files empaten, PostgreSQL les pot resoldre
 * diferent a cada tram i n'hi ha que no surten a cap pàgina.
 */

/** Prou per sota del topall per defecte (1.000) perquè un tram sencer vulgui
 *  dir de debò «encara en queden», i prou gran perquè un historial normal
 *  càpiga en una o dues peticions. */
export const SUPABASE_PAGE_SIZE = 500;

/** Topall de trams: 100.000 files. Abans d'arribar-hi hi ha un problema molt
 *  més gros que la paginació. */
const MAX_PAGES = 200;

/** El poc que cal saber d'una consulta per demanar-li un tram. */
export interface PageableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>;
}

export interface PagedResult<T> {
  rows: T[];
  error: unknown;
  /** Cert només si s'ha arribat al final. Si és fals, el que hi ha a `rows`
   *  és un tros i **no** se'n pot deduir que la resta no existeix. */
  complete: boolean;
}

/**
 * Recorre una consulta per trams fins al final.
 *
 * `build()` s'ha de tornar a cridar a cada tram: un constructor de consultes
 * de supabase-js s'executa quan se l'espera, i reutilitzar-lo tornaria a
 * demanar el mateix rang.
 */
export async function fetchAllRows<T>(
  build: () => PageableQuery<T>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<PagedResult<T>> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize;
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { rows, error, complete: false };

    const batch = data ?? [];
    rows.push(...batch);
    // Un tram incomplet vol dir que ja no en queden. Un de ple pot ser el
    // final just, i llavors el següent tram torna buit: una petició de més,
    // però mai una pàgina de menys.
    if (batch.length < pageSize) return { rows, error: null, complete: true };
  }

  return { rows, error: null, complete: false };
}
