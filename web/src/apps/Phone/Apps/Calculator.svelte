<script>
    import AppWrapper from "../components/AppWrapper.svelte";

    const Operators = ['+', '-', '*', '÷'];

    let DisplayElement;
    let Display = '';
    let History = [];

    const UpdateDisplayRatio = () => {
        const ratio = Math.min(1, 4 / Display.length);
        DisplayElement.style.transform = `scale(${ratio})`;
    };

    const HasOperator = () => {
        return History.some(val => Operators.includes(val));
    };

    const AddValue = (Key) => {
        const LastEntry = History[History.length - 1];
        if (LastEntry && !isNaN(LastEntry) && (LastEntry !== '.' || Key !== '.') && !Operators.includes(Key)) {
            History[History.length - 1] = LastEntry + Key;
        } else {
            if (Operators.includes(Key) && Operators.includes(LastEntry)) return; // don't allow multiple operators in a row. (It won't break it if disabled, but its just ugly.)
            if (Key != "-" && Operators.includes(Key) && !LastEntry) return; // never should be able to start with a operator.
            if (Key === '.' && (!LastEntry || isNaN(LastEntry))) History.push('0'); // if Key is a decimal, but there's no number in front of it - add it.
            History.push(Key);
        };

        Display = History.join('');
        UpdateDisplayRatio();
    };

    const CalculateResult = () => {
        let Expression = History.join('');
        if (Operators.includes(Expression.slice(-1))) {
            Expression = Expression.slice(0, -1);
        };

        let currentOperator = '+';
        let currentNumber = '';
        let result = 0;

        for (let i = 0; i < History.length; i++) {
            const currentChar = History[i];

            if (!isNaN(currentChar) || currentChar === '.') {
                currentNumber += currentChar;
            };

            if (Operators.includes(currentChar) || i === History.length - 1) {
                if (currentNumber) {
                    const parsedNumber = parseFloat(currentNumber);
                    if (currentOperator === '+') {
                        result += parsedNumber;
                    } else if (currentOperator === '-') {
                        result -= parsedNumber;
                    } else if (currentOperator === '*') {
                        result *= parsedNumber;
                    } else if (currentOperator === '÷') {
                        result /= parsedNumber;
                    };
                };

                currentNumber = '';
                currentOperator = currentChar;
            };
        };

        const FormattedResult = result.toString();
        const DecimalPlaces = FormattedResult.split('.')[1]?.length || 0;
        return DecimalPlaces > 0 ? (DecimalPlaces > 4 ? result.toFixed(4) : result.toFixed(DecimalPlaces)) : parseInt(result);
    };

    const ButtonPress = Key => {
        const LastEntry = History[History.length - 1];

        if (LastEntry && History.length == 1 && LastEntry == 0) {
            History = [];
        }

        switch (Key) {
            case "AC":
                History = [];
                Display = '';
                UpdateDisplayRatio();
                break;
            case "+/-":
                if (!LastEntry || isNaN(LastEntry)) return; // if the last entry is not a number, do nothing
                const InverseValue = -parseFloat(LastEntry);
                History[History.length - 1] = InverseValue.toString();
                Display = History.join('');
                UpdateDisplayRatio();
                break;
            case "%":
                if (!LastEntry || isNaN(LastEntry)) return;

                const Percentage = parseFloat(LastEntry) / 100;
                History[History.length - 1] = Percentage.toString();
                Display = History.join('');
                UpdateDisplayRatio();
                break;
            case "=":
                if (!HasOperator()) return;
                const Value = CalculateResult();
                History = [Value.toString()];
                Display = Value.toString();
                UpdateDisplayRatio();
                break;
            default:
                AddValue(Key);
                break;
        }
    };

    const RemoveLastDigit = Event => {
        if (Event.key != 'Backspace') return;

        const LastEntry = History[History.length - 1];
        if (!LastEntry) return;

        if (LastEntry.length === 1) {
            History.pop();
        } else {
            History[History.length - 1] = LastEntry.slice(0, -1);
        };

        Display = History.join('');
        UpdateDisplayRatio();
    }
</script>

