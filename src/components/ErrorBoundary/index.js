import React, { useState, useEffect, Component } from 'react';

function useCount({ initCount = 0, gap = 1, add = true } = {}) {
  const [count, setCount] = useState(initCount)
  gap = add ? gap : -gap
  const addCount = () => {
    setCount(count => count + gap)
  };

  return [count, addCount]
}
class ErrorBoundary extends Component {
  state = { error: null }

  componentDidCatch(error) {
    this.setState({ error })
    console.log('捕获到错误', error, errorInfo)
  }
  // static getDerivedStateFromError(error: Error) {
  //   return { error }
  // }
  render() {
    if (this.state.error) {
      return <div>我是备用ui</div>
    }

    return this.props.children
  }
}


function Child({count}) {
  useEffect(() => {
    return () => {
      console.log('useEffect destroy');
      console.log(xxx);
    }
  }, [count]);
  return <div>child</div>;
}
export default function App() {
  const [hide, setHide] = useState(false)
  const [count, addCount] = useCount()
  return (
    <ErrorBoundary>
      <div><button onClick={addCount}>点击+1</button></div>
      <div><button onClick={() => setHide(true)}>点击卸载Child</button></div>
      {!hide && <Child count={count}/>}
    </ErrorBoundary>
  );
}
