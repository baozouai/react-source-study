/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';
import type {TouchedViewDataAtPoint, InspectorData} from './ReactNativeTypes';

import {
  findCurrentHostFiber,
  findCurrentFiberUsingSlowPath,
} from 'react-reconciler/src/ReactFiberTreeReflection';
import getComponentName from 'shared/getComponentName';
import {HostComponent} from 'react-reconciler/src/ReactWorkTags';
import invariant from 'shared/invariant';
// Module provided by RN:
import {UIManager} from 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface';

import {getClosestInstanceFromNode} from './ReactNativeComponentTree';

const emptyObject = {};


let getInspectorDataForViewTag;
let getInspectorDataForViewAtPoint;

  getInspectorDataForViewTag = () => {
    invariant(
      false,
      'getInspectorDataForViewTag() is not available in production',
    );
  };

  getInspectorDataForViewAtPoint = (
    findNodeHandle: (componentOrHandle: any) => ?number,
    inspectedView: Object,
    locationX: number,
    locationY: number,
    callback: (viewData: TouchedViewDataAtPoint) => mixed,
  ): void => {
    invariant(
      false,
      'getInspectorDataForViewAtPoint() is not available in production.',
    );
  };


export {getInspectorDataForViewAtPoint, getInspectorDataForViewTag};
