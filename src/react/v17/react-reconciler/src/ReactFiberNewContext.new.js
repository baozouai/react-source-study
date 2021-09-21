/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactContext} from 'shared/ReactTypes';
import type {Fiber, ContextDependency} from './ReactInternalTypes';
import type {StackCursor} from './ReactFiberStack.new';
import type {Lanes} from './ReactFiberLane';

import {createCursor, push, pop} from './ReactFiberStack.new';
import {MAX_SIGNED_31_BIT_INT} from './MaxInts';
import {
  ContextProvider,
  ClassComponent,
  DehydratedFragment,
} from './ReactWorkTags';
import {
  NoLanes,
  NoTimestamp,
  isSubsetOfLanes,
  includesSomeLane,
  mergeLanes,
  pickArbitraryLane,
} from './ReactFiberLane';

import invariant from 'shared/invariant';
import is from 'shared/objectIs';
import {createUpdate, enqueueUpdate, ForceUpdate} from './ReactUpdateQueue.new';
import {markWorkInProgressReceivedUpdate} from './ReactFiberBeginWork.new';
import {enableSuspenseServerRenderer} from 'shared/ReactFeatureFlags';

const valueCursor: StackCursor<mixed> = createCursor(null);



let currentlyRenderingFiber: Fiber | null = null;
let lastContextDependency: ContextDependency<mixed> | null = null;
let lastContextWithAllBitsObserved: ReactContext<any> | null = null;


export function resetContextDependencies(): void {
  // This is called right before React yields execution, to ensure `readContext`
  // cannot be called outside the render phase.
  currentlyRenderingFiber = null;
  lastContextDependency = null;
  lastContextWithAllBitsObserved = null;

}


export function pushProvider<T>(providerFiber: Fiber, nextValue: T): void {
  const context: ReactContext<T> = providerFiber.type._context;

  push(valueCursor, context._currentValue, providerFiber);

  context._currentValue = nextValue;

}

export function popProvider(providerFiber: Fiber): void {
  const currentValue = valueCursor.current;

  pop(valueCursor, providerFiber);

  const context: ReactContext<any> = providerFiber.type._context;
  context._currentValue = currentValue;
}
/** 
 * 判断newValue或oldValue是否变化，
 * 变化了如果createContext有传入第二个参数，且是函数，
 * 则调用该函数判断新旧props的变化情况，否则就是变化了
 *  */
export function calculateChangedBits<T>(
  context: ReactContext<T>,
  newValue: T,
  oldValue: T,
) {
  if (is(oldValue, newValue)) {
    // No change
    return 0;
  } else {
    const changedBits =
      typeof context._calculateChangedBits === 'function'
        ? context._calculateChangedBits(oldValue, newValue)
        : MAX_SIGNED_31_BIT_INT;

    return changedBits | 0;
  }
}
/** 
 * 祖先节点和其alternate的childLanes如果不包含renderLanes，则加入，
 * 如果都有就意味着剩下的祖先节点都有足够的优先级了，那就break跳出
 * */
export function scheduleWorkOnParentPath(
  parent: Fiber | null,
  renderLanes: Lanes,
) {
  // Update the child lanes of all the ancestors, including the alternates.
  let node = parent;
  while (node !== null) {
    const alternate = node.alternate;
    if (!isSubsetOfLanes(node.childLanes, renderLanes)) {
      node.childLanes = mergeLanes(node.childLanes, renderLanes);
      if (alternate !== null) {
        alternate.childLanes = mergeLanes(alternate.childLanes, renderLanes);
      }
    } else if (
      alternate !== null &&
      !isSubsetOfLanes(alternate.childLanes, renderLanes)
    ) {
      alternate.childLanes = mergeLanes(alternate.childLanes, renderLanes);
    } else {
      // node和其alternate都有renderLanes，意味着剩下的祖先节点都有足够的优先级了，那就break跳出
      // Neither alternate was updated, which means the rest of the
      // ancestor path already has sufficient priority.
      break;
    }
    node = node.return;
  }
}
/** 
 * context变化了，则通知其依赖，判断该WIP的子节点是否有Provider.Consumer或者useContext，
 * 且对应的dependencies中是否有dependency.context === context，有则创建更新，通知变化 
 * */
