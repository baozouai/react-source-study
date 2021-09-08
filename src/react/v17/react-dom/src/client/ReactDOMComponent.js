/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {
  registrationNameDependencies,
} from '../events/EventRegistry';



import {
  setValueForProperty,
} from './DOMPropertyOperations';
import {
  initWrapperState as ReactDOMInputInitWrapperState,
  getHostProps as ReactDOMInputGetHostProps,
  postMountWrapper as ReactDOMInputPostMountWrapper,
  updateChecked as ReactDOMInputUpdateChecked,
  updateWrapper as ReactDOMInputUpdateWrapper,
  restoreControlledState as ReactDOMInputRestoreControlledState,
} from './ReactDOMInput';
import {
  getHostProps as ReactDOMOptionGetHostProps,
  postMountWrapper as ReactDOMOptionPostMountWrapper,
  validateProps as ReactDOMOptionValidateProps,
} from './ReactDOMOption';
import {
  initWrapperState as ReactDOMSelectInitWrapperState,
  getHostProps as ReactDOMSelectGetHostProps,
  postMountWrapper as ReactDOMSelectPostMountWrapper,
  restoreControlledState as ReactDOMSelectRestoreControlledState,
  postUpdateWrapper as ReactDOMSelectPostUpdateWrapper,
} from './ReactDOMSelect';
import {
  initWrapperState as ReactDOMTextareaInitWrapperState,
  getHostProps as ReactDOMTextareaGetHostProps,
  postMountWrapper as ReactDOMTextareaPostMountWrapper,
  updateWrapper as ReactDOMTextareaUpdateWrapper,
  restoreControlledState as ReactDOMTextareaRestoreControlledState,
} from './ReactDOMTextarea';
import {track} from './inputValueTracking';
import setInnerHTML from './setInnerHTML';
import setTextContent from './setTextContent';
import {
  setValueForStyles,
} from '../shared/CSSPropertyOperations';
import {Namespaces, getIntrinsicNamespace} from '../shared/DOMNamespaces';

import assertValidProps from '../shared/assertValidProps';
import {
  DOCUMENT_NODE,
  COMMENT_NODE,
} from '../shared/HTMLNodeType';
import isCustomComponent from '../shared/isCustomComponent';
import {REACT_OPAQUE_ID_TYPE} from 'shared/ReactSymbols';

import {
  mediaEventTypes,
  listenToNonDelegatedEvent,
} from '../events/DOMPluginEventSystem';
import { enableLog } from 'shared/ReactFeatureFlags';

const DANGEROUSLY_SET_INNER_HTML = 'dangerouslySetInnerHTML';
const SUPPRESS_CONTENT_EDITABLE_WARNING = 'suppressContentEditableWarning';
const SUPPRESS_HYDRATION_WARNING = 'suppressHydrationWarning';
const AUTOFOCUS = 'autoFocus';
const CHILDREN = 'children';
const STYLE = 'style';
const HTML = '__html';

const {html: HTML_NAMESPACE} = Namespaces;


function getOwnerDocumentFromRootContainer(
  rootContainerElement: Element | Document,
): Document {
  return rootContainerElement.nodeType === DOCUMENT_NODE
    ? (rootContainerElement: any)
    : rootContainerElement.ownerDocument;
}

function noop() {}
/**
 * safari移动端如果不给dom节点加onclick，那么不会触发冒泡
 */
export function trapClickOnNonInteractiveElement(node: HTMLElement) {
  // Mobile Safari does not fire properly bubble click events on
  // non-interactive elements, which means delegated click listeners do not
  // fire. The workaround for this bug involves attaching an empty click
  // listener on the target node.
  // https://www.quirksmode.org/blog/archives/2010/09/click_event_del.html
  // Just set it using the onclick property so that we don't have to manage any
  // bookkeeping for it. Not sure if we need to clear it when the listener is
  // removed.
  // TODO: Only do this for the relevant Safaris maybe?
  node.onclick = noop;
}

