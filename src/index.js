import ReactDOM from 'react-dom';
import './index.css';

function App() {
  return <div>app</div>
}
const root = document.getElementById('root')

// Concurrent mode
ReactDOM.createRoot(root).render(<App />);

// blocking mode
// ReactDOM.createBlockingRoot(root).render(<App />);

// Sync mode
// ReactDOM.render(<App />, root);

// console.log('React 源码调试，当前版本：' + React.version);
