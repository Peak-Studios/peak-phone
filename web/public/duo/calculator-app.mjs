import { GlassView, el, field, readLocal, writeLocal } from './glass-kit.mjs?rev=owner-config-20261015';
import {
  applyRepeatOperation,
  calculate,
  formatNumber,
  normalizeHistory,
  repeatOperation,
} from './calculator-core.mjs?rev=ios-calculator-quality-20261011a';

const BASE_KEYS = [
  { label: '⌫', action: 'backspace', className: 'gx-calc-utility', aria: 'Delete last digit' },
  { label: 'C', action: 'clear-entry', className: 'gx-calc-utility', aria: 'Clear entry' },
  { label: '%', action: 'percent', className: 'gx-calc-utility', aria: 'Percent' },
  { label: '÷', action: 'operator:/', className: 'gx-calc-operator', aria: 'Divide' },
  ...['7', '8', '9'].map(label => ({ label, action: `digit:${label}`, className: '', aria: label })),
  { label: '×', action: 'operator:*', className: 'gx-calc-operator', aria: 'Multiply' },
  ...['4', '5', '6'].map(label => ({ label, action: `digit:${label}`, className: '', aria: label })),
  { label: '−', action: 'operator:-', className: 'gx-calc-operator', aria: 'Subtract' },
  ...['1', '2', '3'].map(label => ({ label, action: `digit:${label}`, className: '', aria: label })),
  { label: '+', action: 'operator:+', className: 'gx-calc-operator', aria: 'Add' },
  { label: '±', action: 'sign', className: '', aria: 'Change sign' },
  { label: '0', action: 'digit:0', className: '', aria: '0' },
  { label: '.', action: 'decimal', className: '', aria: 'Decimal point' },
  { label: '=', action: 'equals', className: 'gx-calc-operator gx-calc-equals', aria: '=' },
];

const SCIENTIFIC_ROWS = [
  ['open', 'close', 'mc', 'm-plus', 'm-minus', 'mr'],
  ['second', 'square', 'cube', 'power', 'exp', 'ten-power'],
  ['reciprocal', 'sqrt', 'cbrt', 'root', 'ln', 'log'],
  ['factorial', 'sin', 'cos', 'tan', 'e', 'ee'],
  ['sinh', 'cosh', 'tanh', 'pi', 'angle', 'random'],
];

const SCIENTIFIC_KEYS = {
  open: { label: '(', aria: 'Open parenthesis', action: 'open' },
  close: { label: ')', aria: 'Close parenthesis', action: 'close' },
  mc: { label: 'mc', aria: 'Clear memory', action: 'mc' },
  'm-plus': { label: 'm+', aria: 'Add to memory', action: 'm-plus' },
  'm-minus': { label: 'm−', aria: 'Subtract from memory', action: 'm-minus' },
  mr: { label: 'mr', aria: 'Recall memory', action: 'mr' },
  second: { label: '2nd', aria: 'Toggle alternate scientific functions', action: 'second' },
  square: { label: 'x²', altLabel: '√x', aria: 'Square or square root', action: 'square', altAction: 'sqrt' },
  cube: { label: 'x³', altLabel: '∛x', aria: 'Cube or cube root', action: 'cube', altAction: 'cbrt' },
  power: { label: 'xʸ', altLabel: 'y√x', aria: 'Power or nth root', action: 'power', altAction: 'root' },
  exp: { label: 'eˣ', altLabel: 'ln', aria: 'e to the power or natural log', action: 'exp', altAction: 'ln' },
  'ten-power': { label: '10ˣ', altLabel: 'log', aria: '10 to the power or base ten log', action: 'ten-power', altAction: 'log' },
  reciprocal: { label: '1/x', aria: 'Reciprocal', action: 'reciprocal' },
  sqrt: { label: '√x', altLabel: 'x²', aria: 'Square root or square', action: 'sqrt', altAction: 'square' },
  cbrt: { label: '∛x', altLabel: 'x³', aria: 'Cube root or cube', action: 'cbrt', altAction: 'cube' },
  root: { label: 'y√x', altLabel: 'xʸ', aria: 'Nth root or power', action: 'root', altAction: 'power' },
  ln: { label: 'ln', altLabel: 'eˣ', aria: 'Natural log or e to the power', action: 'ln', altAction: 'exp' },
  log: { label: 'log', altLabel: '10ˣ', aria: 'Base ten log or 10 to the power', action: 'log', altAction: 'ten-power' },
  factorial: { label: 'x!', aria: 'Factorial', action: 'factorial' },
  sin: { label: 'sin', altLabel: 'sin⁻¹', aria: 'Sine or inverse sine', action: 'sin', altAction: 'asin' },
  cos: { label: 'cos', altLabel: 'cos⁻¹', aria: 'Cosine or inverse cosine', action: 'cos', altAction: 'acos' },
  tan: { label: 'tan', altLabel: 'tan⁻¹', aria: 'Tangent or inverse tangent', action: 'tan', altAction: 'atan' },
  e: { label: 'e', aria: 'Euler constant', action: 'e' },
  ee: { label: 'EE', aria: 'Scientific notation exponent', action: 'ee' },
  sinh: { label: 'sinh', altLabel: 'sinh⁻¹', aria: 'Hyperbolic sine or inverse', action: 'sinh', altAction: 'asinh' },
  cosh: { label: 'cosh', altLabel: 'cosh⁻¹', aria: 'Hyperbolic cosine or inverse', action: 'cosh', altAction: 'acosh' },
  tanh: { label: 'tanh', altLabel: 'tanh⁻¹', aria: 'Hyperbolic tangent or inverse', action: 'tanh', altAction: 'atanh' },
  pi: { label: 'π', aria: 'Pi constant', action: 'pi' },
  angle: { label: 'DEG', aria: 'Change angle mode', action: 'angle' },
  random: { label: 'Rand', aria: 'Random value from zero to one', action: 'random' },
};