function setInitialDOMProperties(
  tag: string,
  domElement: Element,
  rootContainerElement: Element | Document,
  nextProps: Object,
  isCustomComponentTag: boolean,
): void {
  
  enableLog && console.log('setInitialDOMProperties start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('setInitialDOMProperties')) debugger
  
  for (const propKey in nextProps) {
    if (!nextProps.hasOwnProperty(propKey)) {
      // 如果是原型链上的属性，则跳过
      continue;
    }
    const nextProp = nextProps[propKey];
    if (propKey === STYLE) {
      // 设置style
      // Relies on `updateStylesByID` not mutating `styleUpdates`.
      setValueForStyles(domElement, nextProp);
    } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
      const nextHtml = nextProp ? nextProp[HTML] : undefined;
      if (nextHtml != null) {
        setInnerHTML(domElement, nextHtml);
      }
    } else if (propKey === CHILDREN) {
      if (typeof nextProp === 'string') {
        // Avoid setting initial textContent when the text is empty. In IE11 setting
        // textContent on a <textarea> will cause the placeholder to not
        // show within the <textarea> until it has been focused and blurred again.
        // https://github.com/facebook/react/issues/6731#issuecomment-254874553
        const canSetTextContent = tag !== 'textarea' || nextProp !== '';
        if (canSetTextContent) {
          setTextContent(domElement, nextProp);
        }
      } else if (typeof nextProp === 'number') {
        setTextContent(domElement, '' + nextProp);
      }
    } else if (
      propKey === SUPPRESS_CONTENT_EDITABLE_WARNING ||
      propKey === SUPPRESS_HYDRATION_WARNING
    ) {
      // Noop
    } else if (propKey === AUTOFOCUS) {
      // We polyfill it separately on the client during commit.
      // We could have excluded it in the property list instead of
      // adding a special case here, but then it wouldn't be emitted
      // on server rendering (but we *do* want to emit it in SSR).
    } else if (registrationNameDependencies.hasOwnProperty(propKey)) {
      // 设置监听事件
      if (nextProp != null) {

        if (propKey === 'onScroll') {
          listenToNonDelegatedEvent('scroll', domElement);
        }
      }
    } else if (nextProp != null) {
      setValueForProperty(domElement, propKey, nextProp, isCustomComponentTag);
    }
  }
}

function updateDOMProperties(
  domElement: Element,
  updatePayload: Array<any>,
  wasCustomComponentTag: boolean,
  isCustomComponentTag: boolean,
): void {
  // TODO: Handle wasCustomComponentTag
  for (let i = 0; i < updatePayload.length; i += 2) {
    const propKey = updatePayload[i];
    const propValue = updatePayload[i + 1];
    if (propKey === STYLE) {
      setValueForStyles(domElement, propValue);
    } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
      setInnerHTML(domElement, propValue);
    } else if (propKey === CHILDREN) {
      setTextContent(domElement, propValue);
    } else {
      setValueForProperty(domElement, propKey, propValue, isCustomComponentTag);
    }
  }
}

export function createElement(
  type: string,
  props: Object,
  rootContainerElement: Element | Document,
  parentNamespace: string,
): Element {
  let isCustomComponentTag;

  enableLog && console.log('ReactDomComponent: createElement')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('createElement')) debugger
  
  // We create tags in the namespace of their parent container, except HTML
  // tags get no namespace.
  // 这里一般是document
  const ownerDocument: Document = getOwnerDocumentFromRootContainer(
    rootContainerElement,
  );
  let domElement: Element;
  let namespaceURI = parentNamespace;
  if (namespaceURI === HTML_NAMESPACE) {
    namespaceURI = getIntrinsicNamespace(type);
  }
  if (namespaceURI === HTML_NAMESPACE) {

    if (type === 'script') {
      // Create the script via .innerHTML so its "parser-inserted" flag is
      // set to true and it does not execute
      const div = ownerDocument.createElement('div');
      div.innerHTML = '<script><' + '/script>'; // eslint-disable-line
      // This is guaranteed to yield a script element.
      const firstChild = ((div.firstChild: any): HTMLScriptElement);
      domElement = div.removeChild(firstChild);
    } else if (typeof props.is === 'string') {
      // $FlowIssue `createElement` should be updated for Web Components
      domElement = ownerDocument.createElement(type, {is: props.is});
    } else {
      // Separate else branch instead of using `props.is || undefined` above because of a Firefox bug.
      // See discussion in https://github.com/facebook/react/pull/6896
      // and discussion in https://bugzilla.mozilla.org/show_bug.cgi?id=1276240
      domElement = ownerDocument.createElement(type);
      // Normally attributes are assigned in `setInitialDOMProperties`, however the `multiple` and `size`
      // attributes on `select`s needs to be added before `option`s are inserted.
      // This prevents:
      // - a bug where the `select` does not scroll to the correct option because singular
      //  `select` elements automatically pick the first item #13222
      // - a bug where the `select` set the first item as selected despite the `size` attribute #14239
      // See https://github.com/facebook/react/issues/13222
      // and https://github.com/facebook/react/issues/14239
      // 处理select
      if (type === 'select') {
        const node = ((domElement: any): HTMLSelectElement);
        if (props.multiple) {
          node.multiple = true;
        } else if (props.size) {
          // Setting a size greater than 1 causes a select to behave like `multiple=true`, where
          // it is possible that no option is selected.
          //
          // This is only necessary when a select in "single selection mode".
          node.size = props.size;
        }
      }
    }
  } else {
    domElement = ownerDocument.createElementNS(namespaceURI, type);
  }

  return domElement;
}

