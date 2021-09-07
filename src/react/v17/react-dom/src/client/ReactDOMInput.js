/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// TODO: direct imports like some-package/src/* are bad. Fix me.
import invariant from 'shared/invariant';

import {setValueForProperty} from './DOMPropertyOperations';
import {getFiberCurrentPropsFromNode} from './ReactDOMComponentTree';
import {getToStringValue, toString} from './ToStringValue';
import {updateValueIfChanged} from './inputValueTracking';
import getActiveElement from './getActiveElement';

import type {ToStringValue} from './ToStringValue';

type InputWithWrapperState = HTMLInputElement & {
  _wrapperState: {
    initialValue: ToStringValue,
    initialChecked: ?boolean,
    controlled?: boolean,
    ...
  },
  ...
};


function isControlled(props) {
  const usesChecked = props.type === 'checkbox' || props.type === 'radio';
  return usesChecked ? props.checked != null : props.value != null;
}

/**
 * Implements an <input> host component that allows setting these optional
 * props: `checked`, `value`, `defaultChecked`, and `defaultValue`.
 *
 * If `checked` or `value` are not supplied (or null/undefined), user actions
 * that affect the checked state or value will trigger updates to the element.
 *
 * If they are supplied (and not null/undefined), the rendered element will not
 * trigger updates to the element. Instead, the props must change in order for
 * the rendered element to be updated.
 *
 * The rendered element will be initialized as unchecked (or `defaultChecked`)
 * with an empty value (or `defaultValue`).
 *
 * See http://www.w3.org/TR/2012/WD-html5-20121025/the-input-element.html
 */

export function getHostProps(element: Element, props: Object) {
  const node = ((element: any): InputWithWrapperState);
  const checked = props.checked;

  const hostProps = Object.assign({}, props, {
    defaultChecked: undefined,
    defaultValue: undefined,
    value: undefined,
    checked: checked != null ? checked : node._wrapperState.initialChecked,
  });

  return hostProps;
}

export function initWrapperState(element: Element, props: Object) {

  const node = ((element: any): InputWithWrapperState);
  const defaultValue = props.defaultValue == null ? '' : props.defaultValue;

  node._wrapperState = {
    initialChecked:
      props.checked != null ? props.checked : props.defaultChecked,
    initialValue: getToStringValue(
      props.value != null ? props.value : defaultValue,
    ),
    controlled: isControlled(props),
  };
}

export function updateChecked(element: Element, props: Object) {
  const node = ((element: any): InputWithWrapperState);
  const checked = props.checked;
  if (checked != null) {
    setValueForProperty(node, 'checked', checked, false);
  }
}

export function updateWrapper(element: Element, props: Object) {
  const node = ((element: any): InputWithWrapperState);

  updateChecked(element, props);

  const value = getToStringValue(props.value);
  const type = props.type;

  if (value != null) {
    if (type === 'number') {
      if (
        (value === 0 && node.value === '') ||
        // We explicitly want to coerce to number here if possible.
        // eslint-disable-next-line
        node.value != (value: any)
      ) {
        node.value = toString((value: any));
      }
    } else if (node.value !== toString((value: any))) {
      node.value = toString((value: any));
    }
  } else if (type === 'submit' || type === 'reset') {
    // Submit/reset inputs need the attribute removed completely to avoid
    // blank-text buttons.
    node.removeAttribute('value');
    return;
  }

  // When syncing the value attribute, the value comes from a cascade of
  // properties:
  //  1. The value React property
  //  2. The defaultValue React property
  //  3. Otherwise there should be no change
  if (props.hasOwnProperty('value')) {
    setDefaultValue(node, props.type, value);
  } else if (props.hasOwnProperty('defaultValue')) {
    setDefaultValue(node, props.type, getToStringValue(props.defaultValue));
  }
  // When syncing the checked attribute, it only changes when it needs
  // to be removed, such as transitioning from a checkbox into a text input
  if (props.checked == null && props.defaultChecked != null) {
    node.defaultChecked = !!props.defaultChecked;
  }
}

