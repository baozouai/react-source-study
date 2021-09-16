/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber, SuspenseHydrationCallbacks} from './ReactInternalTypes';
import type {FiberRoot} from './ReactInternalTypes';
import type {RootTag} from './ReactRootTags';
import type {
  Instance,
  TextInstance,
  Container,
  PublicInstance,
} from './ReactFiberHostConfig';
import type {RendererInspectionConfig} from './ReactFiberHostConfig';
import {FundamentalComponent} from './ReactWorkTags';
import type {ReactNodeList} from 'shared/ReactTypes';
import type {Lane, LanePriority} from './ReactFiberLane';
import type {SuspenseState} from './ReactFiberSuspenseComponent.new';

import {
  findCurrentHostFiber,
  findCurrentHostFiberWithNoPortals,
} from './ReactFiberTreeReflection';
import {get as getInstance} from 'shared/ReactInstanceMap';
import {
  HostComponent,
  ClassComponent,
  HostRoot,
  SuspenseComponent,
} from './ReactWorkTags';

import invariant from 'shared/invariant';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import {getPublicInstance} from './ReactFiberHostConfig';
import {
  findCurrentUnmaskedContext,
  processChildContext,
  emptyContextObject,
  isContextProvider as isLegacyContextProvider,
} from './ReactFiberContext.new';
import {createFiberRoot} from './ReactFiberRoot.new';
import {injectInternals} from './ReactFiberDevToolsHook.new';
import {
  requestEventTime,
  requestUpdateLane,
  scheduleUpdateOnFiber,
  flushRoot,
  batchedEventUpdates,
  batchedUpdates,
  unbatchedUpdates,
  flushSync,
  flushControlled,
  deferredUpdates,
  discreteUpdates,
  flushDiscreteUpdates,
  flushPassiveEffects,
  IsThisRendererActing,
  act,
} from './ReactFiberWorkLoop.new';
import {createUpdate, enqueueUpdate} from './ReactUpdateQueue.new';

import {
  SyncLane,
  InputDiscreteHydrationLane,
  SelectiveHydrationLane,
  getHighestPriorityPendingLanes,
  higherPriorityLane,
  getCurrentUpdateLanePriority,
  setCurrentUpdateLanePriority,
} from './ReactFiberLane';
import { enableLog } from 'shared/ReactFeatureFlags';

export {registerMutableSourceForHydration} from './ReactMutableSource.new';
export {createPortal} from './ReactPortal';
export {
  createComponentSelector,
  createHasPsuedoClassSelector,
  createRoleSelector,
  createTestNameSelector,
  createTextSelector,
  getFindAllNodesFailureDescription,
  findAllNodes,
  findBoundingRects,
  focusWithin,
  observeVisibleRects,
} from './ReactTestSelectors';

type OpaqueRoot = FiberRoot;

// 0 is PROD, 1 is DEV.
// Might add PROFILE later.
type BundleType = 0 | 1;

type DevToolsConfig = {
  bundleType: BundleType,
  version: string,
  rendererPackageName: string,
  // Note: this actually *does* depend on Fiber internal fields.
  // Used by "inspect clicked DOM element" in React DevTools.
  findFiberByHostInstance?: (instance: Instance | TextInstance) => Fiber | null,
  rendererConfig?: RendererInspectionConfig,
};




function getContextForSubtree(
  parentComponent: ?React$Component<any, any>,
): Object {
  if (!parentComponent) {
    return emptyContextObject;
  }

  const fiber = getInstance(parentComponent);
  const parentContext = findCurrentUnmaskedContext(fiber);

  if (fiber.tag === ClassComponent) {
    const Component = fiber.type;
    if (isLegacyContextProvider(Component)) {
      return processChildContext(fiber, Component, parentContext);
    }
  }

  return parentContext;
}