export function createTextNode(
  text: string,
  rootContainerElement: Element | Document,
): Text {
  return getOwnerDocumentFromRootContainer(rootContainerElement).createTextNode(
    text,
  );
}

export function setInitialProperties(
  domElement: Element,
  tag: string,
  rawProps: Object,
  rootContainerElement: Element | Document,
): void {
  // 判断是否是自定义标签，如tag=x-foo
  const isCustomComponentTag = isCustomComponent(tag, rawProps);

  // TODO: Make sure that we check isMounted before firing any of these events.
  let props: Object;
  switch (tag) {
    case 'dialog':
      listenToNonDelegatedEvent('cancel', domElement);
      listenToNonDelegatedEvent('close', domElement);
      props = rawProps;
      break;
    case 'iframe':
    case 'object':
    case 'embed':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the load event.
      listenToNonDelegatedEvent('load', domElement);
      props = rawProps;
      break;
    case 'video':
    case 'audio':
      // We listen to these events in case to ensure emulated bubble
      // listeners still fire for all the media events.
      for (let i = 0; i < mediaEventTypes.length; i++) {
        listenToNonDelegatedEvent(mediaEventTypes[i], domElement);
      }
      props = rawProps;
      break;
    case 'source':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the error event.
      listenToNonDelegatedEvent('error', domElement);
      props = rawProps;
      break;
    case 'img':
    case 'image':
    case 'link':
      // We listen to these events in case to ensure emulated bubble
      // listeners still fire for error and load events.
      listenToNonDelegatedEvent('error', domElement);
      listenToNonDelegatedEvent('load', domElement);
      props = rawProps;
      break;
    case 'details':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the toggle event.
      listenToNonDelegatedEvent('toggle', domElement);
      props = rawProps;
      break;
    case 'input':
      ReactDOMInputInitWrapperState(domElement, rawProps);
      props = ReactDOMInputGetHostProps(domElement, rawProps);
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the invalid event.
      listenToNonDelegatedEvent('invalid', domElement);
      break;
    case 'option':
      ReactDOMOptionValidateProps(domElement, rawProps);
      props = ReactDOMOptionGetHostProps(domElement, rawProps);
      break;
    case 'select':
      ReactDOMSelectInitWrapperState(domElement, rawProps);
      props = ReactDOMSelectGetHostProps(domElement, rawProps);
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the invalid event.
      listenToNonDelegatedEvent('invalid', domElement);
      break;
    case 'textarea':
      ReactDOMTextareaInitWrapperState(domElement, rawProps);
      props = ReactDOMTextareaGetHostProps(domElement, rawProps);
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the invalid event.
      listenToNonDelegatedEvent('invalid', domElement);
      break;
    default:
      props = rawProps;
  }

  assertValidProps(tag, props);
  // 这里才是真正设置dom的props
  setInitialDOMProperties(
    tag,
    domElement,
    rootContainerElement,
    props,
    isCustomComponentTag,
  );

  switch (tag) {
    case 'input':
      // TODO: Make sure we check if this is still unmounted or do any clean
      // up necessary since we never stop tracking anymore.
      track((domElement: any));
      ReactDOMInputPostMountWrapper(domElement, rawProps, false);
      break;
    case 'textarea':
      // TODO: Make sure we check if this is still unmounted or do any clean
      // up necessary since we never stop tracking anymore.
      track((domElement: any));
      ReactDOMTextareaPostMountWrapper(domElement, rawProps);
      break;
    case 'option':
      ReactDOMOptionPostMountWrapper(domElement, rawProps);
      break;
    case 'select':
      ReactDOMSelectPostMountWrapper(domElement, rawProps);
      break;
    default:
      if (typeof props.onClick === 'function') {
        // TODO: This cast may not be sound for SVG, MathML or custom elements.
        trapClickOnNonInteractiveElement(((domElement: any): HTMLElement));
      }
      break;
  }
}

