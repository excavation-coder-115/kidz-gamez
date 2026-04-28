import { describe, expect, test } from 'bun:test';

import type { VehicleGraphV1 } from '../src/contracts/arcade';
import { ParentGateChallenge } from '../src/parent-gate';
import { GarageStore, VEHICLE_CLASS_REGISTRY } from '../src/garage-store';
import { InMemoryStorage, ProfileStore } from '../src/profile-store';

function withParentReady(storage = new InMemoryStorage()): ProfileStore {
  const gate = new ParentGateChallenge();
  const store = new ProfileStore(storage, gate);
  const challenge = gate.createChallenge();
  expect(gate.verifyAnswer(challenge, challenge.answer)).toBeTrue();
  return store;
}

function makeGraph(classId = 'speedster'): VehicleGraphV1 {
  return {
    schemaVersion: 1,
    classId,
    nodes: [],
  };
}

describe('T05 vehicle classes and garage persistence', () => {
  test('persistence keying isolates vehicles across child profiles', () => {
    const storage = new InMemoryStorage();

    const profileStore = withParentReady(storage);
    const aria = profileStore.createProfile({ name: 'Aria', ageBandId: 'age-6-8' });
    expect(aria.ok).toBeTrue();

    const garage = new GarageStore(storage, profileStore);
    const firstSave = garage.saveVehicle({ name: 'Aria Racer', graph: makeGraph('speedster') });
    expect(firstSave.ok).toBeTrue();

    const zeke = profileStore.createProfile({ name: 'Zeke', ageBandId: 'age-9-12' });
    expect(zeke.ok).toBeTrue();

    const secondSave = garage.saveVehicle({ name: 'Zeke Tank', graph: makeGraph('hauler') });
    expect(secondSave.ok).toBeTrue();

    const zekeGarage = garage.getGarageEntries();
    expect(zekeGarage).toHaveLength(1);
    expect(zekeGarage[0].name).toBe('Zeke Tank');

    const ariaId = aria.ok ? aria.profile.id : '';
    expect(profileStore.selectProfile(ariaId).ok).toBeTrue();

    const ariaGarage = garage.getGarageEntries();
    expect(ariaGarage).toHaveLength(1);
    expect(ariaGarage[0].name).toBe('Aria Racer');
  });

  test('fallback logic recovers when active vehicle is missing or corrupted', () => {
    const storage = new InMemoryStorage();
    const profileStore = withParentReady(storage);
    const create = profileStore.createProfile({ name: 'Luna', ageBandId: 'age-9-12' });
    expect(create.ok).toBeTrue();

    const lunaId = create.ok ? create.profile.id : '';

    storage.setItem(
      'kidz-gamez.garage.v1',
      JSON.stringify({
        profiles: {
          [lunaId]: {
            entries: [{ id: 'build-1', name: 'Luna Custom', graph: makeGraph('speedster') }],
            activeVehicleId: 'missing-build',
          },
        },
      }),
    );

    const garageFromCorruptActive = new GarageStore(storage, profileStore);
    expect(garageFromCorruptActive.getActiveVehicle()?.id).toBe('build-1');

    storage.setItem(
      'kidz-gamez.garage.v1',
      JSON.stringify({
        profiles: {
          [lunaId]: {
            entries: [],
            activeVehicleId: 'still-missing',
          },
        },
      }),
    );

    const garageFromMissingData = new GarageStore(storage, profileStore);
    const fallback = garageFromMissingData.getActiveVehicle();
    expect(fallback).not.toBeNull();
    expect(fallback?.classId).toBe(VEHICLE_CLASS_REGISTRY[0].id);
  });

  test('save two vehicles, switch active, reload, and restore active vehicle', () => {
    const storage = new InMemoryStorage();
    const profileStore1 = withParentReady(storage);
    const create = profileStore1.createProfile({ name: 'Nova', ageBandId: 'age-6-8' });
    expect(create.ok).toBeTrue();

    const garage1 = new GarageStore(storage, profileStore1);

    const saveA = garage1.saveVehicle({ name: 'Nova Drift', graph: makeGraph('speedster') });
    expect(saveA.ok).toBeTrue();

    const saveB = garage1.saveVehicle({ name: 'Nova Cargo', graph: makeGraph('hauler') });
    expect(saveB.ok).toBeTrue();

    const activeTargetId = saveA.ok ? saveA.vehicle.id : '';
    expect(garage1.selectVehicle(activeTargetId).ok).toBeTrue();

    const profileStore2 = withParentReady(storage);
    const garage2 = new GarageStore(storage, profileStore2);

    expect(garage2.getGarageEntries()).toHaveLength(2);
    expect(garage2.getActiveVehicle()?.id).toBe(activeTargetId);
  });

  test('profile swap updates available garage entries correctly', () => {
    const storage = new InMemoryStorage();
    const profileStore = withParentReady(storage);

    const milo = profileStore.createProfile({ name: 'Milo', ageBandId: 'age-3-5' });
    const ivy = profileStore.createProfile({ name: 'Ivy', ageBandId: 'age-6-8' });
    expect(milo.ok).toBeTrue();
    expect(ivy.ok).toBeTrue();

    const garage = new GarageStore(storage, profileStore);

    expect(garage.saveVehicle({ name: 'Ivy Wing', graph: makeGraph('glider') }).ok).toBeTrue();

    const miloId = milo.ok ? milo.profile.id : '';
    expect(profileStore.selectProfile(miloId).ok).toBeTrue();

    expect(garage.getGarageEntries()).toEqual([]);

    expect(garage.saveVehicle({ name: 'Milo Mini', graph: makeGraph('speedster') }).ok).toBeTrue();
    expect(garage.getGarageEntries().map((entry) => entry.name)).toEqual(['Milo Mini']);

    const ivyId = ivy.ok ? ivy.profile.id : '';
    expect(profileStore.selectProfile(ivyId).ok).toBeTrue();

    expect(garage.getGarageEntries().map((entry) => entry.name)).toEqual(['Ivy Wing']);
  });
});
