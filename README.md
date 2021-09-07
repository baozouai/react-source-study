# React源码学习
本仓库在 [react-source-code-debug](https://github.com/neroneroffy/react-source-code-debug)的基础上保留了V17和Lanes模型，且删除掉了大量无关文件、代码（如其中的__DEV__相关判断)，只保留了核心的react、react-dom、react-reconciler、和scheduler

## 📦 安装依赖

```shell
yarn
## or
npm i
```
## 🔨 配置env文件
自定义配置env文件下的__LOG_NAMES__，需要debugger的函数名都可以在里面加上，__LOG_NAMES__为空则都会进入debugger模式。

如配置了`__LOG_NAMES__`中包含`createRootImpl`
```js
  if (!__LOG_NAMES__.length || __LOG_NAMES__.includes('createRootImpl')) debugger
```
## ⌨️ 启动启动17正式版：

```shell
 yarn dev
 ## or
 npm run dev
```