const FUNCTION_GROUPS = [
  { id: 'powers', label: 'Powers', keys: ['square', 'cube', 'power', 'exp', 'ten-power', 'reciprocal', 'factorial'] },
  { id: 'roots', label: 'Roots', keys: ['sqrt', 'cbrt', 'root', 'reciprocal'] },
  { id: 'trig', label: 'Trig', keys: ['sin', 'cos', 'tan', 'angle', 'pi'] },
  { id: 'hyperbolic', label: 'Hyperbolic', keys: ['sinh', 'cosh', 'tanh'] },
  { id: 'logs', label: 'Logs', keys: ['ln', 'log', 'e', 'ee', 'ten-power'] },
  { id: 'memory', label: 'Memory', keys: ['mc', 'm-plus', 'm-minus', 'mr'] },
  { id: 'more', label: 'More', keys: ['open', 'close', 'random', 'second'] },
];

function displayExpression(expression) {
  return expression.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/pi/gi, 'π');
}

function includeUnaryMinus(expression, start) {
  let sign = start - 1;
  while (sign >= 0 && /\s/.test(expression[sign])) sign--;
  if (expression[sign] !== '-') return start;
  let previous = sign - 1;
  while (previous >= 0 && /\s/.test(expression[previous])) previous--;
  return previous < 0 || '(+-*/^,'.includes(expression[previous]) ? sign : start;
}

function currentOperandRange(expression) {
  if (!expression) return null;
  let end = expression.length;
  while (end && /[%!\s]/.test(expression[end - 1])) end--;
  const beforeSuffix = expression.slice(0, end);
  const number = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d*)?$/.exec(beforeSuffix);
  if (number) {
    const start = includeUnaryMinus(beforeSuffix, number.index);
    return { start, end: expression.length };
  }
  const constant = /(?:^|[^a-z])(?:pi|π|e)$/i.exec(beforeSuffix);
  if (constant) {
    const tokenLength = /pi$/i.test(beforeSuffix) ? 2 : 1;
    return { start: includeUnaryMinus(beforeSuffix, beforeSuffix.length - tokenLength), end: expression.length };
  }
  if (!beforeSuffix.endsWith(')')) return null;
  let nesting = 0;
  for (let index = beforeSuffix.length - 1; index >= 0; index--) {
    if (beforeSuffix[index] === ')') nesting++;
    else if (beforeSuffix[index] === '(' && --nesting === 0) {
      let start = index;
      while (start > 0 && /[a-z]/i.test(beforeSuffix[start - 1])) start--;
      start = includeUnaryMinus(beforeSuffix, start);
      return { start, end: expression.length };
    }
  }
  return null;
}