export function propagateContextChange(
  workInProgress: Fiber,
  context: ReactContext<mixed>,
  changedBits: number,
  renderLanes: Lanes,
): void {
  debugger
  // 遍历子节点
  let fiber = workInProgress.child;
  if (fiber !== null) {
    // Set the return pointer of the child to the work-in-progress fiber.
    fiber.return = workInProgress;
  }
  // 传入的workInProgress是Provider对应的Fiber，那么查找子节点是否是对应的dependency含有context
  while (fiber !== null) {
    let nextFiber;
    // Visit this fiber.
    const list = fiber.dependencies;
    if (list !== null) {
      nextFiber = fiber.child;

      let dependency = list.firstContext;
      while (dependency !== null) {
        // Check if the context matches.
        if (
          dependency.context === context &&
          (dependency.observedBits & changedBits) !== 0
        ) {
          // 这里找到了
          // Match! Schedule an update on this fiber.
          // class组件才需要创建一个forceUpdate,加入updateQueue
          if (fiber.tag === ClassComponent) {
            // 如果fiber是class组件
            // Schedule a force update on the work-in-progress.
            // NoTimestamp为-1，创建一个forceUpdate
            const update = createUpdate(
              NoTimestamp,
              pickArbitraryLane(renderLanes),
            );
            // 打上强制更新的tag
            update.tag = ForceUpdate;
            // TODO: Because we don't have a work-in-progress, this will add the
            // update to the current fiber, too, which means it will persist even if
            // this render is thrown away. Since it's a race condition, not sure it's
            // worth fixing.
            enqueueUpdate(fiber, update);
          }
          // 加上renderLanes到该fiber和其alternate、dependencies的lanes上
          fiber.lanes = mergeLanes(fiber.lanes, renderLanes);
          const alternate = fiber.alternate;
          if (alternate !== null) {
            alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
          }
          scheduleWorkOnParentPath(fiber.return, renderLanes);

          // Mark the updated lanes on the list, too.
          list.lanes = mergeLanes(list.lanes, renderLanes);

          // Since we already found a match, we can stop traversing the
          // dependency list.
          // 既然已经找到了，那就可以停止遍历了，break跳出
          break;
        }
        dependency = dependency.next;
      }
    } else if (fiber.tag === ContextProvider) {
      /**
       * fiber为wip的child，那么这里为何要判断fiber.type === workInProgress.type？
       * 举个🌰：
       * <ThemeContext.Provider value={theme1}>
       *  theme1:<Child />
       *  <ThemeContext.Provider value={theme2}>
       *    theme2:<Child />
       *  </ThemeContext.Provider>
       * </ThemeContext.Provider>
       * 就是ThemeContext.Provider下面又有ThemeContext.Provider，
       * 这里theme1的child受顶层ThemeContext.Provider控制，
       * theme2的child应该受第二个ThemeContext.Provider控制，而不受顶层Context控制，
       * 上面例子它们的type相等，那么nextFiber就为null，
       * 如果type不相等，就是ThemeContext.Provider子节点也是ContextProvider,
       * 但不是ThemeContext.Provider，那么 fiber.child可以作为nextFiber
       */
      // Don't scan deeper if this is a matching provider
      nextFiber = fiber.type === workInProgress.type ? null : fiber.child;
    } else if (
      enableSuspenseServerRenderer &&
      fiber.tag === DehydratedFragment
    ) {
      // If a dehydrated suspense boundary is in this subtree, we don't know
      // if it will have any context consumers in it. The best we can do is
      // mark it as having updates.
      const parentSuspense = fiber.return;
      invariant(
        parentSuspense !== null,
        'We just came from a parent so we must have had a parent. This is a bug in React.',
      );
      parentSuspense.lanes = mergeLanes(parentSuspense.lanes, renderLanes);
      const alternate = parentSuspense.alternate;
      if (alternate !== null) {
        alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
      }
      // This is intentionally passing this fiber as the parent
      // because we want to schedule this fiber as having work
      // on its children. We'll use the childLanes on
      // this fiber to indicate that a context has changed.
      scheduleWorkOnParentPath(parentSuspense, renderLanes);
      nextFiber = fiber.sibling;
    } else {
      // 移动到child
      // Traverse down.
      nextFiber = fiber.child;
    }

    if (nextFiber !== null) {
      // Set the return pointer of the child to the work-in-progress fiber.
      nextFiber.return = fiber;
    } else {
      // No child. Traverse to next sibling.
      // 如果没有child，那处理sibling
      nextFiber = fiber;
      while (nextFiber !== null) {
        if (nextFiber === workInProgress) {
          // 下面有nextFiber = nextFiber.return向上回溯，如果回溯到WIP,那么就跳出
          // We're back to the root of this subtree. Exit.
          nextFiber = null;
          break;
        }
        // 处理sibling
        const sibling = nextFiber.sibling;
        if (sibling !== null) {
          // Set the return pointer of the sibling to the work-in-progress fiber.
          sibling.return = nextFiber.return;
          nextFiber = sibling;
          break;
        }
        // sibling也处理完了，那向上回溯
        // No more siblings. Traverse up.
        nextFiber = nextFiber.return;
      }
    }
    fiber = nextFiber;
  }
}
/** readContext前的准备工作 */
export function prepareToReadContext(
  workInProgress: Fiber,
  renderLanes: Lanes,
): void {
  // 设置一些全局变量，为下面的readContext做准备
  currentlyRenderingFiber = workInProgress;
  lastContextDependency = null;
  lastContextWithAllBitsObserved = null;

  const dependencies = workInProgress.dependencies;
  if (dependencies !== null) {
    const firstContext = dependencies.firstContext;
    if (firstContext !== null) {
      if (includesSomeLane(dependencies.lanes, renderLanes)) {
        // Context list has a pending update. Mark that this fiber performed work.
        markWorkInProgressReceivedUpdate();
      }
      // Reset the work-in-progress list
      dependencies.firstContext = null;
    }
  }
}
/** 返回context._currentValue */
export function readContext<T>(
  context: ReactContext<T>,
  observedBits: void | number | boolean,
): T {

  if (lastContextWithAllBitsObserved === context) {
    // Nothing to do. We already observe everything in this context.
  } else if (observedBits === false || observedBits === 0) {
    // Do not observe any updates.
  } else {
    let resolvedObservedBits; // Avoid deopting on observable arguments or heterogeneous types.
    if (
      typeof observedBits !== 'number' ||
      observedBits === MAX_SIGNED_31_BIT_INT
    ) {
      // Observe all updates.
      lastContextWithAllBitsObserved = ((context: any): ReactContext<mixed>);
      resolvedObservedBits = MAX_SIGNED_31_BIT_INT;
    } else {
      resolvedObservedBits = observedBits;
    }

    const contextItem = {
      context: ((context: any): ReactContext<mixed>),
      observedBits: resolvedObservedBits,
      next: null,
    };

    if (lastContextDependency === null) {
      // 如果为空，则以下的contextItem为第一个，那么作为firstContext
      invariant(
        currentlyRenderingFiber !== null,
        'Context can only be read while React is rendering. ' +
          'In classes, you can read it in the render method or getDerivedStateFromProps. ' +
          'In function components, you can read it directly in the function body, but not ' +
          'inside Hooks like useReducer() or useMemo().',
      );

      // This is the first dependency for this component. Create a new list.
      lastContextDependency = contextItem;
      currentlyRenderingFiber.dependencies = {
        lanes: NoLanes,
        firstContext: contextItem,
        responders: null,
      };
    } else {
      // 不为空，则上个contextItem的next指向当前新建的contextItem
      // Append a new context item.
      lastContextDependency = lastContextDependency.next = contextItem;
    }
  }
  return context._currentValue;
}
