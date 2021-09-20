/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {
  Instance,
  TextInstance,
  SuspenseInstance,
  Container,
  ChildSet,
  UpdatePayload,
} from './ReactFiberHostConfig';
import type {Fiber} from './ReactInternalTypes';
import type {FiberRoot} from './ReactInternalTypes';
import type {SuspenseState} from './ReactFiberSuspenseComponent.new';
import type {UpdateQueue} from './ReactUpdateQueue.new';
import type {FunctionComponentUpdateQueue} from './ReactFiberHooks.new';
import type {Wakeable} from 'shared/ReactTypes';
import type {ReactPriorityLevel} from './ReactInternalTypes';
import type {OffscreenState} from './ReactFiberOffscreenComponent';
import type {HookFlags} from './ReactHookEffectTags';

import {unstable_wrap as Schedule_tracing_wrap} from '../../scheduler/tracing';
import {
  enableSchedulerTracing,
  enableProfilerTimer,
  enableSuspenseServerRenderer,
} from 'shared/ReactFeatureFlags';
import {
  FunctionComponent,
  ForwardRef,
  ClassComponent,
  HostRoot,
  HostComponent,
  HostText,
  HostPortal,
  Profiler,
  SuspenseComponent,
  DehydratedFragment,
  IncompleteClassComponent,
  MemoComponent,
  SimpleMemoComponent,
  SuspenseListComponent,
  FundamentalComponent,
  ScopeComponent,
  Block,
  OffscreenComponent,
  LegacyHiddenComponent,
} from './ReactWorkTags';
import {
  invokeGuardedCallback,
  hasCaughtError,
  clearCaughtError,
} from 'shared/ReactErrorUtils';
import {
  NoFlags,
  ContentReset,
  Placement,
  Snapshot,
  Update,
  Callback,
  LayoutMask,
  PassiveMask,
  Ref,
} from './ReactFiberFlags';

import invariant from 'shared/invariant';

import {onCommitUnmount} from './ReactFiberDevToolsHook.new';
import {resolveDefaultProps} from './ReactFiberLazyComponent.new';
import {
  getCommitTime,
} from './ReactProfilerTimer.new';

import {commitUpdateQueue} from './ReactUpdateQueue.new';
import {
  getPublicInstance,
  supportsMutation,
  supportsPersistence,
  supportsHydration,
  commitMount,
  commitUpdate,
  resetTextContent,
  commitTextUpdate,
  appendChild,
  appendChildToContainer,
  insertBefore,
  insertInContainerBefore,
  removeChild,
  removeChildFromContainer,
  clearSuspenseBoundary,
  clearSuspenseBoundaryFromContainer,
  replaceContainerChildren,
  createContainerChildSet,
  hideInstance,
  hideTextInstance,
  unhideInstance,
  unhideTextInstance,
  commitHydratedContainer,
  commitHydratedSuspenseInstance,
  clearContainer,
} from './ReactFiberHostConfig';
import {
  captureCommitPhaseError,
  resolveRetryWakeable,
  markCommitTimeOfFallback,
  schedulePassiveEffectCallback,
} from './ReactFiberWorkLoop.new';
import {
  NoFlags as NoHookEffect,
  HasEffect as HookHasEffect,
  Layout as HookLayout,
  Passive as HookPassive,
} from './ReactHookEffectTags';
import { enableLog } from 'shared/ReactFeatureFlags';


const PossiblyWeakSet = typeof WeakSet === 'function' ? WeakSet : Set;

const callComponentWillUnmountWithTimer = function(current, instance) {
  instance.props = current.memoizedProps;
  instance.state = current.memoizedState;
  instance.componentWillUnmount();
};

// Capture errors so they don't interrupt unmounting.
function safelyCallComponentWillUnmount(
  current: Fiber,
  instance: any,
  nearestMountedAncestor: Fiber | null,
) {

    try {
      callComponentWillUnmountWithTimer(current, instance);
    } catch (unmountError) {
      captureCommitPhaseError(current, nearestMountedAncestor, unmountError);
    }

}

function safelyDetachRef(current: Fiber, nearestMountedAncestor: Fiber) {
  const ref = current.ref;
  if (ref !== null) {
    if (typeof ref === 'function') {

        try {
          ref(null);
        } catch (refError) {
          captureCommitPhaseError(current, nearestMountedAncestor, refError);
        }

    } else {
      ref.current = null;
    }
  }
}

export function safelyCallDestroy(
  current: Fiber,
  nearestMountedAncestor: Fiber | null,
  destroy: () => void,
) {

    try {
      destroy();
    } catch (error) {
      captureCommitPhaseError(current, nearestMountedAncestor, error);
    }

}

