// Characters module — Roblox-classic R6 blocky characters + v2 creatures. Contract: ARCHITECTURE.md §3 and v2.
// See README.md in this folder for the full spec reference.
import { FACES, POSES, HAIR_STYLES, SHIRT_PATTERNS, PROPS_HELD, ACCESSORIES, PANTS_STYLES, PANTS_PATTERNS, CREATURES, EYE_MODES, MASK_SLOTS,
  normalizeSpec, normCreature, randomSpec } from './spec.js';
import { createHumanoid } from './humanoid.js';
import { buildCreature } from './creatures.js';

export { FACES, POSES, HAIR_STYLES, SHIRT_PATTERNS, PROPS_HELD, ACCESSORIES, PANTS_STYLES, PANTS_PATTERNS, CREATURES, EYE_MODES, MASK_SLOTS, randomSpec };

/** Build a character (or a creature when spec.creature is set). Never throws on bad specs. */
export function createCharacter(ctx, specIn) {
  if (!ctx.textures) ctx.textures = new Map();
  const raw = specIn && typeof specIn === 'object' ? specIn : {};
  try {
    const cid = normCreature(raw.creature);
    if (cid) { const c = buildCreature(ctx, cid, raw); if (c) return c; }
    return createHumanoid(ctx, normalizeSpec(raw), {});
  } catch (e) {
    console.warn('[characters] createCharacter failed, using a default character:', e && e.message);
    return createHumanoid(ctx, normalizeSpec({}), {});
  }
}
