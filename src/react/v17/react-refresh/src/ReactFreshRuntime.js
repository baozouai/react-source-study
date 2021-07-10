/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Instance} from 'react-reconciler/src/ReactFiberHostConfig';
import type {FiberRoot} from 'react-reconciler/src/ReactInternalTypes';
import type {
  Family,
  RefreshUpdate,
  ScheduleRefresh,
  ScheduleRoot,
  FindHostInstancesForRefresh,
  SetRefreshHandler,
} from 'react-reconciler/src/ReactFiberHotReloading';
import type {ReactNodeList} from 'shared/ReactTypes';

import {REACT_MEMO_TYPE, REACT_FORWARD_REF_TYPE} from 'shared/ReactSymbols';

type Signature = {
  ownKey: string,
  forceReset: boolean,
  fullKey: string | null, // Contains keys of nested Hooks. Computed lazily.
  getCustomHooks: () => Array<Function>,
};

type RendererHelpers = {
  findHostInstancesForRefresh: FindHostInstancesForRefresh,
  scheduleRefresh: ScheduleRefresh,
  scheduleRoot: ScheduleRoot,
  setRefreshHandler: SetRefreshHandler,
};



// In old environments, we'll leak previous types after every edit.
const PossiblyWeakMap = typeof WeakMap === 'function' ? WeakMap : Map;

// We never remove these associations.
// It's OK to reference families, but use WeakMap/Set for types.
const allFamiliesByID: Map<string, Family> = new Map();
const allFamiliesByType: // $FlowIssue
WeakMap<any, Family> | Map<any, Family> = new PossiblyWeakMap();
const allSignaturesByType: // $FlowIssue
WeakMap<any, Signature> | Map<any, Signature> = new PossiblyWeakMap();
// This WeakMap is read by React, so we only put families
// that have actually been edited here. This keeps checks fast.
// $FlowIssue
const updatedFamiliesByType: // $FlowIssue
WeakMap<any, Family> | Map<any, Family> = new PossiblyWeakMap();

// This is cleared on every performReactRefresh() call.
// It is an array of [Family, NextType] tuples.
let pendingUpdates: Array<[Family, any]> = [];

// This is injected by the renderer via DevTools global hook.
const helpersByRendererID: Map<number, RendererHelpers> = new Map();

const helpersByRoot: Map<FiberRoot, RendererHelpers> = new Map();

// We keep track of mounted roots so we can schedule updates.
const mountedRoots: Set<FiberRoot> = new Set();
// If a root captures an error, we remember it so we can retry on edit.
const failedRoots: Set<FiberRoot> = new Set();

// In environments that support WeakMap, we also remember the last element for every root.
// It needs to be weak because we do this even for roots that failed to mount.
// If there is no WeakMap, we won't attempt to do retrying.
// $FlowIssue
const rootElements: WeakMap<any, ReactNodeList> | null = // $FlowIssue
  typeof WeakMap === 'function' ? new WeakMap() : null;

let isPerformingRefresh = false;

function computeFullKey(signature: Signature): string {
  if (signature.fullKey !== null) {
    return signature.fullKey;
  }

  let fullKey: string = signature.ownKey;
  let hooks;
  try {
    hooks = signature.getCustomHooks();
  } catch (err) {
    // This can happen in an edge case, e.g. if expression like Foo.useSomething
    // depends on Foo which is lazily initialized during rendering.
    // In that case just assume we'll have to remount.
    signature.forceReset = true;
    signature.fullKey = fullKey;
    return fullKey;
  }

  for (let i = 0; i < hooks.length; i++) {
    const hook = hooks[i];
    if (typeof hook !== 'function') {
      // Something's wrong. Assume we need to remount.
      signature.forceReset = true;
      signature.fullKey = fullKey;
      return fullKey;
    }
    const nestedHookSignature = allSignaturesByType.get(hook);
    if (nestedHookSignature === undefined) {
      // No signature means Hook wasn't in the source code, e.g. in a library.
      // We'll skip it because we can assume it won't change during this session.
      continue;
    }
    const nestedHookKey = computeFullKey(nestedHookSignature);
    if (nestedHookSignature.forceReset) {
      signature.forceReset = true;
    }
    fullKey += '\n---\n' + nestedHookKey;
  }

  signature.fullKey = fullKey;
  return fullKey;
}

function haveEqualSignatures(prevType, nextType) {
  const prevSignature = allSignaturesByType.get(prevType);
  const nextSignature = allSignaturesByType.get(nextType);

  if (prevSignature === undefined && nextSignature === undefined) {
    return true;
  }
  if (prevSignature === undefined || nextSignature === undefined) {
    return false;
  }
  if (computeFullKey(prevSignature) !== computeFullKey(nextSignature)) {
    return false;
  }
  if (nextSignature.forceReset) {
    return false;
  }

  return true;
}

function isReactClass(type) {
  return type.prototype && type.prototype.isReactComponent;
}

function canPreserveStateBetween(prevType, nextType) {
  if (isReactClass(prevType) || isReactClass(nextType)) {
    return false;
  }
  if (haveEqualSignatures(prevType, nextType)) {
    return true;
  }
  return false;
}

function resolveFamily(type) {
  // Only check updated types to keep lookups fast.
  return updatedFamiliesByType.get(type);
}

