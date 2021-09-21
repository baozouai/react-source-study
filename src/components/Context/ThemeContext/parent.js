import React, { useState } from 'react'
import Child from './child'
import ThemeContext, { THEME_COLOR } from '../context/theme'

const { PURPLE, BLUE, RED } = THEME_COLOR

function Parent() {
  const [theme1, setTheme1] = useState(PURPLE)
  const [theme2, setTheme2] = useState(PURPLE)
  return <div className={'theme-context'}>
    <h2>新版context</h2>
    <span>主题</span>
    <div>
      theme1:
      <select
        onChange={e => {
          setTheme1(e.target.value)
        }}
      >
        <option value={PURPLE}>紫色</option>
        <option value={BLUE}>蓝色</option>
        <option value={RED}>红色</option>
      </select>
    </div>
    <div>
      theme2:
      <select
        onChange={e => {
          setTheme2(e.target.value)
        }}
      >
        <option value={PURPLE}>紫色</option>
        <option value={BLUE}>蓝色</option>
        <option value={RED}>红色</option>
      </select>
    </div>

    <ThemeContext.Provider value={theme1}>
      theme1:<Child />
      <ThemeContext.Provider value={theme2}>
        theme2:<Child />
      </ThemeContext.Provider>
    </ThemeContext.Provider>
  </div>
}

export default Parent
