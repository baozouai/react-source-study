/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Thenable, Wakeable} from 'shared/ReactTypes';
import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane';
import type {ReactPriorityLevel} from './ReactInternalTypes';
import type {Interaction} from '../../scheduler/src/Tracing';
import type {SuspenseState} from './ReactFiberSuspenseComponent.new';
import type {StackCursor} from './ReactFiberStack.new';

import {
  enableSuspenseServerRenderer,
  enableProfilerTimer,
  enableSchedulerTracing,
  enableLog
} from 'shared/ReactFeatureFlags';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import invariant from 'shared/invariant';

import {
  scheduleCallback,
  cancelCallback,
  getCurrentPriorityLevel,
  runWithPriority,
  shouldYield,
  requestPaint,
  now,
  NoPriority as NoSchedulerPriority,
  ImmediatePriority as ImmediateSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  flushSyncCallbackQueue,
  scheduleSyncCallback,
} from './SchedulerWithReactIntegration.new';


// The scheduler is imported here *only* to detect whether it's been mocked
import * as Scheduler from '../../scheduler';

import {__interactionsRef, __subscriberRef} from 'scheduler/tracing';

import {
  prepareForCommit,
  resetAfterCommit,
  scheduleTimeout,
  cancelTimeout,
  noTimeout,
  beforeActiveInstanceBlur,
  afterActiveInstanceBlur,
  clearContainer,
} from './ReactFiberHostConfig';

import {
  createWorkInProgress,
} from './ReactFiber.new';
import {
  NoMode,
  ProfileMode,
  BlockingMode,
  ConcurrentMode,
} from './ReactTypeOfMode';
import {
  HostRoot,

  ClassComponent,
  SuspenseComponent,
  SuspenseListComponent,
} from './ReactWorkTags';
import {LegacyRoot} from './ReactRootTags';
import {
  NoFlags,
  Placement,
  Update,
  PlacementAndUpdate,
  Ref,
  ContentReset,
  Snapshot,
  Passive,
  PassiveStatic,
  Incomplete,
  HostEffectMask,
  Hydrating,
  HydratingAndUpdate,
  BeforeMutationMask,
  MutationMask,
  LayoutMask,
  PassiveMask,
} from './ReactFiberFlags';
import {
  NoLanePriority,
  SyncLanePriority,
  SyncBatchedLanePriority,
  InputDiscreteLanePriority,
  NoLanes,
  NoLane,
  SyncLane,

  NoTimestamp,
  findUpdateLane,
  findTransitionLane,
  findRetryLane,
  includesSomeLane,
  isSubsetOfLanes,
  mergeLanes,
  removeLanes,
  hasDiscreteLanes,
  includesNonIdleWork,
  includesOnlyRetries,
  includesOnlyTransitions,
  getNextLanes,
  returnNextLanesPriority,
  markStarvedLanesAsExpired,
  getLanesToRetrySynchronouslyOnError,
  getMostRecentEventTime,
  markRootUpdated,
  markRootSuspended as markRootSuspended_dontCallThisOneDirectly,
  markRootPinged,
  markRootExpired,
  markDiscreteUpdatesExpired,
  markRootFinished,
  schedulerPriorityToLanePriority,
  lanePriorityToSchedulerPriority,
} from './ReactFiberLane';
import {requestCurrentTransition, NoTransition} from './ReactFiberTransition';
import {beginWork } from './ReactFiberBeginWork.new';
import {completeWork} from './ReactFiberCompleteWork.new';
import {unwindWork, unwindInterruptedWork} from './ReactFiberUnwindWork.new';
import {
  throwException,
  createRootErrorUpdate,
  createClassErrorUpdate,
} from './ReactFiberThrow.new';
import {
  commitBeforeMutationLifeCycles as commitBeforeMutationEffectOnFiber,
  commitPlacement,
  commitWork,
  commitDeletion,
  commitPassiveUnmount as commitPassiveUnmountOnFiber,
  commitPassiveUnmountInsideDeletedTree as commitPassiveUnmountInsideDeletedTreeOnFiber,
  commitPassiveMount as commitPassiveMountOnFiber,
  commitDetachRef,
  commitAttachRef,
  commitResetTextContent,
  isSuspenseBoundaryBeingHidden,
  recursivelyCommitLayoutEffects,
} from './ReactFiberCommitWork.new';
import {enqueueUpdate} from './ReactUpdateQueue.new';
import {resetContextDependencies} from './ReactFiberNewContext.new';
import {
  resetHooksAfterThrow,
  ContextOnlyDispatcher,
} from './ReactFiberHooks.new';
import {createCapturedValue} from './ReactCapturedValue';
import {
  push as pushToStack,
  pop as popFromStack,
  createCursor,
} from './ReactFiberStack.new';

import {
  recordCommitTime,
  startProfilerTimer,
  stopProfilerTimerIfRunningAndRecordDelta,
} from './ReactProfilerTimer.new';

import {onCommitRoot as onCommitRootDevTools} from './ReactFiberDevToolsHook.new';

// Used by `act`
import enqueueTask from 'shared/enqueueTask';
import {doesFiberContain} from './ReactFiberTreeReflection';

const ceil = Math.ceil;

const {
  ReactCurrentDispatcher,
  ReactCurrentOwner,
  IsSomeRendererActing,
} = ReactSharedInternals;

type ExecutionContext = number;

export const NoContext = /*             */ 0b0000000;
const BatchedContext = /*               */ 0b0000001;
const EventContext = /*                 */ 0b0000010;
const DiscreteEventContext = /*         */ 0b0000100;
const LegacyUnbatchedContext = /*       */ 0b0001000;
const RenderContext = /*                */ 0b0010000;
const CommitContext = /*                */ 0b0100000;
export const RetryAfterError = /*       */ 0b1000000;

type RootExitStatus = 0 | 1 | 2 | 3 | 4 | 5;
const RootIncomplete = 0;
const RootFatalErrored = 1;
const RootErrored = 2;
const RootSuspended = 3;
const RootSuspendedWithDelay = 4;
const RootCompleted = 5;

// Describes where we are in the React execution stack
let executionContext: ExecutionContext = NoContext;
// The root we're working on
let workInProgressRoot: FiberRoot | null = null;
// The fiber we're working on
let workInProgress: Fiber | null = null;
// The lanes we're rendering
let workInProgressRootRenderLanes: Lanes = NoLanes;

// Stack that allows components to change the render lanes for its subtree
// This is a superset of the lanes we started working on at the root. The only
// case where it's different from `workInProgressRootRenderLanes` is when we
// enter a subtree that is hidden and needs to be unhidden: Suspense and
// Offscreen component.
//
// Most things in the work loop should deal with workInProgressRootRenderLanes.
// Most things in begin/complete phases should deal with subtreeRenderLanes.
export let subtreeRenderLanes: Lanes = NoLanes;
const subtreeRenderLanesCursor: StackCursor<Lanes> = createCursor(NoLanes);

// Whether to root completed, errored, suspended, etc.
let workInProgressRootExitStatus: RootExitStatus = RootIncomplete;
// A fatal error, if one is thrown
let workInProgressRootFatalError: mixed = null;
// "Included" lanes refer to lanes that were worked on during this render. It's
// slightly different than `renderLanes` because `renderLanes` can change as you
// enter and exit an Offscreen tree. This value is the combination of all render
// lanes for the entire render phase.
let workInProgressRootIncludedLanes: Lanes = NoLanes;
// The work left over by components that were visited during this render. Only
// includes unprocessed updates, not work in bailed out children.
let workInProgressRootSkippedLanes: Lanes = NoLanes;
// Lanes that were updated (in an interleaved event) during this render.
let workInProgressRootUpdatedLanes: Lanes = NoLanes;
// Lanes that were pinged (in an interleaved event) during this render.
let workInProgressRootPingedLanes: Lanes = NoLanes;

let mostRecentlyUpdatedRoot: FiberRoot | null = null;

// The most recent time we committed a fallback. This lets us ensure a train
// model where we don't commit new loading states in too quick succession.
let globalMostRecentFallbackTime: number = 0;
const FALLBACK_THROTTLE_MS: number = 500;

// The absolute time for when we should start giving up on rendering
// more and prefer CPU suspense heuristics instead.
let workInProgressRootRenderTargetTime: number = Infinity;
// How long a render is supposed to take before we start following CPU
// suspense heuristics and opt out of rendering more content.
const RENDER_TIMEOUT_MS = 500;

// Used to avoid traversing the return path to find the nearest Profiler ancestor during commit.
let nearestProfilerOnStack: Fiber | null = null;

function resetRenderTimer() {
  workInProgressRootRenderTargetTime = now() + RENDER_TIMEOUT_MS;
}

export function getRenderTargetTime(): number {
  return workInProgressRootRenderTargetTime;
}

let hasUncaughtError = false;
let firstUncaughtError = null;
let legacyErrorBoundariesThatAlreadyFailed: Set<mixed> | null = null;

let rootDoesHavePassiveEffects: boolean = false;
let rootWithPendingPassiveEffects: FiberRoot | null = null;
let pendingPassiveEffectsRenderPriority: ReactPriorityLevel = NoSchedulerPriority;
let pendingPassiveEffectsLanes: Lanes = NoLanes;

let rootsWithPendingDiscreteUpdates: Set<FiberRoot> | null = null;

// Use these to prevent an infinite loop of nested updates
const NESTED_UPDATE_LIMIT = 50;
let nestedUpdateCount: number = 0;
let rootWithNestedUpdates: FiberRoot | null = null;

const NESTED_PASSIVE_UPDATE_LIMIT = 50;
let nestedPassiveUpdateCount: number = 0;

// Marks the need to reschedule pending interactions at these lanes
// during the commit phase. This enables them to be traced across components
// that spawn new work during render. E.g. hidden boundaries, suspended SSR
// hydration or SuspenseList.
// TODO: Can use a bitmask instead of an array
let spawnedWorkDuringRender: null | Array<Lane | Lanes> = null;

// If two updates are scheduled within the same event, we should treat their
// event times as simultaneous, even if the actual clock time has advanced
// between the first and second call.
let currentEventTime: number = NoTimestamp;
let currentEventWipLanes: Lanes = NoLanes;
let currentEventPendingLanes: Lanes = NoLanes;

// Dev only flag that tracks if passive effects are currently being flushed.
// We warn about state updates for unmounted components differently in this case.
let isFlushingPassiveEffects = false;

let focusedInstanceHandle: null | Fiber = null;
let shouldFireAfterActiveInstanceBlur: boolean = false;

export function getWorkInProgressRoot(): FiberRoot | null {
  return workInProgressRoot;
}

export function requestEventTime() {
  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    // We're inside React, so it's fine to read the actual time.
    return now();
  }
  // We're not inside React, so we may be in the middle of a browser event.
  if (currentEventTime !== NoTimestamp) {
    // Use the same start time for all updates until we enter React again.
    return currentEventTime;
  }
  // This is the first update since React yielded. Compute a new start time.
  currentEventTime = now();
  return currentEventTime;
}

export function getCurrentTime() {
  return now();
}

