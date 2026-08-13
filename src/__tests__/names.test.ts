import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRandomName, isValidName, generateSuffix, generateAgentId } from '../names.js';

describe('names', () => {
  it('getRandomName returns a valid name', () => {
    const name = getRandomName();
    assert.ok(isValidName(name), `"${name}" should be a valid name`);
  });

  it('generateSuffix returns 4-char hex string', () => {
    const suffix = generateSuffix('abc123def456');
    assert.equal(suffix.length, 4);
    assert.match(suffix, /^[0-9a-f]{4}$/);
  });

  it('generateAgentId combines name and suffix', () => {
    const id = generateAgentId('Zeus', 'a3f2');
    assert.equal(id, 'Zeus-a3f2');
  });

  it('isValidName rejects unknown names', () => {
    assert.equal(isValidName('NotARealName'), false);
    assert.equal(isValidName('zeus'), false); // case sensitive
  });

  it('getRandomName produces different names across calls', () => {
    const names = new Set(Array.from({ length: 50 }, () => getRandomName()));
    assert.ok(names.size > 1, 'Should produce varied names');
  });
});
