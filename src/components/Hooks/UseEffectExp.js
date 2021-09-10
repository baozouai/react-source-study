import React, { useEffect, useState, useLayoutEffect } from 'react'

const UseEffectExp = () => {
    debugger
  const [ text, setText ] = useState(0)
  if (!text) {
    /**
     * 在render的时候setState是为了验证在updateWorkInProgressHook中的
     * if (nextWorkInProgressHook !== null) 分支
     */
    //   setText(text => text + 1)
  }
    useEffect(() => {
        console.log('effect1')
        return () => {
            console.log('destory1');
        }
    }, [text])
    // useLayoutEffect(() => {
    //     console.log('effect2')
    //     return () => {
    //         console.log('destory2');
    //     }
    // }, [])
    return <button onClick={() => {
            debugger
            setText(text => text + 1)
        }}>{text}</button>

}

export default UseEffectExp