function findHostInstance(component: Object): PublicInstance | null {
  const fiber = getInstance(component);
  if (fiber === undefined) {
    if (typeof component.render === 'function') {
      invariant(false, 'Unable to find node on an unmounted component.');
    } else {
      invariant(
        false,
        'Argument appears to not be a ReactComponent. Keys: %s',
        Object.keys(component),
      );
    }
  }
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

function findHostInstanceWithWarning(
  component: Object,
  methodName: string,
): PublicInstance | null {

  return findHostInstance(component);
}

export function createContainer(
  containerInfo: Container,
  tag: RootTag,
  hydrate: boolean,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): OpaqueRoot {
  
  enableLog && console.log('createContainer start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('createContainer')) debugger

  return createFiberRoot(containerInfo, tag, hydrate, hydrationCallbacks);
}
/** 更新的起点 */ 
export function updateContainer(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): Lane {
 
  enableLog && console.log('updateContainer start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('updateContainer')) debugger

  const current = container.current;
  // 获取事件开始时间，一般是performance.now()
  const eventTime = requestEventTime();
  // 获取更新优先级
  const lane = requestUpdateLane(current);

  const context = getContextForSubtree(parentComponent);
  if (container.context === null) {
    container.context = context;
  } else {
    container.pendingContext = context;
  }

  // 创建更新任务
  const update = createUpdate(eventTime, lane);
  // Caution: React DevTools currently depends on this property
  // being called "element".
  // 对于container，其update的payload就是React.element
  update.payload = { element };
  // 对于ReactDom.createRoot(Concurrent模式)的render来说，callback为null
  // 对于ReactDom.render来说，callback为ReactDom.render的第三个参数
  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    update.callback = callback;
  }
  // 往updateQueue加入update
  enqueueUpdate(current, update);
  // 调度更新
  scheduleUpdateOnFiber(current, lane, eventTime);

  return lane;
}

export {
  batchedEventUpdates,
  batchedUpdates,
  unbatchedUpdates,
  deferredUpdates,
  discreteUpdates,
  flushDiscreteUpdates,
  flushControlled,
  flushSync,
  flushPassiveEffects,
  IsThisRendererActing,
  act,
};

export function getPublicRootInstance(
  container: OpaqueRoot,
): React$Component<any, any> | PublicInstance | null {
  const containerFiber = container.current;
  if (!containerFiber.child) {
    return null;
  }
  switch (containerFiber.child.tag) {
    case HostComponent:
      return getPublicInstance(containerFiber.child.stateNode);
    default:
      return containerFiber.child.stateNode;
  }
}

export function attemptSynchronousHydration(fiber: Fiber): void {
  switch (fiber.tag) {
    case HostRoot:
      const root: FiberRoot = fiber.stateNode;
      if (root.hydrate) {
        // Flush the first scheduled "update".
        const lanes = getHighestPriorityPendingLanes(root);
        flushRoot(root, lanes);
      }
      break;
    case SuspenseComponent:
      const eventTime = requestEventTime();
      flushSync(() => scheduleUpdateOnFiber(fiber, SyncLane, eventTime));
      // If we're still blocked after this, we need to increase
      // the priority of any promises resolving within this
      // boundary so that they next attempt also has higher pri.
      const retryLane = InputDiscreteHydrationLane;
      markRetryLaneIfNotHydrated(fiber, retryLane);
      break;
  }
}

function markRetryLaneImpl(fiber: Fiber, retryLane: Lane) {
  const suspenseState: null | SuspenseState = fiber.memoizedState;
  if (suspenseState !== null && suspenseState.dehydrated !== null) {
    suspenseState.retryLane = higherPriorityLane(
      suspenseState.retryLane,
      retryLane,
    );
  }
}

// Increases the priority of thennables when they resolve within this boundary.
function markRetryLaneIfNotHydrated(fiber: Fiber, retryLane: Lane) {
  markRetryLaneImpl(fiber, retryLane);
  const alternate = fiber.alternate;
  if (alternate) {
    markRetryLaneImpl(alternate, retryLane);
  }
}

export function attemptUserBlockingHydration(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }
  const eventTime = requestEventTime();
  const lane = InputDiscreteHydrationLane;
  scheduleUpdateOnFiber(fiber, lane, eventTime);
  markRetryLaneIfNotHydrated(fiber, lane);
}

export function attemptContinuousHydration(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }
  const eventTime = requestEventTime();
  const lane = SelectiveHydrationLane;
  scheduleUpdateOnFiber(fiber, lane, eventTime);
  markRetryLaneIfNotHydrated(fiber, lane);
}

export function attemptHydrationAtCurrentPriority(fiber: Fiber): void {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority other than synchronously flush it.
    return;
  }
  const eventTime = requestEventTime();
  const lane = requestUpdateLane(fiber);
  scheduleUpdateOnFiber(fiber, lane, eventTime);
  markRetryLaneIfNotHydrated(fiber, lane);
}

export function runWithPriority<T>(priority: LanePriority, fn: () => T) {
  const previousPriority = getCurrentUpdateLanePriority();
  try {
    setCurrentUpdateLanePriority(priority);
    return fn();
  } finally {
    setCurrentUpdateLanePriority(previousPriority);
  }
}

export {getCurrentUpdateLanePriority};

export {findHostInstance};

export {findHostInstanceWithWarning};

export function findHostInstanceWithNoPortals(
  fiber: Fiber,
): PublicInstance | null {
  const hostFiber = findCurrentHostFiberWithNoPortals(fiber);
  if (hostFiber === null) {
    return null;
  }
  if (hostFiber.tag === FundamentalComponent) {
    return hostFiber.stateNode.instance;
  }
  return hostFiber.stateNode;
}

let shouldSuspendImpl = fiber => false;

export function shouldSuspend(fiber: Fiber): boolean {
  return shouldSuspendImpl(fiber);
}

let overrideHookState = null;
let overrideHookStateDeletePath = null;
let overrideHookStateRenamePath = null;
let overrideProps = null;
let overridePropsDeletePath = null;
let overridePropsRenamePath = null;
let scheduleUpdate = null;
let setSuspenseHandler = null;


function findHostInstanceByFiber(fiber: Fiber): Instance | TextInstance | null {
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

function emptyFindFiberByHostInstance(
  instance: Instance | TextInstance,
): Fiber | null {
  return null;
}


export function injectIntoDevTools(devToolsConfig: DevToolsConfig): boolean {
  const {findFiberByHostInstance} = devToolsConfig;
  const {ReactCurrentDispatcher} = ReactSharedInternals;

  return injectInternals({
    bundleType: devToolsConfig.bundleType,
    version: devToolsConfig.version,
    rendererPackageName: devToolsConfig.rendererPackageName,
    rendererConfig: devToolsConfig.rendererConfig,
    overrideHookState,
    overrideHookStateDeletePath,
    overrideHookStateRenamePath,
    overrideProps,
    overridePropsDeletePath,
    overridePropsRenamePath,
    setSuspenseHandler,
    scheduleUpdate,
    currentDispatcherRef: ReactCurrentDispatcher,
    findHostInstanceByFiber,
    findFiberByHostInstance:
      findFiberByHostInstance || emptyFindFiberByHostInstance,
    // React Refresh
    findHostInstancesForRefresh: null,
    scheduleRefresh: null,
    scheduleRoot: null,
    setRefreshHandler: null,
    // Enables DevTools to append owner stacks to error messages in DEV mode.
    getCurrentFiber: null,
  });
}
