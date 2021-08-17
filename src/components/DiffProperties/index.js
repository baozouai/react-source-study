import React, { useState } from 'react'
function DiffProperties() {
  const [state, setState] = useState(0)
  let props = {
    onClick: () => setState(state => state + 1)
  }

  const oddProps = {
    style: { color: 'red', fontSize: 18 },
    className: 'odd'
  }

  const evenProps = {
    style: { color: 'blue', fontSize: 18, display: 'inline-block' },
    className: 'even'
  }

  props = {
    ...props,
    ...(state % 2 === 0 ? evenProps: oddProps)
  }
  return (<p {...props}>{state}</p>)
}
export default DiffProperties