// Calculate the diff between the two objects.
export function diffProperties(
  domElement: Element,
  tag: string,
  lastRawProps: Object,
  nextRawProps: Object,
  rootContainerElement: Element | Document,
): null | Array<mixed> {

  enableLog && console.log('diffProperties start')
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('diffProperties')) debugger
  // updatePayload为[key1, value1, key2, value2,...]
  let updatePayload: null | Array<any> = null;

  let lastProps: Object;
  let nextProps: Object;
  switch (tag) {
    case 'input':
      lastProps = ReactDOMInputGetHostProps(domElement, lastRawProps);
      nextProps = ReactDOMInputGetHostProps(domElement, nextRawProps);
      updatePayload = [];
      break;
    case 'option':
      lastProps = ReactDOMOptionGetHostProps(domElement, lastRawProps);
      nextProps = ReactDOMOptionGetHostProps(domElement, nextRawProps);
      updatePayload = [];
      break;
    case 'select':
      lastProps = ReactDOMSelectGetHostProps(domElement, lastRawProps);
      nextProps = ReactDOMSelectGetHostProps(domElement, nextRawProps);
      updatePayload = [];
      break;
    case 'textarea':
      lastProps = ReactDOMTextareaGetHostProps(domElement, lastRawProps);
      nextProps = ReactDOMTextareaGetHostProps(domElement, nextRawProps);
      updatePayload = [];
      break;
    default:
      lastProps = lastRawProps;
      nextProps = nextRawProps;
      if (
        typeof lastProps.onClick !== 'function' &&
        typeof nextProps.onClick === 'function'
      ) {
        // TODO: This cast may not be sound for SVG, MathML or custom elements.
        trapClickOnNonInteractiveElement(((domElement: any): HTMLElement));
      }
      break;
  }

  assertValidProps(tag, nextProps);

  let propKey;
  let styleName;
  let styleUpdates = null;
  for (propKey in lastProps) {
    // 循环lastProps，找出需要标记删除的propKey
    if (
      nextProps.hasOwnProperty(propKey) ||
      !lastProps.hasOwnProperty(propKey) ||
      lastProps[propKey] == null
    ) {
      // 如果nextProps有，或lastProps没有，则跳过，不需要标记为删除
      continue;
    }
    /**
     * 到了这里，说明propKey满足了条件：
     * !nextProps.hasOwnProperty(propKey) && lastProps[propKey] != null
     * 即新的props没有，老的props有，则要删除
     */
    if (propKey === STYLE) {
      // 对应style
      const lastStyle = lastProps[propKey];
      for (styleName in lastStyle) {
        if (lastStyle.hasOwnProperty(styleName)) {
          if (!styleUpdates) {
            styleUpdates = {};
          }
          styleUpdates[styleName] = '';
        }
      }
    } else if (propKey === DANGEROUSLY_SET_INNER_HTML || propKey === CHILDREN) {
      // Noop. This is handled by the clear text mechanism.
    } else if (
      propKey === SUPPRESS_CONTENT_EDITABLE_WARNING ||
      propKey === SUPPRESS_HYDRATION_WARNING
    ) {
      // Noop
    } else if (propKey === AUTOFOCUS) {
      // Noop. It doesn't work on updates anyway.
    } else if (registrationNameDependencies.hasOwnProperty(propKey)) {
      // 监听函数
      // This is a special case. If any listener updates we need to ensure
      // that the "current" fiber pointer gets updated so we need a commit
      // to update this element.
      if (!updatePayload) {
        updatePayload = [];
      }
    } else {
      // For all other deleted properties we add it to the queue. We use
      // the allowed property list in the commit phase instead.
      (updatePayload = updatePayload || []).push(propKey, null);
    }
  }
  for (propKey in nextProps) {
    // 将新prop添加到updatePayload
    const nextProp = nextProps[propKey];
    const lastProp = lastProps != null ? lastProps[propKey] : undefined;
    if (
      !nextProps.hasOwnProperty(propKey) ||
      nextProp === lastProp ||
      (nextProp == null && lastProp == null)
    ) {
      // 如果nextProps不存在propKey，或者前后的value相同，或者前后的value都为null
      // 那么不需要添加进去，跳出本次循环继续处理下一个prop
      continue;
    }
    /**
     * 到了这里，则满足条件：
     * nextProps.hasOwnProperty(propKey) // nextProps存在propKey 
     * && nextProp !== lastProp // nextProp不等于lastProp
     * && [nextProp, lastProp].every(prop => prop == null) 两者不都为null
     */
    if (propKey === STYLE) {
      // 对应style prop来说
      if (lastProp) {
        // 如果存在旧的style prop
        // 比如：
        // lastProp：{ color": "red", fontSize: 18 }
        // nextProp：{ color: "blue" }
        // Unset styles on `lastProp` but not on `nextProp`.
        // 重置lastProp上的style
        for (styleName in lastProp) {
          if (
            lastProp.hasOwnProperty(styleName) &&
            (!nextProp || !nextProp.hasOwnProperty(styleName))
          ) {
            // 如果lastProp存在styleName，但nextProp不存在styleName，则重置styleName为空字符串
            if (!styleUpdates) {
              styleUpdates = {};
            }
            styleUpdates[styleName] = '';
          }
        }
        // 经过上面循环后，styleUpdates = {fontSize: ''}
        // Update styles that changed since `lastProp`.
        // 更新lastProp上的style
        // 经过下面循环后，styleUpdates = { color: 'blue', fontSize: ''}
        for (styleName in nextProp) {
          if (
            nextProp.hasOwnProperty(styleName) &&
            lastProp[styleName] !== nextProp[styleName]
          ) {
            // 如果nextProp存在styleName且前后styleName对应的value不等，跟下为新的value
            if (!styleUpdates) {
              styleUpdates = {};
            }
            styleUpdates[styleName] = nextProp[styleName];
          }
        }
      } else {
        // 不存在旧的style prop
        // Relies on `updateStylesByID` not mutating `styleUpdates`.
        if (!styleUpdates) {
          if (!updatePayload) {
            updatePayload = [];
          }
          updatePayload.push(propKey, styleUpdates);
        }
        styleUpdates = nextProp;
      }
    } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
      const nextHtml = nextProp ? nextProp[HTML] : undefined;
      const lastHtml = lastProp ? lastProp[HTML] : undefined;
      if (nextHtml != null) {
        if (lastHtml !== nextHtml) {
          (updatePayload = updatePayload || []).push(propKey, nextHtml);
        }
      } else {
        // TODO: It might be too late to clear this if we have children
        // inserted already.
      }
    } else if (propKey === CHILDREN) {
      if (typeof nextProp === 'string' || typeof nextProp === 'number') {
        (updatePayload = updatePayload || []).push(propKey, '' + nextProp);
      }
    } else if (
      propKey === SUPPRESS_CONTENT_EDITABLE_WARNING ||
      propKey === SUPPRESS_HYDRATION_WARNING
    ) {
      // Noop
    } else if (registrationNameDependencies.hasOwnProperty(propKey)) {
      if (nextProp != null) {
        // We eagerly listen to this even though we haven't committed yet.

        if (propKey === 'onScroll') {
          listenToNonDelegatedEvent('scroll', domElement);
        }
      }
      if (!updatePayload && lastProp !== nextProp) {
        // 事件重新绑定后，需要赋值updatePayload，使这个节点得以被更新
        // This is a special case. If any listener updates we need to ensure
        // that the "current" props pointer gets updated so we need a commit
        // to update this element.
        updatePayload = [];
      }
    } else if (
      typeof nextProp === 'object' &&
      nextProp !== null &&
      nextProp.$$typeof === REACT_OPAQUE_ID_TYPE
    ) {
      // 服务端渲染相关
      // If we encounter useOpaqueReference's opaque object, this means we are hydrating.
      // In this case, call the opaque object's toString function which generates a new client
      // ID so client and server IDs match and throws to rerender.
      nextProp.toString();
    } else {
      // For any other property we always add it to the queue and then we
      // filter it out using the allowed property list during the commit.
      (updatePayload = updatePayload || []).push(propKey, nextProp);
    }
  }
  if (styleUpdates) {

    (updatePayload = updatePayload || []).push(STYLE, styleUpdates);
  }
  enableLog && console.log('diffProperties end')
  return updatePayload;
}

