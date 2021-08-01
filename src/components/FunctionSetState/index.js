import React, {Component} from 'react'



class State extends Component {
  state = { a: 1, b: 2}

  onClick = () => {
    this.setState((preState) => {
      this.setState({a: 3, b: 4})
      return {a: preState.a + preState.b + 1}
    })
  }
  render() {
    return <div onClick={this.onClick}>{this.state.a}</div>
  }
} 

export default State