// If we didn't care about IE11, we could use new Map/Set(iterable).
function cloneMap<K, V>(map: Map<K, V>): Map<K, V> {
  const clone = new Map();
  map.forEach((value, key) => {
    clone.set(key, value);
  });
  return clone;
}
function cloneSet<T>(set: Set<T>): Set<T> {
  const clone = new Set();
  set.forEach(value => {
    clone.add(value);
  });
  return clone;
}

export function performReactRefresh(): RefreshUpdate | null {

  if (pendingUpdates.length === 0) {
    return null;
  }
  if (isPerformingRefresh) {
    return null;
  }

  isPerformingRefresh = true;
  try {
    const staleFamilies = new Set();
    const updatedFamilies = new Set();

    const updates = pendingUpdates;
    pendingUpdates = [];
    updates.forEach(([family, nextType]) => {
      // Now that we got a real edit, we can create associations
      // that will be read by the React reconciler.
      const prevType = family.current;
      updatedFamiliesByType.set(prevType, family);
      updatedFamiliesByType.set(nextType, family);
      family.current = nextType;

      // Determine whether this should be a re-render or a re-mount.
      if (canPreserveStateBetween(prevType, nextType)) {
        updatedFamilies.add(family);
      } else {
        staleFamilies.add(family);
      }
    });

    // TODO: rename these fields to something more meaningful.
    const update: RefreshUpdate = {
      updatedFamilies, // Families that will re-render preserving state
      staleFamilies, // Families that will be remounted
    };

    helpersByRendererID.forEach(helpers => {
      // Even if there are no roots, set the handler on first update.
      // This ensures that if *new* roots are mounted, they'll use the resolve handler.
      helpers.setRefreshHandler(resolveFamily);
    });

    let didError = false;
    let firstError = null;

    // We snapshot maps and sets that are mutated during commits.
    // If we don't do this, there is a risk they will be mutated while
    // we iterate over them. For example, trying to recover a failed root
    // may cause another root to be added to the failed list -- an infinite loop.
    const failedRootsSnapshot = cloneSet(failedRoots);
    const mountedRootsSnapshot = cloneSet(mountedRoots);
    const helpersByRootSnapshot = cloneMap(helpersByRoot);

    failedRootsSnapshot.forEach(root => {
      const helpers = helpersByRootSnapshot.get(root);
      if (helpers === undefined) {
        throw new Error(
          'Could not find helpers for a root. This is a bug in React Refresh.',
        );
      }
      if (!failedRoots.has(root)) {
        // No longer failed.
      }
      if (rootElements === null) {
        return;
      }
      if (!rootElements.has(root)) {
        return;
      }
      const element = rootElements.get(root);
      try {
        helpers.scheduleRoot(root, element);
      } catch (err) {
        if (!didError) {
          didError = true;
          firstError = err;
        }
        // Keep trying other roots.
      }
    });
    mountedRootsSnapshot.forEach(root => {
      const helpers = helpersByRootSnapshot.get(root);
      if (helpers === undefined) {
        throw new Error(
          'Could not find helpers for a root. This is a bug in React Refresh.',
        );
      }
      if (!mountedRoots.has(root)) {
        // No longer mounted.
      }
      try {
        helpers.scheduleRefresh(root, update);
      } catch (err) {
        if (!didError) {
          didError = true;
          firstError = err;
        }
        // Keep trying other roots.
      }
    });
    if (didError) {
      throw firstError;
    }
    return update;
  } finally {
    isPerformingRefresh = false;
  }
}

export function register(type: any, id: string): void {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

export function setSignature(
  type: any,
  key: string,
  forceReset?: boolean = false,
  getCustomHooks?: () => Array<Function>,
): void {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

// This is lazily called during first render for a type.
// It captures Hook list at that time so inline requires don't break comparisons.
export function collectCustomHooksForSignature(type: any) {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

export function getFamilyByID(id: string): Family | void {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

export function getFamilyByType(type: any): Family | void {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

export function findAffectedHostInstances(
  families: Array<Family>,
): Set<Instance> {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

export function injectIntoGlobalHook(globalObject: any): void {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

export function hasUnrecoverableErrors() {
  // TODO: delete this after removing dependency in RN.
  return false;
}

// Exposed for testing.
export function _getMountedRootCount() {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

// This is a wrapper over more primitive functions for setting signature.
// Signatures let us decide whether the Hook order has changed on refresh.
//
// This function is intended to be used as a transform target, e.g.:
// var _s = createSignatureFunctionForTransform()
//
// function Hello() {
//   const [foo, setFoo] = useState(0);
//   const value = useCustomHook();
//   _s(); /* Second call triggers collecting the custom Hook list.
//          * This doesn't happen during the module evaluation because we
//          * don't want to change the module order with inline requires.
//          * Next calls are noops. */
//   return <h1>Hi</h1>;
// }
//
// /* First call specifies the signature: */
// _s(
//   Hello,
//   'useState{[foo, setFoo]}(0)',
//   () => [useCustomHook], /* Lazy to avoid triggering inline requires */
// );
type SignatureStatus = 'needsSignature' | 'needsCustomHooks' | 'resolved';
export function createSignatureFunctionForTransform() {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}

export function isLikelyComponentType(type: any): boolean {

    throw new Error(
      'Unexpected call to React Refresh in a production environment.',
    );

}