// Apply the diff.
export function updateProperties(
  domElement: Element,
  updatePayload: Array<any>,
  tag: string,
  lastRawProps: Object,
  nextRawProps: Object,
): void {
  // Update checked *before* name.
  // In the middle of an update, it is possible to have multiple checked.
  // When a checked radio tries to change name, browser makes another radio's checked false.
  if (
    tag === 'input' &&
    nextRawProps.type === 'radio' &&
    nextRawProps.name != null
  ) {
    ReactDOMInputUpdateChecked(domElement, nextRawProps);
  }

  const wasCustomComponentTag = isCustomComponent(tag, lastRawProps);
  const isCustomComponentTag = isCustomComponent(tag, nextRawProps);
  // Apply the diff.
  updateDOMProperties(
    domElement,
    updatePayload,
    wasCustomComponentTag,
    isCustomComponentTag,
  );

  // TODO: Ensure that an update gets scheduled if any of the special props
  // changed.
  switch (tag) {
    case 'input':
      // Update the wrapper around inputs *after* updating props. This has to
      // happen after `updateDOMProperties`. Otherwise HTML5 input validations
      // raise warnings and prevent the new value from being assigned.
      ReactDOMInputUpdateWrapper(domElement, nextRawProps);
      break;
    case 'textarea':
      ReactDOMTextareaUpdateWrapper(domElement, nextRawProps);
      break;
    case 'select':
      // <select> value update needs to occur after <option> children
      // reconciliation
      ReactDOMSelectPostUpdateWrapper(domElement, nextRawProps);
      break;
  }
}