export function requestUpdateLane(fiber: Fiber): Lane {
  // Special cases
  const mode = fiber.mode;
  if ((mode & BlockingMode) === NoMode) {
    return (SyncLane: Lane);
  } else if ((mode & ConcurrentMode) === NoMode) {
    return getCurrentPriorityLevel() === ImmediateSchedulerPriority
      ? (SyncLane: Lane)
      : (SyncBatchedLane: Lane);
  }

  // The algorithm for assigning an update to a lane should be stable for all
  // updates at the same priority within the same event. To do this, the inputs
  // to the algorithm must be the same. For example, we use the `renderLanes`
  // to avoid choosing a lane that is already in the middle of rendering.
  //
  // However, the "included" lanes could be mutated in between updates in the
  // same event, like if you perform an update inside `flushSync`. Or any other
  // code path that might call `prepareFreshStack`.
  //
  // The trick we use is to cache the first of each of these inputs within an
  // event. Then reset the cached values once we can be sure the event is over.
  // Our heuristic for that is whenever we enter a concurrent work loop.
  //
  // We'll do the same for `currentEventPendingLanes` below.
  if (currentEventWipLanes === NoLanes) {
    currentEventWipLanes = workInProgressRootIncludedLanes;
  }

  const isTransition = requestCurrentTransition() !== NoTransition;
  if (isTransition) {
    if (currentEventPendingLanes !== NoLanes) {
      currentEventPendingLanes =
        mostRecentlyUpdatedRoot !== null
          ? mostRecentlyUpdatedRoot.pendingLanes
          : NoLanes;
    }
    return findTransitionLane(currentEventWipLanes, currentEventPendingLanes);
  }

  // TODO: Remove this dependency on the Scheduler priority.
  // To do that, we're replacing it with an update lane priority.
  const schedulerPriority = getCurrentPriorityLevel();

  // The old behavior was using the priority level of the Scheduler.
  // This couples React to the Scheduler internals, so we're replacing it
  // with the currentUpdateLanePriority above. As an example of how this
  // could be problematic, if we're not inside `Scheduler.runWithPriority`,
  // then we'll get the priority of the current running Scheduler task,
  // which is probably not what we want.
  let lane;
  if (
    // TODO: Temporary. We're removing the concept of discrete updates.
    (executionContext & DiscreteEventContext) !== NoContext &&
    schedulerPriority === UserBlockingSchedulerPriority
  ) {
    lane = findUpdateLane(InputDiscreteLanePriority, currentEventWipLanes);
  } else {
    const schedulerLanePriority = schedulerPriorityToLanePriority(
      schedulerPriority,
    );


    lane = findUpdateLane(schedulerLanePriority, currentEventWipLanes);
  }

  return lane;
}

function requestRetryLane(fiber: Fiber) {
  // This is a fork of `requestUpdateLane` designed specifically for Suspense
  // "retries" — a special update that attempts to flip a Suspense boundary
  // from its placeholder state to its primary/resolved state.

  // Special cases
  const mode = fiber.mode;
  if ((mode & BlockingMode) === NoMode) {
    return (SyncLane: Lane);
  } else if ((mode & ConcurrentMode) === NoMode) {
    return getCurrentPriorityLevel() === ImmediateSchedulerPriority
      ? (SyncLane: Lane)
      : (SyncBatchedLane: Lane);
  }

  // See `requestUpdateLane` for explanation of `currentEventWipLanes`
  if (currentEventWipLanes === NoLanes) {
    currentEventWipLanes = workInProgressRootIncludedLanes;
  }
  return findRetryLane(currentEventWipLanes);
}
/** React的更新入口 */ 
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  lane: Lane,
  eventTime: number,
) {
  
  enableLog && console.log('scheduleUpdateOnFiber start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('scheduleUpdateOnFiber')) debugger

  // 第一步，检查是否有无限更新, 例如在render函数中调用了setState
  checkForNestedUpdates();
  // 第二步，向上收集fiber.childLanes
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);
  if (root === null) {
    return null;
  }
  // 第三步，在root上标记更新，将update的lane放到root.pendingLanes
  // Mark that the root has a pending update.
  markRootUpdated(root, lane, eventTime);

  if (root === workInProgressRoot) {
    // workInProgressRoo存在，意味着是当前根节点触发的更新
    // Received an update to a tree that's in the middle of rendering. Mark
    // that there was an interleaved update work on this root. Unless the
    // `deferRenderPhaseUpdateToNextBatch` flag is off and this is a render
    // phase update. In that case, we don't treat render phase updates as if
    // they were interleaved, for backwards compat reasons.
    if (
      (executionContext & RenderContext) === NoContext
    ) {
      workInProgressRootUpdatedLanes = mergeLanes(
        workInProgressRootUpdatedLanes,
        lane,
      );
    }
    if (workInProgressRootExitStatus === RootSuspendedWithDelay) {
      // The root already suspended with a delay, which means this render
      // definitely won't finish. Since we have a new update, let's mark it as
      // suspended now, right before marking the incoming update. This has the
      // effect of interrupting the current render and switching to the update.
      // TODO: Make sure this doesn't override pings that happen while we've
      // already started rendering.
      markRootSuspended(root, workInProgressRootRenderLanes);
    }
  }

  // TODO: requestUpdateLanePriority also reads the priority. Pass the
  // priority as an argument to that function and this one.
  // 根据Scheduler的优先级获取到对应的React优先级
  const priorityLevel = getCurrentPriorityLevel();

  if (lane === SyncLane) { // 0b0000000000000000000000000000001
    // 根据Scheduler的优先级获取到对应的React优先级
    if (
      // Check if we're inside unbatchedUpdates
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // Check if we're not already rendering
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // 如果是本次更新是同步的(lane === SyncLane)，并且当前还未渲染，意味着主线程空闲，并没有React的
      // 更新任务在执行，那么调用performSyncWorkOnRoot开始执行同步任务
      // Register pending interactions on the root to avoid losing traced interaction data.
      schedulePendingInteractions(root, lane);

      // This is a legacy edge case. The initial mount of a ReactDOM.render-ed
      // root inside of batchedUpdates should be synchronous, but layout updates
      // should be deferred until the end of the batch.
      performSyncWorkOnRoot(root);
    } else {
      // 如果当前有React更新任务正在进行，而且因为无法打断，所以调用ensureRootIsScheduled,
      // 目的是去复用已经在更新的任务，让这个已有的任务把这次更新顺便做了
      ensureRootIsScheduled(root, eventTime);
      schedulePendingInteractions(root, lane);
      // 通过判断 executionContext 是否等于 NoContext 来确定当前更新流程是否在 React 事件流中
      // 如果不在(NoContext)，直接调用 flushSyncCallbackQueue 更新
      if (executionContext === NoContext) {
        // Flush the synchronous work now, unless we're already working or inside
        // a batch. This is intentionally inside scheduleUpdateOnFiber instead of
        // scheduleCallbackForFiber to preserve the ability to schedule a callback
        // without immediately flushing it. We only do this for user-initiated
        // updates, to preserve historical behavior of legacy mode.
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    } 
  } else {
    // 异步操作
    // Schedule a discrete update but only if it's not Sync.
    if (
      // 是否是用户事件触发的上下文
      (executionContext & DiscreteEventContext) !== NoContext && // DiscreteEventContext = 0b0000100;
      // Only updates at user-blocking priority or greater are considered
      // discrete, even inside a discrete event.
      // UserBlockingPriority = 98), ImmediatePriority = 99
      [UserBlockingSchedulerPriority, ImmediateSchedulerPriority].includes(priorityLevel) 
    ) {
      // This is the result of a discrete event. Track the lowest priority
      // discrete update per root so we can flush them early, if needed.
      if (rootsWithPendingDiscreteUpdates === null) {
        rootsWithPendingDiscreteUpdates = new Set([root]);
      } else {
        rootsWithPendingDiscreteUpdates.add(root);
      }
    }
    // Schedule other updates after in case the callback is sync.
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, lane);
  }

  // We use this when assigning a lane for a transition inside
  // `requestUpdateLane`. We assume it's the same as the root being updated,
  // since in the common case of a single root app it probably is. If it's not
  // the same root, then it's not a huge deal, we just might batch more stuff
  // together more than necessary.
  mostRecentlyUpdatedRoot = root;
}
// This is split into a separate function so we can mark a fiber with pending
// work without treating it as a typical update that originates from an event;
// e.g. retrying a Suspense boundary isn't an update, but it does schedule work
// on a fiber.
/** 从触发状态更新的fiber通过一直往上找return得到rootFiber，找的过程都会将lane收集到每个parent.childLanes上 */
function markUpdateLaneFromFiberToRoot(
  sourceFiber: Fiber,
  lane: Lane,
): FiberRoot | null {
  // Update the source fiber's lanes
  // 更新现有fiber上的lanes
  sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane);
  // 获取现有fiber的alternate，通过alternate是否为null，来区分是否是更新过程
  let alternate = sourceFiber.alternate;
  // alternate不为空，也要同步更新自身lanes
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }

  // Walk the parent path to the root and update the child expiration time.
  let node = sourceFiber;
  let parent = sourceFiber.return;
  // 从产生更新的fiber节点开始，向上收集childLanes
  // 到rootFiber，其parent为null，则会跳出while
  while (parent !== null) {
    parent.childLanes = mergeLanes(parent.childLanes, lane);
    alternate = parent.alternate;
    if (alternate !== null) {
      alternate.childLanes = mergeLanes(alternate.childLanes, lane);
    }
    node = parent;
    parent = parent.return;
  }
  if (node.tag === HostRoot) {
    // node为rootFiber的话，那么root为rootFiber.stateNode
    const root: FiberRoot = node.stateNode;
    return root;
  } else {
    return null;
  }
}

// Use this function to schedule a task for a root. There's only one task per
// root; if a task was already scheduled, we'll check to make sure the priority
// of the existing task is the same as the priority of the next level that the
// root has work on. This function is called on every update, and right before
// exiting a task.
/** 通知Scheduler根据更新的优先级，决定以同步还是异步的方式调度本次更新任务 */ 
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  
  enableLog && console.log('ensureRootIsScheduled start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('ensureRootIsScheduled')) debugger

  // 获取旧任务，对应task上的callback，代表当前根节点正在被调度的任务
  const existingCallbackNode = root.callbackNode;

  // 记录任务的过期时间，检查是否有过期任务，有则立即将它放到root.expiredLanes，
  // 便于接下来将这个任务以同步模式立即调度
  // Check if any lanes are being starved by other work. If so, mark them as
  // expired so we know to work on those next.
  markStarvedLanesAsExpired(root, currentTime);
  // 获取renderLanes，顺便计算return_highestLanePriority，也即是下面的newCallbackPriority
  // Determine the next lanes to work on, and their priority.
  const nextLanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  // This returns the priority level computed during the `getNextLanes` call.
  /**
   * returnNextLanesPriority()返回return_highestLanePriority，在上面的getNextLanes已经计算了
   */
  const newCallbackPriority = returnNextLanesPriority();

  if (nextLanes === NoLanes) {
    // 如果渲染优先级为空，则不需要调度
    // Special case: There's nothing to work on.
    if (existingCallbackNode !== null) {
      // 如果存在旧任务那么就取消掉
      // 即existingCallbackNode.callback = null
      cancelCallback(existingCallbackNode);
      // 然后root上相应置空
      root.callbackNode = null;
      root.callbackPriority = NoLanePriority;
    }
    return;
  }
  // 如果存在旧任务，那么看一下能否复用
  // Check if there's an existing task. We may be able to reuse it.
  if (existingCallbackNode !== null) {
    // 获取旧任务的优先级
    const existingCallbackPriority = root.callbackPriority;
    // 如果新旧任务的优先级相同，则无需调度
    if (existingCallbackPriority === newCallbackPriority) {
      // The priority hasn't changed. We can reuse the existing task. Exit.
      return;
    }
    // 代码执行到这里说明新任务的优先级高于旧任务的优先级，取消掉旧任务，实现高优先级任务插队
    // The priority changed. Cancel the existing callback. We'll schedule a new
    // one below.
    cancelCallback(existingCallbackNode);
  }
  // 调度一个新任务
  // Schedule a new callback.
  let newCallbackNode;
  if (newCallbackPriority === SyncLanePriority) {
    // Special case: Sync React callbacks are scheduled on a special
    // internal queue
    // 若新任务的优先级（newCallbackPriority）为同步优先级（SyncLanePriority），则同步调度
    // 传统的同步渲染和过期任务会走这里
    // 同步渲染模式
    newCallbackNode = scheduleSyncCallback(
      performSyncWorkOnRoot.bind(null, root),
    );
  } else if (newCallbackPriority === SyncBatchedLanePriority) {
    // 同步模式到concurrent模式的过渡模式：blocking模式会走这里
    newCallbackNode = scheduleCallback(
      ImmediateSchedulerPriority,
      performSyncWorkOnRoot.bind(null, root),
    );
  } else {
    // 否则就是concurrent模式
    // 将本次更新任务的优先级转化为调度优先级
    // schedulerPriorityLevel为调度优先级
    const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
      newCallbackPriority,
    );
    // concurrent模式
    newCallbackNode = scheduleCallback(
      schedulerPriorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );
  }
  // 更新root上的任务优先级和任务，以便下次发起调度时候可以获取到
  root.callbackPriority = newCallbackPriority;
  root.callbackNode = newCallbackNode;
}