function clearEntryExpression(expression) {
  const range = currentOperandRange(expression);
  return range ? expression.slice(0, range.start) : expression;
}

export class CalculatorApp extends GlassView {
  constructor(options) {
    super(options);
    this.element.classList.add('gx-calculator');
    this.element.setAttribute('aria-label', 'Calculator');
    this.expression = '';
    this.answer = '0';
    this.error = '';
    this.finished = false;
    this.scientific = false;
    this.second = false;
    this.degrees = true;
    this.memory = null;
    this.repeat = null;
    this.history = normalizeHistory(readLocal(this.context, 'calculator-history', []));
    this.render();
    this.listen(document, 'keydown', event => this.onKeydown(event));
  }

  render() {
    this.element.dataset.mode = this.scientific ? 'scientific' : 'basic';
    const body = this.frame('', '', []);
    this.element.querySelector('.nx-header')?.remove();
    body.classList.add('gx-calc-body');
    body.setAttribute('aria-label', 'Calculator workspace');

    const toolbar = el('header', 'gx-calc-toolbar');
    toolbar.setAttribute('aria-label', 'Calculator controls');
    const title = el('h1', 'gx-calc-title', 'Calculator');
    toolbar.append(
      title,
      el('span', 'gx-calc-memory-indicator', this.memory === null ? '' : 'M'),
      this.textButton('History', '', () => this.showHistory(), 'gx-calc-top-control gx-calc-history-control'),
      this.textButton(this.scientific ? 'Basic' : 'Scientific', '', () => this.toggleScientific(), 'gx-calc-top-control gx-calc-mode-control'),
    );
    toolbar.querySelector('.gx-calc-history-control').setAttribute('aria-label', 'Calculation history');
    toolbar.querySelector('.gx-calc-history-control').title = 'Calculation history';
    toolbar.lastElementChild.setAttribute('aria-label', this.scientific ? 'Switch to basic calculator' : 'Switch to scientific calculator');
    toolbar.lastElementChild.setAttribute('aria-pressed', String(this.scientific));
    toolbar.lastElementChild.title = this.scientific ? 'Basic calculator' : 'Scientific calculator';
    body.append(toolbar);

    const display = el('section', 'gx-calc-display');
    display.setAttribute('aria-label', 'Calculation display');
    const expressionLine = el('div', 'gx-calc-expression-line');
    this.expressionNode = el('div', 'gx-calc-expression', this.expression ? displayExpression(this.expression) : ' ');
    this.expressionNode.setAttribute('aria-label', 'Expression');
    const clearAll = this.textButton('AC', '', () => this.clearAll(), 'gx-calc-clear-all');
    clearAll.setAttribute('aria-label', 'All clear');
    clearAll.title = 'Clear expression';
    expressionLine.append(this.expressionNode, clearAll);
    const resultLine = el('div', 'gx-calc-result-line');
    this.resultNode = el('output', 'display-result gx-calc-result', this.answer);
    this.resultNode.setAttribute('aria-live', 'polite');
    this.copyButton = this.textButton('Copy', '', () => this.copy(this.answer), 'gx-calc-copy-control');
    this.copyButton.setAttribute('aria-label', 'Copy result');
    this.copyButton.title = 'Copy result';
    resultLine.append(this.resultNode, this.copyButton);
    display.append(expressionLine, resultLine);
    body.append(display);

    if (this.scientific) {
      const compact = el('div', 'gx-calc-compact-scientific');
      const functions = this.textButton('Functions', '', () => this.showScientificFunctions(), 'gx-calc-function-trigger');
      functions.setAttribute('aria-label', 'Scientific functions');
      const angle = this.textButton(this.degrees ? 'DEG' : 'RAD', '', () => this.toggleAngleMode(), 'gx-calc-angle-trigger');
      angle.setAttribute('aria-label', 'Change angle mode');
      angle.title = this.degrees ? 'Degrees' : 'Radians';
      compact.append(functions, angle);
      body.append(compact);
      body.append(this.renderScientificPad());
    }

    const keypad = el('div', 'gx-calc-keypad');
    keypad.setAttribute('role', 'group');
    keypad.setAttribute('aria-label', 'Calculator keypad');
    for (const key of BASE_KEYS) keypad.append(this.makeKey(key));
    body.append(keypad);
    this.updateDisplay();
  }

