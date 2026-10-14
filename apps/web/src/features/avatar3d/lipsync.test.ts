import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTimeline,
  charsSpokenAt,
  mouthAt,
  REST_MOUTH,
  SpeechClock,
  wordVisemes,
} from './lipsync';
import { activeSpeech, liveMouth, resetSpeech, startSpeech } from './speechSignal';

const visemes = (word: string) => wordVisemes(word).map((p) => p.viseme);

describe('wordVisemes (español)', () => {
  it('h muda, dígrafos y c/g suaves', () => {
    expect(visemes('hola')).toEqual(['O', 'DD', 'aa']);
    expect(visemes('chico')).toEqual(['CH', 'I', 'kk', 'O']);
    expect(visemes('calle')).toEqual(['kk', 'aa', 'CH', 'E']);
    expect(visemes('perro')).toEqual(['PP', 'E', 'RR', 'O']);
    expect(visemes('queso')).toEqual(['kk', 'E', 'SS', 'O']);
    expect(visemes('cine')).toEqual(['SS', 'I', 'nn', 'E']);
  });

  it('marca la vocal con tilde como tónica', () => {
    const phones = wordVisemes('café');
    expect(phones.at(-1)).toEqual({ viseme: 'E', stressed: true });
  });

  it('m, b y p cierran los labios', () => {
    expect(visemes('mamá')[0]).toBe('PP');
  });
});

describe('buildTimeline', () => {
  it('ordena visemas sin huecos y registra cada palabra', () => {
    const text = 'Hola, ¿cómo estás?';
    const timeline = buildTimeline(text);
    expect(timeline.words.map((w) => text.slice(w.char, w.end))).toEqual(['Hola', 'cómo', 'estás']);
    for (let i = 1; i < timeline.visemes.length; i++) {
      expect(timeline.visemes[i]!.start).toBeCloseTo(timeline.visemes[i - 1]!.end, 6);
    }
    expect(timeline.duration).toBeGreaterThan(1000);
  });

  it('las comas y los puntos son pausas: la boca descansa', () => {
    const timeline = buildTimeline('Sí. No');
    const pause = timeline.visemes.find((v) => v.viseme === 'sil' && v.end - v.start > 300);
    expect(pause).toBeDefined();
    expect(mouthAt(timeline, (pause!.start + pause!.end) / 2).open).toBeLessThan(0.05);
  });

  it('a mayor velocidad, menos duración', () => {
    const text = 'Podemos construir el lanzamiento alrededor del origen';
    expect(buildTimeline(text, 2).duration).toBeCloseTo(buildTimeline(text).duration / 2, 0);
  });
});

describe('mouthAt', () => {
  const timeline = buildTimeline('ma');
  const a = timeline.visemes.find((v) => v.viseme === 'aa')!;
  const m = timeline.visemes.find((v) => v.viseme === 'PP')!;

  it('abre en la «a» y cierra en la «m»', () => {
    expect(mouthAt(timeline, a.start + 5).open).toBeGreaterThan(0.6);
    expect(mouthAt(timeline, m.start + 5).open).toBeLessThan(0.1);
  });

  it('antes y después del habla, reposo', () => {
    expect(mouthAt(timeline, -10)).toEqual(REST_MOUTH);
    expect(mouthAt(timeline, timeline.duration + 10)).toEqual(REST_MOUTH);
  });

  it('la «u» redondea los labios', () => {
    const u = buildTimeline('tu');
    const vowel = u.visemes.find((v) => v.viseme === 'U')!;
    expect(mouthAt(u, vowel.start + 5).round).toBeGreaterThan(0.8);
  });

  it('cuenta lo dicho por palabras completas', () => {
    const text = 'uno dos tres';
    const tl = buildTimeline(text);
    expect(charsSpokenAt(tl, tl.words[1]!.start + 1, text.length)).toBe(7);
    expect(charsSpokenAt(tl, tl.duration, text.length)).toBe(text.length);
  });
});

describe('SpeechClock', () => {
  const text = 'uno dos tres cuatro';

  it('callado hasta que empieza el audio', () => {
    const clock = new SpeechClock(buildTimeline(text));
    expect(clock.mouth(500)).toEqual(REST_MOUTH);
    clock.begin(1000);
    expect(clock.position(1100)).toBeCloseTo(100);
  });

  it('se reancla en cada palabra de la voz y no se adelanta a ella', () => {
    const tl = buildTimeline(text);
    const clock = new SpeechClock(tl);
    clock.begin(0);
    clock.boundary(0, 0);
    // La voz tarda en llegar a «dos»: el reloj espera al comienzo de esa palabra.
    expect(clock.position(10_000)).toBeLessThan(tl.words[1]!.start);
    clock.boundary(4, 10_000);
    expect(clock.position(10_000)).toBeCloseTo(tl.words[1]!.start);
  });

  it('adopta la velocidad real de la voz', () => {
    const tl = buildTimeline(text);
    const clock = new SpeechClock(tl);
    clock.begin(0);
    clock.boundary(0, 0);
    // Esta voz habla al doble de lo estimado.
    clock.boundary(8, tl.words[2]!.start / 2);
    const now = tl.words[2]!.start / 2 + 50;
    expect(clock.position(now) - tl.words[2]!.start).toBeGreaterThan(60);
  });

  it('al terminar, reposo y todo dicho', () => {
    const clock = new SpeechClock(buildTimeline(text));
    clock.begin(0);
    clock.end();
    expect(clock.mouth(100)).toEqual(REST_MOUTH);
    expect(clock.spokenChars(100, text.length)).toBe(text.length);
  });
});

describe('speechSignal', () => {
  afterEach(resetSpeech);

  it('sin nadie hablando no hay boca sincronizada', () => {
    expect(liveMouth()).toBeNull();
  });

  it('la voz tiene prioridad sobre el texto que aparece', () => {
    const voice = startSpeech('hola a todos', { source: 'voice' });
    startSpeech('otro texto', { source: 'text' });
    expect(activeSpeech()).toBe(voice);
    expect(liveMouth(0)).toEqual(REST_MOUTH); // aún no suena
    voice.begin(0);
    voice.end();
    expect(liveMouth()).toBeNull();
  });
});
