/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane';
import type {FiberRoot} from './ReactInternalTypes';
import type {
  Instance,
  Type,
  Props,
  Container,
} from './ReactFiberHostConfig';
import type {
  SuspenseState,
  SuspenseListRenderState,
} from './ReactFiberSuspenseComponent.new';
import type {SuspenseContext} from './ReactFiberSuspenseContext.new';
import type {OffscreenState} from './ReactFiberOffscreenComponent';

import {resetWorkInProgressVersions as resetMutableSourceWorkInProgressVersions} from './ReactMutableSource.new';

import {now} from './SchedulerWithReactIntegration.new';

import {
  IndeterminateComponent,
  FunctionComponent,
  ClassComponent,
  HostRoot,
  HostComponent,
  HostText,
  HostPortal,
  ContextProvider,
  ContextConsumer,
  ForwardRef,
  Fragment,
  Mode,
  Profiler,
  SuspenseComponent,
  SuspenseListComponent,
  MemoComponent,
  SimpleMemoComponent,
  LazyComponent,
  IncompleteClassComponent,
  FundamentalComponent,
  ScopeComponent,
  Block,
  OffscreenComponent,
  LegacyHiddenComponent,
} from './ReactWorkTags';
import {
  NoMode,
  BlockingMode,
  ConcurrentMode,
  ProfileMode,
} from './ReactTypeOfMode';
import {
  Ref,
  Update,
  Callback,
  Passive,
  Deletion,
  NoFlags,
  DidCapture,
  Snapshot,
  MutationMask,
  LayoutMask,
  PassiveMask,
  StaticMask,
  PerformedWork,
} from './ReactFiberFlags';
import invariant from 'shared/invariant';

import {
  createInstance,
  createTextInstance,
  appendInitialChild,
  finalizeInitialChildren,
  prepareUpdate,
  preparePortalMount,
} from './ReactFiberHostConfig';
import {
  getRootHostContainer,
  popHostContext,
  getHostContext,
  popHostContainer,
} from './ReactFiberHostContext.new';
import {
  suspenseStackCursor,
  InvisibleParentSuspenseContext,
  hasSuspenseContext,
  popSuspenseContext,
  pushSuspenseContext,
  setShallowSuspenseContext,
  ForceSuspenseFallback,
  setDefaultShallowSuspenseContext,
} from './ReactFiberSuspenseContext.new';
import {findFirstSuspended} from './ReactFiberSuspenseComponent.new';
import {
  isContextProvider as isLegacyContextProvider,
  popContext as popLegacyContext,
  popTopLevelContextObject as popTopLevelLegacyContextObject,
} from './ReactFiberContext.new';
import {popProvider} from './ReactFiberNewContext.new';
import {
  prepareToHydrateHostInstance,
  prepareToHydrateHostTextInstance,
  prepareToHydrateHostSuspenseInstance,
  popHydrationState,
  resetHydrationState,
  getIsHydrating,
} from './ReactFiberHydrationContext.new';
import {
  enableSchedulerTracing,
  enableSuspenseServerRenderer,
  enableBlocksAPI,
  enableProfilerTimer,
  enableLog
} from 'shared/ReactFeatureFlags';
import {
  markSpawnedWork,
  renderDidSuspend,
  renderDidSuspendDelayIfPossible,
  renderHasNotSuspendedYet,
  popRenderLanes,
  getRenderTargetTime,
  subtreeRenderLanes,
} from './ReactFiberWorkLoop.new';

import {
  OffscreenLane,
  SomeRetryLane,
  NoLanes,
  includesSomeLane,
  mergeLanes,
} from './ReactFiberLane';
import {resetChildFibers} from './ReactChildFiber.new';

import {transferActualDuration} from './ReactProfilerTimer.new';

function markUpdate(workInProgress: Fiber) {
  // Tag the fiber with an update effect. This turns a Placement into
  // a PlacementAndUpdate.
  workInProgress.flags |= Update;
}

function markRef(workInProgress: Fiber) {
  workInProgress.flags |= Ref;
}

  // Mutation mode