  renderScientificPad() {
    const pad = el('div', 'gx-calc-scientific');
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', 'Scientific keypad');
    for (const row of SCIENTIFIC_ROWS) {
      for (const key of row) pad.append(this.makeScientificKey(key));
    }
    return pad;
  }

  makeKey(key) {
    const button = this.textButton(key.label, '', () => this.perform(key.action), `gx-calc-key ${key.className}`);
    button.dataset.key = key.label;
    button.setAttribute('aria-label', key.aria);
    button.title = key.aria;
    return button;
  }

  makeScientificKey(id) {
    const definition = SCIENTIFIC_KEYS[id];
    const alternate = this.second && definition.altLabel;
    const label = id === 'angle' ? (this.degrees ? 'DEG' : 'RAD') : alternate ? definition.altLabel : definition.label;
    const action = alternate ? definition.altAction : definition.action;
    const button = this.textButton(label, '', () => this.performScientific(action), `gx-calc-key gx-calc-scientific-key ${['mc', 'm-plus', 'm-minus', 'mr', 'angle'].includes(id) ? 'gx-calc-secondary' : 'gx-calc-function'}`);
    button.dataset.science = id;
    button.setAttribute('aria-label', definition.aria);
    button.title = definition.aria;
    if (id === 'second') button.setAttribute('aria-pressed', String(this.second));
    return button;
  }

