/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {DOMEventName} from '../events/DOMEventNames';
import type {ReactScopeInstance} from 'shared/ReactTypes';
import type {
  ReactDOMEventHandle,
  ReactDOMEventHandleListener,
} from '../shared/ReactDOMTypes';


import {
} from './ReactDOMComponentTree';
import {ELEMENT_NODE} from '../shared/HTMLNodeType';
import {listenToNativeEvent} from '../events/DOMPluginEventSystem';

import {IS_EVENT_HANDLE_NON_MANAGED_NODE} from '../events/EventSystemFlags';

import {
  enableScopeAPI,
} from 'shared/ReactFeatureFlags';
import invariant from 'shared/invariant';

type EventHandleOptions = {
  capture?: boolean,
};


function isValidEventTarget(target: EventTarget | ReactScopeInstance): boolean {
  return typeof (target: Object).addEventListener === 'function';
}

function isReactScope(target: EventTarget | ReactScopeInstance): boolean {
  return typeof (target: Object).getChildContextValues === 'function';
}

function createEventHandleListener(
  type: DOMEventName,
  isCapturePhaseListener: boolean,
  callback: (SyntheticEvent<EventTarget>) => void,
): ReactDOMEventHandleListener {
  return {
    callback,
    capture: isCapturePhaseListener,
    type,
  };
}


function registerReactDOMEvent(
  target: EventTarget | ReactScopeInstance,
  domEventName: DOMEventName,
  isCapturePhaseListener: boolean,
): void {
  // Check if the target is a DOM element.
  if ((target: any).nodeType === ELEMENT_NODE) {
  } else if (enableScopeAPI && isReactScope(target)) {
  } else if (isValidEventTarget(target)) {
    const eventTarget = ((target: any): EventTarget);
    // These are valid event targets, but they are also
    // non-managed React nodes.
    listenToNativeEvent(
      domEventName,
      isCapturePhaseListener,
      eventTarget,
      null,
      IS_EVENT_HANDLE_NON_MANAGED_NODE,
    );
  } else {
    invariant(
      false,
      'ReactDOM.createEventHandle: setter called on an invalid ' +
        'target. Provide a valid EventTarget or an element managed by React.',
    );
  }
}

export function createEventHandle(
  type: string,
  options?: EventHandleOptions,
): ReactDOMEventHandle {
  return (null: any);
}
