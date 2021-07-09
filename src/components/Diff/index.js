import React from 'react'

class Diff extends React.Component {
    state = {
        arr: [1, 2]
    }

    pushArr = () => {
        this.setState({arr: [...this.state.arr, this.state.arr.length + 1]})
    }
    render() {
        return <p onClick={this.pushArr}>
          {
              this.state.arr.map(v => {
                  return <div key={v}>{v}</div>
              })
          }
        </p>
    }
}
export default Diff