  onKeydown(event) {
    if (!window.PeakDuo?.isAppInteractive('calculator') || this.sheet || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input,textarea,select,[contenteditable=true]')) return;
    const pane = this.element.closest('.duo-pane');
    if (pane?.dataset.active === 'false') return;
    let action = null;
    if (event.key === 'Enter' || event.key === '=') action = 'equals';
    else if (event.key === 'Backspace') action = 'backspace';
    else if (event.key === 'Delete') action = 'clear-entry';
    else if (/^[0-9]$/.test(event.key)) action = `digit:${event.key}`;
    else if (event.key === '.') action = 'decimal';
    else if (event.key === '+') action = 'operator:+';
    else if (event.key === '-') action = 'operator:-';
    else if (event.key === '*') action = 'operator:*';
    else if (event.key === '/') action = 'operator:/';
    else if (event.key === '^') action = 'operator:^';
    else if (event.key === '%') action = 'percent';
    else if (event.key === '(') action = 'open';
    else if (event.key === ')') action = 'close';
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.perform(action);
  }

  perform(action) {
    if (action.startsWith('digit:')) return this.inputDigit(action.slice(6));
    if (action.startsWith('operator:')) return this.inputOperator(action.slice(9));
    switch (action) {
      case 'backspace': return this.deleteLastDigit();
      case 'clear-entry': return this.clearEntry();
      case 'clear-all': return this.clearAll();
      case 'decimal': return this.inputDecimal();
      case 'percent': return this.inputPostfix('%');
      case 'sign': return this.toggleSign();
      case 'equals': return this.equals();
      case 'open': return this.inputParenthesis('(');
      case 'close': return this.inputParenthesis(')');
    }
  }

  performScientific(action) {
    switch (action) {
      case 'second':
        this.second = !this.second;
        if (this.sheet && this.functionSheetRender) this.functionSheetRender(this.functionGroup);
        else this.render();
        return;
      case 'angle': return this.toggleAngleMode();
      case 'mc':
        this.memory = null;
        this.updateDisplay();
        return;
      case 'm-plus': return this.adjustMemory(1);
      case 'm-minus': return this.adjustMemory(-1);
      case 'mr': return this.recallMemory();
      case 'square': return this.applyPower(2);
      case 'cube': return this.applyPower(3);
      case 'power': return this.inputOperator('^');
      case 'exp': return this.wrapCurrentEntry('exp');
      case 'ten-power': return this.wrapCurrentEntry('10^');
      case 'reciprocal': return this.wrapCurrentEntry('1/(');
      case 'sqrt': return this.wrapCurrentEntry('sqrt');
      case 'cbrt': return this.wrapCurrentEntry('cbrt');
      case 'root': return this.showRootIndexSheet();
      case 'ln': case 'log': case 'sin': case 'cos': case 'tan':
      case 'asin': case 'acos': case 'atan': case 'sinh': case 'cosh':
      case 'tanh': case 'asinh': case 'acosh': case 'atanh':
        return this.wrapCurrentEntry(action);
      case 'factorial': return this.inputPostfix('!');
      case 'e': return this.inputConstant('e');
      case 'pi': return this.inputConstant('π');
      case 'ee': return this.inputExponent();
      case 'random': return this.inputRandom();
    }
  }

  toggleScientific() {
    const restoreModeFocus = document.activeElement === this.element.querySelector('.gx-calc-mode-control');
    this.scientific = !this.scientific;
    this.second = false;
    this.render();
    if (restoreModeFocus) this.element.querySelector('.gx-calc-mode-control')?.focus({ preventScroll: true });
  }

  toggleAngleMode() {
    this.degrees = !this.degrees;
    this.updatePreview();
    const angle = this.element.querySelector('.gx-calc-angle-trigger');
    if (angle) {
      angle.textContent = this.degrees ? 'DEG' : 'RAD';
      angle.title = this.degrees ? 'Degrees' : 'Radians';
    }
    const scienceAngle = this.element.querySelector('[data-science="angle"]');
    if (scienceAngle) scienceAngle.textContent = this.degrees ? 'DEG' : 'RAD';
    this.updateDisplay();
  }

  clearAll() {
    this.expression = '';
    this.answer = '0';
    this.error = '';
    this.finished = false;
    this.repeat = null;
    this.updateDisplay();
  }

  clearEntry() {
    if (this.finished) {
      this.expression = this.answer;
      this.finished = false;
    }
    this.expression = clearEntryExpression(this.expression);
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  deleteLastDigit() {
    if (this.finished) {
      this.expression = this.answer;
      this.finished = false;
    }
    this.expression = this.expression.slice(0, -1);
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputDigit(digit) {
    if (this.finished) {
      this.expression = '';
      this.finished = false;
    }
    if (this.expression.length >= 256) return;
    const range = currentOperandRange(this.expression);
    if (range && range.end === this.expression.length) {
      const operand = this.expression.slice(range.start, range.end);
      const isLiteral = /^(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d*)?)$/.test(operand);
      const incompleteExponent = /(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?$/.test(operand);
      if (!isLiteral && !incompleteExponent) this.expression += '*';
    }
    this.expression += digit;
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputDecimal() {
    if (this.finished) {
      this.expression = '';
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    const operand = range?.end === this.expression.length ? this.expression.slice(range.start, range.end) : '';
    if (/^-?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?$/.test(operand)) {
      this.expression += '0';
    } else if (/^-?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(operand)) {
      return;
    } else if (operand && !/^(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d*)?)$/.test(operand)) {
      this.expression += '*0.';
    } else if (!operand || /[+\-*/^(]$/.test(this.expression)) {
      this.expression += '0.';
    } else if (!operand.includes('.')) {
      this.expression += '.';
    }
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputOperator(operator) {
    if (this.finished) {
      this.expression = `${this.answer}${operator}`;
      this.finished = false;
      this.error = '';
      this.updatePreview();
      this.updateDisplay();
      return;
    }
    if (!this.expression) {
      if (operator === '-') this.expression = '-';
      else return;
    } else if (/[eE]$/.test(this.expression) && (operator === '+' || operator === '-')) {
      this.expression += operator;
    } else if (/[eE][+-]$/.test(this.expression)) {
      return;
    } else if (/[+\-*/^]$/.test(this.expression)) {
      if (operator === '-' && /[+*/^]$/.test(this.expression)) this.expression += '-';
      else this.expression = this.expression.slice(0, -1) + operator;
    } else if (this.expression.endsWith('(')) {
      if (operator === '-') this.expression += '-';
      else return;
    } else {
      this.expression += operator;
    }
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputPostfix(operator) {
    if (this.finished) {
      this.expression = this.answer;
      this.finished = false;
    }
    if (!currentOperandRange(this.expression)) return;
    if (this.expression.length < 256) this.expression += operator;
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputParenthesis(character) {
    if (this.finished && character === '(') {
      this.expression = this.answer;
      this.finished = false;
    }
    if (character === '(') {
      const range = currentOperandRange(this.expression);
      if (range?.end === this.expression.length) this.expression += '*';
      this.expression += '(';
    } else {
      const opens = [...this.expression].filter(value => value === '(').length;
      const closes = [...this.expression].filter(value => value === ')').length;
      if (opens <= closes || !currentOperandRange(this.expression)) return;
      this.expression += ')';
    }
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputConstant(constant) {
    if (this.finished) {
      this.expression = '';
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    if (range?.end === this.expression.length) this.expression += '*';
    this.expression += constant;
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputExponent() {
    if (this.finished) {
      this.expression = this.answer;
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    const operand = range?.end === this.expression.length ? this.expression.slice(range.start, range.end) : '';
    if (!/^(?:-?(?:\d+(?:\.\d*)?|\.\d+))$/.test(operand)) return;
    this.expression += 'E';
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  inputRandom() {
    if (this.finished) {
      this.expression = '';
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    if (range?.end === this.expression.length) this.expression += '*';
    this.expression += String(Math.random());
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  toggleSign() {
    if (this.finished) {
      this.expression = this.answer;
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    if (!range) {
      if (!this.expression) this.expression = '-';
      else return;
    } else {
      const entry = this.expression.slice(range.start, range.end);
      const replaced = entry.startsWith('-') ? entry.slice(1) : `-${entry}`;
      this.expression = this.expression.slice(0, range.start) + replaced;
    }
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  wrapCurrentEntry(name) {
    if (this.finished) {
      this.expression = this.answer;
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    if (!range || range.end !== this.expression.length) {
      if (this.expression.length + name.length + 2 <= 256) this.expression += `${name}(`;
    } else {
      const entry = this.expression.slice(range.start, range.end);
      const prefix = name === '10^'
        ? `(10^(${entry}))`
        : name === '1/('
          ? `(1/(${entry}))`
          : `${name}(${entry})`;
      this.expression = this.expression.slice(0, range.start) + prefix;
    }
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  applyPower(power) {
    if (this.finished) {
      this.expression = this.answer;
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    if (!range || range.end !== this.expression.length) return;
    const entry = this.expression.slice(range.start, range.end);
    this.expression = this.expression.slice(0, range.start) + `((${entry})^${power})`;
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  adjustMemory(direction) {
    const value = this.currentValue();
    if (value === null) {
      this.showError('Complete a calculation before using memory.');
      return;
    }
    this.memory = (this.memory ?? 0) + direction * value;
    if (!Number.isFinite(this.memory) || Math.abs(this.memory) > 1e100) {
      this.memory = null;
      this.showError('Memory exceeds the calculator limit.');
      return;
    }
    this.updateDisplay();
  }

  recallMemory() {
    if (this.memory === null) {
      this.showError('Memory is empty.');
      return;
    }
    if (this.finished) {
      this.expression = '';
      this.finished = false;
    }
    const range = currentOperandRange(this.expression);
    if (range?.end === this.expression.length) this.expression += '*';
    this.expression += formatNumber(this.memory);
    this.error = '';
    this.updatePreview();
    this.updateDisplay();
  }

  currentValue() {
    try {
      return this.expression ? calculate(this.expression, { degrees: this.degrees }) : Number(this.answer);
    } catch {
      return null;
    }
  }

  equals() {
    if (this.finished && this.repeat) {
      try {
        const value = applyRepeatOperation(Number(this.answer), this.repeat);
        const operator = this.repeat.operator.replace('*', '×').replace('/', '÷').replace('-', '−');
        const amount = this.repeat.percent ? `${formatNumber(this.repeat.operand * 100)}%` : formatNumber(this.repeat.operand);
        const expression = `${this.answer}${operator}${amount}`;
        this.completeCalculation(expression, value, this.repeat);
      } catch (error) {
        this.showError(error.message);
      }
      return;
    }

    if (!this.expression) return;
    try {
      const value = calculate(this.expression, { degrees: this.degrees });
      const repeat = repeatOperation(this.expression, { degrees: this.degrees });
      if (repeat) this.repeat = repeat;
      else if (!this.finished) this.repeat = this.repeat;
      this.completeCalculation(this.expression, value, this.repeat);
    } catch (error) {
      this.showError(error.message);
    }
  }

  completeCalculation(expression, value, repeat) {
    this.expression = expression;
    this.answer = formatNumber(value);
    this.error = '';
    this.finished = true;
    this.history.unshift({ expression, result: this.answer });
    this.history = normalizeHistory(this.history);
    writeLocal(this.context, 'calculator-history', this.history);
    this.repeat = repeat || null;
    this.updateDisplay();
  }

  showError(message) {
    this.error = String(message || 'Calculation failed.');
    this.answer = this.error;
    this.finished = false;
    this.updateDisplay();
  }

  updatePreview() {
    this.error = '';
    if (!this.expression) {
      this.answer = '0';
      return;
    }
    try {
      this.answer = formatNumber(calculate(this.expression, { degrees: this.degrees }));
    } catch {
      this.answer = '—';
    }
  }

  updateDisplay() {
    if (this.expressionNode) this.expressionNode.textContent = this.expression ? displayExpression(this.expression) : ' ';
    if (this.resultNode) {
      this.resultNode.textContent = this.answer;
      this.resultNode.dataset.long = String(this.answer.length > 12);
      this.resultNode.dataset.error = String(Boolean(this.error));
      this.resultNode.setAttribute('aria-label', this.error ? `Calculation error: ${this.error}` : `Result ${this.answer}`);
      this.resultNode.title = this.error || '';
    }
    if (this.copyButton) this.copyButton.disabled = Boolean(this.error);
    const memory = this.element.querySelector('.gx-calc-memory-indicator');
    if (memory) {
      memory.textContent = this.memory === null ? '' : 'M';
      memory.setAttribute('aria-label', this.memory === null ? 'Memory empty' : `Memory ${formatNumber(this.memory)}`);
      memory.title = this.memory === null ? '' : `Memory: ${formatNumber(this.memory)}`;
    }
  }

  showHistory() {
    this.history = normalizeHistory(readLocal(this.context, 'calculator-history', this.history));
    const panel = this.openSheet('Calculation history', { header: false });
    panel.classList.add('cf-sheet', 'gx-calc-history-sheet');
    const nav = el('header', 'cf-sheet-nav');
    nav.append(this.textButton('Done', '', () => this.closeSheet(), 'cf-nav-leading'), el('h2', '', 'History'));
    if (this.history.length) nav.append(this.textButton('Clear', '', () => this.confirmClearHistory(), 'cf-nav-trailing gx-danger'));
    else nav.append(el('span', 'cf-nav-trailing'));
    const context = el('div', 'cf-context-row');
    context.append(el('span', 'cf-confirm-mark', '∑'), el('span', 'cf-confirm-copy', `Private to this device · ${this.history.length} saved calculation${this.history.length === 1 ? '' : 's'}`));
    panel.append(nav, context);
    if (!this.history.length) {
      panel.append(this.empty('No calculations yet', 'Your completed calculations will appear here.', 'calculator'));
      return;
    }
    const list = el('div', 'gx-calc-history-list');
    for (const item of this.history) {
      const row = el('article', 'gx-calculation');
      row.append(el('p', '', 'Expression'), el('code', 'gx-calc-history-expression', displayExpression(item.expression)), el('strong', '', `= ${item.result}`));
      const actions = el('div', 'gx-calc-history-actions');
      actions.append(
        this.textButton('Use result', '', () => {
          this.expression = item.result;
          this.answer = item.result;
          this.error = '';
          this.finished = true;
          this.repeat = null;
          this.closeSheet();
          this.updateDisplay();
        }, 'gx-list-button'),
        this.textButton('Copy result', '', () => this.copy(item.result), 'gx-list-button'),
      );
      row.append(actions);
      list.append(row);
    }
    panel.append(list);
  }

  confirmClearHistory() {
    const panel = this.openSheet('Clear history', { header: false });
    panel.classList.add('cf-sheet', 'gx-calc-history-confirm');
    const nav = el('header', 'cf-sheet-nav');
    nav.append(this.textButton('Cancel', '', () => this.showHistory(), 'cf-nav-leading'), el('h2', '', 'Clear history'));
    nav.append(this.textButton('Clear', '', () => {
      this.history = [];
      writeLocal(this.context, 'calculator-history', []);
      this.closeSheet();
    }, 'cf-nav-trailing gx-danger'));
    const summary = el('div', 'cf-context-row');
    summary.append(el('span', 'cf-confirm-mark', '∑'), el('span', 'cf-confirm-copy', `Remove ${this.history.length} saved calculations from this device?`));
    panel.append(nav, summary, el('p', 'cf-sheet-intro', 'This only clears Calculator history for the current character. Your answer and current expression stay on the calculator.'));
  }

  showScientificFunctions(groupId = 'powers') {
    const panel = this.openSheet('Scientific functions', { header: false });
    panel.classList.add('cf-sheet', 'gx-calc-function-sheet');
    const nav = el('header', 'cf-sheet-nav gx-calc-function-nav');
    nav.append(this.textButton('Done', '', () => this.closeSheet(), 'cf-nav-leading'), el('h2', '', 'Functions'));
    const angle = this.textButton(this.degrees ? 'DEG' : 'RAD', '', () => {
      this.toggleAngleMode();
      angle.textContent = this.degrees ? 'DEG' : 'RAD';
    }, 'cf-nav-trailing gx-calc-sheet-angle');
    angle.setAttribute('aria-label', 'Change angle mode');
    nav.append(angle);
    const tabs = el('nav', 'gx-calc-function-tabs');
    tabs.setAttribute('aria-label', 'Scientific function groups');
    const content = el('div', 'gx-calc-function-content');
    panel.append(nav, tabs, content);
    const renderGroup = selected => {
      this.functionGroup = selected;
      tabs.replaceChildren();
      for (const group of FUNCTION_GROUPS) {
        const button = this.textButton(group.label, '', () => renderGroup(group.id), 'gx-calc-function-tab');
        button.setAttribute('aria-pressed', String(group.id === selected));
        tabs.append(button);
      }
      const group = FUNCTION_GROUPS.find(item => item.id === selected) || FUNCTION_GROUPS[0];
      const grid = el('div', 'gx-calc-function-grid');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', `${group.label} functions`);
      for (const key of group.keys) grid.append(this.makeScientificKey(key));
      content.replaceChildren(grid);
      if (this.second) grid.querySelector('[data-science="second"]')?.setAttribute('aria-pressed', 'true');
    };
    this.functionGroup = groupId;
    this.functionSheetRender = renderGroup;
    renderGroup(groupId);
  }

  showRootIndexSheet() {
    const source = this.finished ? this.answer : this.expression;
    const range = currentOperandRange(source);
    const panel = this.openSheet('Nth root', { header: false });
    panel.classList.add('cf-sheet', 'gx-calc-root-sheet');
    const nav = el('header', 'cf-sheet-nav');
    nav.append(this.textButton('Cancel', '', () => this.closeSheet(), 'cf-nav-leading'), el('h2', '', 'Nth root'));
    const apply = this.textButton('Apply', '', () => {
      const index = Number(indexField.input.value);
      if (!Number.isInteger(index) || index === 0 || Math.abs(index) > 99) {
        status.textContent = 'Enter a nonzero whole number from −99 to 99.';
        return;
      }
      if (range?.end === source.length) {
        const entry = source.slice(range.start, range.end);
        this.expression = source.slice(0, range.start) + `root(${index},${entry})`;
      } else {
        this.expression = source + `root(${index},`;
      }
      this.finished = false;
      this.error = '';
      this.closeSheet();
      this.updatePreview();
      this.updateDisplay();
    }, 'cf-nav-trailing');
    nav.append(apply);
    const copy = el('p', 'cf-sheet-intro', range ? 'Choose the index for the current value.' : 'Choose an index, then enter a value and close the parenthesis.');
    const indexField = field('Root index', { type: 'number', value: '3', placeholder: '3' });
    indexField.input.min = '-99';
    indexField.input.max = '99';
    indexField.input.step = '1';
    const status = el('p', 'gx-calc-sheet-status');
    status.setAttribute('role', 'alert');
    panel.append(nav, copy, indexField.wrapper, status);
  }
}