function getPossibleStandardName(propName: string): string | null {

  return null;
}

export function diffHydratedProperties(
  domElement: Element,
  tag: string,
  rawProps: Object,
  parentNamespace: string,
  rootContainerElement: Element | Document,
): null | Array<mixed> {
  let isCustomComponentTag;
  let extraAttributeNames: Set<string>;


  // TODO: Make sure that we check isMounted before firing any of these events.
  switch (tag) {
    case 'dialog':
      listenToNonDelegatedEvent('cancel', domElement);
      listenToNonDelegatedEvent('close', domElement);
      break;
    case 'iframe':
    case 'object':
    case 'embed':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the load event.
      listenToNonDelegatedEvent('load', domElement);
      break;
    case 'video':
    case 'audio':
      // We listen to these events in case to ensure emulated bubble
      // listeners still fire for all the media events.
      for (let i = 0; i < mediaEventTypes.length; i++) {
        listenToNonDelegatedEvent(mediaEventTypes[i], domElement);
      }
      break;
    case 'source':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the error event.
      listenToNonDelegatedEvent('error', domElement);
      break;
    case 'img':
    case 'image':
    case 'link':
      // We listen to these events in case to ensure emulated bubble
      // listeners still fire for error and load events.
      listenToNonDelegatedEvent('error', domElement);
      listenToNonDelegatedEvent('load', domElement);
      break;
    case 'details':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the toggle event.
      listenToNonDelegatedEvent('toggle', domElement);
      break;
    case 'input':
      ReactDOMInputInitWrapperState(domElement, rawProps);
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the invalid event.
      listenToNonDelegatedEvent('invalid', domElement);
      break;
    case 'option':
      ReactDOMOptionValidateProps(domElement, rawProps);
      break;
    case 'select':
      ReactDOMSelectInitWrapperState(domElement, rawProps);
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the invalid event.
      listenToNonDelegatedEvent('invalid', domElement);
      break;
    case 'textarea':
      ReactDOMTextareaInitWrapperState(domElement, rawProps);
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the invalid event.
      listenToNonDelegatedEvent('invalid', domElement);
      break;
  }

  assertValidProps(tag, rawProps);



  let updatePayload = null;
  for (const propKey in rawProps) {
    if (!rawProps.hasOwnProperty(propKey)) {
      continue;
    }
    const nextProp = rawProps[propKey];
    if (propKey === CHILDREN) {
      // For text content children we compare against textContent. This
      // might match additional HTML that is hidden when we read it using
      // textContent. E.g. "foo" will match "f<span>oo</span>" but that still
      // satisfies our requirement. Our requirement is not to produce perfect
      // HTML and attributes. Ideally we should preserve structure but it's
      // ok not to if the visible content is still enough to indicate what
      // even listeners these nodes might be wired up to.
      // TODO: Warn if there is more than a single textNode as a child.
      // TODO: Should we use domElement.firstChild.nodeValue to compare?
      if (typeof nextProp === 'string') {
        if (domElement.textContent !== nextProp) {

          updatePayload = [CHILDREN, nextProp];
        }
      } else if (typeof nextProp === 'number') {
        if (domElement.textContent !== '' + nextProp) {

          updatePayload = [CHILDREN, '' + nextProp];
        }
      }
    } else if (registrationNameDependencies.hasOwnProperty(propKey)) {
      if (nextProp != null) {

        if (propKey === 'onScroll') {
          listenToNonDelegatedEvent('scroll', domElement);
        }
      }
    }
  }


  switch (tag) {
    case 'input':
      // TODO: Make sure we check if this is still unmounted or do any clean
      // up necessary since we never stop tracking anymore.
      track((domElement: any));
      ReactDOMInputPostMountWrapper(domElement, rawProps, true);
      break;
    case 'textarea':
      // TODO: Make sure we check if this is still unmounted or do any clean
      // up necessary since we never stop tracking anymore.
      track((domElement: any));
      ReactDOMTextareaPostMountWrapper(domElement, rawProps);
      break;
    case 'select':
    case 'option':
      // For input and textarea we current always set the value property at
      // post mount to force it to diverge from attributes. However, for
      // option and select we don't quite do the same thing and select
      // is not resilient to the DOM state changing so we don't do that here.
      // TODO: Consider not doing this for input and textarea.
      break;
    default:
      if (typeof rawProps.onClick === 'function') {
        // TODO: This cast may not be sound for SVG, MathML or custom elements.
        trapClickOnNonInteractiveElement(((domElement: any): HTMLElement));
      }
      break;
  }

  return updatePayload;
}

export function diffHydratedText(textNode: Text, text: string): boolean {
  const isDifferent = textNode.nodeValue !== text;
  return isDifferent;
}

export function warnForUnmatchedText(textNode: Text, text: string) {

}

export function warnForDeletedHydratableElement(
  parentNode: Element | Document,
  child: Element,
) {

}

export function warnForDeletedHydratableText(
  parentNode: Element | Document,
  child: Text,
) {

}

export function warnForInsertedHydratedElement(
  parentNode: Element | Document,
  tag: string,
  props: Object,
) {

}

export function warnForInsertedHydratedText(
  parentNode: Element | Document,
  text: string,
) {

}

export function restoreControlledState(
  domElement: Element,
  tag: string,
  props: Object,
): void {
  switch (tag) {
    case 'input':
      ReactDOMInputRestoreControlledState(domElement, props);
      return;
    case 'textarea':
      ReactDOMTextareaRestoreControlledState(domElement, props);
      return;
    case 'select':
      ReactDOMSelectRestoreControlledState(domElement, props);
      return;
  }
}
