import { useState, useDefferedValue, memo, useTransition } from 'react'
/*  模拟数据  */
const mockDataArray = new Array(10000).fill(1)
/* 高量显示内容 */
function ShowText({ query }){
   const text = 'asdfghjk'
   let children
   if(text.indexOf(query) > 0 ){
       /* 找到匹配的关键词 */
       const arr = text.split(query)
       children = <div>{arr[0]}<span style={{ color:'pink' }} >{query}</span>{arr[1]} </div>
   }else{
      children = <div>{text}</div>
   }
   return <div>{children}</div>
}
/* 列表数据 */
function List ({ query }){
    console.log('List渲染')
    return <div>
        {
           mockDataArray.map((item,index)=><div key={index} >
              <ShowText query={query} />
           </div>)
        }
    </div>
}
/* memo 做优化处理  */
const NewList = memo(List)
export default function App(){
  const [ value ,setInputValue ] = useState('')
  const [ isTransition , setTransion ] = useState(false)
  const [ query ,setSearchQuery  ] = useState('')
  const [startTransition, isPending] = useTransition()
  // const query = useDefferedValue(value)
  const handleChange = (e) => {
      /* 高优先级任务 —— 改变搜索条件 */
      setInputValue(e.target.value)
      if(isTransition){ /* transition 模式 */
          startTransition(()=>{
              /* 低优先级任务 —— 改变搜索过滤后列表状态  */
              setSearchQuery(e.target.value)
          })
      }else{ /* 不加优化，传统模式 */
          setSearchQuery(e.target.value)
      }
  }
  return <div>
      <button onClick={()=>setTransion(!isTransition)} >{isTransition ?   'normal': 'transition'} </button>
      <input onChange={handleChange}
          placeholder="输入搜索内容"
          value={value}
      />
      <div>isPending: {isPending ? 'true': 'false'}</div>
     <NewList  query={query} />
  </div>
}