// render阶段的起点
// This is the entry point for every concurrent task, i.e. anything that
// goes through Scheduler.
function performConcurrentWorkOnRoot(root) {

  enableLog && console.log('performConcurrentWorkOnRoot start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('performConcurrentWorkOnRoot')) debugger

  // Since we know we're in a React event, we can clear the current
  // event time. The next update will compute a new event time.
  currentEventTime = NoTimestamp;
  currentEventWipLanes = NoLanes;
  currentEventPendingLanes = NoLanes;

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );

  // Flush any pending passive effects before deciding which lanes to work on,
  // in case they schedule additional work.
  // 这里的root.callbackNode是在ensureRootIsScheduled的最后赋值的
  const originalCallbackNode = root.callbackNode;
  // 1. 刷新pending状态的effects, 有可能某些effect会取消本次任务
  const didFlushPassiveEffects = flushPassiveEffects();
  // 如果清空了副作用
  if (didFlushPassiveEffects) {
    // Something in the passive effect phase may have canceled the current task.
    // Check if the task node for this root was changed.
    // 上面的flushPassiveEffects运行后又可能重新赋值了root.callbackNode，所以这里要判断root.callbackNode
    // 是否变化了
    if (root.callbackNode !== originalCallbackNode) {
      // 如果改变了，以为这有高优任务插队，才有可能root.callbackNode !== originalCallbackNode,
      // 则当前任务要取消掉，直接return掉
      // The current task was canceled. Exit. We don't need to call
      // `ensureRootIsScheduled` because the check above implies either that
      // there's a new task, or that there's no remaining work on this root.
      return null;
    }
  }

  // Determine the next expiration time to work on, using the fields stored
  // on the root.
  // 2. 获取本次渲染的优先级
  let lanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  if (lanes === NoLanes) {
    // Defensive coding. This is never expected to happen.
    return null;
  }
  // 去执行更新任务的工作循环，一旦超出时间片，则会退出renderRootConcurrent
  // 去执行下面的逻辑
  // 3. 构造fiber树
  let exitStatus = renderRootConcurrent(root, lanes);

  if (
    includesSomeLane(
      workInProgressRootIncludedLanes,
      workInProgressRootUpdatedLanes,
    )
  ) {
    // The render included lanes that were updated during the render phase.
    // For example, when unhiding a hidden tree, we include all the lanes
    // that were previously skipped when the tree was hidden. That set of
    // lanes is a superset of the lanes we started rendering with.
    //
    // So we'll throw out the current work and restart.
    // 如果在render过程中产生了新的update, 且新update的优先级与最初render的优先级有交集
    // 那么最初render无效, 丢弃最初render的结果, 等待下一次调度
    prepareFreshStack(root, NoLanes);
  } else if (exitStatus !== RootIncomplete) {
    // 4. 异常处理: 有可能fiber构造过程中出现异常
    if (exitStatus === RootErrored) {
      executionContext |= RetryAfterError;

      // If an error occurred during hydration,
      // discard server response and fall back to client side render.
      if (root.hydrate) {
        root.hydrate = false;
        clearContainer(root.containerInfo);
      }

      // If something threw an error, try rendering one more time. We'll render
      // synchronously to block concurrent data mutations, and we'll includes
      // all pending updates are included. If it still fails after the second
      // attempt, we'll give up and commit the resulting tree.
      lanes = getLanesToRetrySynchronouslyOnError(root);
      if (lanes !== NoLanes) {
        exitStatus = renderRootSync(root, lanes);
      }
    }

    if (exitStatus === RootFatalErrored) {
      const fatalError = workInProgressRootFatalError;
      prepareFreshStack(root, NoLanes);
      markRootSuspended(root, lanes);
      ensureRootIsScheduled(root, now());
      throw fatalError;
    }

    // We now have a consistent tree. The next step is either to commit it,
    // or, if something suspended, wait to commit it after a timeout.
    const finishedWork: Fiber = (root.current.alternate: any);
    root.finishedWork = finishedWork;
    root.finishedLanes = lanes;
    // 5. 输出: 渲染fiber树
    finishConcurrentRender(root, exitStatus, lanes);
  }
  // 调用ensureRootIsScheduled去检查有无过期任务，是否需要调度过期任务
  ensureRootIsScheduled(root, now());
  // 更新任务未完成，return自己，方便Scheduler判断任务完成状态
  if (root.callbackNode === originalCallbackNode) {
    // The task node scheduled for this root is the same one that's
    // currently executed. Need to return a continuation.
    return performConcurrentWorkOnRoot.bind(null, root);
  }
  enableLog && console.log('performConcurrentWorkOnRoot end')
  // 否则retutn null，表示任务已经完成，通知Scheduler停止调度
  return null;
}

function finishConcurrentRender(root, exitStatus, lanes) {
  switch (exitStatus) {
    case RootIncomplete:
    case RootFatalErrored: {
      invariant(false, 'Root did not complete. This is a bug in React.');
    }
    // Flow knows about invariant, so it complains if I add a break
    // statement, but eslint doesn't know about invariant, so it complains
    // if I do. eslint-disable-next-line no-fallthrough
    case RootErrored: {
      // We should have already attempted to retry this tree. If we reached
      // this point, it errored again. Commit it.
      commitRoot(root);
      break;
    }
    case RootSuspended: {
      markRootSuspended(root, lanes);

      // We have an acceptable loading state. We need to figure out if we
      // should immediately commit it or wait a bit.

      if (
        includesOnlyRetries(lanes)
      ) {
        // This render only included retries, no updates. Throttle committing
        // retries so that we don't show too many loading states too quickly.
        const msUntilTimeout =
          globalMostRecentFallbackTime + FALLBACK_THROTTLE_MS - now();
        // Don't bother with a very short suspense time.
        if (msUntilTimeout > 10) {
          const nextLanes = getNextLanes(root, NoLanes);
          if (nextLanes !== NoLanes) {
            // There's additional work on this root.
            break;
          }
          const suspendedLanes = root.suspendedLanes;
          if (!isSubsetOfLanes(suspendedLanes, lanes)) {
            // We should prefer to render the fallback of at the last
            // suspended level. Ping the last suspended level to try
            // rendering it again.
            // FIXME: What if the suspended lanes are Idle? Should not restart.
            const eventTime = requestEventTime();
            markRootPinged(root, suspendedLanes, eventTime);
            break;
          }

          // The render is suspended, it hasn't timed out, and there's no
          // lower priority work to do. Instead of committing the fallback
          // immediately, wait for more data to arrive.
          root.timeoutHandle = scheduleTimeout(
            commitRoot.bind(null, root),
            msUntilTimeout,
          );
          break;
        }
      }
      // The work expired. Commit immediately.
      commitRoot(root);
      break;
    }
    case RootSuspendedWithDelay: {
      markRootSuspended(root, lanes);

      if (includesOnlyTransitions(lanes)) {
        // This is a transition, so we should exit without committing a
        // placeholder and without scheduling a timeout. Delay indefinitely
        // until we receive more data.
        break;
      }


        // This is not a transition, but we did trigger an avoided state.
        // Schedule a placeholder to display after a short delay, using the Just
        // Noticeable Difference.
        // TODO: Is the JND optimization worth the added complexity? If this is
        // the only reason we track the event time, then probably not.
        // Consider removing.

      const mostRecentEventTime = getMostRecentEventTime(root, lanes);
      const eventTimeMs = mostRecentEventTime;
      const timeElapsedMs = now() - eventTimeMs;
      const msUntilTimeout = jnd(timeElapsedMs) - timeElapsedMs;

      // Don't bother with a very short suspense time.
      if (msUntilTimeout > 10) {
        // Instead of committing the fallback immediately, wait for more data
        // to arrive.
        root.timeoutHandle = scheduleTimeout(
          commitRoot.bind(null, root),
          msUntilTimeout,
        );
        break;
      }


      // Commit the placeholder.
      commitRoot(root);
      break;
    }
    case RootCompleted: {
      // The work completed. Ready to commit.
      commitRoot(root);
      break;
    }
    default: {
      invariant(false, 'Unknown root exit status.');
    }
  }
}

function markRootSuspended(root, suspendedLanes) {
  // When suspending, we should always exclude lanes that were pinged or (more
  // rarely, since we try to avoid it) updated during the render phase.
  // TODO: Lol maybe there's a better way to factor this besides this
  // obnoxiously named function :)
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootPingedLanes);
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootUpdatedLanes);
  markRootSuspended_dontCallThisOneDirectly(root, suspendedLanes);
}

// This is the entry point for synchronous tasks that don't go
// through Scheduler
function performSyncWorkOnRoot(root) {
  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );
  
  console.log('ReactFiberWorkLoop.new: performSyncWorkOnRoot')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('performSyncWorkOnRoot')) debugger
  flushPassiveEffects();

  let lanes;
  let exitStatus;
  if (
    root === workInProgressRoot &&
    includesSomeLane(root.expiredLanes, workInProgressRootRenderLanes)
  ) {
    // There's a partial tree, and at least one of its lanes has expired. Finish
    // rendering it before rendering the rest of the expired work.
    lanes = workInProgressRootRenderLanes;
    exitStatus = renderRootSync(root, lanes);
    if (
      includesSomeLane(
        workInProgressRootIncludedLanes,
        workInProgressRootUpdatedLanes,
      )
    ) {
      // The render included lanes that were updated during the render phase.
      // For example, when unhiding a hidden tree, we include all the lanes
      // that were previously skipped when the tree was hidden. That set of
      // lanes is a superset of the lanes we started rendering with.
      //
      // Note that this only happens when part of the tree is rendered
      // concurrently. If the whole tree is rendered synchronously, then there
      // are no interleaved events.
      lanes = getNextLanes(root, lanes);
      exitStatus = renderRootSync(root, lanes);
    }
  } else {
    lanes = getNextLanes(root, NoLanes);
    exitStatus = renderRootSync(root, lanes);
  }

  if (root.tag !== LegacyRoot && exitStatus === RootErrored) {
    executionContext |= RetryAfterError;

    // If an error occurred during hydration,
    // discard server response and fall back to client side render.
    if (root.hydrate) {
      root.hydrate = false;
      clearContainer(root.containerInfo);
    }

    // If something threw an error, try rendering one more time. We'll render
    // synchronously to block concurrent data mutations, and we'll includes
    // all pending updates are included. If it still fails after the second
    // attempt, we'll give up and commit the resulting tree.
    lanes = getLanesToRetrySynchronouslyOnError(root);
    if (lanes !== NoLanes) {
      exitStatus = renderRootSync(root, lanes);
    }
  }

  if (exitStatus === RootFatalErrored) {
    const fatalError = workInProgressRootFatalError;
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, lanes);
    ensureRootIsScheduled(root, now());
    throw fatalError;
  }

  // We now have a consistent tree. Because this is a sync render, we
  // will commit it even if something suspended.
  const finishedWork: Fiber = (root.current.alternate: any);
  root.finishedWork = finishedWork;
  root.finishedLanes = lanes;
  commitRoot(root);

  // Before exiting, make sure there's a callback scheduled for the next
  // pending level.
  ensureRootIsScheduled(root, now());

  return null;
}

export function flushRoot(root: FiberRoot, lanes: Lanes) {
  markRootExpired(root, lanes);
  ensureRootIsScheduled(root, now());
  if ((executionContext & (RenderContext | CommitContext)) === NoContext) {
    resetRenderTimer();
    flushSyncCallbackQueue();
  }
}

export function getExecutionContext(): ExecutionContext {
  return executionContext;
}

