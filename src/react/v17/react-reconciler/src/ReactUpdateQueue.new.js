/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// UpdateQueue is a linked list of prioritized updates.
//
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.
//
// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.
//
// For example:
//
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          The work-in-progress queue has
//                                          processed more updates than current.
//
// The reason we append to both queues is because otherwise we might drop
// updates without ever processing them. For example, if we only add updates to
// the work-in-progress queue, some updates could be lost whenever a work-in
// -progress render restarts by cloning from current. Similarly, if we only add
// updates to the current queue, the updates will be lost whenever an already
// in-progress queue commits and swaps with the current queue. However, by
// adding to both queues, we guarantee that the update will be part of the next
// work-in-progress. (And because the work-in-progress queue becomes the
// current queue once it commits, there's no danger of applying the same
// update twice.)
//
// Prioritization
// --------------
//
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.
//
// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first
// update in the queue is applied.
//
// For example:
//
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2
//
//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   Second render, at priority 2:
//     Base state: 'A'            <-  The base state does not include C1,
//                                    because B2 was skipped.
//     Updates: [B2, C1, D2]      <-  C1 was rebased on top of B2
//     Result state: 'ABCD'
//
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

import type {Fiber} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane';

import {NoLane, NoLanes, isSubsetOfLanes, mergeLanes} from './ReactFiberLane';

import {Callback, ShouldCapture, DidCapture} from './ReactFiberFlags';


import { markSkippedUpdateLanes } from './ReactFiberWorkLoop.new';
import invariant from 'shared/invariant';
import { enableLog } from 'shared/ReactFeatureFlags';

export type Update<State> = {
  // TODO: Temporary field. Will remove this by storing a map of
  // transition -> event time on the root.
  eventTime: number,
  lane: Lane,

  tag: 0 | 1 | 2 | 3,
  payload: any,
  callback: (() => mixed) | null,

  next: Update<State> | null,
};

type SharedQueue<State> = {
  pending: Update<State> | null,
};

export type UpdateQueue<State> = {
  baseState: State,
  firstBaseUpdate: Update<State> | null,
  lastBaseUpdate: Update<State> | null,
  shared: SharedQueue<State>,
  effects: Array<Update<State>> | null,
};

export const UpdateState = 0;
export const ReplaceState = 1;
export const ForceUpdate = 2;
export const CaptureUpdate = 3;

// Global state that is reset at the beginning of calling `processUpdateQueue`.
// It should only be read right after calling `processUpdateQueue`, via
// `checkHasForceUpdateAfterProcessing`.
let hasForceUpdate = false;
export let resetCurrentlyProcessingQueue;


export function initializeUpdateQueue<State>(fiber: Fiber): void {
  
  enableLog && console.log('initializeUpdateQueue start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('initializeUpdateQueue')) debugger

  const queue: UpdateQueue<State> = {
    // 前一次更新计算得出的状态，它是第一个被跳过的update之前的那些update计算得出的state。
    // 会以它为基础计算本次的state
    baseState: fiber.memoizedState,
    // 前一次更新时updateQueue中第一个被跳过的update对象
    firstBaseUpdate: null,
    // 前一次更新中，updateQueue中以第一个被跳过的update为起点一直到的最后一个update
    // 截取的队列中的最后一个update
    lastBaseUpdate: null,
    // 存储着本次更新的update队列，是实际的updateQueue。
    // shared的意思是current节点与workInProgress节点共享一条更新队列
    shared: {
      pending: null,
    },
    // 数组。保存update.callback !== null的Update
    effects: null,
  };
  fiber.updateQueue = queue;
}

export function cloneUpdateQueue<State>(
  current: Fiber,
  workInProgress: Fiber,
): void {
  // Clone the update queue from current. Unless it's already a clone.
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);
  const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
  if (queue === currentQueue) {
    const clone: UpdateQueue<State> = {
      baseState: currentQueue.baseState,
      firstBaseUpdate: currentQueue.firstBaseUpdate,
      lastBaseUpdate: currentQueue.lastBaseUpdate,
      shared: currentQueue.shared,
      effects: currentQueue.effects,
    };
    workInProgress.updateQueue = clone;
  }
}
// ClassComponent和HostRoot的update
export function createUpdate(eventTime: number, lane: Lane): Update<*> {
  const update: Update<*> = {
    // 任务时间，通过performance.now()获取的毫秒数
    eventTime,
    // 更新优先级
    lane,
    // 表示更新是哪种类型（UpdateState，ReplaceState，ForceUpdate，CaptureUpdate）
    tag: UpdateState,
    //     payload：更新所携带的状态。
    // 在类组件中，有两种可能，对象（{}），和函数（(prevState, nextProps):newState => {}）
    // 根组件中，为React.element，即ReactDOM.render的第一个参数
    payload: null,
    // setState的回调
    callback: null,
    // 指向下一个update
    next: null,
  };
  return update;
}

