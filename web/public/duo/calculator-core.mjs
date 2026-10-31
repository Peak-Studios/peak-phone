/** A bounded recursive-descent calculator. It never evaluates JavaScript. */
const MAX_EXPRESSION = 256;
const MAX_TOKENS = 180;
const MAX_DEPTH = 32;
const MAX_MAGNITUDE = 1e100;

const FUNCTIONS = new Set([
  'sqrt', 'cbrt', 'root', 'abs', 'ln', 'log', 'exp',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
]);

function checked(value) {
  if (!Number.isFinite(value)) throw Error('Result is not a finite number.');
  if (Math.abs(value) > MAX_MAGNITUDE) throw Error('Result exceeds the calculator limit.');
  return { value, percent: false };
}

function factorial(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw Error('Factorial needs a nonnegative whole number.');
  }
  if (value > 69) throw Error('Factorial exceeds the calculator limit.');
  let result = 1;
  for (let factor = 2; factor <= value; factor++) result = checked(result * factor).value;
  return result;
}

function root(index, radicand) {
  if (!Number.isInteger(index) || index === 0 || Math.abs(index) > 99) {
    throw Error('Root index must be a nonzero whole number.');
  }
  if (radicand < 0) {
    if (index < 0 || index % 2 === 0) throw Error('This root needs a nonnegative value.');
    return -Math.pow(-radicand, 1 / index);
  }
  return Math.pow(radicand, 1 / index);
}

function applyFunction(name, value, degrees) {
  const radians = degrees ? value * Math.PI / 180 : value;
  const angle = result => degrees ? result * 180 / Math.PI : result;
  switch (name) {
    case 'sqrt':
      if (value < 0) throw Error('Square root needs a nonnegative value.');
      return Math.sqrt(value);
    case 'cbrt': return Math.cbrt(value);
    case 'abs': return Math.abs(value);
    case 'ln':
      if (value <= 0) throw Error('Natural log needs a positive value.');
      return Math.log(value);
    case 'log':
      if (value <= 0) throw Error('Log needs a positive value.');
      return Math.log10(value);
    case 'exp': return Math.exp(value);
    case 'sin': return Math.sin(radians);
    case 'cos': return Math.cos(radians);
    case 'tan':
      if (Math.abs(Math.cos(radians)) < 1e-12) throw Error('Tangent is undefined at this angle.');
      return Math.tan(radians);
    case 'asin':
      if (value < -1 || value > 1) throw Error('Inverse sine needs a value from −1 to 1.');
      return angle(Math.asin(value));
    case 'acos':
      if (value < -1 || value > 1) throw Error('Inverse cosine needs a value from −1 to 1.');
      return angle(Math.acos(value));
    case 'atan': return angle(Math.atan(value));
    case 'sinh': return Math.sinh(value);
    case 'cosh': return Math.cosh(value);
    case 'tanh': return Math.tanh(value);
    case 'asinh': return Math.asinh(value);
    case 'acosh':
      if (value < 1) throw Error('Inverse cosh needs a value of 1 or more.');
      return Math.acosh(value);
    case 'atanh':
      if (Math.abs(value) >= 1) throw Error('Inverse tanh needs a value between −1 and 1.');
      return Math.atanh(value);
    default: throw Error('Unknown function.');
  }
}

