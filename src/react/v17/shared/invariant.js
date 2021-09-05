export default function invariant(condition, format, ...res) {
  // 条件不满足则抛出错误
  if (!condition) {

    format = format.split('%s')

    res.forEach((arg, index) => format[index] += JSON.stringify(arg))
    format = format.join('')

    throw new Error(
      format
    );
  }
}
