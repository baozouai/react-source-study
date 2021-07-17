/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';
import type {CapturedValue} from './ReactCapturedValue';

import {showErrorDialog} from './ReactFiberErrorDialog';


export function logCapturedError(
  boundary: Fiber,
  errorInfo: CapturedValue<mixed>,
): void {
  try {
    const logError = showErrorDialog(boundary, errorInfo);

    // Allow injected showErrorDialog() to prevent default console.error logging.
    // This enables renderers like ReactNative to better manage redbox behavior.
    if (logError === false) {
      return;
    }

    const error = (errorInfo.value: any);

      // In production, we print the error directly.
      // This will include the message, the JS stack, and anything the browser wants to show.
      // We pass the error object instead of custom message so that the browser displays the error natively.
      console['error'](error); // Don't transform to our wrapper

  } catch (e) {
    // This method must not throw, or React internal state will get messed up.
    // If console.error is overridden, or logCapturedError() shows a dialog that throws,
    // we want to report this error outside of the normal stack as a last resort.
    // https://github.com/facebook/react/issues/13188
    setTimeout(() => {
      throw e;
    });
  }
}