export function flushDiscreteUpdates() {
  // TODO: Should be able to flush inside batchedUpdates, but not inside `act`.
  // However, `act` uses `batchedUpdates`, so there's no way to distinguish
  // those two cases. Need to fix this before exposing flushDiscreteUpdates
  // as a public API.
  if (
    (executionContext & (BatchedContext | RenderContext | CommitContext)) !==
    NoContext
  ) {
    // We're already rendering, so we can't synchronously flush pending work.
    // This is probably a nested event dispatch triggered by a lifecycle/effect,
    // like `el.focus()`. Exit.
    return;
  }
  flushPendingDiscreteUpdates();
  // If the discrete updates scheduled passive effects, flush them now so that
  // they fire before the next serial event.
  flushPassiveEffects();
}

export function deferredUpdates<A>(fn: () => A): A {
  return runWithPriority(NormalSchedulerPriority, fn);
}

function flushPendingDiscreteUpdates() {
  if (rootsWithPendingDiscreteUpdates !== null) {
    // For each root with pending discrete updates, schedule a callback to
    // immediately flush them.
    const roots = rootsWithPendingDiscreteUpdates;
    rootsWithPendingDiscreteUpdates = null;
    roots.forEach(root => {
      markDiscreteUpdatesExpired(root);
      ensureRootIsScheduled(root, now());
    });
  }
  // Now flush the immediate queue.
  flushSyncCallbackQueue();
}

export function batchedUpdates<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      resetRenderTimer();
      flushSyncCallbackQueue();
    }
  }
}

export function batchedEventUpdates<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  // 所有的事件在触发的时候，都会先调用 batchedEventUpdates 这个方法
  // 在这里就会修改 executionContext 的值，React 就知道此时的 setState 在自己的掌控中
  executionContext |= EventContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    // 调用结束后，调用 flushSyncCallbackQueue
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      resetRenderTimer();
      flushSyncCallbackQueue();
    }
  }
}

export function discreteUpdates<A, B, C, D, R>(
  fn: (A, B, C) => R,
  a: A,
  b: B,
  c: C,
  d: D,
): R {
  const prevExecutionContext = executionContext;
  executionContext |= DiscreteEventContext;

    try {
      return runWithPriority(
        UserBlockingSchedulerPriority,
        fn.bind(null, a, b, c, d),
      );
    } finally {
      executionContext = prevExecutionContext;
      if (executionContext === NoContext) {
        // Flush the immediate callbacks that were scheduled during this batch
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    }

}

export function unbatchedUpdates<A, R>(fn: (a: A) => R, a: A): R {
  const prevExecutionContext = executionContext;
  executionContext &= ~BatchedContext;
  executionContext |= LegacyUnbatchedContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      resetRenderTimer();
      flushSyncCallbackQueue();
    }
  }
}

export function flushSync<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  if ((prevExecutionContext & (RenderContext | CommitContext)) !== NoContext) {
    return fn(a);
  }
  executionContext |= BatchedContext;


  try {
    if (fn) {
      return runWithPriority(ImmediateSchedulerPriority, fn.bind(null, a));
    } else {
      return (undefined: $FlowFixMe);
    }
  } finally {
    executionContext = prevExecutionContext;
    // Flush the immediate callbacks that were scheduled during this batch.
    // Note that this will happen even if batchedUpdates is higher up
    // the stack.
    flushSyncCallbackQueue();
  }

}

export function flushControlled(fn: () => mixed): void {
  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;

    try {
      runWithPriority(ImmediateSchedulerPriority, fn);
    } finally {
      executionContext = prevExecutionContext;
      if (executionContext === NoContext) {
        // Flush the immediate callbacks that were scheduled during this batch
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    }

}

export function pushRenderLanes(fiber: Fiber, lanes: Lanes) {
  pushToStack(subtreeRenderLanesCursor, subtreeRenderLanes, fiber);
  subtreeRenderLanes = mergeLanes(subtreeRenderLanes, lanes);
  workInProgressRootIncludedLanes = mergeLanes(
    workInProgressRootIncludedLanes,
    lanes,
  );
}

export function popRenderLanes(fiber: Fiber) {
  subtreeRenderLanes = subtreeRenderLanesCursor.current;
  popFromStack(subtreeRenderLanesCursor, fiber);
}

function prepareFreshStack(root: FiberRoot, lanes: Lanes) {
  // workInProgressRoot第一次在这里初始化
  enableLog && console.log('prepareFreshStack start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('prepareFreshStack')) debugger
  
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  const timeoutHandle = root.timeoutHandle;
  if (timeoutHandle !== noTimeout) { // noTimeout === -1
    // The root previous suspended and scheduled a timeout to commit a fallback
    // state. Now that we have additional work, cancel the timeout.
    root.timeoutHandle = noTimeout;
    // $FlowFixMe Complains noTimeout is not a TimeoutID, despite the check above
    cancelTimeout(timeoutHandle);
  }

  if (workInProgress !== null) {
    let interruptedWork = workInProgress.return;
    while (interruptedWork !== null) {
      unwindInterruptedWork(interruptedWork);
      interruptedWork = interruptedWork.return;
    }
  }
  workInProgressRoot = root;
  workInProgress = createWorkInProgress(root.current, null);
  workInProgressRootRenderLanes = subtreeRenderLanes = workInProgressRootIncludedLanes = lanes;
  workInProgressRootExitStatus = RootIncomplete;
  workInProgressRootFatalError = null;
  workInProgressRootSkippedLanes = NoLanes;
  workInProgressRootUpdatedLanes = NoLanes;
  workInProgressRootPingedLanes = NoLanes;

  if (enableSchedulerTracing) {
    spawnedWorkDuringRender = null;
  }
  enableLog && console.log('prepareFreshStack end')
}

function handleError(root, thrownValue): void {
  do {
    let erroredWork = workInProgress;
    try {
      // Reset module-level state that was set during the render phase.
      resetContextDependencies();
      resetHooksAfterThrow();
      // TODO: I found and added this missing line while investigating a
      // separate issue. Write a regression test using string refs.
      ReactCurrentOwner.current = null;

      if (erroredWork === null || erroredWork.return === null) {
        // Expected to be working on a non-root fiber. This is a fatal error
        // because there's no ancestor that can handle it; the root is
        // supposed to capture all errors that weren't caught by an error
        // boundary.
        workInProgressRootExitStatus = RootFatalErrored;
        workInProgressRootFatalError = thrownValue;
        // Set `workInProgress` to null. This represents advancing to the next
        // sibling, or the parent if there are no siblings. But since the root
        // has no siblings nor a parent, we set it to null. Usually this is
        // handled by `completeUnitOfWork` or `unwindWork`, but since we're
        // intentionally not calling those, we need set it here.
        // TODO: Consider calling `unwindWork` to pop the contexts.
        workInProgress = null;
        return;
      }

      if (enableProfilerTimer && erroredWork.mode & ProfileMode) {
        // Record the time spent rendering before an error was thrown. This
        // avoids inaccurate Profiler durations in the case of a
        // suspended render.
        stopProfilerTimerIfRunningAndRecordDelta(erroredWork, true);
      }

      throwException(
        root,
        erroredWork.return,
        erroredWork,
        thrownValue,
        workInProgressRootRenderLanes,
      );
      completeUnitOfWork(erroredWork);
    } catch (yetAnotherThrownValue) {
      // Something in the return path also threw.
      thrownValue = yetAnotherThrownValue;
      if (workInProgress === erroredWork && erroredWork !== null) {
        // If this boundary has already errored, then we had trouble processing
        // the error. Bubble it to the next boundary.
        erroredWork = erroredWork.return;
        workInProgress = erroredWork;
      } else {
        erroredWork = workInProgress;
      }
      continue;
    }
    // Return to the normal work loop.
    return;
  } while (true);
}


function pushDispatcher() {
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = ContextOnlyDispatcher;
  if (prevDispatcher === null) {
    // The React isomorphic package does not include a default dispatcher.
    // Instead the first renderer will lazily attach one, in order to give
    // nicer error messages.
    return ContextOnlyDispatcher;
  } else {
    return prevDispatcher;
  }
}

function popDispatcher(prevDispatcher) {
  ReactCurrentDispatcher.current = prevDispatcher;
}

function pushInteractions(root) {
  if (enableSchedulerTracing) {
    const prevInteractions: Set<Interaction> | null = __interactionsRef.current;
    __interactionsRef.current = root.memoizedInteractions;
    return prevInteractions;
  }
  return null;
}

function popInteractions(prevInteractions) {
  if (enableSchedulerTracing) {
    __interactionsRef.current = prevInteractions;
  }
}

export function markCommitTimeOfFallback() {
  globalMostRecentFallbackTime = now();
}

export function markSkippedUpdateLanes(lane: Lane | Lanes): void {
  workInProgressRootSkippedLanes = mergeLanes(
    lane,
    workInProgressRootSkippedLanes,
  );
}

export function renderDidSuspend(): void {
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootSuspended;
  }
}

export function renderDidSuspendDelayIfPossible(): void {
  if (
    workInProgressRootExitStatus === RootIncomplete ||
    workInProgressRootExitStatus === RootSuspended
  ) {
    workInProgressRootExitStatus = RootSuspendedWithDelay;
  }

  // Check if there are updates that we skipped tree that might have unblocked
  // this render.
  if (
    workInProgressRoot !== null &&
    (includesNonIdleWork(workInProgressRootSkippedLanes) ||
      includesNonIdleWork(workInProgressRootUpdatedLanes))
  ) {
    // Mark the current render as suspended so that we switch to working on
    // the updates that were skipped. Usually we only suspend at the end of
    // the render phase.
    // TODO: We should probably always mark the root as suspended immediately
    // (inside this function), since by suspending at the end of the render
    // phase introduces a potential mistake where we suspend lanes that were
    // pinged or updated while we were rendering.
    markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes);
  }
}

export function renderDidError() {
  if (workInProgressRootExitStatus !== RootCompleted) {
    workInProgressRootExitStatus = RootErrored;
  }
}

// Called during render to determine if anything has suspended.
// Returns false if we're not sure.
export function renderHasNotSuspendedYet(): boolean {
  // If something errored or completed, we can't really be sure,
  // so those are false.
  return workInProgressRootExitStatus === RootIncomplete;
}

function renderRootSync(root: FiberRoot, lanes: Lanes) {
  
  console.log('renderRootSync')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('renderRootSync')) debugger
  
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  const prevDispatcher = pushDispatcher();

  // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    prepareFreshStack(root, lanes);
    startWorkOnPendingInteractions(root, lanes);
  }

  const prevInteractions = pushInteractions(root);


  do {
    try {
      workLoopSync();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
  resetContextDependencies();
  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
  }

  executionContext = prevExecutionContext;
  popDispatcher(prevDispatcher);

  if (workInProgress !== null) {
    // This is a sync render, so we should have finished the whole tree.
    invariant(
      false,
      'Cannot commit an incomplete root. This error is likely caused by a ' +
        'bug in React. Please file an issue.',
    );
  }


  // Set this to null to indicate there's no in-progress render.
  workInProgressRoot = null;
  workInProgressRootRenderLanes = NoLanes;

  return workInProgressRootExitStatus;
}

// The work loop is an extremely hot path. Tell Closure not to inline it.
/** @noinline */
function workLoopSync() {
  
  console.log('workLoopSync')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('workLoopSync')) debugger

  // Already timed out, so perform work without checking if we need to yield.
  while (workInProgress !== null) {

    console.log('workLoopSync in while')
    if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('workLoopSync')) debugger

    performUnitOfWork(workInProgress);
  }
}

