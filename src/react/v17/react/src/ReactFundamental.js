/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @flow
 */

import type {
  ReactFundamentalImpl,
  ReactFundamentalComponent,
} from 'shared/ReactTypes';
import {REACT_FUNDAMENTAL_TYPE} from 'shared/ReactSymbols';


export function createFundamental<C, H>(
  impl: ReactFundamentalImpl<C, H>,
): ReactFundamentalComponent<C, H> {
  // We use responder as a Map key later on. When we have a bad
  // polyfill, then we can't use it as a key as the polyfill tries
  // to add a property to the object.

  const fundamentalComponent = {
    $$typeof: REACT_FUNDAMENTAL_TYPE,
    impl,
  };

  return fundamentalComponent;
}
