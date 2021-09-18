/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import {
  enableProfiling,
} from './SchedulerFeatureFlags';
import {
  requestHostCallback,
  requestHostTimeout,
  cancelHostTimeout,
  shouldYieldToHost,
  getCurrentTime,
  forceFrameRate,
  requestPaint,
} from './SchedulerHostConfig';
import {push, pop, peek} from './SchedulerMinHeap';

// TODO: Use symbols?
import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from './SchedulerPriorities';
import {
  sharedProfilingBuffer,
  markTaskRun,
  markTaskYield,
  markTaskCompleted,
  markTaskCanceled,
  markTaskErrored,
  markSchedulerSuspended,
  markSchedulerUnsuspended,
  markTaskStart,
  stopLoggingProfilingEvents,
  startLoggingProfilingEvents,
} from './SchedulerProfiling';
import { enableLog } from 'shared/ReactFeatureFlags';

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;
// 不同优先级对应的不同的任务过期时间间隔
// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;

// Tasks are stored on a min heap
var taskQueue = [];
var timerQueue = [];

// Incrementing id counter. Used to maintain insertion order.
var taskIdCounter = 1;

// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentTask = null;
var currentPriorityLevel = NormalPriority;

// This is set while performing work, to prevent re-entrancy.
var isPerformingWork = false;

var isHostCallbackScheduled = false;
var isHostTimeoutScheduled = false;

function advanceTimers(currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  // 检查过期任务队列中不应再被推迟的，放到taskQueue中
  let timer = peek(timerQueue);
  while (timer !== null) {
    if (timer.callback === null) {
      // 该任务被取消了，弹出
      // Timer was cancelled.
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // 任务已过期，放到taskQueue中
      // Timer fired. Transfer to the task queue.
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer);
      if (enableProfiling) {
        markTaskStart(timer, currentTime);
        timer.isQueued = true;
      }
    } else {
      // 由于是小顶堆，第一个未过期的话，剩下的都是未过期，无需再遍历
      // Remaining timers are pending.
      return;
    }
    timer = peek(timerQueue);
  }
}