function renderRootConcurrent(root: FiberRoot, lanes: Lanes) {
  
  enableLog && console.log('renderRootConcurrent start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('renderRootConcurrent')) debugger

  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  const prevDispatcher = pushDispatcher();

  // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.
  // root或者lane改变
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    resetRenderTimer();
    // prepareFreshStack里面会通过workInProgress = createWorkInProgress(root.current, null)创建workInProgress
    prepareFreshStack(root, lanes);
    startWorkOnPendingInteractions(root, lanes);
  }

  const prevInteractions = pushInteractions(root);



  do {
    try {
      // workLoopConcurrent中判断超出时间片了，
      // 那workLoopConcurrent就会从调用栈弹出，
      // 走到下面的break，终止循环

      workLoopConcurrent();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
  // 走到这里就说明是被时间片打断任务了，或者fiber树直接构建完了
  // 依据情况return不同的status
  resetContextDependencies();
  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
  }

  popDispatcher(prevDispatcher);
  executionContext = prevExecutionContext;

  // Check if the tree has completed.
  if (workInProgress !== null) {
    // workInProgress 不为null，说明是被时间片打断的
    // return RootIncomplete说明还没完成任务
    // Still work remaining.
    enableLog && console.log('renderRootConcurrent end')
    return RootIncomplete;
  } else {
    // 否则说明任务完成了
    // return最终的status
    // Completed the tree.


    // Set this to null to indicate there's no in-progress render.
    workInProgressRoot = null;
    workInProgressRootRenderLanes = NoLanes;
    enableLog && console.log('renderRootConcurrent end')
    // Return the final exit status.
    return workInProgressRootExitStatus;
  }
}

/** @noinline */
function workLoopConcurrent() {

  enableLog && console.log('workLoopConcurrent start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('workLoopConcurrent')) debugger

  // 调用shouldYield判断如果超出时间片限制，那么结束循环
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
  enableLog && console.log('workLoopConcurrent end')
}

function performUnitOfWork(unitOfWork: Fiber): void {
  
  enableLog && console.log('performUnitOfWork start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('performUnitOfWork')) debugger

  // The current, flushed, state of this fiber is the alternate. Ideally
  // nothing should rely on this, but relying on it here means that we don't
  // need an additional field on the work in progress.
  const current = unitOfWork.alternate;

  let next;
  if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);
    /**
     * subtreeRenderLanes在prepareFreshStack里面有赋值
     * workInProgressRootRenderLanes = subtreeRenderLanes = workInProgressRootIncludedLanes = lanes;
     */
    next = beginWork(current, unitOfWork, subtreeRenderLanes);
    stopProfilerTimerIfRunningAndRecordDelta(unitOfWork, true);
  } else {
    next = beginWork(current, unitOfWork, subtreeRenderLanes);
  }
  // 上面beginWork已经处理完pendingProps了，那么之后就会赋值给memorizedProps
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // 如果next为null，则意味着“递”过程结束，进入“归”过程：completeUnitOfWork
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
  enableLog && console.log('performUnitOfWork end')
}

function completeUnitOfWork(unitOfWork: Fiber): void {
  // 已经结束beginWork阶段的fiber节点被称为completedWork
  // Attempt to complete the current unit of work, then move to the next
  // sibling. If there are no more siblings, return to the parent fiber.
  let completedWork = unitOfWork;
  
  enableLog && console.log('completeUnitOfWork start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('completeUnitOfWork')) debugger

  do {
    // 向上一直循环到root的过程
    // The current, flushed, state of this fiber is the alternate. Ideally
    // nothing should rely on this, but relying on it here means that we don't
    // need an additional field on the work in progress.
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;
    // Check if the work completed or if something threw.
    // 如果completedWork出错，会打上Incomplete，则走else
    if ((completedWork.flags & Incomplete) === NoFlags) {
      // 正常完成了工作
      let next;
      if (
        !enableProfilerTimer || // enableProfilerTimer = __PROFILE__，默认为true
        (completedWork.mode & ProfileMode) === NoMode
      ) {
        next = completeWork(current, completedWork, subtreeRenderLanes);
      } else {
        startProfilerTimer(completedWork);
        next = completeWork(current, completedWork, subtreeRenderLanes);
        // Update render duration assuming we didn't error.
        stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);
      }

      if (next !== null) {
        // Completing this fiber spawned new work. Work on that next.
        workInProgress = next;
        return;
      }
    } else {
      // 进行错误处理
      // This fiber did not complete because something threw. Pop values off
      // the stack without entering the complete phase. If this is a boundary,
      // capture values if possible.
      const next = unwindWork(completedWork, subtreeRenderLanes);

      // Because this fiber did not complete, don't reset its expiration time.

      if (next !== null) {
        // If completing this work spawned new work, do that next. We'll come
        // back here again.
        // Since we're restarting, remove anything that is not a host effect
        // from the effect tag.
        next.flags &= HostEffectMask;
        workInProgress = next;
        return;
      }

      if (
        enableProfilerTimer &&
        (completedWork.mode & ProfileMode) !== NoMode
      ) {
        // Record the render duration for the fiber that errored.
        stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);

        // Include the time spent working on failed children before continuing.
        let actualDuration = completedWork.actualDuration;
        let child = completedWork.child;
        while (child !== null) {
          actualDuration += child.actualDuration;
          child = child.sibling;
        }
        completedWork.actualDuration = actualDuration;
      }

      if (returnFiber !== null) {
        /**
         * 给父fiber打上Incomplete，之后父fiber也会走unwindWork
         * 直到找到错误边界的父fiber，上面的next !== null，将workInProgress指向该错误边界，然后return掉
         * 错误边界的父fiber重新走beginWork处理updateQueue，改错误边界为增加了一个update，update的payload有getDerivedStateFromError
         * 故渲染出备用的ui
         * render() {
         *  if (this.state.hasError) {
         *  return <h1>Something went wrong.</h1>;
         *  }
         *  return this.props.children;
         * }
         */
        // Mark the parent fiber as incomplete
        returnFiber.flags |= Incomplete;
        returnFiber.subtreeFlags = NoFlags;
        returnFiber.deletions = null;
      }
    }
    // 上面completedWork的child处理完了，开始处理completedWork的sibling
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // If there is more work to do in this returnFiber, do that next.
      workInProgress = siblingFiber;
      return;
    }
    // Otherwise, return to the parent
    // child和sibling都处理完，就回溯到returnFiber
    completedWork = returnFiber;
    // Update the next thing we're working on in case something throws.
    // workInProgress则指向returnFiber
    workInProgress = completedWork;
  } while (completedWork !== null);

  // We've reached the root.
  // 已经到达根节点
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootCompleted;
  }
  enableLog && console.log('completeUnitOfWork end')
}
/** commit阶段的起点 */  
function commitRoot(root) {
  
  enableLog && console.log('commitRoot start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitRoot')) debugger
  
  const renderPriorityLevel = getCurrentPriorityLevel();
  // commit阶段是同步执行的，优先级最高
  runWithPriority(
    ImmediateSchedulerPriority,
    commitRootImpl.bind(null, root, renderPriorityLevel),
  );
  enableLog && console.log('commitRoot end')
  return null;
}

