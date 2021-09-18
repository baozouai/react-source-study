/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {enableIsInputPending} from '../SchedulerFeatureFlags';
import { enableLog } from 'shared/ReactFeatureFlags';
/** 请求回调，通过port.postMessage触发，回调是performWorkUntilDeadline */
export let requestHostCallback;
/** 取消回调，scheduledHostCallback = null */
export let cancelHostCallback;
/**
 * requestHostTimeout = function(callback, ms) {
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };
 */
export let requestHostTimeout;
/** clearTimeout(taskTimeoutID) */
export let cancelHostTimeout;
/** 是否应该让出线程，判断当前时间是否大于deadline */
export let shouldYieldToHost;
/** needsPaint = true */
export let requestPaint;
/** 获取当前时间 */
export let getCurrentTime;
export let forceFrameRate;
// performce.now是否是函数
const hasPerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

if (hasPerformanceNow) {
  const localPerformance = performance;
  getCurrentTime = () => localPerformance.now();
} else {
  const localDate = Date;
  const initialTime = localDate.now();
  getCurrentTime = () => localDate.now() - initialTime;
}

if (
  // If Scheduler runs in a non-DOM environment, it falls back to a naive
  // implementation using setTimeout.
  typeof window === 'undefined' ||
  // Check if MessageChannel is supported, too.
  typeof MessageChannel !== 'function'
) {
  // If this accidentally gets imported in a non-browser environment, e.g. JavaScriptCore,
  // fallback to a naive implementation.
  let _callback = null;
  let _timeoutID = null;
  const _flushCallback = function() {
    if (_callback !== null) {
      try {
        const currentTime = getCurrentTime();
        const hasRemainingTime = true;
        _callback(hasRemainingTime, currentTime);
        _callback = null;
      } catch (e) {
        setTimeout(_flushCallback, 0);
        throw e;
      }
    }
  };
  // 非浏览器环境
  requestHostCallback = function(cb) {
    if (_callback !== null) {
      // Protect against re-entrancy.
      setTimeout(requestHostCallback, 0, cb);
    } else {
      _callback = cb;
      // 调度_flushCallback去执行_callback，taskQueue被清空
      setTimeout(_flushCallback, 0);
    }
  };
  cancelHostCallback = function() {
    _callback = null;
  };
  requestHostTimeout = function(cb, ms) {
    _timeoutID = setTimeout(cb, ms);
  };
  cancelHostTimeout = function() {
    clearTimeout(_timeoutID);
  };
  shouldYieldToHost = function() {
    return false;
  };
  requestPaint = forceFrameRate = function() {};
} else {
  // Capture local references to native APIs, in case a polyfill overrides them.
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;

  if (typeof console !== 'undefined') {
    // TODO: Scheduler no longer requires these methods to be polyfilled. But
    // maybe we want to continue warning if they don't exist, to preserve the
    // option to rely on it in the future?
    const requestAnimationFrame = window.requestAnimationFrame;
    const cancelAnimationFrame = window.cancelAnimationFrame;

    if (typeof requestAnimationFrame !== 'function') {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        "This browser doesn't support requestAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills',
      );
    }
    if (typeof cancelAnimationFrame !== 'function') {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        "This browser doesn't support cancelAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills',
      );
    }
  }

  let isMessageLoopRunning = false;
  let scheduledHostCallback = null;
  let taskTimeoutID = -1;

  // Scheduler periodically yields in case there is other work on the main
  // thread, like user events. By default, it yields multiple times per frame.
  // It does not attempt to align with frame boundaries, since most tasks don't
  // need to be frame aligned; for those that do, use requestAnimationFrame.
  let yieldInterval = 5;
  let deadline = 0;

  // TODO: Make this configurable
  // TODO: Adjust this based on priority?
  const maxYieldInterval = 300;
  let needsPaint = false;

  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    const scheduling = navigator.scheduling;
    shouldYieldToHost = function() {
      const currentTime = getCurrentTime();
      if (currentTime >= deadline) {
        // There's no time left. We may want to yield control of the main
        // thread, so the browser can perform high priority tasks. The main ones
        // are painting and user input. If there's a pending paint or a pending
        // input, then we should yield. But if there's neither, then we can
        // yield less often while remaining responsive. We'll eventually yield
        // regardless, since there could be a pending paint that wasn't
        // accompanied by a call to `requestPaint`, or other main thread tasks
        // like network events.
        if (needsPaint || scheduling.isInputPending()) {
          // There is either a pending paint or a pending input.
          return true;
        }
        // There's no pending input. Only yield if we've reached the max
        // yield interval.
        return currentTime >= maxYieldInterval;
      } else {
        // There's still time left in the frame.
        return false;
      }
    };

    requestPaint = function() {
      needsPaint = true;
    };
  } else {
    // `isInputPending` is not available. Since we have no way of knowing if
    // there's pending input, always yield at the end of the frame.
    shouldYieldToHost = function() {
      return getCurrentTime() >= deadline;
    };

    // Since we yield every frame regardless, `requestPaint` has no effect.
    requestPaint = function() {};
  }
  // 动态分配时间
  forceFrameRate = function(fps) {
    if (fps < 0 || fps > 125) {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        'forceFrameRate takes a positive int between 0 and 125, ' +
          'forcing frame rates higher than 125 fps is not supported',
      );
      return;
    }
    if (fps > 0) {
      yieldInterval = Math.floor(1000 / fps);
    } else {
      // reset the framerate
      yieldInterval = 5;
    }
  };
  /** 
   * performWorkUntilDeadline内部会执行掉scheduledHostCallback，最后taskQueue被清空,
   * 这个过程中会涉及任务的中断和恢复、任务完成状态的判断
  */
  const performWorkUntilDeadline = () => {
    
    enableLog && console.log('performWorkUntilDeadline start')
    if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('performWorkUntilDeadline')) debugger
    /**
     * requestHostCallback接收的callback会赋值给scheduledHostCallback,
     * 之后通过port1.postMessage触发，port2监听到执行回调performWorkUntilDeadline
     */
    if (scheduledHostCallback !== null) {
      const currentTime = getCurrentTime();
      // Yield after `yieldInterval` ms, regardless of where we are in the vsync
      // cycle. This means there's always time remaining at the beginning of
      // the message event.
      // 计算deadline，deadline会参与到shouldYieldToHost（根据时间片去限制任务执行）的计算中
      deadline = currentTime + yieldInterval;
      // hasTimeRemaining表示任务是否还有剩余时间，它和时间片一起限制任务的执行。如果没有时间，
      // 或者任务的执行时间超出时间片限制了，那么中断任务。它的默认为true，表示一直有剩余时间
      // 因为MessageChannel的port在postMessage，是比setTimeout还靠前执行的宏任务，这意味着
      // 在这一帧开始时，总是会有剩余时间，所以现在中断任务只看时间片的了
      const hasTimeRemaining = true;
      try {
        // scheduledHostCallback去执行任务的函数，当任务因为时间片被打断时，它会返回true，表示
        // 还有任务，所以会再让调度者调度一个执行者继续执行任务
        // scheduledHostCallback 由requestHostCallback 赋值为flushWork
        const hasMoreWork = scheduledHostCallback(
          hasTimeRemaining,
          currentTime,
        );
        if (!hasMoreWork) {
          // 如果没有任务了，停止调度
          isMessageLoopRunning = false;
          scheduledHostCallback = null;
        } else {
          // 如果还有任务，继续让调度者调度执行者，便于继续完成任务
          // If there's more work, schedule the next message event at the end
          // of the preceding one.
          port.postMessage(null);
        }
      } catch (error) {
        // If a scheduler task throws, exit the current browser task so the
        // error can be observed.
        port.postMessage(null);
        throw error;
      }
    } else {
      isMessageLoopRunning = false;
    }
    // Yielding to the browser will give it a chance to paint, so we can
    // reset this.
    needsPaint = false;
    enableLog && console.log('performWorkUntilDeadline end')
  };

  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  requestHostCallback = function(callback) {
    
    enableLog && console.log('requestHostCallback start')
    if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('requestHostCallback')) debugger
    
    scheduledHostCallback = callback;
    /**
     * performWorkUntilDeadline里面将isMessageLoopRunning设为false有两处:
     * 1.判断scheduledHostCallback为null
     * 2.或者判断scheduledHostCallback不为null，执行scheduledHostCallback返回结果为null
     */
    if (!isMessageLoopRunning) {
      isMessageLoopRunning = true;
      port.postMessage(null);
    }
  };

  cancelHostCallback = function() {
    scheduledHostCallback = null;
  };

  requestHostTimeout = function(callback, ms) {
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };

  cancelHostTimeout = function() {
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
  };
}