function commitBeforeMutationLifeCycles(
  current: Fiber | null,
  finishedWork: Fiber,
): void {

  enableLog && console.log('commitBeforeMutationLifeCycles start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitBeforeMutationLifeCycles')) debugger

  switch (finishedWork.tag) {
    case FunctionComponent: // 0
    case ForwardRef: // 11
    case SimpleMemoComponent: // 15
    case Block: { // 22
      console.log('commitBeforeMutationLifeCycles end')
      return;
    }
    case ClassComponent: { // 1
      if (finishedWork.flags & Snapshot) { // 256
        if (current !== null) {
          const prevProps = current.memoizedProps;
          const prevState = current.memoizedState;
          const instance = finishedWork.stateNode;
          // We could update instance props and state here,
          // but instead we rely on them being set during last render.
          // TODO: revisit this when we implement resuming.
          // 调用getSnapshotBeforeUpdate
          const snapshot = instance.getSnapshotBeforeUpdate(
            finishedWork.elementType === finishedWork.type
              ? prevProps
              : resolveDefaultProps(finishedWork.type, prevProps),
            prevState,
          );
          // 将返回值存储在内部属性上，方便componentDidUpdate获取
          instance.__reactInternalSnapshotBeforeUpdate = snapshot;
        }
      }
      enableLog && console.log('commitBeforeMutationLifeCycles end')

      return;
    }
    case HostRoot: { // 3
      if (finishedWork.flags & Snapshot) { // 256
        const root = finishedWork.stateNode;
        clearContainer(root.containerInfo);
      }
      enableLog && console.log('commitBeforeMutationLifeCycles end')

      return;
    }
    case HostComponent: // 5
    case HostText: // 6
    case HostPortal: // 4
    case IncompleteClassComponent: // 17
      enableLog && console.log('commitBeforeMutationLifeCycles end')

      // Nothing to do for these component types
      return;
  }
  invariant(
    false,
    'This unit of work tag should not have side-effects. This error is ' +
      'likely caused by a bug in React. Please file an issue.',
  );
}
/** 该方法会遍历effectList，执行所有useLayoutEffect hook的销毁函数 */
function commitHookEffectListUnmount(
  flags: HookFlags,
  finishedWork: Fiber,
  nearestMountedAncestor: Fiber | null,
) {

  enableLog && console.log('commitHookEffectListUnmount start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitHookEffectListUnmount')) debugger

  const updateQueue: FunctionComponentUpdateQueue | null = finishedWork.updateQueue;
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & flags) === flags) {
        // Unmount
        const destroy = effect.destroy;
        effect.destroy = undefined;
        if (destroy !== undefined) {
          // 调用清理副作用函数destroy
          safelyCallDestroy(finishedWork, nearestMountedAncestor, destroy);
        }
      }
      effect = effect.next;
    } while (effect !== firstEffect);
  }
  enableLog && console.log('commitHookEffectListUnmount end')
}
/**
 * @description: 根据flag来判断要处理useEffect还是useLayoutEffect
 * @param {*} flags
 * @param {*} finishedWork
 */
function commitHookEffectListMount(flags: HookFlags, finishedWork: Fiber) {
  
  enableLog && console.log('commitHookEffectListMount start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitHookEffectListMount')) debugger

  const updateQueue: FunctionComponentUpdateQueue | null = finishedWork.updateQueue;
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & flags) === flags) {
        // Mount
        const create = effect.create;
        effect.destroy = create();

      }
      effect = effect.next;
    } while (effect !== firstEffect);
  }
  enableLog && console.log('commitHookEffectListMount end')
}