function commitRootImpl(root, renderPriorityLevel) {
  // 由于useEffect是异步调度的，有可能上一次更新调度的useEffect还未被真正执行，
  // 所以在本次更新开始前，需要先将之前的useEffect都执行掉，以保证本次更新调度的
  // useEffect都是本次更新产生的

  enableLog && console.log('commitRootImpl start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitRootImpl')) debugger

  do {
    // `flushPassiveEffects` will call `flushSyncUpdateQueue` at the end, which
    // means `flushPassiveEffects` will sometimes result in additional
    // passive effects. So we need to keep flushing in a loop until there are
    // no more pending effects.
    // TODO: Might be better if `flushPassiveEffects` did not automatically
    // flush synchronous work at the end, to avoid factoring hazards like this.
     // 触发useEffect回调与其他同步任务。
    //  由于这些任务可能触发新的渲染，所以这里要一直遍历执行直到没有任务
    flushPassiveEffects();
  } while (rootWithPendingPassiveEffects !== null);

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );
  // root指 fiberRootNode
  // root.finishedWork指当前应用的rootFiber
  const finishedWork = root.finishedWork;
  const lanes = root.finishedLanes;
  
  if (finishedWork === null) {

    return null;
  }
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  invariant(
    finishedWork !== root.current,
    'Cannot commit the same tree as before. This error is likely caused by ' +
      'a bug in React. Please file an issue.',
  );

  // commitRoot never returns a continuation; it always finishes synchronously.
  // So we can clear these now to allow a new callback to be scheduled.
  // 重置Scheduler绑定的回调函数
  root.callbackNode = null;

  // Update the first and last pending times on this root. The new first
  // pending time is whatever is left on the root fiber.
  // 将收集到的childLanes，连同root自己的lanes，一并赋值给remainingLanes
  let remainingLanes = mergeLanes(finishedWork.lanes, finishedWork.childLanes);
  /**
   * 将root.pendingLanes去掉remaingLanes(叫做noLongerPendingLanes），
   * 即noLongerPendingLanes = root.pendingLanes & ~remainingLanes，
   * 之后root.pendingLanes = remainingLanes
   * 将noLongerPendingLanes对应eventTimes、expirationTimes中的index位的值置为NoTimestamp
   */
  markRootFinished(root, remainingLanes);

  // Clear already finished discrete updates in case that a later call of
  // `flushDiscreteUpdates` starts a useless render pass which may cancels
  // a scheduled timeout.
  // 清除已经完成的离散更新，如click更新
  if (rootsWithPendingDiscreteUpdates !== null) {
    if (
      !hasDiscreteLanes(remainingLanes) &&
      rootsWithPendingDiscreteUpdates.has(root)
    ) {
      // 如果不是离散更新且之前rootsWithPendingDiscreteUpdates里有root
      // 则去掉root
      rootsWithPendingDiscreteUpdates.delete(root);
    }
  }

  if (root === workInProgressRoot) {
    // We can reset these now that they are finished.
    // 已经完成，则重置
    workInProgressRoot = null;
    workInProgress = null;
    workInProgressRootRenderLanes = NoLanes;
  } else {
    // This indicates that the last root we worked on is not the same one that
    // we're committing now. This most commonly happens when a suspended root
    // times out.
  }

  // Check if there are any effects in the whole tree.
  // TODO: This is left over from the effect list implementation, where we had
  // to check for the existence of `firstEffect` to satsify Flow. I think the
  // only other reason this optimization exists is because it affects profiling.
  // Reconsider whether this is necessary.
  // 子树是否有副作用
  const subtreeHasEffects =
    (finishedWork.subtreeFlags &
      (BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !==
    NoFlags;
  // root是否有副作用
  const rootHasEffect =
    (finishedWork.flags &
      (BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !==
    NoFlags;
  // 子树或根节点有副作用
  if (subtreeHasEffects || rootHasEffect) {
    let previousLanePriority;
    // 将当前上下文标记为CommitContext，作为commit阶段的标志
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext;
    // 获取上次__interactionsRef.current（Set集合）
    const prevInteractions = pushInteractions(root);

    // Reset this to null before calling lifecycles
    // 调用生命周期前重置
    ReactCurrentOwner.current = null;
    // commit分为几个阶段
    // The commit phase is broken into several sub-phases. We do a separate pass
    // of the effect list for each phase: all mutation effects come before all
    // layout effects, and so on.
    /**
     * 第一阶段为：before mutation，（执行DOM操作前），before mutation直接翻译是变化前，即dom变化前
     * 会获取根节点上的state,调用getSnapshotBeforeUpdate
     */
    // The first phase a "before mutation" phase. We use this phase to read the
    // state of the host tree right before we mutate it. This is where
    // getSnapshotBeforeUpdate is called.
    focusedInstanceHandle = prepareForCommit(root.containerInfo);
    shouldFireAfterActiveInstanceBlur = false;

    commitBeforeMutationEffects(finishedWork);

    // We no longer need to track the active instance fiber
    focusedInstanceHandle = null;

    if (enableProfilerTimer) {
      // 记录当前commit的时间
      // Mark the current commit time to be shared by all Profilers in this
      // batch. This enables them to be grouped later.
      recordCommitTime();
    }
    /**
     * 第二阶段：mutation阶段（执行DOM操作），mutation直接翻译是裂变，即页面发生改变
     */
    // The next phase is the mutation phase, where we mutate the host tree.
    commitMutationEffects(finishedWork, root, renderPriorityLevel);

    if (shouldFireAfterActiveInstanceBlur) {
      afterActiveInstanceBlur();
    }
    // commit后重置一些状态
    resetAfterCommit(root.containerInfo);

    // The work-in-progress tree is now the current tree. This must come after
    // the mutation phase, so that the previous tree is still current during
    // componentWillUnmount, but before the layout phase, so that the finished
    // work is current during componentDidMount/Update.
    // 到这步workInProgress tree变为current tree
    // 1.这一步必须在mutation阶段后，为了在组件在调用componentWillUnmount时current树依然存在
    // 2.这一步又必须在layout节点之前，因为componentDidMount/Update要获取的是当前finishedWork的状态
    root.current = finishedWork;
    // 第三阶段：layout阶段，也是最后阶段
    // The next phase is the layout phase, where we call effects that read
    // the host tree after it's been mutated. The idiomatic use case for this is
    // layout, but class component lifecycles also fire here for legacy reasons.

    try {
      recursivelyCommitLayoutEffects(finishedWork, root);
    } catch (error) {
      captureCommitPhaseErrorOnRoot(finishedWork, finishedWork, error);
    }


    // If there are pending passive effects, schedule a callback to process them.
    // PassiveMask，包含了Deletion的effect，因此，此处调度useEffect是为了被卸载的组件去调度的
    // commit阶段涉及到useEffect的地方有三处：
    // commit阶段刚开始：这个时候主要是执行本次更新之前还未被触发的useEffect，相当于清理工作。因为要保证本次调度的useEffect都是本次更新产生的
    // commit阶段之内的beforeMutation阶段：这个时候为含有useEffect的组件调度useEffect
    // commit阶段之内的layout阶段：为卸载的组件调度useEffect，执行effect的destroy函数，清理effect
    // PassiveMask === 0b000000,0010,0000,1000;
    if (
      (finishedWork.subtreeFlags & PassiveMask) !== NoFlags ||
      (finishedWork.flags & PassiveMask) !== NoFlags
    ) {
      /**
       * commitBeforeMutationEffects中的commitBeforeMutationEffectsImpl调用了，
       * 会将rootDoesHavePassiveEffects设为true，那么这里就不用执行了，相当于一个开关。
       * 两个阶段只有一个异步调度flushPassiveEffects来处理useEffect
       */
      if (!rootDoesHavePassiveEffects) {
        rootDoesHavePassiveEffects = true;
        // layout阶段调度useEffect
        scheduleCallback(NormalSchedulerPriority, () => {
          flushPassiveEffects();
          return null;
        });
      }
    }

    // Tell Scheduler to yield at the end of the frame, so the browser has an
    // opportunity to paint.
    requestPaint();

    if (enableSchedulerTracing) { // enableSchedulerTracing = __PROFILE__
      popInteractions(((prevInteractions: any): Set<Interaction>));
    }
    executionContext = prevExecutionContext;

  } else {
    // No effects.
    // 没有effectList，直接将wprkInProgress树切换为current树
    root.current = finishedWork;
    // Measure these anyway so the flamegraph explicitly shows that there were
    // no effects.
    // TODO: Maybe there's a better way to report this.
    if (enableProfilerTimer) {
      recordCommitTime();
    }
  }

  const rootDidHavePassiveEffects = rootDoesHavePassiveEffects;

  if (rootDoesHavePassiveEffects) {
    // 为true说明有副作用，再次保存状态，但是不调度
    // This commit has passive effects. Stash a reference to them. But don't
    // schedule a callback until after flushing layout work.
    rootDoesHavePassiveEffects = false;
    rootWithPendingPassiveEffects = root;
    pendingPassiveEffectsLanes = lanes;
    pendingPassiveEffectsRenderPriority = renderPriorityLevel;
  }
  // 获取尚未处理的优先级，比如之前被跳过的任务的优先级
  // Read this again, since an effect might have updated it
  remainingLanes = root.pendingLanes;

  // Check if there's remaining work on this root
  if (remainingLanes !== NoLanes) {
    if (enableSchedulerTracing) {
      if (spawnedWorkDuringRender !== null) {
        const expirationTimes = spawnedWorkDuringRender;
        spawnedWorkDuringRender = null;
        for (let i = 0; i < expirationTimes.length; i++) {
          scheduleInteractions(
            root,
            expirationTimes[i],
            root.memoizedInteractions,
          );
        }
      }
      schedulePendingInteractions(root, remainingLanes);
    }
  } else {
    // If there's no remaining work, we can clear the set of already failed
    // error boundaries.
    legacyErrorBoundariesThatAlreadyFailed = null;
  }

  if (enableSchedulerTracing) {
    if (!rootDidHavePassiveEffects) {
      // 如果没有副作用
      // If there are no passive effects, then we can complete the pending interactions.
      // Otherwise, we'll wait until after the passive effects are flushed.
      // Wait to do this until after remaining work has been scheduled,
      // so that we don't prematurely signal complete for interactions when there's e.g. hidden work.
      finishPendingInteractions(root, lanes);
    }
  }

  if (remainingLanes === SyncLane) {
    // 计算根节点同步re-render的次数，太多意味着是个死循环
    // Count the number of times the root synchronously re-renders without
    // finishing. If there are too many, it indicates an infinite update loop.
    if (root === rootWithNestedUpdates) {
      nestedUpdateCount++;
    } else {
      nestedUpdateCount = 0;
      rootWithNestedUpdates = root;
    }
  } else {
    nestedUpdateCount = 0;
  }

  onCommitRootDevTools(finishedWork.stateNode, renderPriorityLevel);
 /*
  * 每次commit阶段完成后，再执行一遍ensureRootIsScheduled，
  * 保证root上任何的pendingLanes都能被处理,即确保是否还有任务需要被调度。
  * 例如，高优先级插队的更新完成后，commit完成后，还会再执行一遍，保证之前跳过的低优先级任务
  * 重新调度
  * */
  // Always call this before exiting `commitRoot`, to ensure that any
  // additional work on this root is scheduled.
  ensureRootIsScheduled(root, now());

  if (hasUncaughtError) {
    hasUncaughtError = false;
    const error = firstUncaughtError;
    firstUncaughtError = null;
    throw error;
  }


  // If layout work was scheduled, flush it now.
  flushSyncCallbackQueue();

  enableLog && console.log('commitRootImpl end')
  return null;
}

function commitBeforeMutationEffects(firstChild: Fiber) {

  enableLog && console.log('commitBeforeMutationEffects start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitBeforeMutationEffects')) debugger

  let fiber = firstChild;
  while (fiber !== null) {
    if (fiber.deletions !== null) {
      commitBeforeMutationEffectsDeletions(fiber.deletions);
    }

    if (fiber.child !== null) {
      // BeforeMutationMask: 0b000000001100001010
      const primarySubtreeFlags = fiber.subtreeFlags & BeforeMutationMask;
      if (primarySubtreeFlags !== NoFlags) {
        commitBeforeMutationEffects(fiber.child);
      }
    }


    try {
      commitBeforeMutationEffectsImpl(fiber);
    } catch (error) {
      captureCommitPhaseError(fiber, fiber.return, error);
    }

    fiber = fiber.sibling;
  }
  enableLog && console.log('commitBeforeMutationEffects end')
}

function commitBeforeMutationEffectsImpl(fiber: Fiber) {

  enableLog && console.log('commitBeforeMutationEffectsImpl start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitBeforeMutationEffectsImpl')) debugger

  const current = fiber.alternate;
  const flags = fiber.flags;

  if (!shouldFireAfterActiveInstanceBlur && focusedInstanceHandle !== null) {
    // Check to see if the focused element was inside of a hidden (Suspense) subtree.
    // TODO: Move this out of the hot path using a dedicated effect tag.
    if (
      fiber.tag === SuspenseComponent &&
      isSuspenseBoundaryBeingHidden(current, fiber) &&
      doesFiberContain(fiber, focusedInstanceHandle)
    ) {
      shouldFireAfterActiveInstanceBlur = true;
      beforeActiveInstanceBlur();
    }
  }
  // Snapshot = 0b000000000,100000000;
  if ((flags & Snapshot) !== NoFlags) {
    // 通过commitBeforeMutationEffectOnFiber调用getSnapshotBeforeUpdate
    commitBeforeMutationEffectOnFiber(current, fiber);
  }
  // Passive = 0b000000001,000000000;
  if ((flags & Passive) !== NoFlags) {
    // If there are passive effects, schedule a callback to flush at
    // the earliest opportunity.
    // before mutation 调度useEffects
    if (!rootDoesHavePassiveEffects) {
      rootDoesHavePassiveEffects = true;
      scheduleCallback(NormalSchedulerPriority, () => {
        flushPassiveEffects();
        return null;
      });
    }
  }
  enableLog && console.log('commitBeforeMutationEffectsImpl end')
}

function commitBeforeMutationEffectsDeletions(deletions: Array<Fiber>) {
  for (let i = 0; i < deletions.length; i++) {
    const fiber = deletions[i];

    // TODO (effects) It would be nice to avoid calling doesFiberContain()
    // Maybe we can repurpose one of the subtreeFlags positions for this instead?
    // Use it to store which part of the tree the focused instance is in?
    // This assumes we can safely determine that instance during the "render" phase.

    if (doesFiberContain(fiber, ((focusedInstanceHandle: any): Fiber))) {
      shouldFireAfterActiveInstanceBlur = true;
      beforeActiveInstanceBlur();
    }
  }
}

function commitMutationEffects(
  firstChild: Fiber,
  root: FiberRoot,
  renderPriorityLevel: ReactPriorityLevel,
) {

  enableLog && console.log('commitMutationEffects start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitMutationEffects')) debugger

  let fiber = firstChild;
  while (fiber !== null) {
    const deletions = fiber.deletions;
    if (deletions !== null) {
      // 该Fiber节点对应的DOM节点需要从页面中删除
      commitMutationEffectsDeletions(
        deletions,
        fiber,
        root,
        renderPriorityLevel,
      );
    }
    // 如果删除之后的fiber还有子节点，
    // 递归调用commitMutationEffects来处理
    if (fiber.child !== null) {
      const mutationFlags = fiber.subtreeFlags & MutationMask;
      if (mutationFlags !== NoFlags) {
        commitMutationEffects(fiber.child, root, renderPriorityLevel);
      }
    }


    try {
      commitMutationEffectsImpl(fiber, root, renderPriorityLevel);
    } catch (error) {
      captureCommitPhaseError(fiber, fiber.return, error);
    }

    fiber = fiber.sibling;
  }
  enableLog && console.log('commitMutationEffects end')
}

function commitMutationEffectsImpl(
  fiber: Fiber,
  root: FiberRoot,
  renderPriorityLevel,
) {
  enableLog && console.log('commitMutationEffectsImpl start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitMutationEffectsImpl')) debugger

  const flags = fiber.flags;
  if (flags & ContentReset) { // ContentReset =  0b0000000000,0001,0000;
    commitResetTextContent(fiber);
  }

  if (flags & Ref) { // Ref = 0b0000000000,1000,0000;
    const current = fiber.alternate;
    if (current !== null) {
      // 移除之前的ref
      commitDetachRef(current);
    }
  }

  // The following switch statement is only concerned about placement,
  // updates, and deletions. To avoid needing to add a case for every possible
  // bitmap value, we remove the secondary effects from the effect tag and
  // switch on that value.
  const primaryFlags = flags & (Placement | Update | Hydrating);
  // Placement =          0b000000,0000,0000,0010;
  // Update =             0b000000,0000,0000,0100;
  // PlacementAndUpdate = 0b000000,0000,0000,0110;
  // Hydrating =          0b000000,0100,0000,0000;
  switch (primaryFlags) {
    case Placement: {
      commitPlacement(fiber);
      // Clear the "placement" from effect tag so that we know that this is
      // inserted, before any life-cycles like componentDidMount gets called.
      // TODO: findDOMNode doesn't rely on this any more but isMounted does
      // and isMounted is deprecated anyway so we should be able to kill this.
      // 已经Placement完了，则去掉 Placement flag
      fiber.flags &= ~Placement;
      break;
    }
    case PlacementAndUpdate: {
      // Placement
      commitPlacement(fiber);
      // Clear the "placement" from effect tag so that we know that this is
      // inserted, before any life-cycles like componentDidMount gets called.
      fiber.flags &= ~Placement;

      // Update
      const current = fiber.alternate;
      commitWork(current, fiber);
      break;
    }
    case Hydrating: {
      fiber.flags &= ~Hydrating;
      break;
    }
    case HydratingAndUpdate: {
      fiber.flags &= ~Hydrating;

      // Update
      const current = fiber.alternate;
      commitWork(current, fiber);
      break;
    }
    case Update: {
      const current = fiber.alternate;
      commitWork(current, fiber);
      break;
    }
  }
  enableLog && console.log('commitMutationEffectsImpl end')
}

