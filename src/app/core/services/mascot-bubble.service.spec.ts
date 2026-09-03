import { MascotBubbleService } from './mascot-bubble.service';

const LS_KEY = 'gymgoli_mascot_bubble';
const TODAY  = (): string => new Date().toISOString().split('T')[0];

describe('MascotBubbleService', () => {
  beforeEach(() => localStorage.removeItem(LS_KEY));
  afterEach(()  => localStorage.removeItem(LS_KEY));

  it('starts open for a key nobody has dismissed', () => {
    expect(new MascotBubbleService().isOpen('home:gran_setmana')).toBe(true);
  });

  it('closes a key once dismissed', () => {
    const service = new MascotBubbleService();
    service.dismiss('home:gran_setmana');
    expect(service.isOpen('home:gran_setmana')).toBe(false);
  });

  it('leaves other keys open', () => {
    const service = new MascotBubbleService();
    service.dismiss('home:gran_setmana');
    expect(service.isOpen('train:gym:Empenta')).toBe(true);
  });

  it('keeps it closed for a new instance on the same day', () => {
    new MascotBubbleService().dismiss('home:descansa');
    expect(new MascotBubbleService().isOpen('home:descansa')).toBe(false);
  });

  it('reopens everything the next day', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ date: '2000-01-01', keys: ['home:descansa'] }));
    expect(new MascotBubbleService().isOpen('home:descansa')).toBe(true);
  });

  it('stamps stored keys with today so they expire', () => {
    new MascotBubbleService().dismiss('home:descansa');
    const stored = JSON.parse(localStorage.getItem(LS_KEY)!);
    expect(stored.date).toBe(TODAY());
    expect(stored.keys).toContain('home:descansa');
  });

  it('dismissing twice does not duplicate the key', () => {
    const service = new MascotBubbleService();
    service.dismiss('home:descansa');
    service.dismiss('home:descansa');
    expect(JSON.parse(localStorage.getItem(LS_KEY)!).keys).toEqual(['home:descansa']);
  });

  it('survives corrupted storage instead of throwing', () => {
    localStorage.setItem(LS_KEY, 'no és json');
    expect(() => new MascotBubbleService()).not.toThrow();
    expect(new MascotBubbleService().isOpen('home:descansa')).toBe(true);
  });
});