const appendAllChildren = function(
  parent: Instance,
  workInProgress: Fiber,
  needsVisibilityToggle: boolean,
  isHidden: boolean,
) {
  // We only have the top Fiber that was created but we need recurse down its
  // children to find all the terminal nodes.
  
  enableLog && console.log('appendAllChildren')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('appendAllChildren')) debugger

  let node = workInProgress.child;
  while (node !== null) {
    // 是dom的fiber直接取stateNode来appendChild
    if (node.tag === HostComponent || node.tag === HostText) {
      appendInitialChild(parent, node.stateNode);
    } else if (node.tag === HostPortal) {
      // If we have a portal child, then we don't want to traverse
      // down its children. Instead, we'll get insertions from each child in
      // the portal directly.
    } else if (node.child !== null) {
      // 到了这里不是HostComponent || HostText，那么进一步到child
      node.child.return = node;
      node = node.child;
      continue;
    }
    if (node === workInProgress) {
      // 节点回溯到父节点，意味着处理完，return掉
      return;
    }
    while (node.sibling === null) {
      // node.sibling === null：没有兄弟节点，或者兄弟节点处理完
      if (node.return === null || node.return === workInProgress) {
        // node.return === null：到了rootFiber
        // node.return === workInProgress：到了parent fiber
        // 那么处理完了，跳出
        return;
      }
      // 否则回溯到parentFiber
      node = node.return;
    }
    // 处理兄弟节点
    node.sibling.return = node.return;
    node = node.sibling;
  }
};

const updateHostContainer = function(current: null | Fiber, workInProgress: Fiber) {
  // Noop
};
const updateHostComponent = function(
  current: Fiber,
  workInProgress: Fiber,
  type: Type,
  newProps: Props,
  rootContainerInstance: Container,
) {
  
  enableLog && console.log('updateHostComponent start')
if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('updateHostComponent')) debugger
  // If we have an alternate, that means this is an update and we need to
  // schedule a side-effect to do the updates.
  const oldProps = current.memoizedProps;
  if (oldProps === newProps) {
    // In mutation mode, this is sufficient for a bailout because
    // we won't touch this node even if children changed.
    return;
  }

  // If we get updated because one of our children updated, we don't
  // have newProps so we'll have to reuse them.
  // TODO: Split the update API as separate for the props vs. children.
  // Even better would be if children weren't special cased at all tho.
  const instance: Instance = workInProgress.stateNode;
  const currentHostContext = getHostContext();
  // TODO: Experiencing an error where oldProps is null. Suggests a host
  // component is hitting the resume path. Figure out why. Possibly
  // related to `hidden`.
  // update的props，但是被处理成数量为成对的数组
  // 偶数索引(0、2...)为对应update的prop key
  // 奇数索引(1、3...)为对应update的prop value
  // 实际是在prepareUpdate中调用了diffProperties生成的
  const updatePayload = prepareUpdate(
    instance,
    type,
    oldProps,
    newProps,
    rootContainerInstance,
    currentHostContext,
  );
  // TODO: Type this specific to this type of component.
  workInProgress.updateQueue = updatePayload;
  // If the update payload indicates that there is a change or if there
  // is a new ref we mark this as an update. All the work is done in commitWork.
  if (updatePayload) {
    markUpdate(workInProgress);
  }
};
const updateHostText = function(
  current: Fiber,
  workInProgress: Fiber,
  oldText: string,
  newText: string,
) {
  // If the text differs, mark it as an update. All the work in done in commitWork.
  if (oldText !== newText) {
    markUpdate(workInProgress);
  }
};


function cutOffTailIfNeeded(
  renderState: SuspenseListRenderState,
  hasRenderedATailFallback: boolean,
) {
  if (getIsHydrating()) {
    // If we're hydrating, we should consume as many items as we can
    // so we don't leave any behind.
    return;
  }
  switch (renderState.tailMode) {
    case 'hidden': {
      // Any insertions at the end of the tail list after this point
      // should be invisible. If there are already mounted boundaries
      // anything before them are not considered for collapsing.
      // Therefore we need to go through the whole tail to find if
      // there are any.
      let tailNode = renderState.tail;
      let lastTailNode = null;
      while (tailNode !== null) {
        if (tailNode.alternate !== null) {
          lastTailNode = tailNode;
        }
        tailNode = tailNode.sibling;
      }
      // Next we're simply going to delete all insertions after the
      // last rendered item.
      if (lastTailNode === null) {
        // All remaining items in the tail are insertions.
        renderState.tail = null;
      } else {
        // Detach the insertion after the last node that was already
        // inserted.
        lastTailNode.sibling = null;
      }
      break;
    }
    case 'collapsed': {
      // Any insertions at the end of the tail list after this point
      // should be invisible. If there are already mounted boundaries
      // anything before them are not considered for collapsing.
      // Therefore we need to go through the whole tail to find if
      // there are any.
      let tailNode = renderState.tail;
      let lastTailNode = null;
      while (tailNode !== null) {
        if (tailNode.alternate !== null) {
          lastTailNode = tailNode;
        }
        tailNode = tailNode.sibling;
      }
      // Next we're simply going to delete all insertions after the
      // last rendered item.
      if (lastTailNode === null) {
        // All remaining items in the tail are insertions.
        if (!hasRenderedATailFallback && renderState.tail !== null) {
          // We suspended during the head. We want to show at least one
          // row at the tail. So we'll keep on and cut off the rest.
          renderState.tail.sibling = null;
        } else {
          renderState.tail = null;
        }
      } else {
        // Detach the insertion after the last node that was already
        // inserted.
        lastTailNode.sibling = null;
      }
      break;
    }
  }
}

