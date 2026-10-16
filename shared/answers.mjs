export const NORMALIZATION = 'nfkc-katakana-space-lower-v2';
export function toKatakana(value) {
  return String(value).normalize('NFKC')
    .replace(/[\u3041-\u3096\u309D-\u309E]/gu, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
}
export function normalizeAnswer(value) {
  return toKatakana(value).toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF]/gu, '');
}
export async function hashAnswer(value) {
  const bytes = new TextEncoder().encode(normalizeAnswer(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Maximum bipartite matching: one answer group can satisfy only one input.
export function matchHashes(hashes, groups) {
  const owners = new Array(groups.length).fill(-1);
  function assign(input, seen) {
    for (let group = 0; group < groups.length; group++) {
      if (seen.has(group) || !groups[group].includes(hashes[input])) continue;
      seen.add(group);
      if (owners[group] === -1 || assign(owners[group], seen)) {
        owners[group] = input;
        return true;
      }
    }
    return false;
  }
  hashes.forEach((_, i) => assign(i, new Set()));
  return hashes.map((_, i) => owners.includes(i));
}
export async function checkAnswers(values, groups, treasureValue, treasureHashes) {
  const matched = matchHashes(await Promise.all(values.map(hashAnswer)), groups);
  if (treasureHashes) matched.push(treasureHashes.includes(await hashAnswer(treasureValue)));
  return matched;
}
