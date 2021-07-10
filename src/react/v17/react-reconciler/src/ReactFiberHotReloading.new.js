/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactElement} from 'shared/ReactElementType';
import type {Fiber} from './ReactInternalTypes';
import type {FiberRoot} from './ReactInternalTypes';
import type {Instance} from './ReactFiberHostConfig';
import type {ReactNodeList} from 'shared/ReactTypes';

import {
  flushSync,
  scheduleUpdateOnFiber,
  flushPassiveEffects,
} from './ReactFiberWorkLoop.new';
import {updateContainer} from './ReactFiberReconciler.new';
import {emptyContextObject} from './ReactFiberContext.new';
import {SyncLane, NoTimestamp} from './ReactFiberLane';
import {
  ClassComponent,
  FunctionComponent,
  ForwardRef,
  HostComponent,
  HostPortal,
  HostRoot,
  MemoComponent,
  SimpleMemoComponent,
} from './ReactWorkTags';
import {
  REACT_FORWARD_REF_TYPE,
  REACT_MEMO_TYPE,
  REACT_LAZY_TYPE,
} from 'shared/ReactSymbols';

export type Family = {
  current: any,
};

export type RefreshUpdate = {
  staleFamilies: Set<Family>,
  updatedFamilies: Set<Family>,
};

// Resolves type to a family.
type RefreshHandler = any => Family | void;

// Used by React Refresh runtime through DevTools Global Hook.
export type SetRefreshHandler = (handler: RefreshHandler | null) => void;
export type ScheduleRefresh = (root: FiberRoot, update: RefreshUpdate) => void;
export type ScheduleRoot = (root: FiberRoot, element: ReactNodeList) => void;
export type FindHostInstancesForRefresh = (
  root: FiberRoot,
  families: Array<Family>,
) => Set<Instance>;

let resolveFamily: RefreshHandler | null = null;
// $FlowFixMe Flow gets confused by a WeakSet feature check below.
let failedBoundaries: WeakSet<Fiber> | null = null;

export const setRefreshHandler = (handler: RefreshHandler | null): void => {

};

export function resolveFunctionForHotReloading(type: any): any {

    return type;

}

export function resolveClassForHotReloading(type: any): any {
  // No implementation differences.
  return resolveFunctionForHotReloading(type);
}

export function resolveForwardRefForHotReloading(type: any): any {

    return type;

}

export function isCompatibleFamilyForHotReloading(
  fiber: Fiber,
  element: ReactElement,
): boolean {

    return false;

}

export function markFailedErrorBoundaryForHotReloading(fiber: Fiber) {

}

export const scheduleRefresh: ScheduleRefresh = (
  root: FiberRoot,
  update: RefreshUpdate,
): void => {

};

export const scheduleRoot: ScheduleRoot = (
  root: FiberRoot,
  element: ReactNodeList,
): void => {

};

function scheduleFibersWithFamiliesRecursively(
  fiber: Fiber,
  updatedFamilies: Set<Family>,
  staleFamilies: Set<Family>,
) {

}

export const findHostInstancesForRefresh: FindHostInstancesForRefresh = (
  root: FiberRoot,
  families: Array<Family>,
): Set<Instance> => {

    throw new Error(
      'Did not expect findHostInstancesForRefresh to be called in production.',
    );

};

function findHostInstancesForMatchingFibersRecursively(
  fiber: Fiber,
  types: Set<any>,
  hostInstances: Set<Instance>,
) {

}

function findHostInstancesForFiberShallowly(
  fiber: Fiber,
  hostInstances: Set<Instance>,
): void {

}

function findChildHostInstancesForFiberShallowly(
  fiber: Fiber,
  hostInstances: Set<Instance>,
): boolean {

  return false;
}
