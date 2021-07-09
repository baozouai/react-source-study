/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {enableNewReconciler} from 'shared/ReactFeatureFlags';

// The entry file imports either the old or new version of the reconciler.
// During build and testing, this indirection is always shimmed with the actual
// modules, otherwise both reconcilers would be initialized. So this is really
// only here for Flow purposes.

// import {
//   createContainer as createContainer_old,
//   updateContainer as updateContainer_old,
//   batchedEventUpdates as batchedEventUpdates_old,
//   batchedUpdates as batchedUpdates_old,
//   unbatchedUpdates as unbatchedUpdates_old,
//   deferredUpdates as deferredUpdates_old,
//   discreteUpdates as discreteUpdates_old,
//   flushDiscreteUpdates as flushDiscreteUpdates_old,
//   flushControlled as flushControlled_old,
//   flushSync as flushSync_old,
//   flushPassiveEffects as flushPassiveEffects_old,
//   IsThisRendererActing as IsThisRendererActing_old,
//   getPublicRootInstance as getPublicRootInstance_old,
//   attemptSynchronousHydration as attemptSynchronousHydration_old,
//   attemptUserBlockingHydration as attemptUserBlockingHydration_old,
//   attemptContinuousHydration as attemptContinuousHydration_old,
//   attemptHydrationAtCurrentPriority as attemptHydrationAtCurrentPriority_old,
//   findHostInstance as findHostInstance_old,
//   findHostInstanceWithWarning as findHostInstanceWithWarning_old,
//   findHostInstanceWithNoPortals as findHostInstanceWithNoPortals_old,
//   shouldSuspend as shouldSuspend_old,
//   injectIntoDevTools as injectIntoDevTools_old,
//   act as act_old,
//   createPortal as createPortal_old,
//   createComponentSelector as createComponentSelector_old,
//   createHasPsuedoClassSelector as createHasPsuedoClassSelector_old,
//   createRoleSelector as createRoleSelector_old,
//   createTestNameSelector as createTestNameSelector_old,
//   createTextSelector as createTextSelector_old,
//   getFindAllNodesFailureDescription as getFindAllNodesFailureDescription_old,
//   findAllNodes as findAllNodes_old,
//   findBoundingRects as findBoundingRects_old,
//   focusWithin as focusWithin_old,
//   observeVisibleRects as observeVisibleRects_old,
//   registerMutableSourceForHydration as registerMutableSourceForHydration_old,
//   runWithPriority as runWithPriority_old,
//   getCurrentUpdateLanePriority as getCurrentUpdateLanePriority_old,
// } from './ReactFiberReconciler.old';

import {
  createContainer as createContainer_new,
  updateContainer as updateContainer_new,
  batchedEventUpdates as batchedEventUpdates_new,
  batchedUpdates as batchedUpdates_new,
  unbatchedUpdates as unbatchedUpdates_new,
  deferredUpdates as deferredUpdates_new,
  discreteUpdates as discreteUpdates_new,
  flushDiscreteUpdates as flushDiscreteUpdates_new,
  flushControlled as flushControlled_new,
  flushSync as flushSync_new,
  flushPassiveEffects as flushPassiveEffects_new,
  IsThisRendererActing as IsThisRendererActing_new,
  getPublicRootInstance as getPublicRootInstance_new,
  attemptSynchronousHydration as attemptSynchronousHydration_new,
  attemptUserBlockingHydration as attemptUserBlockingHydration_new,
  attemptContinuousHydration as attemptContinuousHydration_new,
  attemptHydrationAtCurrentPriority as attemptHydrationAtCurrentPriority_new,
  findHostInstance as findHostInstance_new,
  findHostInstanceWithWarning as findHostInstanceWithWarning_new,
  findHostInstanceWithNoPortals as findHostInstanceWithNoPortals_new,
  shouldSuspend as shouldSuspend_new,
  injectIntoDevTools as injectIntoDevTools_new,
  act as act_new,
  createPortal as createPortal_new,
  createComponentSelector as createComponentSelector_new,
  createHasPsuedoClassSelector as createHasPsuedoClassSelector_new,
  createRoleSelector as createRoleSelector_new,
  createTestNameSelector as createTestNameSelector_new,
  createTextSelector as createTextSelector_new,
  getFindAllNodesFailureDescription as getFindAllNodesFailureDescription_new,
  findAllNodes as findAllNodes_new,
  findBoundingRects as findBoundingRects_new,
  focusWithin as focusWithin_new,
  observeVisibleRects as observeVisibleRects_new,
  registerMutableSourceForHydration as registerMutableSourceForHydration_new,
  runWithPriority as runWithPriority_new,
  getCurrentUpdateLanePriority as getCurrentUpdateLanePriority_new,
} from './ReactFiberReconciler.new';

export const createContainer = createContainer_new

export const updateContainer = updateContainer_new

export const batchedEventUpdates = batchedEventUpdates_new

export const batchedUpdates = batchedUpdates_new

export const unbatchedUpdates = unbatchedUpdates_new

export const deferredUpdates = deferredUpdates_new

export const discreteUpdates = discreteUpdates_new

export const flushDiscreteUpdates = flushDiscreteUpdates_new

export const flushControlled = flushControlled_new

export const flushSync = flushSync_new
export const flushPassiveEffects = flushPassiveEffects_new

export const IsThisRendererActing = IsThisRendererActing_new

export const getPublicRootInstance = getPublicRootInstance_new

export const attemptSynchronousHydration = attemptSynchronousHydration_new

export const attemptUserBlockingHydration = attemptUserBlockingHydration_new

export const attemptContinuousHydration = attemptContinuousHydration_new

export const attemptHydrationAtCurrentPriority = attemptHydrationAtCurrentPriority_new

export const getCurrentUpdateLanePriority = getCurrentUpdateLanePriority_new

export const findHostInstance = findHostInstance_new

export const findHostInstanceWithWarning = findHostInstanceWithWarning_new

export const findHostInstanceWithNoPortals = findHostInstanceWithNoPortals_new

export const shouldSuspend = shouldSuspend_new

export const injectIntoDevTools = injectIntoDevTools_new

export const act = act_new
export const createPortal = createPortal_new

export const createComponentSelector = createComponentSelector_new


//TODO: "psuedo" is spelled "pseudo"
export const createHasPsuedoClassSelector = createHasPsuedoClassSelector_new

export const createRoleSelector = createRoleSelector_new

export const createTextSelector = createTextSelector_new

export const createTestNameSelector = createTestNameSelector_new

export const getFindAllNodesFailureDescription = getFindAllNodesFailureDescription_new

export const findAllNodes = findAllNodes_new

export const findBoundingRects = findBoundingRects_new

export const focusWithin = focusWithin_new

export const observeVisibleRects = observeVisibleRects_new

export const registerMutableSourceForHydration = registerMutableSourceForHydration_new

export const runWithPriority = runWithPriority_new