function commitMutationEffectsDeletions(
  deletions: Array<Fiber>,
  nearestMountedAncestor: Fiber,
  root: FiberRoot,
  renderPriorityLevel,
) {
  for (let i = 0; i < deletions.length; i++) {
    const childToDelete = deletions[i];

    try {
      commitDeletion(
        root,
        childToDelete,
        nearestMountedAncestor,
        renderPriorityLevel,
      );
    } catch (error) {
      captureCommitPhaseError(childToDelete, nearestMountedAncestor, error);
    }

  }
}

export function schedulePassiveEffectCallback() {
  if (!rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = true;
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

// 返回副作用是否被清空的标志
export function flushPassiveEffects(): boolean {
  enableLog && console.log('flushPassiveEffects start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('flushPassiveEffects')) debugger
  // Returns whether passive effects were flushed.
  /**
   * pendingPassiveEffectsRenderPriority会在commitRootImpl里面rootDoesHavePassiveEffects为true的时候赋值为：
   * pendingPassiveEffectsRenderPriority = renderPriorityLevel
   */
  
  if (pendingPassiveEffectsRenderPriority !== NoSchedulerPriority) {
    const priorityLevel = Math.min(pendingPassiveEffectsRenderPriority, NormalSchedulerPriority)

    pendingPassiveEffectsRenderPriority = NoSchedulerPriority;

    const priority = runWithPriority(priorityLevel, flushPassiveEffectsImpl);
    
    enableLog && console.log('flushPassiveEffects end')
    return priority

  }
  enableLog && console.log('flushPassiveEffects end')
  return false;
}

function flushPassiveMountEffects(root, firstChild: Fiber): void {
  let fiber = firstChild;
  while (fiber !== null) {


    const primarySubtreeFlags = fiber.subtreeFlags & PassiveMask;

    if (fiber.child !== null && primarySubtreeFlags !== NoFlags) {
      flushPassiveMountEffects(root, fiber.child);
    }

    if ((fiber.flags & Passive) !== NoFlags) {

      try {
        commitPassiveMountOnFiber(root, fiber);
      } catch (error) {
        captureCommitPhaseError(fiber, fiber.return, error);
      }

    }


    fiber = fiber.sibling;
  }
}

function flushPassiveUnmountEffects(firstChild: Fiber): void {
  let fiber = firstChild;
  // 深度优先遍历fiber，处理删除的节点，执行useEffect的destroy函数
  while (fiber !== null) {
    const deletions = fiber.deletions;
    if (deletions !== null) {
      for (let i = 0; i < deletions.length; i++) {
        const fiberToDelete = deletions[i];
        flushPassiveUnmountEffectsInsideOfDeletedTree(fiberToDelete, fiber);

        // Now that passive effects have been processed, it's safe to detach lingering pointers.
        detachFiberAfterEffects(fiberToDelete);
      }
    }

    const child = fiber.child;
    if (child !== null) {
      // If any children have passive effects then traverse the subtree.
      // Note that this requires checking subtreeFlags of the current Fiber,
      // rather than the subtreeFlags/effectsTag of the first child,
      // since that would not cover passive effects in siblings.
      const passiveFlags = fiber.subtreeFlags & PassiveMask;
      if (passiveFlags !== NoFlags) {
        flushPassiveUnmountEffects(child);
      }
    }
    // 为fiber本身执行useEffect
    const primaryFlags = fiber.flags & Passive;
    if (primaryFlags !== NoFlags) {
      commitPassiveUnmountOnFiber(fiber);
    }

    fiber = fiber.sibling;
  }
}

function flushPassiveUnmountEffectsInsideOfDeletedTree(
  fiberToDelete: Fiber,
  nearestMountedAncestor: Fiber,
): void {
  if ((fiberToDelete.subtreeFlags & PassiveStatic) !== NoFlags) {
    // If any children have passive effects then traverse the subtree.
    // Note that this requires checking subtreeFlags of the current Fiber,
    // rather than the subtreeFlags/effectsTag of the first child,
    // since that would not cover passive effects in siblings.
    let child = fiberToDelete.child;
    while (child !== null) {
      flushPassiveUnmountEffectsInsideOfDeletedTree(
        child,
        nearestMountedAncestor,
      );
      child = child.sibling;
    }
  }

  if ((fiberToDelete.flags & PassiveStatic) !== NoFlags) {
    commitPassiveUnmountInsideDeletedTreeOnFiber(
      fiberToDelete,
      nearestMountedAncestor,
    );
  }
}

function flushPassiveEffectsImpl() {
  
  enableLog && console.log('flushPassiveEffectsImpl start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('flushPassiveEffectsImpl')) debugger
  
  // 先校验，如果root上没有 Passive efectTag的节点，则直接return
  if (rootWithPendingPassiveEffects === null) {
    enableLog && console.log('flushPassiveEffectsImpl end')
    return false;
  }

  const root = rootWithPendingPassiveEffects;
  const lanes = pendingPassiveEffectsLanes;
  rootWithPendingPassiveEffects = null;
  pendingPassiveEffectsLanes = NoLanes;

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Cannot flush passive effects while already rendering.',
  );


  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  const prevInteractions = pushInteractions(root);

  // It's important that ALL pending passive effect destroy functions are called
  // before ANY passive effect create functions are called.
  // Otherwise effects in sibling components might interfere with each other.
  // e.g. a destroy function in one component may unintentionally override a ref
  // value set by a create function in another component.
  // Layout effects have the same constraint.
  flushPassiveUnmountEffects(root.current);
  flushPassiveMountEffects(root, root.current);



  if (enableSchedulerTracing) {
    popInteractions(prevInteractions); // prevInteractions as Set<Interaction>
    finishPendingInteractions(root, lanes);
  }

  executionContext = prevExecutionContext;

  // 刷新同步任务队列
  flushSyncCallbackQueue();

  // If additional passive effects were scheduled, increment a counter. If this
  // exceeds the limit, we'll fire a warning.
  nestedPassiveUpdateCount =
    rootWithPendingPassiveEffects === null ? 0 : nestedPassiveUpdateCount + 1;
  enableLog && console.log('flushPassiveEffectsImpl end')
  return true;
}

export function isAlreadyFailedLegacyErrorBoundary(instance: mixed): boolean {
  return (
    legacyErrorBoundariesThatAlreadyFailed !== null &&
    legacyErrorBoundariesThatAlreadyFailed.has(instance)
  );
}

export function markLegacyErrorBoundaryAsFailed(instance: mixed) {
  if (legacyErrorBoundariesThatAlreadyFailed === null) {
    legacyErrorBoundariesThatAlreadyFailed = new Set([instance]);
  } else {
    legacyErrorBoundariesThatAlreadyFailed.add(instance);
  }
}

function prepareToThrowUncaughtError(error: mixed) {
  if (!hasUncaughtError) {
    hasUncaughtError = true;
    firstUncaughtError = error;
  }
}
export const onUncaughtError = prepareToThrowUncaughtError;

function captureCommitPhaseErrorOnRoot(
  rootFiber: Fiber,
  sourceFiber: Fiber,
  error: mixed,
) {
  const errorInfo = createCapturedValue(error, sourceFiber);
  const update = createRootErrorUpdate(rootFiber, errorInfo, (SyncLane: Lane));
  enqueueUpdate(rootFiber, update);
  const eventTime = requestEventTime();
  const root = markUpdateLaneFromFiberToRoot(rootFiber, (SyncLane: Lane));
  if (root !== null) {
    markRootUpdated(root, SyncLane, eventTime);
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, SyncLane);
  }
}

export function captureCommitPhaseError(
  sourceFiber: Fiber,
  nearestMountedAncestor: Fiber | null,
  error: mixed,
) {
  if (sourceFiber.tag === HostRoot) {
    // Error was thrown at the root. There is no parent, so the root
    // itself should capture it.
    captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
    return;
  }

  let fiber = null;

  fiber = sourceFiber.return;


  while (fiber !== null) {
    if (fiber.tag === HostRoot) {
      captureCommitPhaseErrorOnRoot(fiber, sourceFiber, error);
      return;
    } else if (fiber.tag === ClassComponent) {
      const ctor = fiber.type;
      const instance = fiber.stateNode;
      if (
        typeof ctor.getDerivedStateFromError === 'function' ||
        (typeof instance.componentDidCatch === 'function' &&
          !isAlreadyFailedLegacyErrorBoundary(instance))
      ) {
        const errorInfo = createCapturedValue(error, sourceFiber);
        const update = createClassErrorUpdate(
          fiber,
          errorInfo,
          (SyncLane: Lane),
        );
        enqueueUpdate(fiber, update);
        const eventTime = requestEventTime();
        const root = markUpdateLaneFromFiberToRoot(fiber, (SyncLane: Lane));
        if (root !== null) {
          markRootUpdated(root, SyncLane, eventTime);
          ensureRootIsScheduled(root, eventTime);
          schedulePendingInteractions(root, SyncLane);
        }
        return;
      }
    }
    fiber = fiber.return;
  }
}

export function pingSuspendedRoot(
  root: FiberRoot,
  wakeable: Wakeable,
  pingedLanes: Lanes,
) {
  const pingCache = root.pingCache;
  if (pingCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    pingCache.delete(wakeable);
  }

  const eventTime = requestEventTime();
  markRootPinged(root, pingedLanes, eventTime);

  if (
    workInProgressRoot === root &&
    isSubsetOfLanes(workInProgressRootRenderLanes, pingedLanes)
  ) {
    // Received a ping at the same priority level at which we're currently
    // rendering. We might want to restart this render. This should mirror
    // the logic of whether or not a root suspends once it completes.

    // TODO: If we're rendering sync either due to Sync, Batched or expired,
    // we should probably never restart.

    // If we're suspended with delay, or if it's a retry, we'll always suspend
    // so we can always restart.
    if (
      workInProgressRootExitStatus === RootSuspendedWithDelay ||
      (workInProgressRootExitStatus === RootSuspended &&
        includesOnlyRetries(workInProgressRootRenderLanes) &&
        now() - globalMostRecentFallbackTime < FALLBACK_THROTTLE_MS)
    ) {
      // Restart from the root.
      prepareFreshStack(root, NoLanes);
    } else {
      // Even though we can't restart right now, we might get an
      // opportunity later. So we mark this render as having a ping.
      workInProgressRootPingedLanes = mergeLanes(
        workInProgressRootPingedLanes,
        pingedLanes,
      );
    }
  }

  ensureRootIsScheduled(root, eventTime);
  schedulePendingInteractions(root, pingedLanes);
}

function retryTimedOutBoundary(boundaryFiber: Fiber, retryLane: Lane) {
  // The boundary fiber (a Suspense component or SuspenseList component)
  // previously was rendered in its fallback state. One of the promises that
  // suspended it has resolved, which means at least part of the tree was
  // likely unblocked. Try rendering again, at a new expiration time.
  if (retryLane === NoLane) {
    retryLane = requestRetryLane(boundaryFiber);
  }
  // TODO: Special case idle priority?
  const eventTime = requestEventTime();
  const root = markUpdateLaneFromFiberToRoot(boundaryFiber, retryLane);
  if (root !== null) {
    markRootUpdated(root, retryLane, eventTime);
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, retryLane);
  }
}

export function retryDehydratedSuspenseBoundary(boundaryFiber: Fiber) {
  const suspenseState: null | SuspenseState = boundaryFiber.memoizedState;
  let retryLane = NoLane;
  if (suspenseState !== null) {
    retryLane = suspenseState.retryLane;
  }
  retryTimedOutBoundary(boundaryFiber, retryLane);
}

export function resolveRetryWakeable(boundaryFiber: Fiber, wakeable: Wakeable) {
  let retryLane = NoLane; // Default
  let retryCache: WeakSet<Wakeable> | Set<Wakeable> | null;
  if (enableSuspenseServerRenderer) {
    switch (boundaryFiber.tag) {
      case SuspenseComponent:
        retryCache = boundaryFiber.stateNode;
        const suspenseState: null | SuspenseState = boundaryFiber.memoizedState;
        if (suspenseState !== null) {
          retryLane = suspenseState.retryLane;
        }
        break;
      case SuspenseListComponent:
        retryCache = boundaryFiber.stateNode;
        break;
      default:
        invariant(
          false,
          'Pinged unknown suspense boundary type. ' +
            'This is probably a bug in React.',
        );
    }
  } else {
    retryCache = boundaryFiber.stateNode;
  }

  if (retryCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    retryCache.delete(wakeable);
  }

  retryTimedOutBoundary(boundaryFiber, retryLane);
}

// Computes the next Just Noticeable Difference (JND) boundary.
// The theory is that a person can't tell the difference between small differences in time.
// Therefore, if we wait a bit longer than necessary that won't translate to a noticeable
// difference in the experience. However, waiting for longer might mean that we can avoid
// showing an intermediate loading state. The longer we have already waited, the harder it
// is to tell small differences in time. Therefore, the longer we've already waited,
// the longer we can wait additionally. At some point we have to give up though.
// We pick a train model where the next boundary commits at a consistent schedule.
// These particular numbers are vague estimates. We expect to adjust them based on research.
function jnd(timeElapsed: number) {
  return timeElapsed < 120
    ? 120
    : timeElapsed < 480
    ? 480
    : timeElapsed < 1080
    ? 1080
    : timeElapsed < 1920
    ? 1920
    : timeElapsed < 3000
    ? 3000
    : timeElapsed < 4320
    ? 4320
    : ceil(timeElapsed / 1960) * 1960;
}

function checkForNestedUpdates() {
  // React中规定循环更新大于50次则是重复在componentWillUpdate或componentDidUpdate调用setState
  if (nestedUpdateCount > NESTED_UPDATE_LIMIT) {
    nestedUpdateCount = 0;
    rootWithNestedUpdates = null;
    invariant(
      false,
      'Maximum update depth exceeded. This can happen when a component ' +
        'repeatedly calls setState inside componentWillUpdate or ' +
        'componentDidUpdate. React limits the number of nested updates to ' +
        'prevent infinite loops.',
    );
  }
}





// a 'shared' variable that changes when act() opens/closes in tests.
export const IsThisRendererActing = {current: (false: boolean)};



function computeThreadID(root: FiberRoot, lane: Lane | Lanes) {
  // Interaction threads are unique per root and expiration time.
  // NOTE: Intentionally unsound cast. All that matters is that it's a number
  // and it represents a batch of work. Could make a helper function instead,
  // but meh this is fine for now.
  return lane * 1000 + root.interactionThreadID;
}

export function markSpawnedWork(lane: Lane | Lanes) {
  if (!enableSchedulerTracing) {
    return;
  }
  if (spawnedWorkDuringRender === null) {
    spawnedWorkDuringRender = [lane];
  } else {
    spawnedWorkDuringRender.push(lane);
  }
}

function scheduleInteractions(
  root: FiberRoot,
  lane: Lane | Lanes,
  interactions: Set<Interaction>,
) {
  if (!enableSchedulerTracing) {
    return;
  }

  if (interactions.size > 0) {
    const pendingInteractionMap = root.pendingInteractionMap;
    const pendingInteractions = pendingInteractionMap.get(lane);
    if (pendingInteractions != null) {
      interactions.forEach(interaction => {
        if (!pendingInteractions.has(interaction)) {
          // Update the pending async work count for previously unscheduled interaction.
          interaction.__count++;
        }

        pendingInteractions.add(interaction);
      });
    } else {
      pendingInteractionMap.set(lane, new Set(interactions));

      // Update the pending async work count for the current interactions.
      interactions.forEach(interaction => {
        interaction.__count++;
      });
    }

    const subscriber = __subscriberRef.current;
    if (subscriber !== null) {
      const threadID = computeThreadID(root, lane);
      subscriber.onWorkScheduled(interactions, threadID);
    }
  }
}

function schedulePendingInteractions(root: FiberRoot, lane: Lane | Lanes) {
  // This is called when work is scheduled on a root.
  // It associates the current interactions with the newly-scheduled expiration.
  // They will be restored when that expiration is later committed.
  if (!enableSchedulerTracing) {
    return;
  }

  scheduleInteractions(root, lane, __interactionsRef.current);
}

function startWorkOnPendingInteractions(root: FiberRoot, lanes: Lanes) {
  // This is called when new work is started on a root.
  if (!enableSchedulerTracing) {
    return;
  }

  // Determine which interactions this batch of work currently includes, So that
  // we can accurately attribute time spent working on it, And so that cascading
  // work triggered during the render phase will be associated with it.
  const interactions: Set<Interaction> = new Set();
  root.pendingInteractionMap.forEach((scheduledInteractions, scheduledLane) => {
    if (includesSomeLane(lanes, scheduledLane)) {
      scheduledInteractions.forEach(interaction =>
        interactions.add(interaction),
      );
    }
  });

  // Store the current set of interactions on the FiberRoot for a few reasons:
  // We can re-use it in hot functions like performConcurrentWorkOnRoot()
  // without having to recalculate it. We will also use it in commitWork() to
  // pass to any Profiler onRender() hooks. This also provides DevTools with a
  // way to access it when the onCommitRoot() hook is called.
  root.memoizedInteractions = interactions;

  if (interactions.size > 0) {
    const subscriber = __subscriberRef.current;
    if (subscriber !== null) {
      const threadID = computeThreadID(root, lanes);
      try {
        subscriber.onWorkStarted(interactions, threadID);
      } catch (error) {
        // If the subscriber throws, rethrow it in a separate task
        scheduleCallback(ImmediateSchedulerPriority, () => {
          throw error;
        });
      }
    }
  }
}

function finishPendingInteractions(root, committedLanes) {
  if (!enableSchedulerTracing) {
    return;
  }

  const remainingLanesAfterCommit = root.pendingLanes;

  let subscriber;

  try {
    subscriber = __subscriberRef.current;
    if (subscriber !== null && root.memoizedInteractions.size > 0) {
      // FIXME: More than one lane can finish in a single commit.
      const threadID = computeThreadID(root, committedLanes);
      subscriber.onWorkStopped(root.memoizedInteractions, threadID);
    }
  } catch (error) {
    // If the subscriber throws, rethrow it in a separate task
    scheduleCallback(ImmediateSchedulerPriority, () => {
      throw error;
    });
  } finally {
    // Clear completed interactions from the pending Map.
    // Unless the render was suspended or cascading work was scheduled,
    // In which case– leave pending interactions until the subsequent render.
    const pendingInteractionMap = root.pendingInteractionMap;
    pendingInteractionMap.forEach((scheduledInteractions, lane) => {
      // Only decrement the pending interaction count if we're done.
      // If there's still work at the current priority,
      // That indicates that we are waiting for suspense data.
      if (!includesSomeLane(remainingLanesAfterCommit, lane)) {
        pendingInteractionMap.delete(lane);

        scheduledInteractions.forEach(interaction => {
          interaction.__count--;

          if (subscriber !== null && interaction.__count === 0) {
            try {
              subscriber.onInteractionScheduledWorkCompleted(interaction);
            } catch (error) {
              // If the subscriber throws, rethrow it in a separate task
              scheduleCallback(ImmediateSchedulerPriority, () => {
                throw error;
              });
            }
          }
        });
      }
    });
  }
}

// `act` testing API
//
// TODO: This is mostly a copy-paste from the legacy `act`, which does not have
// access to the same internals that we do here. Some trade offs in the
// implementation no longer make sense.

let isFlushingAct = false;
let isInsideThisAct = false;


const flushMockScheduler = Scheduler.unstable_flushAllWithoutAsserting;
const isSchedulerMocked = typeof flushMockScheduler === 'function';

// Returns whether additional work was scheduled. Caller should keep flushing
// until there's no work left.
function flushActWork(): boolean {
  if (flushMockScheduler !== undefined) {
    const prevIsFlushing = isFlushingAct;
    isFlushingAct = true;
    try {
      return flushMockScheduler();
    } finally {
      isFlushingAct = prevIsFlushing;
    }
  } else {
    // No mock scheduler available. However, the only type of pending work is
    // passive effects, which we control. So we can flush that.
    const prevIsFlushing = isFlushingAct;
    isFlushingAct = true;
    try {
      let didFlushWork = false;
      while (flushPassiveEffects()) {
        didFlushWork = true;
      }
      return didFlushWork;
    } finally {
      isFlushingAct = prevIsFlushing;
    }
  }
}

function flushWorkAndMicroTasks(onDone: (err: ?Error) => void) {
  try {
    flushActWork();
    enqueueTask(() => {
      if (flushActWork()) {
        flushWorkAndMicroTasks(onDone);
      } else {
        onDone();
      }
    });
  } catch (err) {
    onDone(err);
  }
}

// we track the 'depth' of the act() calls with this counter,
// so we can tell if any async act() calls try to run in parallel.

let actingUpdatesScopeDepth = 0;

export function act(callback: () => Thenable<mixed>): Thenable<void> {

  const previousActingUpdatesScopeDepth = actingUpdatesScopeDepth;
  actingUpdatesScopeDepth++;

  const previousIsSomeRendererActing = IsSomeRendererActing.current;
  const previousIsThisRendererActing = IsThisRendererActing.current;
  const previousIsInsideThisAct = isInsideThisAct;
  IsSomeRendererActing.current = true;
  IsThisRendererActing.current = true;
  isInsideThisAct = true;

  function onDone() {
    actingUpdatesScopeDepth--;
    IsSomeRendererActing.current = previousIsSomeRendererActing;
    IsThisRendererActing.current = previousIsThisRendererActing;
    isInsideThisAct = previousIsInsideThisAct;
  }

  let result;
  try {
    result = batchedUpdates(callback);
  } catch (error) {
    // on sync errors, we still want to 'cleanup' and decrement actingUpdatesScopeDepth
    onDone();
    throw error;
  }

  if (
    result !== null &&
    typeof result === 'object' &&
    typeof result.then === 'function'
  ) {
    // setup a boolean that gets set to true only
    // once this act() call is await-ed
    let called = false;

    // in the async case, the returned thenable runs the callback, flushes
    // effects and  microtasks in a loop until flushPassiveEffects() === false,
    // and cleans up
    return {
      then(resolve, reject) {
        called = true;
        result.then(
          () => {
            if (
              actingUpdatesScopeDepth > 1 ||
              (isSchedulerMocked === true &&
                previousIsSomeRendererActing === true)
            ) {
              onDone();
              resolve();
              return;
            }
            // we're about to exit the act() scope,
            // now's the time to flush tasks/effects
            flushWorkAndMicroTasks((err: ?Error) => {
              onDone();
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          },
          err => {
            onDone();
            reject(err);
          },
        );
      },
    };
  } else {

    // flush effects until none remain, and cleanup
    try {
      if (
        actingUpdatesScopeDepth === 1 &&
        (isSchedulerMocked === false || previousIsSomeRendererActing === false)
      ) {
        // we're about to exit the act() scope,
        // now's the time to flush effects
        flushActWork();
      }
      onDone();
    } catch (err) {
      onDone();
      throw err;
    }

    // in the sync case, the returned thenable only warns *if* await-ed
    return {
      then(resolve) {
        resolve();
      },
    };
  }
}

function detachFiberAfterEffects(fiber: Fiber): void {
  // Null out fields to improve GC for references that may be lingering (e.g. DevTools).
  // Note that we already cleared the return pointer in detachFiberMutation().
  fiber.child = null;
  fiber.deletions = null;
  fiber.dependencies = null;
  fiber.memoizedProps = null;
  fiber.memoizedState = null;
  fiber.pendingProps = null;
  fiber.sibling = null;
  fiber.stateNode = null;
  fiber.updateQueue = null;
}
