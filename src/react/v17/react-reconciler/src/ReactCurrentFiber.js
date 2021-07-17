/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';


import {getStackByFiberInDevAndProd} from './ReactFiberComponentStack';



export let current: Fiber | null = null;
export let isRendering: boolean = false;

export function getCurrentFiberOwnerNameInDevOrNull(): string | null {

  return null;
}

function getCurrentFiberStackInDev(): string {

  return '';
}

export function resetCurrentFiber() {

}

export function setCurrentFiber(fiber: Fiber) {

}

export function setIsRendering(rendering: boolean) {

}

export function getIsRendering() {

}
