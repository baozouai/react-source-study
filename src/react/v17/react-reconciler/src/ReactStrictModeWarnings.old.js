/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';


type FiberArray = Array<Fiber>;

const ReactStrictModeWarnings = {
  recordUnsafeLifecycleWarnings(fiber: Fiber, instance: any): void {},
  flushPendingUnsafeLifecycleWarnings(): void {},
  recordLegacyContextWarning(fiber: Fiber, instance: any): void {},
  flushLegacyContextWarning(): void {},
  discardPendingWarnings(): void {},
};


export default ReactStrictModeWarnings;