function bubbleProperties(completedWork: Fiber) {

  enableLog && console.log('bubbleProperties')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('bubbleProperties')) debugger

  const didBailout =
    completedWork.alternate !== null &&
    completedWork.alternate.child === completedWork.child;
    
  let newChildLanes = NoLanes;
  let subtreeFlags = NoFlags;
  if (!didBailout) {
    // Bubble up the earliest expiration time.
    if (enableProfilerTimer && (completedWork.mode & ProfileMode) !== NoMode) {
      // In profiling mode, resetChildExpirationTime is also used to reset
      // profiler durations.
      let actualDuration = completedWork.actualDuration;
      let treeBaseDuration = ((completedWork.selfBaseDuration: any): number);

      let child = completedWork.child;
      while (child !== null) {
        // 这里收集所有的child的Lanes
        newChildLanes = mergeLanes(
          newChildLanes,
          mergeLanes(child.lanes, child.childLanes),
        );

        subtreeFlags |= child.subtreeFlags;
        subtreeFlags |= child.flags;

        // When a fiber is cloned, its actualDuration is reset to 0. This value will
        // only be updated if work is done on the fiber (i.e. it doesn't bailout).
        // When work is done, it should bubble to the parent's actualDuration. If
        // the fiber has not been cloned though, (meaning no work was done), then
        // this value will reflect the amount of time spent working on a previous
        // render. In that case it should not bubble. We determine whether it was
        // cloned by comparing the child pointer.
        actualDuration += child.actualDuration;

        treeBaseDuration += child.treeBaseDuration;
        child = child.sibling;
      }

      completedWork.actualDuration = actualDuration;
      completedWork.treeBaseDuration = treeBaseDuration;
    } else {
      // 循环子节点和兄弟节点，收集lanes
      let child = completedWork.child;
      while (child !== null) {
        newChildLanes = mergeLanes(
          newChildLanes,
          mergeLanes(child.lanes, child.childLanes),
        );

        subtreeFlags |= child.subtreeFlags;
        subtreeFlags |= child.flags;

        child = child.sibling;
      }
    }

    completedWork.subtreeFlags |= subtreeFlags;
  } else {
    // Bubble up the earliest expiration time.
    if (enableProfilerTimer && (completedWork.mode & ProfileMode) !== NoMode) {
      // In profiling mode, resetChildExpirationTime is also used to reset
      // profiler durations.
      let treeBaseDuration = ((completedWork.selfBaseDuration: any): number);

      let child = completedWork.child;
      while (child !== null) {
        newChildLanes = mergeLanes(
          newChildLanes,
          mergeLanes(child.lanes, child.childLanes),
        );

        // "Static" flags share the lifetime of the fiber/hook they belong to,
        // so we should bubble those up even during a bailout. All the other
        // flags have a lifetime only of a single render + commit, so we should
        // ignore them.
        subtreeFlags |= child.subtreeFlags & StaticMask;
        subtreeFlags |= child.flags & StaticMask;

        treeBaseDuration += child.treeBaseDuration;
        child = child.sibling;
      }

      completedWork.treeBaseDuration = treeBaseDuration;
    } else {
      let child = completedWork.child;
      while (child !== null) {
        newChildLanes = mergeLanes(
          newChildLanes,
          mergeLanes(child.lanes, child.childLanes),
        );

        // "Static" flags share the lifetime of the fiber/hook they belong to,
        // so we should bubble those up even during a bailout. All the other
        // flags have a lifetime only of a single render + commit, so we should
        // ignore them.
        subtreeFlags |= child.subtreeFlags & StaticMask;
        subtreeFlags |= child.flags & StaticMask;

        child = child.sibling;
      }
    }

    completedWork.subtreeFlags |= subtreeFlags;
  }
  // 将收集到的lanes放到该fiber节点的childLanes中
  completedWork.childLanes = newChildLanes;

  return didBailout;
}

function completeWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {

  enableLog && console.log('completeWork start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('completeWork')) debugger

  const newProps = workInProgress.pendingProps;

  switch (workInProgress.tag) {
    case IndeterminateComponent: // 2
    case LazyComponent: // 16
    case SimpleMemoComponent: // 15
    case FunctionComponent: // 0
    case ForwardRef: // 11
    case Fragment: // 7
    case Mode: // 8
    case ContextConsumer: // 9
    case MemoComponent: // 14
      bubbleProperties(workInProgress);
      return null;
    case ClassComponent: {
      const Component = workInProgress.type;
      if (isLegacyContextProvider(Component)) {
        popLegacyContext(workInProgress);
      }
      bubbleProperties(workInProgress);
      return null;
    }
    case HostRoot: {
      popHostContainer(workInProgress);
      popTopLevelLegacyContextObject(workInProgress);
      resetMutableSourceWorkInProgressVersions();
      // fiberRoot即root
      const fiberRoot = (workInProgress.stateNode: FiberRoot);
      if (fiberRoot.pendingContext) {
        fiberRoot.context = fiberRoot.pendingContext;
        fiberRoot.pendingContext = null;
      }
      if (current === null || current.child === null) {
        // If we hydrated, pop so that we can delete any remaining children
        // that weren't hydrated.
        const wasHydrated = popHydrationState(workInProgress);
        if (wasHydrated) {
          // If we hydrated, then we'll need to schedule an update for
          // the commit side-effects on the root.
          markUpdate(workInProgress);
        } else if (!fiberRoot.hydrate) {
          // Schedule an effect to clear this container at the start of the next commit.
          // This handles the case of React rendering into a container with previous children.
          // It's also safe to do for updates too, because current.child would only be null
          // if the previous render was null (so the the container would already be empty).
          workInProgress.flags |= Snapshot;
        }
      }
      updateHostContainer(current, workInProgress);
      bubbleProperties(workInProgress);
      return null;
    }
    case HostComponent: {
      // HostComponent：原生dom
      popHostContext(workInProgress);
      // 获取根节点，如div#root
      const rootContainerInstance = getRootHostContainer();
      const type = workInProgress.type;
      if (current !== null && workInProgress.stateNode != null) {
        // 上面条件满足即意味着是update阶段
        updateHostComponent(
          current,
          workInProgress,
          type,
          newProps,
          rootContainerInstance,
        );

        if (current.ref !== workInProgress.ref) {
          markRef(workInProgress);
        }
      } else {
        // 否则是mount阶段
        if (!newProps) {
          invariant(
            workInProgress.stateNode !== null,
            'We must have new props for new mounts. This error is likely ' +
              'caused by a bug in React. Please file an issue.',
          );
          // This can happen when we abort work.
          bubbleProperties(workInProgress);
          return null;
        }

        const currentHostContext = getHostContext();
        // TODO: Move createInstance to beginWork and keep it on a context
        // "stack" as the parent. Then append children as we go in beginWork
        // or completeWork depending on whether we want to add them top->down or
        // bottom->up. Top->down is faster in IE11.
        const wasHydrated = popHydrationState(workInProgress);
        if (wasHydrated) {
          // TODO: Move this and createInstance step into the beginPhase
          // to consolidate.
          if (
            prepareToHydrateHostInstance(
              workInProgress,
              rootContainerInstance,
              currentHostContext,
            )
          ) {
            // If changes to the hydrated node need to be applied at the
            // commit-phase we mark this as such.
            markUpdate(workInProgress);
          }
        } else {
          // mount阶段创建fiber对应的dom
          const instance = createInstance(
            type,
            newProps,
            rootContainerInstance,
            currentHostContext,
            workInProgress,
          );
          // 将子孙节点插入上面生成的 instance父节点
          appendAllChildren(instance, workInProgress, false, false);

          workInProgress.stateNode = instance;

          // Certain renderers require commit-time effects for initial mount.
          // (eg DOM renderer supports auto-focus for certain elements).
          // Make sure such renderers get scheduled for later work.
          /**
           * 1.finalizeInitialChildren中调用了setInitialProperties
           * setInitialProperties中调用了setInitialDOMProperties
           * 来为instance dom加上初始的props
           * 2.并最终返回了shouldAutoFocusHostComponent(type, props):
           * 如果 type为['button','input','select','textarea']其中一个
           * 返回!!props.autoFocus来判断，如果type不是上面四个类型之一,返回false
           */
          if (
            finalizeInitialChildren(
              instance,
              type,
              newProps,
              rootContainerInstance,
              currentHostContext,
            )
          ) {
            markUpdate(workInProgress);
          }
        }

        if (workInProgress.ref !== null) {
          // 打上ref的flag
          // If there is a ref on a host node we need to schedule a callback
          markRef(workInProgress);
        }
      }
      bubbleProperties(workInProgress);
      return null;
    }
    case HostText: {
      const newText = newProps;
      if (current && workInProgress.stateNode != null) {
        const oldText = current.memoizedProps;
        // If we have an alternate, that means this is an update and we need
        // to schedule a side-effect to do the updates.
        updateHostText(current, workInProgress, oldText, newText);
      } else {
        if (typeof newText !== 'string') {
          invariant(
            workInProgress.stateNode !== null,
            'We must have new props for new mounts. This error is likely ' +
              'caused by a bug in React. Please file an issue.',
          );
          // This can happen when we abort work.
        }
        const rootContainerInstance = getRootHostContainer();
        const currentHostContext = getHostContext();
        const wasHydrated = popHydrationState(workInProgress);
        if (wasHydrated) {
          if (prepareToHydrateHostTextInstance(workInProgress)) {
            markUpdate(workInProgress);
          }
        } else {
          workInProgress.stateNode = createTextInstance(
            newText,
            rootContainerInstance,
            currentHostContext,
            workInProgress,
          );
        }
      }
      bubbleProperties(workInProgress);
      return null;
    }
    case Profiler: {
      const didBailout = bubbleProperties(workInProgress);
      if (!didBailout) {
        // Use subtreeFlags to determine which commit callbacks should fire.
        // TODO: Move this logic to the commit phase, since we already check if
        // a fiber's subtree contains effects. Refactor the commit phase's
        // depth-first traversal so that we can put work tag-specific logic
        // before or after committing a subtree's effects.
        const OnRenderFlag = Update;
        const OnCommitFlag = Callback;
        const OnPostCommitFlag = Passive;
        const subtreeFlags = workInProgress.subtreeFlags;
        const flags = workInProgress.flags;
        let newFlags = flags;

        // Call onRender any time this fiber or its subtree are worked on.
        if (
          (flags & PerformedWork) !== NoFlags ||
          (subtreeFlags & PerformedWork) !== NoFlags
        ) {
          newFlags |= OnRenderFlag;
        }

        // Call onCommit only if the subtree contains layout work, or if it
        // contains deletions, since those might result in unmount work, which
        // we include in the same measure.
        // TODO: Can optimize by using a static flag to track whether a tree
        // contains layout effects, like we do for passive effects.
        if (
          (flags & (LayoutMask | Deletion)) !== NoFlags ||
          (subtreeFlags & (LayoutMask | Deletion)) !== NoFlags
        ) {
          newFlags |= OnCommitFlag;
        }

        // Call onPostCommit only if the subtree contains passive work.
        // Don't have to check for deletions, because Deletion is already
        // a passive flag.
        if (
          (flags & PassiveMask) !== NoFlags ||
          (subtreeFlags & PassiveMask) !== NoFlags
        ) {
          newFlags |= OnPostCommitFlag;
        }
        workInProgress.flags = newFlags;
      } else {
        // This fiber and its subtree bailed out, so don't fire any callbacks.
      }

      return null;
    }
    case SuspenseComponent: {
      popSuspenseContext(workInProgress);
      const nextState: null | SuspenseState = workInProgress.memoizedState;

      if (enableSuspenseServerRenderer) {
        if (nextState !== null && nextState.dehydrated !== null) {
          if (current === null) {
            const wasHydrated = popHydrationState(workInProgress);
            invariant(
              wasHydrated,
              'A dehydrated suspense component was completed without a hydrated node. ' +
                'This is probably a bug in React.',
            );
            prepareToHydrateHostSuspenseInstance(workInProgress);
            if (enableSchedulerTracing) {
              markSpawnedWork(OffscreenLane);
            }
            bubbleProperties(workInProgress);
            if (enableProfilerTimer) {
              if ((workInProgress.mode & ProfileMode) !== NoMode) {
                const isTimedOutSuspense = nextState !== null;
                if (isTimedOutSuspense) {
                  // Don't count time spent in a timed out Suspense subtree as part of the base duration.
                  const primaryChildFragment = workInProgress.child;
                  if (primaryChildFragment !== null) {
                    // $FlowFixMe Flow doens't support type casting in combiation with the -= operator
                    workInProgress.treeBaseDuration -= ((primaryChildFragment.treeBaseDuration: any): number);
                  }
                }
              }
            }
            return null;
          } else {
            // We should never have been in a hydration state if we didn't have a current.
            // However, in some of those paths, we might have reentered a hydration state
            // and then we might be inside a hydration state. In that case, we'll need to exit out of it.
            resetHydrationState();
            if ((workInProgress.flags & DidCapture) === NoFlags) {
              // This boundary did not suspend so it's now hydrated and unsuspended.
              workInProgress.memoizedState = null;
            }
            // If nothing suspended, we need to schedule an effect to mark this boundary
            // as having hydrated so events know that they're free to be invoked.
            // It's also a signal to replay events and the suspense callback.
            // If something suspended, schedule an effect to attach retry listeners.
            // So we might as well always mark this.
            workInProgress.flags |= Update;
            bubbleProperties(workInProgress);
            if (enableProfilerTimer) {
              if ((workInProgress.mode & ProfileMode) !== NoMode) {
                const isTimedOutSuspense = nextState !== null;
                if (isTimedOutSuspense) {
                  // Don't count time spent in a timed out Suspense subtree as part of the base duration.
                  const primaryChildFragment = workInProgress.child;
                  if (primaryChildFragment !== null) {
                    // $FlowFixMe Flow doens't support type casting in combiation with the -= operator
                    workInProgress.treeBaseDuration -= ((primaryChildFragment.treeBaseDuration: any): number);
                  }
                }
              }
            }
            return null;
          }
        }
      }

      if ((workInProgress.flags & DidCapture) !== NoFlags) {
        // Something suspended. Re-render with the fallback children.
        workInProgress.lanes = renderLanes;
        // Do not reset the effect list.
        if (
          enableProfilerTimer &&
          (workInProgress.mode & ProfileMode) !== NoMode
        ) {
          transferActualDuration(workInProgress);
        }
        // Don't bubble properties in this case.
        return workInProgress;
      }

      const nextDidTimeout = nextState !== null;
      let prevDidTimeout = false;
      if (current === null) {
        if (workInProgress.memoizedProps.fallback !== undefined) {
          popHydrationState(workInProgress);
        }
      } else {
        const prevState: null | SuspenseState = current.memoizedState;
        prevDidTimeout = prevState !== null;
      }

      if (nextDidTimeout && !prevDidTimeout) {
        // If this subtreee is running in blocking mode we can suspend,
        // otherwise we won't suspend.
        // TODO: This will still suspend a synchronous tree if anything
        // in the concurrent tree already suspended during this render.
        // This is a known bug.
        if ((workInProgress.mode & BlockingMode) !== NoMode) {
          // TODO: Move this back to throwException because this is too late
          // if this is a large tree which is common for initial loads. We
          // don't know if we should restart a render or not until we get
          // this marker, and this is too late.
          // If this render already had a ping or lower pri updates,
          // and this is the first time we know we're going to suspend we
          // should be able to immediately restart from within throwException.
          const hasInvisibleChildContext =
            current === null &&
            workInProgress.memoizedProps.unstable_avoidThisFallback !== true;
          if (
            hasInvisibleChildContext ||
            hasSuspenseContext(
              suspenseStackCursor.current,
              (InvisibleParentSuspenseContext: SuspenseContext),
            )
          ) {
            // If this was in an invisible tree or a new render, then showing
            // this boundary is ok.
            renderDidSuspend();
          } else {
            // Otherwise, we're going to have to hide content so we should
            // suspend for longer if possible.
            renderDidSuspendDelayIfPossible();
          }
        }
      }


        // TODO: Only schedule updates if these values are non equal, i.e. it changed.
      if (nextDidTimeout || prevDidTimeout) {
        // If this boundary just timed out, schedule an effect to attach a
        // retry listener to the promise. This flag is also used to hide the
        // primary children. In mutation mode, we also need the flag to
        // *unhide* children that were previously hidden, so check if this
        // is currently timed out, too.
        workInProgress.flags |= Update;
      }

      bubbleProperties(workInProgress);
      if (enableProfilerTimer) {
        if ((workInProgress.mode & ProfileMode) !== NoMode) {
          if (nextDidTimeout) {
            // Don't count time spent in a timed out Suspense subtree as part of the base duration.
            const primaryChildFragment = workInProgress.child;
            if (primaryChildFragment !== null) {
              // $FlowFixMe Flow doens't support type casting in combiation with the -= operator
              workInProgress.treeBaseDuration -= ((primaryChildFragment.treeBaseDuration: any): number);
            }
          }
        }
      }
      return null;
    }
    case HostPortal:
      popHostContainer(workInProgress);
      updateHostContainer(current, workInProgress);
      if (current === null) {
        preparePortalMount(workInProgress.stateNode.containerInfo);
      }
      bubbleProperties(workInProgress);
      return null;
    case ContextProvider:
      // Pop provider fiber
      popProvider(workInProgress);
      bubbleProperties(workInProgress);
      return null;
    case IncompleteClassComponent: {
      // Same as class component case. I put it down here so that the tags are
      // sequential to ensure this switch is compiled to a jump table.
      const Component = workInProgress.type;
      if (isLegacyContextProvider(Component)) {
        popLegacyContext(workInProgress);
      }
      bubbleProperties(workInProgress);
      return null;
    }
    case SuspenseListComponent: {
      popSuspenseContext(workInProgress);

      const renderState: null | SuspenseListRenderState =
        workInProgress.memoizedState;

      if (renderState === null) {
        // We're running in the default, "independent" mode.
        // We don't do anything in this mode.
        bubbleProperties(workInProgress);
        return null;
      }

      let didSuspendAlready = (workInProgress.flags & DidCapture) !== NoFlags;

      const renderedTail = renderState.rendering;
      if (renderedTail === null) {
        // We just rendered the head.
        if (!didSuspendAlready) {
          // This is the first pass. We need to figure out if anything is still
          // suspended in the rendered set.

          // If new content unsuspended, but there's still some content that
          // didn't. Then we need to do a second pass that forces everything
          // to keep showing their fallbacks.

          // We might be suspended if something in this render pass suspended, or
          // something in the previous committed pass suspended. Otherwise,
          // there's no chance so we can skip the expensive call to
          // findFirstSuspended.
          const cannotBeSuspended =
            renderHasNotSuspendedYet() &&
            (current === null || (current.flags & DidCapture) === NoFlags);
          if (!cannotBeSuspended) {
            let row = workInProgress.child;
            while (row !== null) {
              const suspended = findFirstSuspended(row);
              if (suspended !== null) {
                didSuspendAlready = true;
                workInProgress.flags |= DidCapture;
                cutOffTailIfNeeded(renderState, false);

                // If this is a newly suspended tree, it might not get committed as
                // part of the second pass. In that case nothing will subscribe to
                // its thennables. Instead, we'll transfer its thennables to the
                // SuspenseList so that it can retry if they resolve.
                // There might be multiple of these in the list but since we're
                // going to wait for all of them anyway, it doesn't really matter
                // which ones gets to ping. In theory we could get clever and keep
                // track of how many dependencies remain but it gets tricky because
                // in the meantime, we can add/remove/change items and dependencies.
                // We might bail out of the loop before finding any but that
                // doesn't matter since that means that the other boundaries that
                // we did find already has their listeners attached.
                const newThennables = suspended.updateQueue;
                if (newThennables !== null) {
                  workInProgress.updateQueue = newThennables;
                  workInProgress.flags |= Update;
                }

                // Rerender the whole list, but this time, we'll force fallbacks
                // to stay in place.
                // Reset the child fibers to their original state.
                workInProgress.subtreeFlags = NoFlags;
                resetChildFibers(workInProgress, renderLanes);

                // Set up the Suspense Context to force suspense and immediately
                // rerender the children.
                pushSuspenseContext(
                  workInProgress,
                  setShallowSuspenseContext(
                    suspenseStackCursor.current,
                    ForceSuspenseFallback,
                  ),
                );
                // Don't bubble properties in this case.
                return workInProgress.child;
              }
              row = row.sibling;
            }
          }

          if (renderState.tail !== null && now() > getRenderTargetTime()) {
            // We have already passed our CPU deadline but we still have rows
            // left in the tail. We'll just give up further attempts to render
            // the main content and only render fallbacks.
            workInProgress.flags |= DidCapture;
            didSuspendAlready = true;

            cutOffTailIfNeeded(renderState, false);

            // Since nothing actually suspended, there will nothing to ping this
            // to get it started back up to attempt the next item. While in terms
            // of priority this work has the same priority as this current render,
            // it's not part of the same transition once the transition has
            // committed. If it's sync, we still want to yield so that it can be
            // painted. Conceptually, this is really the same as pinging.
            // We can use any RetryLane even if it's the one currently rendering
            // since we're leaving it behind on this node.
            workInProgress.lanes = SomeRetryLane;
            if (enableSchedulerTracing) {
              markSpawnedWork(SomeRetryLane);
            }
          }
        } else {
          cutOffTailIfNeeded(renderState, false);
        }
        // Next we're going to render the tail.
      } else {
        // Append the rendered row to the child list.
        if (!didSuspendAlready) {
          const suspended = findFirstSuspended(renderedTail);
          if (suspended !== null) {
            workInProgress.flags |= DidCapture;
            didSuspendAlready = true;

            // Ensure we transfer the update queue to the parent so that it doesn't
            // get lost if this row ends up dropped during a second pass.
            const newThennables = suspended.updateQueue;
            if (newThennables !== null) {
              workInProgress.updateQueue = newThennables;
              workInProgress.flags |= Update;
            }

            cutOffTailIfNeeded(renderState, true);
            // This might have been modified.
            if (
              renderState.tail === null &&
              renderState.tailMode === 'hidden' &&
              !renderedTail.alternate &&
              !getIsHydrating() // We don't cut it if we're hydrating.
            ) {
              // We're done.
              bubbleProperties(workInProgress);
              return null;
            }
          } else if (
            // The time it took to render last row is greater than the remaining
            // time we have to render. So rendering one more row would likely
            // exceed it.
            now() * 2 - renderState.renderingStartTime >
              getRenderTargetTime() &&
            renderLanes !== OffscreenLane
          ) {
            // We have now passed our CPU deadline and we'll just give up further
            // attempts to render the main content and only render fallbacks.
            // The assumption is that this is usually faster.
            workInProgress.flags |= DidCapture;
            didSuspendAlready = true;

            cutOffTailIfNeeded(renderState, false);

            // Since nothing actually suspended, there will nothing to ping this
            // to get it started back up to attempt the next item. If we can show
            // them, then they really have the same priority as this render.
            // So we'll pick it back up the very next render pass once we've had
            // an opportunity to yield for paint.
            workInProgress.lanes = SomeRetryLane;
            if (enableSchedulerTracing) {
              markSpawnedWork(SomeRetryLane);
            }
          }
        }
        if (renderState.isBackwards) {
          // The effect list of the backwards tail will have been added
          // to the end. This breaks the guarantee that life-cycles fire in
          // sibling order but that isn't a strong guarantee promised by React.
          // Especially since these might also just pop in during future commits.
          // Append to the beginning of the list.
          renderedTail.sibling = workInProgress.child;
          workInProgress.child = renderedTail;
        } else {
          const previousSibling = renderState.last;
          if (previousSibling !== null) {
            previousSibling.sibling = renderedTail;
          } else {
            workInProgress.child = renderedTail;
          }
          renderState.last = renderedTail;
        }
      }

      if (renderState.tail !== null) {
        // We still have tail rows to render.
        // Pop a row.
        const next = renderState.tail;
        renderState.rendering = next;
        renderState.tail = next.sibling;
        renderState.renderingStartTime = now();
        next.sibling = null;

        // Restore the context.
        // TODO: We can probably just avoid popping it instead and only
        // setting it the first time we go from not suspended to suspended.
        let suspenseContext = suspenseStackCursor.current;
        if (didSuspendAlready) {
          suspenseContext = setShallowSuspenseContext(
            suspenseContext,
            ForceSuspenseFallback,
          );
        } else {
          suspenseContext = setDefaultShallowSuspenseContext(suspenseContext);
        }
        pushSuspenseContext(workInProgress, suspenseContext);
        // Do a pass over the next row.
        // Don't bubble properties in this case.
        return next;
      }
      bubbleProperties(workInProgress);
      return null;
    }
    case FundamentalComponent: {
      break;
    }
    case ScopeComponent: {
      break;
    }
    case Block:
      if (enableBlocksAPI) {
        bubbleProperties(workInProgress);
        return null;
      }
      break;
    case OffscreenComponent:
    case LegacyHiddenComponent: {
      popRenderLanes(workInProgress);
      const nextState: OffscreenState | null = workInProgress.memoizedState;
      const nextIsHidden = nextState !== null;

      if (current !== null) {
        const prevState: OffscreenState | null = current.memoizedState;

        const prevIsHidden = prevState !== null;
        if (
          prevIsHidden !== nextIsHidden &&
          newProps.mode !== 'unstable-defer-without-hiding'
        ) {
          workInProgress.flags |= Update;
        }
      }

      // Don't bubble properties for hidden children.
      if (
        !nextIsHidden ||
        includesSomeLane(subtreeRenderLanes, (OffscreenLane: Lane)) ||
        (workInProgress.mode & ConcurrentMode) === NoMode
      ) {
        bubbleProperties(workInProgress);
      }

      return null;
    }
  }
  invariant(
    false,
    'Unknown unit of work tag (%s). This error is likely caused by a bug in ' +
      'React. Please file an issue.',
    workInProgress.tag,
  );
}

export {completeWork};
