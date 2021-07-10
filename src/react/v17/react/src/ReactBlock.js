/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {LazyComponent} from './ReactLazy';

import {
  REACT_LAZY_TYPE,
  REACT_BLOCK_TYPE,
  REACT_MEMO_TYPE,
  REACT_FORWARD_REF_TYPE,
} from 'shared/ReactSymbols';

type BlockLoadFunction<Args: Iterable<any>, Data> = (...args: Args) => Data;
export type BlockRenderFunction<Props, Data> = (
  props: Props,
  data: Data,
) => React$Node;

type Payload<Props, Args: Iterable<any>, Data> = {
  load: BlockLoadFunction<Args, Data>,
  args: Args,
  render: BlockRenderFunction<Props, Data>,
};

export type BlockComponent<Props, Data> = {
  $$typeof: Symbol | number,
  _data: Data,
  _render: BlockRenderFunction<Props, Data>,
};

opaque type Block<Props>: React$AbstractComponent<
  Props,
  null,
> = React$AbstractComponent<Props, null>;

function lazyInitializer<Props, Args: Iterable<any>, Data>(
  payload: Payload<Props, Args, Data>,
): BlockComponent<Props, Data> {
  return {
    $$typeof: REACT_BLOCK_TYPE,
    _data: payload.load.apply(null, payload.args),
    _render: payload.render,
  };
}

export function block<Args: Iterable<any>, Props, Data>(
  render: BlockRenderFunction<Props, Data>,
  load?: BlockLoadFunction<Args, Data>,
): (...args: Args) => Block<Props> {

  if (load === undefined) {
    return function(): Block<Props> {
      const blockComponent: BlockComponent<Props, void> = {
        $$typeof: REACT_BLOCK_TYPE,
        _data: undefined,
        // $FlowFixMe: Data must be void in this scenario.
        _render: render,
      };

      // $FlowFixMe: Upstream BlockComponent to Flow as a valid Node.
      return blockComponent;
    };
  }

  // Trick to let Flow refine this.
  const loadFn = load;

  return function(): Block<Props> {
    const args: Args = arguments;

    const payload: Payload<Props, Args, Data> = {
      load: loadFn,
      args: args,
      render: render,
    };

    const lazyType: LazyComponent<
      BlockComponent<Props, Data>,
      Payload<Props, Args, Data>,
    > = {
      $$typeof: REACT_LAZY_TYPE,
      _payload: payload,
      _init: lazyInitializer,
    };

    // $FlowFixMe: Upstream BlockComponent to Flow as a valid Node.
    return lazyType;
  };
}
