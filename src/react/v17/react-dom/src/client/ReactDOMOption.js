/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';
import {getToStringValue, toString} from './ToStringValue';

let didWarnSelectedSetOnOption = false;
let didWarnInvalidChild = false;

function flattenChildren(children) {
  let content = '';

  // Flatten children. We'll warn if they are invalid
  // during validateProps() which runs for hydration too.
  // Note that this would throw on non-element objects.
  // Elements are stringified (which is normally irrelevant
  // but matters for <fbt>).
  React.Children.forEach(children, function(child) {
    if (child == null) {
      return;
    }
    content += (child: any);
    // Note: we don't warn about invalid children here.
    // Instead, this is done separately below so that
    // it happens during the hydration code path too.
  });

  return content;
}

/**
 * Implements an <option> host component that warns when `selected` is set.
 */

export function validateProps(element: Element, props: Object) {

}

export function postMountWrapper(element: Element, props: Object) {
  // value="" should make a value attribute (#6219)
  if (props.value != null) {
    element.setAttribute('value', toString(getToStringValue(props.value)));
  }
}

export function getHostProps(element: Element, props: Object) {
  const hostProps = {children: undefined, ...props};
  const content = flattenChildren(props.children);

  if (content) {
    hostProps.children = content;
  }

  return hostProps;
}
