(() => {
  const input = document.getElementById('number-input');
  const bitfield = document.getElementById('bitfield');
  const valueUnit = document.getElementById('value-unit');
  const modeSelect = document.getElementById('mode');
  const inputLabel = document.getElementById('input-label');

  // default mode: "binary" (treat input as a number of bits and show bytes)
  let mode = modeSelect?.value || 'binary';

  // Keep last bits to animate differences
  let lastBits = [];

  function parseNumber(text) {
    if (!text) return 0n;
    text = text.trim();
    // support decimal or 0x hex
    try {
      if (text.startsWith('0x') || text.startsWith('0X')) return BigInt(text);
      return BigInt(text.replace(/_/g, ''));
    } catch (e) {
      return 0n;
    }
  }

  function humanizeBytes(bytes) {
    const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
    let b = Number(bytes);
    let i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b % 1 === 0 ? b.toFixed(0) : b.toFixed(2)} ${units[i]}`;
  }

  // Create sequential byte values filling each shown byte up to 255.
  // Example: 256 -> [255, 1]
  function distributeToBytes(n) {
    let remaining = BigInt(n);
    const parts = [];
    const MAX = 255n;
    while (remaining > 0n) {
      if (remaining > MAX) {
        parts.push(255);
        remaining -= MAX;
      } else {
        parts.push(Number(remaining));
        remaining = 0n;
      }
    }
    if (parts.length === 0) parts.push(0);
    return parts; // LSB-first: parts[0] is the first grid shown (least significant bit (LSb))
  }

  function byteToBits(num) {
    // turns number 0..255 into array of '0'/'1' length 8, msb->lsb left-to-right (most significant bit first)
    const bits = [];
    for (let i = 7; i >= 0; i--) {
      bits.push(((num >> i) & 1) === 1 ? '1' : '0');
    }
    return bits;
  }

  function render(value) {
    // value is a BigInt from the input; interpretation depends on `mode`.
    let bytes = [];
    let bytesCountForUnit = 0n;

    if (mode === 'bitcount') {
      // interpret `value` as a bit count
      const totalBits = BigInt(value);
      const fullBytes = totalBits / 8n; // BigInt
      const remainder = Number(totalBits % 8n);
      bytesCountForUnit = fullBytes;

      // full bytes -> fully lit (0xFF)
      for (let i = 0n; i < fullBytes; i++) bytes.push(Array(8).fill('1'));
      // partial final byte (fill MSB side for a nicer visual fill)
      if (remainder > 0) {
        const partial = Array(8).fill('0');
        for (let i = 0; i < remainder; i++) partial[i] = '1';
        bytes.push(partial);
      }
      if (bytes.length === 0) bytes.push(Array(8).fill('0'));
    } else {
      // binary mode: interpret value as an integer and show its binary groups (MSB-first)
      const n = BigInt(value);
      bytesCountForUnit = n; // treat as raw bytes count when showing unit

      // convert to binary string
      const bin = n === 0n ? '0' : n.toString(2);
      // pad left to a multiple of 8 for full bytes
      const pad = (8 - (bin.length % 8)) % 8;
      const padded = '0'.repeat(pad) + bin;
      const chunks = [];
      for (let i = 0; i < padded.length; i += 8) chunks.push(padded.slice(i, i + 8));
      // each chunk => array of '0'/'1' characters
      bytes.push(...chunks.map(ch => ch.split('')));
    }
    // (bytes was computed earlier depending on `mode`)

    // Update textual values
    // For bitcount mode show number of bytes derived from bits; for binary mode show the integer in bytes units
    valueUnit.textContent = humanizeBytes(bytesCountForUnit);

    // compute and set sizing classes based on number of bytes and container width
    adjustSizing(bytes.length);

    // now build or update DOM
    const newBitsFlat = bytes.flat().join('');
    // if we're asked to render many byte-groups, show a loader and render asynchronously
    const loader = document.getElementById('loader');

    const renderDom = () => {
      // if no existing nodes, render fresh
      if (!bitfield.dataset.rendered) {
        bitfield.innerHTML = '';
        bytes.forEach((b, idx) => {
          const byteEl = document.createElement('div');
          byteEl.className = 'byte';
          byteEl.dataset.byteIndex = idx;
          // show bits left->right
          const row = document.createElement('div');
          row.className = 'row';
          b.forEach((bit, bi) => {
            const el = document.createElement('div');
            el.className = 'bit off';
            el.dataset.bitIndex = bi;
            el.dataset.value = bit;
            row.appendChild(el);
          });
          const title = document.createElement('div');
          title.className = 'byte-title';
          // show byte index left-to-right with the first grid being byte 0 (LSB)
          title.textContent = mode === 'bitcount' ? `byte group ${idx}` : `binary group ${idx}`;
          byteEl.appendChild(row);
          byteEl.appendChild(title);
          bitfield.appendChild(byteEl);
        });
        bitfield.dataset.rendered = 'true';
        // animate initial state
        lastBits = newBitsFlat.split('');
        staggerUpdate(lastBits, {});
        if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
        return;
      }
    };

    // if not heavy, render synchronously
    if (!bitfield.dataset.rendered) {
      renderDom();
      return;
    }

    // Compare existing bits and animate changes
    const currentBitsFlat = Array.from(bitfield.querySelectorAll('.bit')).map(b => b.dataset.value || '0').join('');
    // If length differs, re-render structure for simplicity
    if (currentBitsFlat.length !== newBitsFlat.length) {
      bitfield.innerHTML = '';
      delete bitfield.dataset.rendered;
      // recursively call to re-render
      render(value);
      return;
    }

    // otherwise animate differences
    const newBitsArr = newBitsFlat.split('');
    const prevBitsArr = Array.from(bitfield.querySelectorAll('.bit')).map(b => b.dataset.value || '0');

    // update element dataset values and animate on/off
    const nodes = Array.from(bitfield.querySelectorAll('.bit'));
    nodes.forEach((el, i) => {
      el.dataset.value = newBitsArr[i];
    });

    staggerUpdate(newBitsArr, { prev: prevBitsArr });
    lastBits = newBitsArr.slice();
  }

  function staggerUpdate(newBits, { prev = [] } = {}) {
    const nodes = Array.from(bitfield.querySelectorAll('.bit'));
    const n = nodes.length || 1;
    // pick a total animation window (ms). For many nodes, keep this reasonable so per-bit delay is small.
    const totalWindow = 700; // ms
    const perBitDelay = Math.max(2, Math.floor(totalWindow / n));
    // animation duration for each dot transitions should be smaller when there are many nodes
    const bitTransitionMs = Math.max(40, Math.floor(350 * Math.min(1, 256 / n)));
    bitfield.style.setProperty('--bit-transition', `${bitTransitionMs}ms`);
    // determine random-ish delays but stable order: light up left-to-right, top-to-bottom
    nodes.forEach((el, i) => {
      const shouldOn = newBits[i] === '1';
      const wasOn = prev[i] === '1';
      // determine delay
      const delay = i * perBitDelay;
      setTimeout(() => {
        if (shouldOn && !wasOn) {
          el.classList.remove('off');
          el.classList.add('on');
        } else if (!shouldOn && wasOn) {
          // turning off uses a slightly different animation cadence
          el.classList.remove('on');
          el.classList.add('off');
        } else {
          // no change, ensure classes match
          if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
          else { el.classList.add('off'); el.classList.remove('on'); }
        }
      }, delay);
    });
  }

  function adjustSizing(byteCount) {
    // decide how cramped it is. Measure container width and estimated byte width.
    const wrap = document.getElementById('bitfield-wrap');
    const containerW = wrap.clientWidth || wrap.getBoundingClientRect().width;
    const computed = getComputedStyle(document.documentElement);
    const circle = parseFloat(computed.getPropertyValue('--circle-size')) || 36;
    const gap = parseFloat(computed.getPropertyValue('--gap')) || 10;
    // rough estimate: each byte has 8 bits + padding, but bits arranged in single row; each bit width + gaps
    const byteWidth = (circle * 8) + (7 * 6) + 40; // bit sizes + spacing + padding approx
    const totalWidth = byteCount * byteWidth;

    bitfield.classList.remove('small', 'smaller', 'scaled');

    // We need to scale the circles to fit the available width. Compute a scale factor.
    // Keep a margin so things don't touch the edges.
    const scale = Math.max(0.2, Math.min(1, (containerW * 0.85) / totalWidth));
    const newCircle = Math.max(6, Math.floor(circle * scale));
    bitfield.style.setProperty('--circle-size', `${newCircle}px`);
    bitfield.classList.add('scaled');

    // Also shrink a bit when very crowded
    if (byteCount > 120) bitfield.classList.add('small');
    if (byteCount > 480) bitfield.classList.add('smaller');
  }

  // throttle input handling slightly
  let timeoutId = null;
  input.addEventListener('input', () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const n = parseNumber(input.value);
      render(n);
    }, 140);
  });

  // keyboard stepper: arrow keys increment/decrement the numeric input
  // - ArrowUp / ArrowDown change value by 1
  // - Shift + Arrow -> change by 10
  // - Ctrl  + Arrow -> change by 100
  // - Alt   + Arrow -> change by 1000
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    // stop native cursor movement / selection changes
    e.preventDefault();

    // modifier precedence: Alt (1000) > Ctrl (100) > Shift (10) > none (1)
    const step = e.altKey ? 1000n : (e.ctrlKey ? 100n : (e.shiftKey ? 10n : 1n));
    const dir = e.key === 'ArrowUp' ? 1n : -1n;

    const current = parseNumber(input.value || '0');
    let next = current + (step * dir);
    if (next < 0n) next = 0n;
    input.value = next.toString();
    render(next);
  });

  // when user switches modes update the label and re-render
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      mode = e.target.value;
      if (inputLabel) {
        inputLabel.textContent = mode === 'bitcount' ? 'Enter bit count' : 'Enter integer';
        input.value = '0';
        input.focus();
      }
      // re-render with the new input interpretation
      const n = parseNumber(input.value);
      render(n);
    });
  }

  // initial render
  render(0n);

  // make field accept big numbers via ctrl+v paste
  input.addEventListener('paste', (e) => {
    // allow paste
    setTimeout(() => { input.dispatchEvent(new Event('input')); }, 1);
  });
})();