export function enqueueUpdate<State>(fiber: Fiber, update: Update<State>) {
  
  enableLog && console.log('enqueueUpdate start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('enqueueUpdate')) debugger

  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue: SharedQueue<State> = updateQueue.shared;
  const pending = sharedQueue.pending;
  // 拼接环状链表
  if (pending === null) {
    // This is the first update. Create a circular list.
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  sharedQueue.pending = update;
}

export function enqueueCapturedUpdate<State>(
  workInProgress: Fiber,
  capturedUpdate: Update<State>,
) {
  // Captured updates are updates that are thrown by a child during the render
  // phase. They should be discarded if the render is aborted. Therefore,
  // we should only put them on the work-in-progress queue, not the current one.
  let queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  // Check if the work-in-progress queue is a clone.
  const current = workInProgress.alternate;
  if (current !== null) {
    const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
    if (queue === currentQueue) {
      // The work-in-progress queue is the same as current. This happens when
      // we bail out on a parent fiber that then captures an error thrown by
      // a child. Since we want to append the update only to the work-in
      // -progress queue, we need to clone the updates. We usually clone during
      // processUpdateQueue, but that didn't happen in this case because we
      // skipped over the parent when we bailed out.
      let newFirst = null;
      let newLast = null;
      const firstBaseUpdate = queue.firstBaseUpdate;
      if (firstBaseUpdate !== null) {
        // Loop through the updates and clone them.
        let update = firstBaseUpdate;
        do {
          const clone: Update<State> = {
            eventTime: update.eventTime,
            lane: update.lane,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          if (newLast === null) {
            newFirst = newLast = clone;
          } else {
            newLast.next = clone;
            newLast = clone;
          }
          update = update.next;
        } while (update !== null);

        // Append the captured update the end of the cloned list.
        if (newLast === null) {
          newFirst = newLast = capturedUpdate;
        } else {
          newLast.next = capturedUpdate;
          newLast = capturedUpdate;
        }
      } else {
        // There are no base updates.
        newFirst = newLast = capturedUpdate;
      }
      queue = {
        baseState: currentQueue.baseState,
        firstBaseUpdate: newFirst,
        lastBaseUpdate: newLast,
        shared: currentQueue.shared,
        effects: currentQueue.effects,
      };
      workInProgress.updateQueue = queue;
      return;
    }
  }

  // Append the update to the end of the list.
  const lastBaseUpdate = queue.lastBaseUpdate;
  if (lastBaseUpdate === null) {
    queue.firstBaseUpdate = capturedUpdate;
  } else {
    lastBaseUpdate.next = capturedUpdate;
  }
  queue.lastBaseUpdate = capturedUpdate;
}

function getStateFromUpdate<State>(
  workInProgress: Fiber,
  // 这里的queue其实没用到过
  queue: UpdateQueue<State>,
  update: Update<State>,
  prevState: State,
  nextProps: any,
  instance: any,
): any {

  enableLog && console.log('getStateFromUpdate start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('getStateFromUpdate')) debugger

  switch (update.tag) {
    // ReplaceState === 1
    case ReplaceState: {
      // useState
      const payload = update.payload;
      if (typeof payload === 'function') {
        

        const nextState = payload.call(instance, prevState, nextProps);

        return nextState;
      }
      // State object
      return payload;
    }
    // CaptureUpdate === 3
    case CaptureUpdate: {
      // 如果已经判断到是CaptureUpdate的update，那就去掉该标志，加上DidCapture的标志
      workInProgress.flags =
        (workInProgress.flags & ~ShouldCapture) | DidCapture;
    }
    // Intentional fallthrough
    // UpdateState === 0
    case UpdateState: {
      const payload = update.payload;
      let partialState;
      // prevState = {a: 1, b: 2, c: 3}
      if (typeof payload === 'function') {
        // Updater function
        // 如果payload为function,如:
        // this.setState((preState, nextProps) => {
        //   ...
        // return newState
        // })
        // Updater function
        partialState = payload.call(instance, prevState, nextProps);

      } else {
        // this.state({a: 2, b: 3}), payload = {a: 2, b: 3}
        // Partial state object
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        return prevState;
      }
      // Object.assign({}, {a: 1, b: 2, c: 3}, {a: 2, b: 3}) = {a: 2, b: 3, c: 3}
      // Merge the partial state and the previous state.
      return Object.assign({}, prevState, partialState);
    }
    // ForceUpdate === 2
    case ForceUpdate: {
      hasForceUpdate = true;
      return prevState;
    }
  }
  return prevState;
}
/** 
 * 遍历updateQueue.shared.pending, 提取有足够优先级的update对象, 
 * 计算出最终的状态 workInProgress.memoizedState
 *  */
export function processUpdateQueue<State>(
  workInProgress: Fiber,
  props: any,
  instance: any,
  renderLanes: Lanes,
): void {

  enableLog && console.log('processUpdateQueue start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('processUpdateQueue')) debugger

  // This is always non-null on a ClassComponent or HostRoot
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;


  // firstBaseUpdate和lastBaseUpdate共同组成baseUpdate链表
  // 假如都不为空，比如firstBaseUpdate = u1,lastBaseUpdate = u2
  // 那么baseUpdate = u1 -> u2
  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate;

  // Check if there are pending updates. If so, transfer them to the base queue.
  let pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    // pedingQueue不为空，说明上面有新增的更新，即queue.shared.pending = u4 -> u3 -↓
    //                                                             ↑   ←   ← ↓
    // 上面已经拿到pedingQueue了，那么将queue的pending置空
    queue.shared.pending = null;

    // The pending queue is circular. Disconnect the pointer between first
    // and last so that it's non-circular.
    // 下面三行代码是剪开环形链表成单向链表 u3 -> u4
    // 照上面例子，这里lastPendingUpdate就是u4
    const lastPendingUpdate = pendingQueue;
    // firstPendingUpdate就是u3
    const firstPendingUpdate = lastPendingUpdate.next;
    // lastPendingUpdate(u4).next = null,则断开了环形链表，成了u3 -> u4
    lastPendingUpdate.next = null;
    // Append pending updates to base queue
    if (lastBaseUpdate === null) {
      // 如果lastBaseUpdate为空，意味着baseUpdate都为空，那么firstBaseUpdate就指向firstPendingUpdate
      firstBaseUpdate = firstPendingUpdate;
    } else {
      // 如果lastBaseUpdate不为空，那么pedingQueue接入到lastBaseUpdate后面
      lastBaseUpdate.next = firstPendingUpdate;
    }
    // lastBaseUpdate移动到lastPendingUpdate
    lastBaseUpdate = lastPendingUpdate;

    // If there's a current queue, and it's different from the base queue, then
    // we need to transfer the updates to that queue, too. Because the base
    // queue is a singly-linked list with no cycles, we can append to both
    // lists and take advantage of structural sharing.
    // TODO: Pass `current` as argument
    const current = workInProgress.alternate;
    if (current !== null) {
      // 同步更新current 的baseUpdate
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }

  // These values may change as we process the queue.
  if (firstBaseUpdate !== null) {
    // firstBaseUpdate !== null即baseUpdate不为空
    // Iterate through the list of updates to compute the result.
    // 本次更新前该Fiber节点的state
    let newState = queue.baseState;
    // TODO: Don't need to accumulate this. Instead, we can remove renderLanes
    // from the original lanes.
    let newLanes = NoLanes;

    let newBaseState = null;
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;

    let update = firstBaseUpdate;
    do {
      const updateLane = update.lane;
      const updateEventTime = update.eventTime;
      // isSubsetOfLanes函数的意思是，判断当前更新的优先级（updateLane）
      // 是否在渲染优先级（renderLanes）中，如果不在，那么就说明优先级不足
      if (!isSubsetOfLanes(renderLanes, updateLane)) {
        // updateLane不在在renderLanes中，跳过，如果该update是第一个被跳过的，那么：
        // 1.该update将作为新的baseUpdate的起点
        // 2.该update前一个产生的state将作为新的baseState
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone: Update<State> = {
          eventTime: updateEventTime,
          lane: updateLane,

          tag: update.tag,
          payload: update.payload,
          callback: update.callback,

          next: null,
        };
        if (newLastBaseUpdate === null) {
          // 如果newLastBaseUpdate为空，那么newFirstBaseUpdate和newLastBaseUpdate都指向该被跳过的update
          newFirstBaseUpdate = newLastBaseUpdate = clone;
          // 该update前一个产生的state将作为新的baseState
          newBaseState = newState;
        } else {
          // 不为空，则接入到newBaseUpdate，移动newLastBaseUpdate指向该被跳过的update
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        /*
        *
        * newLanes会在最后被赋值到workInProgress.lanes上，而它又最终
        * 会被收集到root.pendingLanes。
        *
        * 再次更新时会从root上的pendingLanes中找出应该在本次中更新的优先
        * 级（renderLanes），renderLanes含有本次跳过的优先级，再次进入，
        * processUpdateQueue wip的优先级符合要求，被更新掉，低优先级任务
        * 因此被重做
        * */
        // Update the remaining priority in the queue.
        newLanes = mergeLanes(newLanes, updateLane);
      } else {
        // updateLane在renderLanes中，处理这个更新，即优先级足够，去计算state
        // This update does have sufficient priority.

        if (newLastBaseUpdate !== null) {
          // newLastBaseUpdate不为空，意味着肯定有update优先级不足被跳过
          // 即!isSubsetOfLanes(renderLanes, updateLane) === true满足条件
          const clone: Update<State> = {
            eventTime: updateEventTime,
            // This update is going to be committed so we never want uncommit
            // it. Using NoLane works because 0 is a subset of all bitmasks, so
            // this will never be skipped by the check above.
            // 优先级足够，那么该update的lane标为最高优先级NoLane，确保commit的时候不被打断跳过
            lane: NoLane,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          /**
           * 这里要注意，虽然该update会被commit掉，但如果newLastBaseUpdate !== null，
           * 那么意味着优先级足够的update在baseUpdate里面
           * 比如baseUpdate为:u1(1) -> u2(2) -> u3(1) -> u4(2),括号里的数字越小代表优先级越高，
           * 这里假定只有优先级1才满足isSubsetOfLanes(renderLanes, updateLane)
           * 那么第一个被跳过的update就是u2,然后u3满足，会被commit掉，但u3也是在baseUpdate(newBaseUpdate)里面
           * newBaseUpdate: u2(2) -> u3(1) -> u4(2)
           */
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }

        // Process this update.
        // 在这里面有可能触发新的update，挂载到queue.shared.pending
        // 所以下面有queue.shared.pending !== null的判断
        newState = getStateFromUpdate(
          workInProgress,
          queue,
          update,
          newState,
          props,
          instance,
        );
        const callback = update.callback;
        if (callback !== null) {
          // callback不为空，打上Callback的标准
          // Callback = 0b0000000000,0010,0000;
          workInProgress.flags |= Callback;
          const effects = queue.effects;
          // 放到UpdateQueue的effects上
          if (effects === null) {
            queue.effects = [update];
          } else {
            effects.push(update);
          }
        }
      }
      // 移动到新的update
      update = update.next;
      if (update === null) {
        // baseUpdate都遍历完了
        /**
         * 这里要特别注意：
         * 上面已经把queue.shared.pending = null置空了，那为何现在queue.shared.pending又有？
         * 原因是上面运行了getStateFromUpdate，里面会处理一些回调的更新，
         * 在typeof payload === 'functiion' && payload.call(instance, prevState, nextProps)中，比如：
         * this.setState((prevState, nextProps) => {
         * ...
         *  this.setState({...})
         * ...
         * return newState
         * })
         */
        pendingQueue = queue.shared.pending;
        if (pendingQueue === null) {
          // 且pendingQueue也为空，则跳出
          break;
        } else {
          // An update was scheduled from inside a reducer. Add the new
          // pending updates to the end of the list and keep processing.
          const lastPendingUpdate = pendingQueue;
          // Intentionally unsound. Pending updates form a circular list, but we
          // unravel them when transferring them to the base queue.
          const firstPendingUpdate = ((lastPendingUpdate.next: any): Update<State>);
          lastPendingUpdate.next = null;
          update = firstPendingUpdate;
          queue.lastBaseUpdate = lastPendingUpdate;
          queue.shared.pending = null;
        }
      }
    } while (true);

    if (newLastBaseUpdate === null) {
      // newLastBaseUpdate为空意味着没有update因为优先级低被跳过，所以newState每次都得到新的值
      newBaseState = newState;
    }

    queue.baseState = ((newBaseState: any): State);
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;

    // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.
    markSkippedUpdateLanes(newLanes);
    // 将newLanes赋值给workInProgress.lanes，就是将被跳过的update的lane放到fiber.lanes
    workInProgress.lanes = newLanes;
    workInProgress.memoizedState = newState;
  }

  enableLog && console.log('processUpdateQueue end')
}

function callCallback(callback, context) {
  invariant(
    typeof callback === 'function',
    'Invalid argument passed as callback. Expected a function. Instead ' +
      'received: %s',
    callback,
  );
  callback.call(context);
}

export function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}

export function checkHasForceUpdateAfterProcessing(): boolean {
  return hasForceUpdate;
}

export function commitUpdateQueue<State>(
  finishedWork: Fiber,
  finishedQueue: UpdateQueue<State>,
  instance: any,
): void {
  // Commit the effects
  const effects = finishedQueue.effects;
  finishedQueue.effects = null;
  if (effects !== null) {
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      const callback = effect.callback;
      if (callback !== null) {
        effect.callback = null;
        callCallback(callback, instance);
      }
    }
  }
}
