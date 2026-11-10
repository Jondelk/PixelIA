/**
 * Prueba la producción 3D sin base de datos ni navegador:
 *
 *   npm run avatar:demo -w @pixel/api            → las tres marcas de demostración
 *   npm run avatar:demo -w @pixel/api -- cafe    → solo una (cafe | nova | constructora)
 *
 * Usa el mismo camino que la app: onboarding → BrandDNA → AvatarProfile → CharacterSpec →
 * Pixel Sculpt. Los archivos quedan en apps/api/storage/demo/<marca>/.
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { BrandOnboardingSchema } from '@pixel/contracts';
import { loadEnv } from '../src/config/env.js';
import { rulesAvatarEngine } from '../src/modules/avatars/engine/rulesAvatarEngine.js';
import { profileToCharacterSpec } from '../src/modules/avatars/model/characterSpec.js';
import { createSculptRunner, ENGINE_VERSION } from '../src/modules/avatars/model/sculptRunner.js';
import { generateBrandDna } from '../src/modules/brand-dna/brandDna.generator.js';
import { cafeTinto, constructoraNorte, novaLabs } from '../test/fixtures/onboarding.js';

const BRANDS = { cafe: cafeTinto, nova: novaLabs, constructora: constructoraNorte };

const env = loadEnv();
const runner = createSculptRunner({
  size: env.AVATAR_RENDER_SIZE,
  quality: env.AVATAR_QUALITY,
  timeoutMs: env.AVATAR_TIMEOUT_MS,
});
console.log(
  `${ENGINE_VERSION} · calidad ${env.AVATAR_QUALITY} · renders ${env.AVATAR_RENDER_SIZE}px`,
);

const wanted = process.argv.slice(2).filter((arg) => arg in BRANDS) as (keyof typeof BRANDS)[];
for (const key of wanted.length ? wanted : (Object.keys(BRANDS) as (keyof typeof BRANDS)[])) {
  const dna = generateBrandDna(BrandOnboardingSchema.parse(BRANDS[key]));
  const concept = await rulesAvatarEngine.generate({ brandDna: dna, variation: 0 });
  const spec = profileToCharacterSpec(concept);
  const outDir = resolve(env.STORAGE_DIR, 'demo', key);
  console.log(`\n${dna.identity.name}: «${concept.name}» (${concept.baseObject.label})`);
  try {
    const result = await runner.build(spec, outDir);
    console.log(
      `✓ ${(result.durationMs / 1000).toFixed(1)} s · ${result.stats.triangles.toLocaleString('es')} triángulos → ${outDir}`,
    );
    console.log(`  ${result.files.join(', ')}`);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    if (err && typeof err === 'object' && 'detail' in err) console.error(String(err.detail));
    process.exitCode = 1;
  }
}