/** Percent convention: 200 + 10% = 220; 200 × 10% = 20. */
export function calculate(expression, { degrees = true } = {}) {
  if (typeof expression !== 'string' || expression.length > MAX_EXPRESSION) {
    throw Error('Expression is too long.');
  }
  const source = expression
    .replace(/[×]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−]/g, '-')
    .replace(/[π]/g, 'pi')
    .replace(/\s/g, '');
  if (!source) throw Error('Enter a calculation.');

  const tokens = [];
  let position = 0;
  const push = token => {
    if (tokens.length >= MAX_TOKENS) throw Error('Expression is too long.');
    tokens.push(token);
  };
  while (position < source.length) {
    const remaining = source.slice(position);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(remaining);
    if (number) {
      push({ type: 'n', value: Number(number[0]) });
      position += number[0].length;
      continue;
    }
    const word = /^[a-z]+/i.exec(remaining);
    if (word) {
      push({ type: 'f', value: word[0].toLowerCase() });
      position += word[0].length;
      continue;
    }
    const character = source[position++];
    if ('+-*/^()%!,'.includes(character)) push({ type: character });
    else throw Error('Unsupported character.');
  }

  let at = 0;
  let depth = 0;
  const peek = () => tokens[at]?.type;
  const take = type => peek() === type ? (at++, true) : false;

  function primary() {
    if (++depth > MAX_DEPTH) {
      depth--;
      throw Error('Too many nested expressions.');
    }
    let result;
    try {
      if (take('(')) {
        result = sum();
        if (!take(')')) throw Error('Close the parenthesis.');
      } else if (peek() === 'n') {
        result = checked(tokens[at++].value);
      } else if (peek() === 'f') {
        const name = tokens[at++].value;
        if (name === 'pi') result = checked(Math.PI);
        else if (name === 'e') result = checked(Math.E);
        else {
          if (!FUNCTIONS.has(name)) throw Error('Unknown function.');
          if (!take('(')) throw Error('A function needs parentheses.');
          const first = sum();
          if (name === 'root') {
            if (!take(',')) throw Error('Nth root needs an index and a value.');
            const second = sum();
            if (!take(')')) throw Error('Close the parenthesis.');
            result = checked(root(first.value, second.value));
          } else {
            if (!take(')')) throw Error('Close the parenthesis.');
            result = checked(applyFunction(name, first.value, degrees));
          }
        }
      } else {
        throw Error('A number is missing.');
      }

      while (true) {
        if (take('%')) {
          result = checked(result.value / 100);
          result.percent = true;
        } else if (take('!')) {
          result = checked(factorial(result.value));
        } else {
          break;
        }
      }
      return result;
    } finally {
      depth--;
    }
  }

  function power() {
    const value = primary();
    return take('^') ? checked(value.value ** unary().value) : value;
  }
  function unary() {
    if (take('+')) return unary();
    if (take('-')) {
      const value = unary();
      return { ...value, value: -value.value };
    }
    return power();
  }
  function product() {
    let value = unary();
    while (peek() === '*' || peek() === '/') {
      const operator = tokens[at++].type;
      const right = unary();
      if (operator === '/' && right.value === 0) throw Error('Cannot divide by zero.');
      value = checked(operator === '*' ? value.value * right.value : value.value / right.value);
    }
    return value;
  }
  function sum() {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[at++].type;
      const right = product();
      const amount = right.percent ? value.value * right.value : right.value;
      value = checked(operator === '+' ? value.value + amount : value.value - amount);
    }
    return value;
  }

  const result = sum();
  if (at !== tokens.length) throw Error('An operator is missing.');
  return Number(result.value.toPrecision(14));
}

/** Capture the final binary operation for the standard repeated-equals action. */
export function repeatOperation(expression, { degrees = true } = {}) {
  if (typeof expression !== 'string' || expression.length > MAX_EXPRESSION) return null;
  let nesting = 0;
  let candidate = null;
  for (let index = 0; index < expression.length; index++) {
    const character = expression[index];
    if (character === '(') nesting++;
    else if (character === ')') nesting = Math.max(0, nesting - 1);
    if (nesting !== 0 || !'+-−×÷*/^'.includes(character)) continue;
    const previous = expression[index - 1] || '';
    const exponentSign = /[eE]/.test(previous) && /[\d.]/.test(expression[index - 2] || '');
    const unary = !previous || '(+-−×÷*/^,'.includes(previous) || exponentSign;
    if (!unary) candidate = { index, operator: ({ '×': '*', '÷': '/', '−': '-' })[character] || character };
  }
  if (!candidate) return null;
  const right = expression.slice(candidate.index + 1);
  if (!right.trim()) return null;
  try {
    return {
      operator: candidate.operator,
      operand: calculate(right, { degrees }),
      percent: /%\s*$/.test(right),
    };
  } catch {
    return null;
  }
}

export function applyRepeatOperation(value, repeat) {
  if (!repeat || !Number.isFinite(value) || !Number.isFinite(repeat.operand)) return value;
  const amount = repeat.percent && (repeat.operator === '+' || repeat.operator === '-')
    ? value * repeat.operand
    : repeat.operand;
  switch (repeat.operator) {
    case '+': return checked(value + amount).value;
    case '-': return checked(value - amount).value;
    case '*': return checked(value * amount).value;
    case '/':
      if (amount === 0) throw Error('Cannot divide by zero.');
      return checked(value / amount).value;
    case '^': return checked(value ** amount).value;
    default: return value;
  }
}

export function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  const history = [];
  for (const item of value.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const expression = typeof item.expression === 'string' ? item.expression.trim() : '';
    const result = typeof item.result === 'string' ? item.result.trim() : '';
    const numericResult = Number(result);
    if (!expression || expression.length > MAX_EXPRESSION || !/^[\dA-Za-zπ.+\-−×÷*/^()%!,\s]+$/u.test(expression)
      || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(result) || result.length > 128
      || !Number.isFinite(numericResult) || Math.abs(numericResult) > MAX_MAGNITUDE) continue;
    history.push({ expression, result });
    if (history.length === 50) break;
  }
  return history;
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return 'Error';
  if (Object.is(value, -0)) return '0';
  const rounded = Number(value.toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
