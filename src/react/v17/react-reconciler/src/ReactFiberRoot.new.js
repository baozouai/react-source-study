/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FiberRoot, SuspenseHydrationCallbacks} from './ReactInternalTypes';
import type {RootTag} from './ReactRootTags';

import {noTimeout, supportsHydration} from './ReactFiberHostConfig';
import {createHostRootFiber} from './ReactFiber.new';
import {
  NoLanes,
  NoLanePriority,
  NoTimestamp,
  createLaneMap,
} from './ReactFiberLane';
import {
  enableSchedulerTracing,
  enableSuspenseCallback,
} from 'shared/ReactFeatureFlags';
import {unstable_getThreadID} from '../../scheduler/tracing';
import {initializeUpdateQueue} from './ReactUpdateQueue.new';
import {LegacyRoot, BlockingRoot, ConcurrentRoot} from './ReactRootTags';

function FiberRootNode(containerInfo, tag, hydrate) {
  // type RootTag = 0 | 1 | 2;
  // const LegacyRoot = 0;
  // const BlockingRoot = 1;
  // const ConcurrentRoot = 2;
  // 根节点类型
  this.tag = tag;
  // 存储dom 根节点，如<div id='app'></div>
  this.containerInfo = containerInfo;
  this.pendingChildren = null;
  this.current = null;
  this.pingCache = null;
  this.finishedWork = null;
  this.timeoutHandle = noTimeout;
  this.context = null;
  this.pendingContext = null;
  this.hydrate = hydrate;
  // callbackNode存储正在执行的更新任务
  this.callbackNode = null;
  // callbackPriority存储正在执行的更新任务对应的更新优先级
  this.callbackPriority = NoLanePriority;
  // 存储事件任务产生的时间
  this.eventTimes = createLaneMap(NoLanes);
  // 存储更新任务的过期时间
  this.expirationTimes = createLaneMap(NoTimestamp);
  // react产生的更新优先级会挂载到pendingLanes，只要pendingLanes不为NoLanes，则意味着有更新
  this.pendingLanes = NoLanes;
  this.suspendedLanes = NoLanes;
  this.pingedLanes = NoLanes;
  // 跟过期相关，如果更新任务已过期，则expiredLanes不为NoLanes
  this.expiredLanes = NoLanes;
  this.mutableReadLanes = NoLanes;
  this.finishedLanes = NoLanes;

  this.entangledLanes = NoLanes;
  this.entanglements = createLaneMap(NoLanes);

  if (supportsHydration) { // supportsHydration === true
    this.mutableSourceEagerHydrationData = null;
  }

  if (enableSchedulerTracing) { // enableSchedulerTracing === true
    this.interactionThreadID = unstable_getThreadID();
    this.memoizedInteractions = new Set();
    this.pendingInteractionMap = new Map();
  }
  if (enableSuspenseCallback) { // enableSuspenseCallback === false
    this.hydrationCallbacks = null;
  }

}

export function createFiberRoot(
  // containerInfo就是根节点，如<div id='app'></div>
  containerInfo: any,
  tag: RootTag,
  hydrate: boolean,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): FiberRoot {

  console.log('ReactFiberRoot: createFiberRoot')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('createFiberRoot')) debugger

  // 创建fiberRootNode
  const root: FiberRoot = (new FiberRootNode(containerInfo, tag, hydrate): any);

  if (enableSuspenseCallback) { // enableSuspenseCallback === false
    root.hydrationCallbacks = hydrationCallbacks;
  }

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 创建rootFiber
  const uninitializedFiber = createHostRootFiber(tag);
  // root.current指向rootFiber，root.current指向哪棵Fiber树，页面上就显示该Fiber树对应的dom
  root.current = uninitializedFiber;
  // rootFiber.stateNode指向FiberRoot，可通过stateNode.containerInfo取到对应的dom根节点div#root
  uninitializedFiber.stateNode = root;
  // 初始化updateQueue，对于RootFiber，queue.share.pending上面存储着React.element
  initializeUpdateQueue(uninitializedFiber);

  return root;
}
