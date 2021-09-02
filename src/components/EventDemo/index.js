import React, { useState } from 'react'
import './index.css'
function EventDemo () {
  const [count, setCount] = useState(0)

  const onDemoClick = e => {

    setCount(state => state + 1)
  }
  const onParentClick = (e) => {
    console.log('父级元素的点击事件被触发了');
  }
  const onParentClickCapture = (e) => {
    console.log('父级元素捕获到点击事件');
  }
  const onSubCounterClick = (e) => {
    console.log('子元素点击事件');
  }


    return (<div
        className={'counter-parent'}
        onClick={onParentClick}
        onClickCapture={onParentClickCapture}
    >
      counter-parent
      <div
          onClick={onDemoClick}
          className={'counter'}
      >
        counter：{count}
        <div className={'sub-counter'} onClick={onSubCounterClick}>
          子组件
        </div>
      </div>
    </div>)
  }


export default EventDemo
