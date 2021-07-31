import React, { useState} from 'react'
// abcd => acdb b移动到最后，acd前后顺序不变
function Diff () {
    const [state, setState] = useState(['a', 'b', 'c', 'd'])
       // demo1：react认为这种情况是把b移动到最后，而acd相对先后保持不变，这时候只有b会打上Placement的flag
      // return (<p onClick={() => setState(['a', 'c', 'd', 'b'])}>
      // demo2：react认为这种情况是把abc移动到d后面，而不是保持abc不变，只把d移动到前面，这时候abc都会打上Placement的flag
      return (<p onClick={() => setState(['d','a', 'b', 'c'])}> 

        {state.map(item => <div key={item}>{item}</div>)}
        
      </p>)
}
export default Diff