function recursivelyCommitLayoutEffects(
  finishedWork: Fiber,
  finishedRoot: FiberRoot,
) {
  enableLog && console.log('recursivelyCommitLayoutEffects start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('recursivelyCommitLayoutEffects')) debugger

  const { flags, tag } = finishedWork;
  switch (tag) {
    case Profiler: {

      let child = finishedWork.child;
      while (child !== null) {
        const primarySubtreeFlags = finishedWork.subtreeFlags & LayoutMask;
        if (primarySubtreeFlags !== NoFlags) {

            try {
              recursivelyCommitLayoutEffects(child, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(child, finishedWork, error);
            }

        }
        child = child.sibling;
      }

      const primaryFlags = flags & (Update | Callback);
      if (primaryFlags !== NoFlags) {
        if (enableProfilerTimer) {
            try {
              commitLayoutEffectsForProfiler(finishedWork, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }

        }
      }
      break;
    }

    // case Offscreen: {
    //   TODO: Fast path to invoke all nested layout effects when Offscren goes from hidden to visible.
    //   break;
    // }

    default: {
      let child = finishedWork.child;
      while (child !== null) {
        // LayoutMask === 0b0000000000,1010,0100;
        const primarySubtreeFlags = finishedWork.subtreeFlags & LayoutMask;
        if (primarySubtreeFlags !== NoFlags) {

            try {
              recursivelyCommitLayoutEffects(child, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(child, finishedWork, error);
            }

        }
        child = child.sibling;
      }
      // Update === 0b00000000000000,0100;
      // Callback === 0b0000000000,0010,0000;
      // 判断finishWork是否打上了Update或者Callback
      const primaryFlags = flags & (Update | Callback);
      if (primaryFlags !== NoFlags) {
        switch (tag) {
          case FunctionComponent:
          case ForwardRef:
          case SimpleMemoComponent:
          case Block: {

            // HasEffect === 0b001;
            // Layout === 0b010;
            // HookLayout | HookHasEffect === 0b011
            // 这里会处理useLayoutEffect，调用其回调函数，返回结果赋值给effect.destroy
            commitHookEffectListMount(
              HookLayout | HookHasEffect,
              finishedWork,
            );

            if ((finishedWork.subtreeFlags & PassiveMask) !== NoFlags) {
              schedulePassiveEffectCallback();
            }
            break;
          }
          case ClassComponent: {
            // NOTE: Layout effect durations are measured within this function.
            commitLayoutEffectsForClassComponent(finishedWork);
            break;
          }
          case HostRoot: {
            commitLayoutEffectsForHostRoot(finishedWork);
            break;
          }
          case HostComponent: {
            commitLayoutEffectsForHostComponent(finishedWork);
            break;
          }
          case SuspenseComponent: {
            commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
            break;
          }
          case FundamentalComponent:
          case HostPortal:
          case HostText:
          case IncompleteClassComponent:
          case LegacyHiddenComponent:
          case OffscreenComponent:
          case ScopeComponent:
          case SuspenseListComponent: {
            // We have no life-cycles associated with these component types.
            break;
          }
          default: {
            invariant(
              false,
              'This unit of work tag should not have side-effects. This error is ' +
                'likely caused by a bug in React. Please file an issue.',
            );
          }
        }
      }

      if (flags & Ref) {
        commitAttachRef(finishedWork);
      }

      break;
    }
  }
  enableLog && console.log('recursivelyCommitLayoutEffects end')
}

function commitLayoutEffectsForProfiler(
  finishedWork: Fiber,
  finishedRoot: FiberRoot,
) {
  if (enableProfilerTimer) {
    const flags = finishedWork.flags;
    const current = finishedWork.alternate;

    const {onCommit, onRender} = finishedWork.memoizedProps;
    const {effectDuration} = finishedWork.stateNode;

    const commitTime = getCommitTime();

    const OnRenderFlag = Update;
    const OnCommitFlag = Callback;

    if ((flags & OnRenderFlag) !== NoFlags && typeof onRender === 'function') {
      if (enableSchedulerTracing) {
        onRender(
          finishedWork.memoizedProps.id,
          current === null ? 'mount' : 'update',
          finishedWork.actualDuration,
          finishedWork.treeBaseDuration,
          finishedWork.actualStartTime,
          commitTime,
          finishedRoot.memoizedInteractions,
        );
      } else {
        onRender(
          finishedWork.memoizedProps.id,
          current === null ? 'mount' : 'update',
          finishedWork.actualDuration,
          finishedWork.treeBaseDuration,
          finishedWork.actualStartTime,
          commitTime,
        );
      }
    }
  }
}

function commitLayoutEffectsForClassComponent(finishedWork: Fiber) {
  const instance = finishedWork.stateNode;
  const current = finishedWork.alternate;
  if (finishedWork.flags & Update) {
    if (current === null) {
      // We could update instance props and state here,
      // but instead we rely on them being set during last render.
      // TODO: revisit this when we implement resuming.
        instance.componentDidMount();
    } else {
      const prevProps =
        finishedWork.elementType === finishedWork.type
          ? current.memoizedProps
          : resolveDefaultProps(finishedWork.type, current.memoizedProps);
      const prevState = current.memoizedState;
      // We could update instance props and state here,
      // but instead we rely on them being set during last render.
      // TODO: revisit this when we implement resuming.

      instance.componentDidUpdate(
        prevProps,
        prevState,
        instance.__reactInternalSnapshotBeforeUpdate,
      );

    }
  }

  // TODO: I think this is now always non-null by the time it reaches the
  // commit phase. Consider removing the type check.
  const updateQueue: UpdateQueue<*> | null = (finishedWork.updateQueue: any);
  if (updateQueue !== null) {
    // We could update instance props and state here,
    // but instead we rely on them being set during last render.
    // TODO: revisit this when we implement resuming.
    commitUpdateQueue(finishedWork, updateQueue, instance);
  }
}

function commitLayoutEffectsForHostRoot(finishedWork: Fiber) {
  // TODO: I think this is now always non-null by the time it reaches the
  // commit phase. Consider removing the type check.
  const updateQueue: UpdateQueue<*> | null = (finishedWork.updateQueue: any);
  if (updateQueue !== null) {
    let instance = null;
    if (finishedWork.child !== null) {
      switch (finishedWork.child.tag) {
        case HostComponent:
          instance = getPublicInstance(finishedWork.child.stateNode);
          break;
        case ClassComponent:
          instance = finishedWork.child.stateNode;
          break;
      }
    }
    commitUpdateQueue(finishedWork, updateQueue, instance);
  }
}

function commitLayoutEffectsForHostComponent(finishedWork: Fiber) {
  const instance: Instance = finishedWork.stateNode;
  const current = finishedWork.alternate;

  // Renderers may schedule work to be done after host components are mounted
  // (eg DOM renderer may schedule auto-focus for inputs and form controls).
  // These effects should only be committed when components are first mounted,
  // aka when there is no current/alternate.
  if (current === null && finishedWork.flags & Update) {
    const type = finishedWork.type;
    const props = finishedWork.memoizedProps;
    commitMount(instance, type, props, finishedWork);
  }
}

function hideOrUnhideAllChildren(finishedWork, isHidden) {
  if (supportsMutation) {
    // We only have the top Fiber that was inserted but we need to recurse down its
    // children to find all the terminal nodes.
    let node: Fiber = finishedWork;
    while (true) {
      if (node.tag === HostComponent) {
        const instance = node.stateNode;
        if (isHidden) {
          hideInstance(instance);
        } else {
          unhideInstance(node.stateNode, node.memoizedProps);
        }
      } else if (node.tag === HostText) {
        const instance = node.stateNode;
        if (isHidden) {
          hideTextInstance(instance);
        } else {
          unhideTextInstance(instance, node.memoizedProps);
        }
      } else if (
        (node.tag === OffscreenComponent ||
          node.tag === LegacyHiddenComponent) &&
        (node.memoizedState: OffscreenState) !== null &&
        node !== finishedWork
      ) {
        // Found a nested Offscreen component that is hidden. Don't search
        // any deeper. This tree should remain hidden.
      } else if (node.child !== null) {
        node.child.return = node;
        node = node.child;
        continue;
      }
      if (node === finishedWork) {
        return;
      }
      while (node.sibling === null) {
        if (node.return === null || node.return === finishedWork) {
          return;
        }
        node = node.return;
      }
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }
}
// 赋值ref
function commitAttachRef(finishedWork: Fiber) {
  const ref = finishedWork.ref;
  if (ref !== null) {
    const instance = finishedWork.stateNode;
    let instanceToUse;
    switch (finishedWork.tag) {
      // 对应dom来说
      case HostComponent:
        // 直接返回instnace，即原生dom
        instanceToUse = getPublicInstance(instance);
        break;
      default:
        instanceToUse = instance;
    }
    // Moved outside to ensure DCE works with this flag
    if (typeof ref === 'function') {
        // 如果ref是函数形式，调用回调函数
      ref(instanceToUse);
    } else {
        // 如果ref是ref实例形式，赋值ref.current
      ref.current = instanceToUse;
    }
  }
}

function commitDetachRef(current: Fiber) {
  const currentRef = current.ref;
  if (currentRef !== null) {
    if (typeof currentRef === 'function') {
      currentRef(null);
    } else {
      currentRef.current = null;
    }
  }
}

// User-originating errors (lifecycles and refs) should not interrupt
// deletion, so don't let them throw. Host-originating errors should
// interrupt deletion, so it's okay
function commitUnmount(
  finishedRoot: FiberRoot,
  current: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  onCommitUnmount(current);

  switch (current.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent:
    case Block: {
      const updateQueue: FunctionComponentUpdateQueue | null = (current.updateQueue: any);
      if (updateQueue !== null) {
        // updateQueue不为空
        const lastEffect = updateQueue.lastEffect;
        if (lastEffect !== null) {
          // 处理清除副作用
          const firstEffect = lastEffect.next;

          let effect = firstEffect;
          do {
            const {destroy, tag} = effect;
            if (destroy !== undefined) {
              if ((tag & HookLayout) !== NoHookEffect) {
                // 只处理useLayoutEffect的清除副作用
                safelyCallDestroy(current, nearestMountedAncestor, destroy);
              }
            }
            effect = effect.next;
          } while (effect !== firstEffect);
        }
      }
      return;
    }
    case ClassComponent: {
      // 对于class组件，则卸载ref
      safelyDetachRef(current, nearestMountedAncestor);
      const instance = current.stateNode;
      // 然后调用componentWillUnmount
      if (typeof instance.componentWillUnmount === 'function') {
        safelyCallComponentWillUnmount(
          current,
          instance,
          nearestMountedAncestor,
        );
      }
      return;
    }
    case HostComponent: {
      // 类似commitDetachRef
      safelyDetachRef(current, nearestMountedAncestor);
      return;
    }
    case HostPortal: {
      // TODO: this is recursive.
      // We are also not using this parent because
      // the portal will get pushed immediately.
      if (supportsMutation) {
        unmountHostComponents(
          finishedRoot,
          current,
          nearestMountedAncestor,
          renderPriorityLevel,
        );
      } else if (supportsPersistence) {
        emptyPortalContainer(current);
      }
      return;
    }
    case FundamentalComponent: {
      return;
    }
    case DehydratedFragment: {
      return;
    }
    case ScopeComponent: {
      return;
    }
  }
}

function commitNestedUnmounts(
  finishedRoot: FiberRoot,
  root: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  // While we're inside a removed host node we don't want to call
  // removeChild on the inner nodes because they're removed by the top
  // call anyway. We also want to call componentWillUnmount on all
  // composites before this host node is removed from the tree. Therefore
  // we do an inner loop while we're still inside the host node.
  let node: Fiber = root;
  while (true) {
    // 先卸载自己，然后再卸载child和child的sibling，最后回溯到一开始传入的root，跳出函数
    commitUnmount(
      finishedRoot,
      node,
      nearestMountedAncestor,
      renderPriorityLevel,
    );
    // Visit children because they may contain more composite or host nodes.
    // Skip portals because commitUnmount() currently visits them recursively.
    if (
      node.child !== null &&
      // If we use mutation we drill down into portals using commitUnmount above.
      // If we don't use mutation we drill down into portals here instead.
      (!supportsMutation || node.tag !== HostPortal)
    ) {
      node.child.return = node;
      node = node.child;
      continue;
    }
    // 到了这里说明到了叶子节点
    if (node === root) {
      // 节点是root，说明处理完了
      return;
    }
    // 如果节点sibling为空，则回溯到父节点，直到节点sibling不为空或者到了一开始传进来的root节点才跳出
    while (node.sibling === null) {
      // sibling为null，且return为null、或者return为删除的目标节点，说明目标节点的所有子节点都卸载完，则return掉
      if (node.return === null || node.return === root) {
        return;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
}

function detachFiberMutation(fiber: Fiber) {
  // Cut off the return pointer to disconnect it from the tree.
  // This enables us to detect and warn against state updates on an unmounted component.
  // It also prevents events from bubbling from within disconnected components.
  //
  // Ideally, we should also clear the child pointer of the parent alternate to let this
  // get GC:ed but we don't know which for sure which parent is the current
  // one so we'll settle for GC:ing the subtree of this child.
  // This child itself will be GC:ed when the parent updates the next time.
  //
  // Note that we can't clear child or sibling pointers yet.
  // They're needed for passive effects and for findDOMNode.
  // We defer those fields, and all other cleanup, to the passive phase (see detachFiberAfterEffects).
  const alternate = fiber.alternate;
  if (alternate !== null) {
    alternate.return = null;
    fiber.alternate = null;
  }
  fiber.return = null;
}

function emptyPortalContainer(current: Fiber) {
  if (!supportsPersistence) {
    return;
  }

  const portal: {
    containerInfo: Container,
    pendingChildren: ChildSet,
    ...
  } = current.stateNode;
  const {containerInfo} = portal;
  const emptyChildSet = createContainerChildSet(containerInfo);
  replaceContainerChildren(containerInfo, emptyChildSet);
}

function commitContainer(finishedWork: Fiber) {
  if (!supportsPersistence) {
    return;
  }

  switch (finishedWork.tag) {
    case ClassComponent:
    case HostComponent:
    case HostText:
    case FundamentalComponent: {
      return;
    }
    case HostRoot:
    case HostPortal: {
      const portalOrRoot: {
        containerInfo: Container,
        pendingChildren: ChildSet,
        ...
      } = finishedWork.stateNode;
      const {containerInfo, pendingChildren} = portalOrRoot;
      replaceContainerChildren(containerInfo, pendingChildren);
      return;
    }
  }
  invariant(
    false,
    'This unit of work tag should not have side-effects. This error is ' +
      'likely caused by a bug in React. Please file an issue.',
  );
}
// 获取最近的host parent
function getHostParentFiber(fiber: Fiber): Fiber {
  let parent = fiber.return;
  while (parent !== null) {
    if (isHostParent(parent)) {
      return parent;
    }
    parent = parent.return;
  }
  invariant(
    false,
    'Expected to find a host parent. This error is likely caused by a bug ' +
      'in React. Please file an issue.',
  );
}
/** 是否是Host* Fiber */
function isHostParent(fiber: Fiber): boolean {
  //  HostRoot = 3; 
  //  HostPortal = 4; 
  //  HostComponent = 5;
  return (
    fiber.tag === HostComponent ||
    fiber.tag === HostRoot ||
    fiber.tag === HostPortal
  );
}
/**
 * 该fiber对应的dom要插入到parent，但parent有两种情况：
 * 1. 有多个child，那么要找到该fiber要插入到哪一个（before)dom前
 * 2.只有该fiber对应的dom，直接插入，appendChild
 */
function getHostSibling(fiber: Fiber): ?Instance {

  enableLog && console.log('getHostSibling start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('getHostSibling')) debugger

  // We're going to search forward into the tree until we find a sibling host
  // node. Unfortunately, if multiple insertions are done in a row we have to
  // search past them. This leads to exponential search for the next sibling.
  // TODO: Find a more efficient way to do this.
  let node: Fiber = fiber;
  siblings: while (true) {
    // If we didn't find anything, let's try the next sibling.
    while (node.sibling === null) {
      if (node.return === null || isHostParent(node.return)) {
        // node.return === null:到了rootFiber
        // isHostParent(node.return): node.return为Host* Fiber
        // If we pop out of the root or hit the parent the fiber we are the
        // last sibling.
        return null;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;

    while (
      node.tag !== HostComponent &&
      node.tag !== HostText &&
      node.tag !== DehydratedFragment
    ) {
      // If it is not host node and, we might have a host node inside it.
      // Try to search down until we find one.
      if (node.flags & Placement) {
        // If we don't have a child, try the siblings instead.
        continue siblings;
      }
      // If we don't have a child, try the siblings instead.
      // We also skip portals because they are not part of this host tree.
      if (node.child === null || node.tag === HostPortal) {
        continue siblings;
      } else {
        node.child.return = node;
        node = node.child;
      }
    }
    // 到了这里跳出上面的while循环，那么这里的node就肯定是host node
    // Check if this host node is stable or about to be placed.
    if (!(node.flags & Placement)) {
      // 如果该node不是Placement的，那么就找到了最初传入fiber的before了
      // Found it!
      return node.stateNode;
    }
  }
}

function commitPlacement(finishedWork: Fiber): void {

  enableLog && console.log('commitPlacement start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitPlacement')) debugger


  // Recursively insert all host nodes into the parent.
  // 1.获取最近的host parent
  const parentFiber = getHostParentFiber(finishedWork);

  // Note: these two variables *must* always be updated together.
  let parent;
  let isContainer;
  // 真正的dom
  const parentStateNode = parentFiber.stateNode;
  switch (parentFiber.tag) {
    case HostComponent:
      // 如果是dom类型，dom元素在stateNode
      parent = parentStateNode;
      isContainer = false;
      break;
    case HostRoot:
      // 如果是根节点，dom元素在stateNode.containerInfo
      parent = parentStateNode.containerInfo;
      isContainer = true;
      break;
    case HostPortal:
      parent = parentStateNode.containerInfo;
      isContainer = true;
      break;
    case FundamentalComponent:
    // eslint-disable-next-line-no-fallthrough
    default:
      invariant(
        false,
        'Invalid host parent fiber. This error is likely caused by a bug ' +
          'in React. Please file an issue.',
      );
  }
  // ContentReset = 0b00000000000001,0000;
  // 如果是重置text
  if (parentFiber.flags & ContentReset) {
    // Reset the text content of the parent before doing any insertions
    resetTextContent(parent);
    // Clear ContentReset from the effect tag
    parentFiber.flags &= ~ContentReset;
  }
  // 2.获取Fiber节点的DOM兄弟节点
  const before = getHostSibling(finishedWork);
  // We only have the top Fiber that was inserted but we need to recurse down its
  // children to find all the terminal nodes.
  // 3.根据DOM兄弟节点(before)是否存在决定调用parentNode.insertBefore或parentNode.appendChild执行DOM插入操作
  // isContainer为true代表parentStateNode是rootFiber
  if (isContainer) {
    insertOrAppendPlacementNodeIntoContainer(finishedWork, before, parent);
  } else {
    insertOrAppendPlacementNode(finishedWork, before, parent);
  }
  enableLog && console.log('commitPlacement end')
}

function insertOrAppendPlacementNodeIntoContainer(
  node: Fiber,
  before: ?Instance,
  parent: Container,
): void {

  enableLog && console.log('insertOrAppendPlacementNodeIntoContainer start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('insertOrAppendPlacementNodeIntoContainer')) debugger

  const { tag } = node;
  // 是否是dom
  const isHost = tag === HostComponent || tag === HostText;

  if (isHost) {
    // 是dom的话就直接插入
    const stateNode = isHost ? node.stateNode : node.stateNode.instance;
    if (before) {
      // 如果有before，则stateNode插入到before之前
      insertInContainerBefore(parent, stateNode, before);
    } else {
      // 否则appendChild
      appendChildToContainer(parent, stateNode);
    }
  } else if (tag === HostPortal) {
    // If the insertion itself is a portal, then we don't want to traverse
    // down its children. Instead, we'll get insertions from each child in
    // the portal directly.
  } else {
    // 到了这里node不是dom fiber，那么就要找到其子节点，看看哪个是dom fiber，才能执行dom层面的插入
    const child = node.child;
    if (child !== null) {
      // 递归调用
      insertOrAppendPlacementNodeIntoContainer(child, before, parent);
      // 处理完child，再处理sibling
      let sibling = child.sibling;
      while (sibling !== null) {
        insertOrAppendPlacementNodeIntoContainer(sibling, before, parent);
        sibling = sibling.sibling;
      }
    }
  }
  enableLog && console.log('insertOrAppendPlacementNodeIntoContainer end')
}

function insertOrAppendPlacementNode(
  node: Fiber,
  before: ?Instance,
  parent: Instance,
): void {

  enableLog && console.log('insertOrAppendPlacementNode start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('insertOrAppendPlacementNode')) debugger

  const {tag} = node;
  // 是否是dom节点
  const isHost = tag === HostComponent || tag === HostText;
  if (isHost) {
    // 如果是原生dom，fiber的stateNode指向对应的dom，直接插入
    const stateNode = isHost ? node.stateNode : node.stateNode.instance;
    if (before) {
      // 有before，意味着stateNode要插入到before之前
      insertBefore(parent, stateNode, before);
    } else {
      // 否则直接appendChild插入到parent中
      appendChild(parent, stateNode);
    }
  } else if (tag === HostPortal) {
    // If the insertion itself is a portal, then we don't want to traverse
    // down its children. Instead, we'll get insertions from each child in
    // the portal directly.
  } else {
    // 如果不是原生dom节点，找子节点
    const child = node.child;
    if (child !== null) {
      // 从child切入，找到第一个dom
      insertOrAppendPlacementNode(child, before, parent);
      let sibling = child.sibling;
      // child的兄弟节点也插入
      while (sibling !== null) {
        insertOrAppendPlacementNode(sibling, before, parent);
        // 继续检查兄弟节点
        sibling = sibling.sibling;
      }
    }
  }
  enableLog && console.log('insertOrAppendPlacementNode end')
}

function unmountHostComponents(
  finishedRoot: FiberRoot,
  current: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  // We only have the top Fiber that was deleted but we need to recurse down its
  // children to find all the terminal nodes.
  let node: Fiber = current;

  // Each iteration, currentParent is populated with node's host parent if not
  // currentParentIsValid.
  let currentParentIsValid = false;

  // Note: these two variables *must* always be updated together.
  let currentParent;
  let currentParentIsContainer;

  while (true) {
    if (!currentParentIsValid) {
      let parent = node.return;
      findParent: while (true) {
        // 1.找到目标节点的DOM层面的父节点
        invariant(
          parent !== null,
          'Expected to find a host parent. This error is likely caused by ' +
            'a bug in React. Please file an issue.',
        );
        const parentStateNode = parent.stateNode;
        switch (parent.tag) {
          case HostComponent:
            currentParent = parentStateNode;
            currentParentIsContainer = false;
            break findParent;
          case HostRoot:
            currentParent = parentStateNode.containerInfo;
            currentParentIsContainer = true;
            break findParent;
          case HostPortal:
            currentParent = parentStateNode.containerInfo;
            currentParentIsContainer = true;
            break findParent;
          case FundamentalComponent:
        }
        parent = parent.return;
      }
      currentParentIsValid = true;
    }
    if (node.tag === HostComponent || node.tag === HostText) {
      // 2.如果目标节点是dom节点，则遍历子树执行fiber节点的卸载
      commitNestedUnmounts(
        finishedRoot,
        node,
        nearestMountedAncestor,
        renderPriorityLevel,
      );
      // After all the children have unmounted, it is now safe to remove the
      // node from the tree.
      // 目标节点所有children卸载后，才可以安全地将Node的DOM节点从父节点中移除
      if (currentParentIsContainer) {
        // 如果目标节点的父节点为根节点
        removeChildFromContainer(
          ((currentParent: any): Container),
          (node.stateNode: Instance | TextInstance),
        );
      } else {
        removeChild(
          ((currentParent: any): Instance),
          (node.stateNode: Instance | TextInstance),
        );
      }
      // Don't visit children because we already visited them.
    } else if (
      enableSuspenseServerRenderer &&
      node.tag === DehydratedFragment
    ) {

      // Delete the dehydrated suspense boundary and all of its content.
      if (currentParentIsContainer) {
        clearSuspenseBoundaryFromContainer(
          ((currentParent: any): Container),
          (node.stateNode: SuspenseInstance),
        );
      } else {
        clearSuspenseBoundary(
          ((currentParent: any): Instance),
          (node.stateNode: SuspenseInstance),
        );
      }
    } else if (node.tag === HostPortal) {
      if (node.child !== null) {
        // When we go into a portal, it becomes the parent to remove from.
        // We will reassign it back when we pop the portal on the way up.
        currentParent = node.stateNode.containerInfo;
        currentParentIsContainer = true;
        // Visit children because portals might contain host components.
        node.child.return = node;
        node = node.child;
        continue;
      }
    } else {
      // 目标节点不是dom节点，先卸载自己
      commitUnmount(
        finishedRoot,
        node,
        nearestMountedAncestor,
        renderPriorityLevel,
      );
      // Visit children because we may find more host components below.
      if (node.child !== null) {
        node.child.return = node;
        node = node.child;
        continue;
      }
    }
    // node节点等于一开始传进来的current节点则跳出
    if (node === current) {
      return;
    }
    // 如果节点sibling为空，则回溯到父节点，直到节点sibling不为空或者到了一开始传进来的current节点才跳出
    while (node.sibling === null) {
      // sibling为null，且return为null、或者return为删除的目标节点current
      // 说明目标节点的所有子节点都卸载完，则return掉
      if (node.return === null || node.return === current) {
        return;
      }
      node = node.return;
      if (node.tag === HostPortal) {
        // When we go out of the portal, we need to restore the parent.
        // Since we don't keep a stack of them, we will search for it.
        currentParentIsValid = false;
      }
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
}

function commitDeletion(
  finishedRoot: FiberRoot,
  current: Fiber,
  nearestMountedAncestor: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {

  // Recursively delete all host nodes from the parent.
  // Detach refs and call componentWillUnmount() on the whole subtree.
  // 递归删除parent下的所有dom节点，卸载ref和调用componentWillUnmount
  unmountHostComponents(
    finishedRoot,
    current,
    nearestMountedAncestor,
    renderPriorityLevel,
  );

  const alternate = current.alternate;
  detachFiberMutation(current);
  if (alternate !== null) {
    detachFiberMutation(alternate);
  }
}

function commitWork(current: Fiber | null, finishedWork: Fiber): void {

  enableLog && console.log('commitWork start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitWork')) debugger

  if (!supportsMutation) { // supportsMutation === true
    switch (finishedWork.tag) {
      case FunctionComponent:
      case ForwardRef:
      case MemoComponent:
      case SimpleMemoComponent:
      case Block: {
        // Layout effects are destroyed during the mutation phase so that all
        // destroy functions for all fibers are called before any create functions.
        // This prevents sibling component effects from interfering with each other,
        // e.g. a destroy function in one component should never override a ref set
        // by a create function in another component during the same commit.
        // HookLayout | HookHasEffect这里处理的是useLayoutEffect的unMount
        commitHookEffectListUnmount(
          HookLayout | HookHasEffect,
          finishedWork,
          finishedWork.return,
        );
        enableLog && console.log('commitWork end')
        return;
      }
      case Profiler: {
        return;
      }
      case SuspenseComponent: {
        commitSuspenseComponent(finishedWork);
        attachSuspenseRetryListeners(finishedWork);
        enableLog && console.log('commitWork end')
        return;
      }
      case SuspenseListComponent: {
        attachSuspenseRetryListeners(finishedWork);
        enableLog && console.log('commitWork end')
        return;
      }
      case HostRoot: {
        if (supportsHydration) {
          const root: FiberRoot = finishedWork.stateNode;
          if (root.hydrate) {
            // We've just hydrated. No need to hydrate again.
            root.hydrate = false;
            commitHydratedContainer(root.containerInfo);
          }
        }
        break;
      }
      case OffscreenComponent:
      case LegacyHiddenComponent: {
        enableLog && console.log('commitWork end')
        return;
      }
    }

    commitContainer(finishedWork);
    enableLog && console.log('commitWork end')
    return;
  }

  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent:
    case Block: {
      // Layout effects are destroyed during the mutation phase so that all
      // destroy functions for all fibers are called before any create functions.
      // This prevents sibling component effects from interfering with each other,
      // e.g. a destroy function in one component should never override a ref set
      // by a create function in another component during the same commit.
        commitHookEffectListUnmount(
          HookLayout | HookHasEffect,
          finishedWork,
          finishedWork.return,
        );
      enableLog && console.log('commitWork end')
      return;
    }
    case ClassComponent: {
      enableLog && console.log('commitWork end')
      return;
    }
    case HostComponent: {
      const instance: Instance = finishedWork.stateNode;
      if (instance != null) {
        // Commit the work prepared earlier.
        const newProps = finishedWork.memoizedProps;
        // For hydration we reuse the update path but we treat the oldProps
        // as the newProps. The updatePayload will contain the real change in
        // this case.
        const oldProps = current !== null ? current.memoizedProps : newProps;
        const type = finishedWork.type;
        // TODO: Type the updateQueue to be specific to host components.
        const updatePayload: null | UpdatePayload = (finishedWork.updateQueue: any);
        finishedWork.updateQueue = null;
        if (updatePayload !== null) {
          commitUpdate(
            instance,
            updatePayload,
            type,
            oldProps,
            newProps,
            finishedWork,
          );
        }
      }
      enableLog && console.log('commitWork end')
      return;
    }
    case HostText: {
      invariant(
        finishedWork.stateNode !== null,
        'This should have a text node initialized. This error is likely ' +
          'caused by a bug in React. Please file an issue.',
      );
      const textInstance: TextInstance = finishedWork.stateNode;
      const newText: string = finishedWork.memoizedProps;
      // For hydration we reuse the update path but we treat the oldProps
      // as the newProps. The updatePayload will contain the real change in
      // this case.
      const oldText: string =
        current !== null ? current.memoizedProps : newText;
      commitTextUpdate(textInstance, oldText, newText);
      enableLog && console.log('commitWork end')
      return;
    }
    case HostRoot: {
      if (supportsHydration) {
        const root: FiberRoot = finishedWork.stateNode;
        if (root.hydrate) {
          // We've just hydrated. No need to hydrate again.
          root.hydrate = false;
          commitHydratedContainer(root.containerInfo);
        }
      }
      enableLog && console.log('commitWork end')
      return;
    }
    case Profiler: {
      enableLog && console.log('commitWork end')
      return;
    }
    case SuspenseComponent: {
      commitSuspenseComponent(finishedWork);
      attachSuspenseRetryListeners(finishedWork);
      enableLog && console.log('commitWork end')
      return;
    }
    case SuspenseListComponent: {
      attachSuspenseRetryListeners(finishedWork);
      enableLog && console.log('commitWork end')
      return;
    }
    case IncompleteClassComponent: {
      enableLog && console.log('commitWork end')
      return;
    }
    case FundamentalComponent: {
      break;
    }
    case ScopeComponent: {
      break;
    }
    case OffscreenComponent:
    case LegacyHiddenComponent: {
      const newState: OffscreenState | null = finishedWork.memoizedState;
      const isHidden = newState !== null;
      hideOrUnhideAllChildren(finishedWork, isHidden);
      enableLog && console.log('commitWork end')
      return;
    }
  }
  invariant(
    false,
    'This unit of work tag should not have side-effects. This error is ' +
      'likely caused by a bug in React. Please file an issue.',
  );
}

function commitSuspenseComponent(finishedWork: Fiber) {
  const newState: SuspenseState | null = finishedWork.memoizedState;

  if (newState !== null) {
    markCommitTimeOfFallback();

    if (supportsMutation) {
      // Hide the Offscreen component that contains the primary children. TODO:
      // Ideally, this effect would have been scheduled on the Offscreen fiber
      // itself. That's how unhiding works: the Offscreen component schedules an
      // effect on itself. However, in this case, the component didn't complete,
      // so the fiber was never added to the effect list in the normal path. We
      // could have appended it to the effect list in the Suspense component's
      // second pass, but doing it this way is less complicated. This would be
      // simpler if we got rid of the effect list and traversed the tree, like
      // we're planning to do.
      const primaryChildParent: Fiber = (finishedWork.child: any);
      hideOrUnhideAllChildren(primaryChildParent, true);
    }
  }

}

function commitSuspenseHydrationCallbacks(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
) {
  if (!supportsHydration) {
    return;
  }
  const newState: SuspenseState | null = finishedWork.memoizedState;
  if (newState === null) {
    const current = finishedWork.alternate;
    if (current !== null) {
      const prevState: SuspenseState | null = current.memoizedState;
      if (prevState !== null) {
        const suspenseInstance = prevState.dehydrated;
        if (suspenseInstance !== null) {
          commitHydratedSuspenseInstance(suspenseInstance);
        }
      }
    }
  }
}

function attachSuspenseRetryListeners(finishedWork: Fiber) {
  // If this boundary just timed out, then it will have a set of wakeables.
  // For each wakeable, attach a listener so that when it resolves, React
  // attempts to re-render the boundary in the primary (pre-timeout) state.
  const wakeables: Set<Wakeable> | null = (finishedWork.updateQueue: any);
  if (wakeables !== null) {
    finishedWork.updateQueue = null;
    let retryCache = finishedWork.stateNode;
    if (retryCache === null) {
      retryCache = finishedWork.stateNode = new PossiblyWeakSet();
    }
    wakeables.forEach(wakeable => {
      // Memoize using the boundary fiber to prevent redundant listeners.
      let retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
      if (!retryCache.has(wakeable)) {
        if (enableSchedulerTracing) {
          if (wakeable.__reactDoNotTraceInteractions !== true) {
            retry = Schedule_tracing_wrap(retry);
          }
        }
        retryCache.add(wakeable);
        wakeable.then(retry, retry);
      }
    });
  }
}

// This function detects when a Suspense boundary goes from visible to hidden.
// It returns false if the boundary is already hidden.
// TODO: Use an effect tag.
export function isSuspenseBoundaryBeingHidden(
  current: Fiber | null,
  finishedWork: Fiber,
): boolean {
  if (current !== null) {
    const oldState: SuspenseState | null = current.memoizedState;
    if (oldState === null || oldState.dehydrated !== null) {
      const newState: SuspenseState | null = finishedWork.memoizedState;
      return newState !== null && newState.dehydrated === null;
    }
  }
  return false;
}

function commitResetTextContent(current: Fiber): void {
  if (!supportsMutation) {
    return;
  }
  resetTextContent(current.stateNode);
}
/** 清除useEffect的副作用 */
function commitPassiveUnmount(finishedWork: Fiber): void {
  enableLog && console.log('commitPassiveUnmount start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitPassiveUnmount')) debugger
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
    case Block: {
      commitHookEffectListUnmount(
        HookPassive | HookHasEffect,
        finishedWork,
        finishedWork.return,
      );
      break;
    }
  }
  enableLog && console.log('commitPassiveUnmount end')
}

function commitPassiveUnmountInsideDeletedTree(
  current: Fiber,
  nearestMountedAncestor: Fiber | null,
): void {
  enableLog && console.log('commitPassiveUnmountInsideDeletedTree start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitPassiveUnmountInsideDeletedTree')) debugger
  switch (current.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
    case Block: {
      commitHookEffectListUnmount(
        HookPassive,
        current,
        nearestMountedAncestor,
      );
      break;
    }
  }
  enableLog && console.log('commitPassiveUnmountInsideDeletedTree end')
}

function commitPassiveMount(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
): void {
  enableLog && console.log('commitPassiveMount start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('commitPassiveMount')) debugger
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
    case Block: {
        commitHookEffectListMount(HookPassive | HookHasEffect, finishedWork);
      break;
    }
    case Profiler: {
      break;
    }
  }
  enableLog && console.log('commitPassiveMount end')
}

export {
  commitBeforeMutationLifeCycles,
  commitResetTextContent,
  commitPlacement,
  commitDeletion,
  commitWork,
  commitAttachRef,
  commitDetachRef,
  commitPassiveUnmount,
  commitPassiveUnmountInsideDeletedTree,
  commitPassiveMount,
  recursivelyCommitLayoutEffects,
};
