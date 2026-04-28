import { describe, expect, test } from 'bun:test';

import { ParentGateChallenge } from '../src/parent-gate';
import {
  InMemoryStorage,
  ProfileStore,
  PROFILE_AGE_BANDS,
  type AgeBandId,
} from '../src/profile-store';

function withParentReady(storage = new InMemoryStorage()): ProfileStore {
  const gate = new ParentGateChallenge();
  const store = new ProfileStore(storage, gate);
  const challenge = gate.createChallenge();
  expect(gate.verifyAnswer(challenge, challenge.answer)).toBeTrue();
  return store;
}

describe('T02 parent gate and child profiles', () => {
  test('parent challenge validation handles pass/fail paths', () => {
    const gate = new ParentGateChallenge();
    const challenge = gate.createChallenge();

    expect(gate.verifyAnswer(challenge, challenge.answer)).toBeTrue();
    expect(gate.isUnlocked()).toBeTrue();

    gate.reset();
    expect(gate.verifyAnswer(challenge, challenge.answer + 1)).toBeFalse();
    expect(gate.isUnlocked()).toBeFalse();
  });

  test('verifyAnswer rejects fabricated challenge payloads', () => {
    const gate = new ParentGateChallenge();
    gate.createChallenge();

    const fabricated = { prompt: '', answer: 7 };
    expect(gate.verifyAnswer(fabricated, 7)).toBeFalse();
    expect(gate.isUnlocked()).toBeFalse();
  });

  test('profile validation rejects invalid age bands', () => {
    const store = withParentReady();

    const result = store.createProfile({
      name: 'Ari',
      ageBandId: 'teen-plus' as AgeBandId,
    });

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.error).toContain('age band');
    }
  });

  test('profile management is blocked until parent gate is completed', () => {
    const gate = new ParentGateChallenge();
    const store = new ProfileStore(new InMemoryStorage(), gate);

    const result = store.createProfile({ name: 'Milo', ageBandId: 'age-6-8' });

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.error).toContain('Parent gate');
    }
  });

  test('create profile then reload restores active profile', () => {
    const storage = new InMemoryStorage();

    const store1 = withParentReady(storage);
    const create = store1.createProfile({ name: 'Luna', ageBandId: 'age-9-12' });

    expect(create.ok).toBeTrue();
    expect(store1.getActiveProfile()?.name).toBe('Luna');

    const store2 = withParentReady(storage);

    expect(store2.getProfiles()).toHaveLength(1);
    expect(store2.getProfiles()[0].ageBand).toEqual(PROFILE_AGE_BANDS['age-9-12']);
    expect(store2.getActiveProfile()?.name).toBe('Luna');
  });
});
