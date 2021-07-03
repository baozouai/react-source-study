/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

declare var $$$hostConfig: any;

export type BundlerConfig = mixed; // eslint-disable-line no-undef
export type ModuleReference<T> = mixed; // eslint-disable-line no-undef
export type ModuleMetaData: any = mixed; // eslint-disable-line no-undef
export const resolveModuleMetaData = $$$hostConfig.resolveModuleMetaData;
