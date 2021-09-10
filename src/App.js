import React, { useState, useRef, useEffect } from 'react'
import State from './components/State'

import FunctionSetState from './components/FunctionSetState'
import LanesDemo from './components/LanesDemo'
import AppSibling from './components/AppSibling'
import TasksWithDifferentPriorities from './components/TasksWithDifferentPriorities'
import SchedulerTask from './components/SchedulerTask'
import Concurrent from './components/ConcurrentInput'
import Diff from './components/Diff'
import PropsDiff from './components/PropsDiff'
import DiffProperties from './components/DiffProperties'
import Hooks from "./components/Hooks";
import EventDemo from "./components/EventDemo";
import ContextDemo from "./components/Context";
import Delection from "./components/Delection";
import './App.css';

// propsDiff
/*class App extends React.Component {
  render() {
    return <PropsDiff/>
  }
}*/
function App() {
  // 在this.setState里面又setState
  // return <FunctionSetState />
  // 事件系统
  // return <EventDemo/>

  return <PropsDiff/>
  // fiber树
  // return (
  //   <div className="App">
  //     <span className={'app-span'} onClick={() => setCount(count + 1)}>App{count}</span>
  //     <AppSibling count={count}/>
  //   </div>
  // );

  // Scheduler调度任务与用户交互
  // return <SchedulerTask/>

  // 高优先级插队
  // return <TasksWithDifferentPriorities/>

  // context
  // return <ContextDemo/>

  // diff 算法
  // return <Diff ref={'diffRef'}/>
  return <Diff />

}

export default Hooks;