<AppWrapper>
    <div class="calculator" on:keydown={RemoveLastDigit}>
        <div class="calculator-display">
            <div class="display-history">{History.join('')}</div>
            <div bind:this={DisplayElement} class="display-result">{Display || '0'}</div>
        </div>
        <div class="calculator-keypad">
            <button on:click={() => { ButtonPress("AC")}} class="calc-btn btn-function">AC</button>
            <button on:click={() => { ButtonPress("+/-")}} class="calc-btn btn-function">±</button>
            <button on:click={() => { ButtonPress("%")}} class="calc-btn btn-function">%</button>
            <button on:click={() => { ButtonPress("÷")}} class="calc-btn btn-operator">÷</button>
            
            <button on:click={() => { ButtonPress("7")}} class="calc-btn btn-number">7</button>
            <button on:click={() => { ButtonPress("8")}} class="calc-btn btn-number">8</button>
            <button on:click={() => { ButtonPress("9")}} class="calc-btn btn-number">9</button>
            <button on:click={() => { ButtonPress("*")}} class="calc-btn btn-operator">×</button>
            
            <button on:click={() => { ButtonPress("4")}} class="calc-btn btn-number">4</button>
            <button on:click={() => { ButtonPress("5")}} class="calc-btn btn-number">5</button>
            <button on:click={() => { ButtonPress("6")}} class="calc-btn btn-number">6</button>
            <button on:click={() => { ButtonPress("-")}} class="calc-btn btn-operator">−</button>
            
            <button on:click={() => { ButtonPress("1")}} class="calc-btn btn-number">1</button>
            <button on:click={() => { ButtonPress("2")}} class="calc-btn btn-number">2</button>
            <button on:click={() => { ButtonPress("3")}} class="calc-btn btn-number">3</button>
            <button on:click={() => { ButtonPress("+")}} class="calc-btn btn-operator">+</button>
            
            <button on:click={() => { ButtonPress("0")}} class="calc-btn btn-number btn-zero">0</button>
            <button on:click={() => { ButtonPress(".")}} class="calc-btn btn-number">.</button>
            <button on:click={() => { ButtonPress("=")}} class="calc-btn btn-equals">=</button>
        </div>
    </div>
</AppWrapper>

<style>
    .calculator {
        position: relative;
        width: 88%;
        margin: 0 auto;
        margin-top: 4vh;
        display: flex;
        flex-direction: column;
        gap: 2vh;
        padding-bottom: 1vh;
    }

    .calculator-display {
        background: rgba(40, 40, 50, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-lg);
        padding: 2vh 1.8vh;
        min-height: 12vh;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: flex-end;
        gap: 0.6vh;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3),
                    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        position: relative;
        overflow: hidden;
    }

    .calculator-display::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, 
            rgba(102, 126, 234, 0.08) 0%, 
            rgba(118, 75, 162, 0.05) 100%);
        pointer-events: none;
    }

    .display-history {
        color: var(--color-text-secondary);
        font-size: 1.6vh;
        font-weight: var(--font-weight-normal);
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        text-align: right;
        min-height: 2vh;
        position: relative;
        z-index: 1;
    }

    .display-result {
        color: var(--color-text-primary);
        font-size: 3.8vh;
        font-weight: var(--font-weight-medium);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        text-align: right;
        transform-origin: right;
        transition: transform 0.2s ease;
        position: relative;
        z-index: 1;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .calculator-keypad {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1vh;
        padding-bottom: 1vh;
    }

    .calc-btn {
        background: rgba(40, 40, 50, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: var(--radius-md);
        color: var(--color-text-primary);
        font-size: 2vh;
        font-weight: var(--font-weight-medium);
        height: 5.5vh;
        cursor: pointer;
        user-select: none;
        transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2),
                    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        position: relative;
        overflow: hidden;
    }

    .calc-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.1) 0%, 
            rgba(255, 255, 255, 0.05) 100%);
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .calc-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.18);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25),
                    0 0 0 1px rgba(255, 255, 255, 0.08) inset;
    }

    .calc-btn:hover::before {
        opacity: 1;
    }

    .calc-btn:active {
        transform: translateY(0) scale(0.96);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2),
                    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    }

    .btn-function {
        background: rgba(102, 126, 234, 0.15);
        border-color: rgba(102, 126, 234, 0.25);
        color: rgba(102, 126, 234, 1);
    }

    .btn-function:hover {
        background: rgba(102, 126, 234, 0.22);
        border-color: rgba(102, 126, 234, 0.35);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3),
                    0 0 0 1px rgba(102, 126, 234, 0.15) inset;
    }

    .btn-operator {
        background: linear-gradient(135deg, 
            rgba(102, 126, 234, 0.25) 0%, 
            rgba(118, 75, 162, 0.25) 100%);
        border-color: rgba(102, 126, 234, 0.3);
        color: #ffffff;
        font-weight: var(--font-weight-medium);
    }

    .btn-operator:hover {
        background: linear-gradient(135deg, 
            rgba(102, 126, 234, 0.35) 0%, 
            rgba(118, 75, 162, 0.35) 100%);
        border-color: rgba(102, 126, 234, 0.4);
        box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
    }

    .btn-equals {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-color: rgba(102, 126, 234, 0.4);
        color: #ffffff;
        font-size: 2.4vh;
        font-weight: var(--font-weight-medium);
    }

    .btn-equals:hover {
        background: linear-gradient(135deg, #7c8ff0 0%, #8a5bb0 100%);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5),
                    0 0 0 1px rgba(255, 255, 255, 0.2) inset;
    }

    .btn-number {
        background: rgba(255, 255, 255, 0.08);
    }

    .btn-number:hover {
        background: rgba(255, 255, 255, 0.14);
    }

    .btn-zero {
        grid-column: span 2;
    }
</style>