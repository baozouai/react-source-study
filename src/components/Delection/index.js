import React, { useState, useEffect, useLayoutEffect } from 'react'

function Delection() {
  const [state, setState] = useState(0)
    function onClick() {
      setState(state => state + 1)
    }
  if (state % 2 === 0) return <Child1 onClick={onClick}/>
  return <Child2 />
}

function Child1({onClick}) {
  useEffect(() => {
    return () => console.log('useEffect unmount')
  }, [])
  useLayoutEffect(() => {
    return () => console.log('useLayoutEffect unmount')
  }, [])
  return <div onClick={onClick}>
    <h1>child1</h1>
    <Child11 />
  </div>
}
function Child11() {
  useEffect(() => {
    return () => console.log('Child11 useEffect unmount')
  }, [])
  useLayoutEffect(() => {
    return () => console.log('Child11 useLayoutEffect unmount')
  }, [])
  return <div>
    child11
  </div>
}
function Child2({onClick}) {
  return <div onClick={onClick}>
    <h1>child2</h1>
  </div>
}
export default Delection