function handleTimeout(currentTime) {
  // 这个函数的作用是检查timerQueue中的任务，如果有快过期的任务，将它放到taskQueue中，执行掉
  // 如果没有快过期的，并且taskQueue中没有任务，那就取出timerQueue中的第一个任务，等它的任务快过期了，执行掉它
  isHostTimeoutScheduled = false;
  // 检查过期任务队列中不应再被推迟的，放到taskQueue中
  advanceTimers(currentTime);

  if (!isHostCallbackScheduled) {
    if (peek(taskQueue) !== null) {
      isHostCallbackScheduled = true;
      // 如果taskQueue不为空，发起一次调度
      requestHostCallback(flushWork);
    } else {
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

function flushWork(hasTimeRemaining, initialTime) {
  
  enableLog && console.log('Scheduler: flushWork start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('flushWork')) debugger

  if (enableProfiling) {
    markSchedulerUnsuspended(initialTime);
  }

  // We'll need a host callback the next time work is scheduled.
  isHostCallbackScheduled = false;
  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  isPerformingWork = true;
  const previousPriorityLevel = currentPriorityLevel;
  try {
    if (enableProfiling) {
      try {
        // workLoop的调用使得任务最终被执行
        return workLoop(hasTimeRemaining, initialTime);
      } catch (error) {
        if (currentTask !== null) {
          const currentTime = getCurrentTime();
          markTaskErrored(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        throw error;
      }
    } else {
      // No catch in prod code path.
      return workLoop(hasTimeRemaining, initialTime);
    }
  } finally {
    // 运行完后会还原全局标记
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
    if (enableProfiling) {
      const currentTime = getCurrentTime();
      markSchedulerSuspended(currentTime);
    }
  }
}
/** workLoop是通过判断任务函数的返回值去识别任务的完成状态的,true表示完成，false没完成 */ 
function workLoop(hasTimeRemaining, initialTime) {
  
  enableLog && console.log('Scheduler: workLoop')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('workLoop')) debugger
  
  let currentTime = initialTime;
  // 开始执行前检查一下timerQueue中的过期任务，放到taskQueue中
  advanceTimers(currentTime);
  // 获取taskQueue中最紧急的任务
  currentTask = peek(taskQueue);
  // 循环taskQueue，执行任务，相当于 while (currentTask !== null)
  while (currentTask !== null) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // hasTimeRemaining一直为true，这与MessageChannel作为宏任务的执行时机有关
      // This currentTask hasn't expired, and we've reached the deadline.
      // 当前任务没有过期（urrentTask.expirationTime > currentTime），但是已经到了时间片的末尾，需要中断循环
      // 使得本次循环下面currentTask执行的逻辑都不能被执行到（此处是中断任务的关键）
      break;
    }
    // 执行任务 ---------------------------------------------------
    // 获取任务的执行函数，这个callback就是React传给Scheduler的任务。例如：performConcurrentWorkOnRoot
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      // 如果执行函数为function，说明还有任务可做，调用它
      currentTask.callback = null;
      // 获取任务的优先级
      currentPriorityLevel = currentTask.priorityLevel;
      // 任务是否过期
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      markTaskRun(currentTask, currentTime);
      // 获取任务函数的执行结果
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      if (typeof continuationCallback === 'function') {
        // 检查callback的执行结果返回的是不是函数，如果返回的是函数，则将这个函数作为当前任务新的回调。
        // concurrent模式下，callback是performConcurrentWorkOnRoot，其内部根据当前调度的任务
        // 是否相同，来决定是否返回自身，如果相同，则说明还有任务没做完，返回自身，其作为新的callback
        // 被放到当前的task上。while循环完成一次之后，检查shouldYieldToHost，如果需要让出执行权，
        // 则中断循环，走到下方，判断currentTask不为null，返回true，说明还有任务，回到performWorkUntilDeadline
        // 中，判断还有任务，继续port.postMessage(null)，调用监听函数performWorkUntilDeadline，继续执行任务
        currentTask.callback = continuationCallback;
        markTaskYield(currentTask, currentTime);
      } else {
        // 返回不是函数，说明当前任务执行完了
        if (enableProfiling) {
          markTaskCompleted(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        if (currentTask === peek(taskQueue)) {
          // 将当前任务清除
          pop(taskQueue);
        }
      }
      advanceTimers(currentTime);
    } else {
      // 任务的callback不是函数，说明被取消了（unstable_cancelCallback(task)会将任务的callback置为nul)，则弹出
      pop(taskQueue);
    }
    // 从taskQueue中继续获取任务，如果上一个任务未完成，那么它将不会
    // 被从队列剔除，所以获取到的currentTask还是上一个任务，会继续去执行它
    currentTask = peek(taskQueue);
  }
  // Return whether there's additional work
  // return 的结果会作为 performWorkUntilDeadline 中hasMoreWork的依据
  // 高优先级任务完成后，currentTask.callback为null，任务从taskQueue中删除，此时队列中还有低优先级任务，
  // currentTask = peek(taskQueue)  currentTask不为空，说明还有任务，继续postMessage执行workLoop，
  // 但它被取消过，导致currentTask.callback为null
  // 所以会被删除，此时的taskQueue为空，低优先级的任务重新调度，加入taskQueue
  if (currentTask !== null) {
    // 如果currentTask不为空，说明是时间片的限制导致了任务中断，只是被中止了，
    // return 一个 true告诉外部，此时任务还未执行完，还有任务，
    // 翻译成英文就是hasMoreWork，此处是(恢复任务的关键)
    return true;
  } else {
    // 如果currentTask为空，说明taskQueue队列中的任务已经都
    // 执行完了，然后从timerQueue中找任务，调用requestHostTimeout
    // 去把task放到taskQueue中，到时会再次发起调度，但是这次，
    // 会先return false，告诉外部当前的taskQueue已经清空，
    // 先停止执行任务，也就是终止任务调度
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority: // 1
    case UserBlockingPriority: // 2
    case NormalPriority: // 3
    case LowPriority: // 4
    case IdlePriority: // 5
      break;
    default:
      priorityLevel = NormalPriority;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_next(eventHandler) {
  var priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
}
/** 最终会根据传入的优先级、任务callback返回新创建的newTask */
function unstable_scheduleCallback(priorityLevel, callback, options) {
  
  enableLog && console.log('Scheduler: unstable_scheduleCallback start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('unstable_scheduleCallback')) debugger

  // 获取当前时间，它是计算任务开始时间、过期时间和判断任务是否过期的依据
  var currentTime = getCurrentTime();
  // 确定当前时间 startTime 和延迟更新时间 timeout
  var startTime;
  // 从options中尝试获取delay，也就是推迟时间
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      // 如果有delay，那么任务开始时间就是当前时间加上delay
      startTime = currentTime + delay;
    } else {
      // 没有delay，任务开始时间就是当前时间，也就是任务需要立刻开始
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }
  // 计算过期时间（scheduleCallback函数中的内容）
  var timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT; // -1
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT; // 250
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT; // 1073741823 ms
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT; // 10000
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT; // 5000
      break;
  }
  // 计算任务的过期时间，任务开始时间 + timeout
  // 若是立即执行的优先级（ImmediatePriority），
  // 它的过期时间是startTime - 1比当前时间还短，表示已经过期，需要立即被执行
  var expirationTime = startTime + timeout;
  // 创建调度任务
  var newTask = {
    id: taskIdCounter++,
    // 任务本体
    callback,
    // 任务优先级
    priorityLevel,
    // 任务开始的时间，表示任务何时才能执行
    startTime,
    // 任务的过期时间
    expirationTime,
    // 在小顶堆队列中排序的依据
    sortIndex: -1,
  };
  if (enableProfiling) {
    newTask.isQueued = false;
  }
  // 如果是延迟任务则将 newTask 放入延迟调度队列（timerQueue）并执行 requestHostTimeout
  // 如果是正常任务则将 newTask 放入正常调度队列（taskQueue）并执行 requestHostCallback
  
  // 如果任务未过期，则将 newTask 放入timerQueue， 调用requestHostTimeout，
  // 目的是在timerQueue中检查排在最前面的任务的开始时间是否过期，
  // 过期则立刻将任务加入taskQueue，开始调度
  if (startTime > currentTime) {
    // This is a delayed task.
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // 如果现在taskQueue中没有任务，并且当前的任务是timerQueue中排名最靠前的那一个
      // 那么需要检查timerQueue中有没有需要放到taskQueue中的任务，这一步通过调用
      // requestHostTimeout实现
      // All tasks are delayed, and this is the task with the earliest delay.
      if (isHostTimeoutScheduled) {
        // Cancel an existing timeout.
        // clearTimeout
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      // Schedule a timeout.
      // 会把handleTimeout放到setTimeout里，在startTime - currentTime时间之后执行
      // 待会再调度
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 任务已经过期，以过期时间作为taskQueue排序的依据
    newTask.sortIndex = expirationTime;
    // taskQueue是最小堆，而堆内又是根据sortIndex（也就是expirationTime）进行排序的。
    // 可以保证优先级最高（expirationTime最小）的任务排在前面被优先处理。
    push(taskQueue, newTask);
    if (enableProfiling) {
      markTaskStart(newTask, currentTime);
      newTask.isQueued = true;
    }
    // Schedule a host callback, if needed. If we're already performing work,
    // wait until the next time we yield.
    // 调度一个主线程回调，如果已经执行了一个任务，等到下一次交还执行权的时候再执行回调。
    // 立即调度
    if (!isHostCallbackScheduled && !isPerformingWork) {
      // isPerformingWork在flushWork一开始设置为true，调用完后设置为false
      isHostCallbackScheduled = true;
      /**
       * requestHostCallback里面会将scheduledHostCallback设置为flushWork
       * 这里会通过postMessage调度一个任务，port.onMessage在下一个事件循环开始执行回调performWorkUntilDeadline，
       * 里面会执行flushWork，使用flushWork去执行taskQueue
       */
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback(flushWork);
  }
}

function unstable_getFirstCallbackNode() {
  return peek(taskQueue);
}

function unstable_cancelCallback(task) {
  if (enableProfiling) {
    if (task.isQueued) {
      const currentTime = getCurrentTime();
      markTaskCanceled(task, currentTime);
      task.isQueued = false;
    }
  }

  // Null out the callback to indicate the task has been canceled. (Can't
  // remove from the queue because you can't remove arbitrary nodes from an
  // array based heap, only the first one.)
  // 不能从队列中删除这个任务，因为不能从基于堆的数组中删除任意节点，只能删除第一个节点。
  task.callback = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

const unstable_requestPaint = requestPaint;

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  shouldYieldToHost as unstable_shouldYield,
  unstable_requestPaint,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
  forceFrameRate as unstable_forceFrameRate,
};

export const unstable_Profiling = enableProfiling
  ? {
      startLoggingProfilingEvents,
      stopLoggingProfilingEvents,
      sharedProfilingBuffer,
    }
  : null;
export {
  unstable_flushAllWithoutAsserting,
  unstable_flushNumberOfYields,
  unstable_flushExpired,
  unstable_clearYields,
  unstable_flushUntilNextPaint,
  unstable_flushAll,
  unstable_yieldValue,
  unstable_advanceTime
} from "./forks/SchedulerHostConfig.mock.js";

export {
  requestHostCallback,
  requestHostTimeout,
  cancelHostTimeout,
  shouldYieldToHost,
  getCurrentTime,
  forceFrameRate,
  requestPaint
} from "./forks/SchedulerHostConfig.default.js";