export function postMountWrapper(
  element: Element,
  props: Object,
  isHydrating: boolean,
) {
  const node = ((element: any): InputWithWrapperState);

  // Do not assign value if it is already set. This prevents user text input
  // from being lost during SSR hydration.
  if (props.hasOwnProperty('value') || props.hasOwnProperty('defaultValue')) {
    const type = props.type;
    const isButton = type === 'submit' || type === 'reset';

    // Avoid setting value attribute on submit/reset inputs as it overrides the
    // default value provided by the browser. See: #12872
    if (isButton && (props.value === undefined || props.value === null)) {
      return;
    }

    const initialValue = toString(node._wrapperState.initialValue);

    // Do not assign value if it is already set. This prevents user text input
    // from being lost during SSR hydration.
    if (!isHydrating) {
      // When syncing the value attribute, the value property should use
      // the wrapperState._initialValue property. This uses:
      //
      //   1. The value React property when present
      //   2. The defaultValue React property when present
      //   3. An empty string
      if (initialValue !== node.value) {
        node.value = initialValue;
      }
    }

    // Otherwise, the value attribute is synchronized to the property,
    // so we assign defaultValue to the same thing as the value property
    // assignment step above.
    node.defaultValue = initialValue;
  }

  // Normally, we'd just do `node.checked = node.checked` upon initial mount, less this bug
  // this is needed to work around a chrome bug where setting defaultChecked
  // will sometimes influence the value of checked (even after detachment).
  // Reference: https://bugs.chromium.org/p/chromium/issues/detail?id=608416
  // We need to temporarily unset name to avoid disrupting radio button groups.
  const name = node.name;
  if (name !== '') {
    node.name = '';
  }

  // When syncing the checked attribute, both the checked property and
  // attribute are assigned at the same time using defaultChecked. This uses:
  //
  //   1. The checked React property when present
  //   2. The defaultChecked React property when present
  //   3. Otherwise, false
  node.defaultChecked = !node.defaultChecked;
  node.defaultChecked = !!node._wrapperState.initialChecked;

  if (name !== '') {
    node.name = name;
  }
}

export function restoreControlledState(element: Element, props: Object) {
  const node = ((element: any): InputWithWrapperState);
  updateWrapper(node, props);
  updateNamedCousins(node, props);
}

function updateNamedCousins(rootNode, props) {
  const name = props.name;
  if (props.type === 'radio' && name != null) {
    let queryRoot: Element = rootNode;

    while (queryRoot.parentNode) {
      queryRoot = ((queryRoot.parentNode: any): Element);
    }

    // If `rootNode.form` was non-null, then we could try `form.elements`,
    // but that sometimes behaves strangely in IE8. We could also try using
    // `form.getElementsByName`, but that will only return direct children
    // and won't include inputs that use the HTML5 `form=` attribute. Since
    // the input might not even be in a form. It might not even be in the
    // document. Let's just use the local `querySelectorAll` to ensure we don't
    // miss anything.
    const group = queryRoot.querySelectorAll(
      'input[name=' + JSON.stringify('' + name) + '][type="radio"]',
    );

    for (let i = 0; i < group.length; i++) {
      const otherNode = ((group[i]: any): HTMLInputElement);
      if (otherNode === rootNode || otherNode.form !== rootNode.form) {
        continue;
      }
      // This will throw if radio buttons rendered by different copies of React
      // and the same name are rendered into the same form (same as #1939).
      // That's probably okay; we don't support it just as we don't support
      // mixing React radio buttons with non-React ones.
      const otherProps = getFiberCurrentPropsFromNode(otherNode);
      invariant(
        otherProps,
        'ReactDOMInput: Mixing React and non-React radio inputs with the ' +
          'same `name` is not supported.',
      );

      // We need update the tracked value on the named cousin since the value
      // was changed but the input saw no event or value set
      updateValueIfChanged(otherNode);

      // If this is a controlled radio button group, forcing the input that
      // was previously checked to update will cause it to be come re-checked
      // as appropriate.
      updateWrapper(otherNode, otherProps);
    }
  }
}

// In Chrome, assigning defaultValue to certain input types triggers input validation.
// For number inputs, the display value loses trailing decimal points. For email inputs,
// Chrome raises "The specified value <x> is not a valid email address".
//
// Here we check to see if the defaultValue has actually changed, avoiding these problems
// when the user is inputting text
//
// https://github.com/facebook/react/issues/7253
export function setDefaultValue(
  node: InputWithWrapperState,
  type: ?string,
  value: *,
) {
  if (
    // Focused number inputs synchronize on blur. See ChangeEventPlugin.js
    type !== 'number' ||
    getActiveElement(node.ownerDocument) !== node
  ) {
    if (value == null) {
      node.defaultValue = toString(node._wrapperState.initialValue);
    } else if (node.defaultValue !== toString(value)) {
      node.defaultValue = toString(value);
    }
  }
}
