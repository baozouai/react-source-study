module.exports = {
  parserOptions: {
    ecmaVersion: 7,
    sourceType: 'module',
    ecmaFeatures: { // 添加ES特性支持，使之能够识别ES6语法
      jsx: true
    }
  },
  globals: {
   __LOG_NAMES__: 'readonly'
  },
}