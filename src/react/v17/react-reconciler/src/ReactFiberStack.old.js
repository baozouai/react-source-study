/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';

export type StackCursor<T> = {|current: T|};

const valueStack: Array<any> = [];



let index = -1;

function createCursor<T>(defaultValue: T): StackCursor<T> {
  return {
    current: defaultValue,
  };
}

function isEmpty(): boolean {
  return index === -1;
}

function pop<T>(cursor: StackCursor<T>, fiber: Fiber): void {

  cursor.current = valueStack[index];

  valueStack[index] = null;

  index--;
}

function push<T>(cursor: StackCursor<T>, value: T, fiber: Fiber): void {
  index++;
  /*
  * [ { theme: 'red' }, false ]
  *
  * [ emptyContext, contextValue ]
  *
  * */
  valueStack[index] = cursor.current;

  cursor.current = value;
}

export {
  createCursor,
  isEmpty,
  pop,
  push,
};
