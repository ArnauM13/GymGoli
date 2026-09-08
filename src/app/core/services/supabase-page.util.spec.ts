import { SUPABASE_PAGE_SIZE, fetchAllRows } from './supabase-page.util';

/** Una consulta que contesta com PostgREST: mai més de `cap` files de cop. */
function serverWith(total: number, cap = SUPABASE_PAGE_SIZE) {
  const calls: Array<[number, number]> = [];
  const rows = Array.from({ length: total }, (_, i) => ({ id: `w${i}` }));
  const build = () => ({
    range: (from: number, to: number) => {
      calls.push([from, to]);
      return Promise.resolve({
        data: rows.slice(from, Math.min(to + 1, from + cap)),
        error: null,
      });
    },
  });
  return { build, calls };
}

describe('fetchAllRows()', () => {
  it('en té prou amb una petició quan hi cap tot', async () => {
    const { build, calls } = serverWith(12);

    const { rows, error, complete } = await fetchAllRows<{ id: string }>(build);

    expect(rows.length).toBe(12);
    expect(error).toBeNull();
    expect(complete).toBeTrue();
    expect(calls).toEqual([[0, SUPABASE_PAGE_SIZE - 1]]);
  });

  it('recorre els trams fins al final quan el servidor talla la resposta', async () => {
    // El cas que es menjava l'historial: PostgREST retorna com a molt el seu
    // topall de files i no diu enlloc que n'hi havia més.
    const { build, calls } = serverWith(SUPABASE_PAGE_SIZE + 30);

    const { rows, complete } = await fetchAllRows<{ id: string }>(build);

    expect(rows.length).toBe(SUPABASE_PAGE_SIZE + 30);
    expect(complete).toBeTrue();
    expect(calls.length).toBe(2);
    expect(rows[0].id).toBe('w0');
    expect(rows[rows.length - 1].id).toBe(`w${SUPABASE_PAGE_SIZE + 29}`);
  });

  it('demana un tram de més quan l\'últim surt just ple', async () => {
    const { build, calls } = serverWith(SUPABASE_PAGE_SIZE);

    const { rows, complete } = await fetchAllRows<{ id: string }>(build);

    expect(rows.length).toBe(SUPABASE_PAGE_SIZE);
    expect(complete).toBeTrue();
    expect(calls.length).toBe(2); // el segon torna buit i confirma el final
  });

  it('marca la resposta com a incompleta quan un tram falla', async () => {
    let page = 0;
    const build = () => ({
      range: (_from: number, _to: number) => Promise.resolve(
        page++ === 0
          ? { data: Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => ({ id: `w${i}` })), error: null }
          : { data: null, error: new Error('network') },
      ),
    });

    const { rows, error, complete } = await fetchAllRows<{ id: string }>(build);

    // Qui ho llegeix ha de poder distingir «això és tot» de «això és un tros»:
    // deduir esborrats d'una resposta a mitges buida el magatzem local.
    expect(rows.length).toBe(SUPABASE_PAGE_SIZE);
    expect(error).toBeTruthy();
    expect(complete).toBeFalse();
  });
});
