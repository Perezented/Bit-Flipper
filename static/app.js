(() => {
  const bitInput = document.getElementById('number-input');
  const bitfield = document.getElementById('bitfield');
  const valueUnit = document.getElementById('value-unit');
  const modeSelect = document.getElementById('mode');
  const loader = document.getElementById('loader');

  const chunkSize = 512; // groups per chunk when chunking (for byte-level)
  const CHUNK_CELL_THRESHOLD = 100000; // total bit cells to trigger chunked rendering
  const NO_ANIM_BYTE_GROUPS = 128; // disable per-bit animation above this many byte groups

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
  (function() {
    const START = 2025;
    const now = new Date().getFullYear();
    const el = document.getElementById('copyright-year');
    if (el) el.textContent = now === START ? String(START) : `${START} - ${now}`;
  })();

  // Grouping constants (bytes)
  // We treat a "KB block" here as 1024 bytes (8192 bits).
  const GROUP_BYTES = 1024; // a KB block in our UI = 1024 bytes
  const BITS_PER_GROUP = GROUP_BYTES * 8; // 8192 bits per visual KB block
  // Make an MB-level group be 1024 KB groups (follows binary units: 1024 KB = 1 MB)
  const GROUPS_PER_LEVEL = 1024; // how many KB blocks make an MB

  function render(value) {
    // value is a BigInt from the input; interpretation depends on `mode`.
    let bytes = [];
    let bytesCountForUnit = 0n;
    // (render-level constants moved to top for consistency)

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

    // compute and set sizing classes after grouping decision below (moved)

    // now build or update DOM
    const newBitsFlat = bytes.flat().join('');
    // determine grouping for bitcount mode: if there are many bytes, show KB blocks
    const useGrouping = mode === 'bitcount' && bytes.length >= GROUP_BYTES;
    // when grouping, build KB groups (each is BITS_PER_GROUP bits, now 8192 bits)
    let kbGroups = null; // array of strings (each length BITS_PER_GROUP)
    if (useGrouping) {
      kbGroups = [];
      const totalBits = newBitsFlat.length;
      const groupCount = Math.ceil(totalBits / BITS_PER_GROUP);
      for (let gi = 0; gi < groupCount; gi++) {
        const start = gi * BITS_PER_GROUP;
        const chunk = newBitsFlat.slice(start, start + BITS_PER_GROUP);
        // pad chunk to full length for consistent UI
        kbGroups.push(chunk.padEnd(BITS_PER_GROUP, '0'));
      }
      // determine whether we should render at MB level (groups of GROUPS_PER_LEVEL KBs)
      var useMbLevel = kbGroups.length >= GROUPS_PER_LEVEL;
      var mbGroups = null;

      // If the server can help compute summaries for very large inputs (and we
      // are rendering MB-level summaries), fetch the per-KB fraction summary
      // as an optional performance optimization. The server endpoint returns
      // an array of fractions (0..1) indicating how many bits are set in each
      // KB group for the bitcount mode.
      async function tryServerSummary() {
        try {
          const res = await fetch('/api/group_summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: String(totalBits), mode: 'bitcount' })
          });
          if (!res.ok) return null;
          const body = await res.json();
          if (body && Array.isArray(body.kb_fractions)) return body.kb_fractions;
        } catch (e) { /* ignore and fallback */ }
        return null;
      }
      if (useMbLevel) {
        mbGroups = [];
        for (let i = 0; i < kbGroups.length; i += GROUPS_PER_LEVEL) mbGroups.push(kbGroups.slice(i, i + GROUPS_PER_LEVEL));
      }
    }

    // compute display count and sizing after grouping info is available
    const displayCount = useGrouping ? (useMbLevel ? mbGroups.length : kbGroups.length) : bytes.length;
    adjustSizing(displayCount, useGrouping);
    // if we already rendered something, capture the current bit string so we can
    // decide whether a full rebuild is needed (length differs) or we can update in-place
    const currentBitsFlat = bitfield.dataset.rendered ? Array.from(bitfield.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0').join('') : null;
    // If we're grouping, we'll render groups (kbGroups) instead of individual bytes
    // if we're asked to render many items (bytes or groups), show a loader and render asynchronously
    const totalCells = bytes.length * 8;
    const loader = document.getElementById('loader');
    const heavyThreshold = 180; // number of byte groups considered heavy to render
    // chunkedThreshold & chunkSize are defined at top-level
    if (!render.__token) render.__token = 0; // token to cancel in-progress chunking
    const myToken = ++render.__token;

    // Always render data (possibly via chunked renderer) so
    // the app shows visual output for all inputs.
    if (bitfield.dataset.expanded) delete bitfield.dataset.expanded;

    function renderDom() {
      // if no existing nodes, render fresh
      if (!bitfield.dataset.rendered) {
        bitfield.innerHTML = '';
        // If chunking will be used, skip appending here and delegate to the chunked path below.
        // Otherwise, append all bytes at once (fast path for smaller renders).
        // helper to append a single byte DOM
        const appendByte = (b, idx) => {
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
        };

        // helper to draw a single KB group on canvas (128×64 pixels, 8192 bits)
        // canvas is much more efficient than 8192 DOM elements
        const drawKbBlock = (canvas, chunkBits) => {
          const cols = 128;
          const rows = 64;
          const pixelSize = 1; // 1 pixel per bit
          const ctx = canvas.getContext('2d');
          canvas.width = cols * pixelSize;
          canvas.height = rows * pixelSize;

          // fill background
          ctx.fillStyle = 'rgba(0,0,0,1)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // draw bits as pixels
          ctx.fillStyle = '#00ff99'; // neon green, matching --fg
          for (let i = 0; i < BITS_PER_GROUP; i++) {
            if (chunkBits[i] === '1') {
              const row = Math.floor(i / cols);
              const col = i % cols;
              ctx.fillRect(col * pixelSize, row * pixelSize, pixelSize, pixelSize);
            }
          }
        };

        // helper to append a single KB group as a canvas element
        const appendKb = (chunkBits, idx) => {
          const el = document.createElement('div');
          el.className = 'kb-block';
          el.dataset.kbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'kb-canvas';
          canvas.dataset.kbIndex = idx;
          drawKbBlock(canvas, chunkBits);
          const title = document.createElement('div');
          title.className = 'kb-title';
          title.textContent = `KB ${idx}`;
          el.appendChild(canvas);
          el.appendChild(title);
          bitfield.appendChild(el);
        };

        // helper to draw an MB block as a 32x32 canvas where each pixel represents a KB
        const drawMbBlock = (canvas, mbArray) => {
          const cols = 32;
          const rows = 32; // 32*32 = 1024 KB tiles per MB
          const ctx = canvas.getContext('2d');
          canvas.width = cols;
          canvas.height = rows;
          // clear and paint background
          ctx.fillStyle = 'rgba(0,0,0,1)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // draw each KB entry as one pixel
          for (let i = 0; i < Math.min(mbArray.length, cols * rows); i++) {
            const v = mbArray[i];
            let frac = 0;
            if (typeof v === 'string') {
              const ones = (v.match(/1/g) || []).length;
              frac = ones / BITS_PER_GROUP;
            } else if (typeof v === 'number') {
              frac = v;
            }
            if (frac > 0) {
              const alpha = 0.04 + frac * 0.9;
              ctx.fillStyle = `rgba(0,255,120,${alpha})`;
              const row = Math.floor(i / cols);
              const col = i % cols;
              ctx.fillRect(col, row, 1, 1);
            }
          }
        };

        // helper to append an MB group DOM (collection of GROUPS_PER_LEVEL KB tiles)
        const appendMb = (mbArray, idx) => {
          const mbEl = document.createElement('div');
          mbEl.className = 'mb-block';
          mbEl.dataset.mbIndex = idx;
          const canvas = document.createElement('canvas');
          canvas.className = 'mb-canvas';
          canvas.dataset.mbIndex = idx;
          drawMbBlock(canvas, mbArray);
          const title = document.createElement('div');
          title.className = 'mb-title';
          title.textContent = `MB ${idx}`;
          mbEl.appendChild(canvas);
          mbEl.appendChild(title);
          bitfield.appendChild(mbEl);
          // animate the canvas fade-in
          canvas.style.opacity = '0';
          setTimeout(() => { canvas.style.transition = 'opacity 280ms ease'; canvas.style.opacity = '1'; }, 12);
        };

        if (useGrouping) {
          // determine MB-level grouping (each MB = GROUPS_PER_LEVEL KB groups)
          const useMbLevel = kbGroups.length >= GROUPS_PER_LEVEL;
          if (!useMbLevel) {
            // append KB groups directly when not chunking
            if (totalCells < CHUNK_CELL_THRESHOLD) kbGroups.forEach((b, idx) => appendKb(b, idx));
          } else {
            // build MB groups (each MB contains up to GROUPS_PER_LEVEL KB groups)
            const mbGroups = [];
            for (let i = 0; i < kbGroups.length; i += GROUPS_PER_LEVEL) mbGroups.push(kbGroups.slice(i, i + GROUPS_PER_LEVEL));
            if (totalCells < CHUNK_CELL_THRESHOLD) {
              // Try to use server-side per-KB fractions to drive MB tiles;
              // fall back to the detailed MB groups if none available.
              tryServerSummary().then((kbFractions) => {
                if (kbFractions && kbFractions.length === kbGroups.length) {
                  const mbFracs = [];
                  for (let i = 0; i < kbFractions.length; i += GROUPS_PER_LEVEL) mbFracs.push(kbFractions.slice(i, i + GROUPS_PER_LEVEL));
                  mbFracs.forEach((mbf, mIdx) => appendMb(mbf, mIdx));
                } else {
                  mbGroups.forEach((mb, mIdx) => appendMb(mb, mIdx));
                }
              }).catch(() => { mbGroups.forEach((mb, mIdx) => appendMb(mb, mIdx)); });
            }
          }
        } else if (totalCells < CHUNK_CELL_THRESHOLD) {
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
        }

        // chunked rendering for very large counts / groups
        // decide effective chunk size depending on grouping and level
        let effectiveChunkSize;
        const totalItems = useGrouping ? (useMbLevel ? mbGroups.length : kbGroups.length) : bytes.length;
        if (useGrouping) {
          effectiveChunkSize = useMbLevel ? 2 : 8; // add only a few KBs or MBs per chunk
        } else {
          effectiveChunkSize = chunkSize;
        }
        if (totalCells >= CHUNK_CELL_THRESHOLD) {
          bitfield.innerHTML = '';
          let appended = 0;
          let chunkIdx = 0;
          const totalChunks = Math.ceil(totalItems / effectiveChunkSize);

          const appendChunk = () => {
            if (render.__token !== myToken) return; // aborted
            const start = chunkIdx * effectiveChunkSize;
            const end = Math.min(totalItems, start + effectiveChunkSize);
            for (let idx = start; idx < end; idx++) {
              if (useGrouping) {
                if (useMbLevel) appendMb(mbGroups[idx], idx);
                else appendKb(kbGroups[idx], idx);
              } else {
                appendByte(bytes[idx], idx);
              }
            }
            appended += (end - start);
            chunkIdx++;
            if (loader) loader.querySelector('.loader-label').textContent = `Rendering… ${Math.round(appended / totalItems * 100)}%`;

            // animate the freshly added slice using a small, quick animation window
            // for chunked append animate the newly added nodes
            if (useGrouping) {
              if (useMbLevel) {
                const canvases = Array.from(bitfield.querySelectorAll('.mb-canvas')).slice(start, end);
                if (canvases.length) canvases.forEach(c => { c.style.opacity = '0'; setTimeout(() => c.style.opacity = '1', 6); });
              } else {
                // KB-level canvas animations: fade in the freshly added canvases
                const canvases = Array.from(bitfield.querySelectorAll('.kb-canvas')).slice(start, end);
                if (canvases.length) canvases.forEach(c => { c.style.opacity = '0'; setTimeout(() => c.style.opacity = '1', 6); });
              }
            } else {
              const sliceStart = start * 8;
              const sliceEnd = end * 8;
              const sliceNodes = Array.from(bitfield.querySelectorAll('.bit, .cell')).slice(sliceStart, sliceEnd);
              if (sliceNodes.length) animateNodesQuick(sliceNodes, 6, 2);
            }

            if (end < totalItems) {
              setTimeout(appendChunk, 12);
            } else {
              // finished
              bitfield.dataset.rendered = 'true';
              lastBits = Array.from(bitfield.querySelectorAll('.bit, .cell')).map(n => n.dataset.value || '0');
              if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
            }
          };

          setTimeout(appendChunk, 24);
          return;
        }

        // default non-chunked behavior
        bitfield.dataset.rendered = 'true';
        // animate initial state
        lastBits = newBitsFlat.split('');
        staggerUpdate(lastBits, {});
        if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
        return;
      }
    };

    // Decide how to schedule rendering
    if (totalCells >= CHUNK_CELL_THRESHOLD) {
      // if we already have the DOM and the flat bit length matches, this is an in-place update
      if (bitfield.dataset.rendered && currentBitsFlat !== null && currentBitsFlat.length === newBitsFlat.length) {
        // update element dataset values and animate differences
        const newBitsArr = newBitsFlat.split('');
        const prevBitsArr = Array.from(bitfield.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0');
        const nodes = Array.from(bitfield.querySelectorAll('.bit, .cell'));
        nodes.forEach((el, i) => { el.dataset.value = newBitsArr[i]; });
        staggerUpdate(newBitsArr, { prev: prevBitsArr });
        lastBits = newBitsArr.slice();
        return;
      }

      // otherwise we need to rebuild using chunked rendering — show loader and start render
      if (loader) { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); loader.querySelector('.loader-label').textContent = 'Rendering… 0%'; }
      // clear any prior rendered flag so renderDom will construct fresh
      delete bitfield.dataset.rendered;
      renderDom();
      return;
    }

    // if it's heavy but not chunked, try to update in-place when possible, otherwise rebuild
    if (bytes.length >= heavyThreshold) {
      if (bitfield.dataset.rendered && currentBitsFlat !== null && currentBitsFlat.length === newBitsFlat.length) {
        // same structure, just update values
        const newBitsArr = newBitsFlat.split('');
        const prevBitsArr = Array.from(bitfield.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0');
        const nodes = Array.from(bitfield.querySelectorAll('.bit, .cell'));
        nodes.forEach((el, i) => { el.dataset.value = newBitsArr[i]; });
        staggerUpdate(newBitsArr, { prev: prevBitsArr });
        lastBits = newBitsArr.slice();
        return;
      }

      if (loader) { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); }
      // clear any prior rendered flag so renderDom will construct fresh
      delete bitfield.dataset.rendered;
      setTimeout(renderDom, 30);
      return;
    }

    // if not heavy, render synchronously
    if (!bitfield.dataset.rendered) {
      renderDom();
      return;
    }

    // Compare existing bits and animate changes
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
    const prevBitsArr = Array.from(bitfield.querySelectorAll('.bit, .cell')).map(b => b.dataset.value || '0');

    // update element dataset values and animate on/off
    const nodes = Array.from(bitfield.querySelectorAll('.bit, .cell'));
    nodes.forEach((el, i) => {
      el.dataset.value = newBitsArr[i];
    });

    staggerUpdate(newBitsArr, { prev: prevBitsArr });
    lastBits = newBitsArr.slice();
  }

  // wire cancel button to abort long renders
  const cancelBtn = document.getElementById('cancel-render');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (!render.__token) render.__token = 0;
      // increment token to cancel any in-progress chunking
      render.__token++;
      // hide loader
      if (loader) { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }
      // provide some visual feedback in the loader label
      if (loader) {
        const groupsRendered = bitfield.querySelectorAll('.byte, .kb-block, .mb-block').length;
        loader.querySelector('.loader-label').textContent = `Render cancelled — ${groupsRendered.toLocaleString()} groups rendered`;
        // keep the message briefly visible, then hide loader
        setTimeout(() => { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }, 900);
      }
    });
  }

  // wire the mobile step buttons
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget;
      const step = BigInt(Number(el.getAttribute('data-step') || '1'));
      const action = el.getAttribute('data-action');
      const current = parseNumber(bitInput.value || '0');
      let next = action === 'decrement' ? current - step : current + step;
      if (next < 0n) next = 0n;
      bitInput.value = next.toString();
      render(next);
    });
  });

  function staggerUpdate(newBits, { prev = [] } = {}) {
    const nodes = Array.from(bitfield.querySelectorAll('.bit, .cell'));
    const currentByteGroups = Math.ceil(nodes.length / 8);

    // If we are showing many byte groups, disable per-bit staggered animations
    // and just apply classes directly for performance.
    if (currentByteGroups >= NO_ANIM_BYTE_GROUPS) {
      bitfield.classList.add('no-anim');
      nodes.forEach((el, i) => {
        const shouldOn = newBits[i] === '1';
        if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
        else { el.classList.add('off'); el.classList.remove('on'); }
        el.dataset.value = newBits[i];
      });
      return;
    }
    // otherwise ensure no-anim removed
    bitfield.classList.remove('no-anim');
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

  // Animate a specific list of existing DOM bit nodes quickly (used for chunked rendering)
  function animateNodesQuick(bitEls, startDelay = 0, perDelay = 4) {
    const quickNoAnim = Math.ceil(bitEls.length / 8) >= NO_ANIM_BYTE_GROUPS || bitfield.classList.contains('no-anim');
    bitEls.forEach((el, i) => {
      const shouldOn = (el.dataset.value || '0') === '1';
      if (quickNoAnim) {
        // directly apply final state for performance
        if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
        else { el.classList.add('off'); el.classList.remove('on'); }
      } else {
        setTimeout(() => {
          if (shouldOn) { el.classList.add('on'); el.classList.remove('off'); }
          else { el.classList.add('off'); el.classList.remove('on'); }
        }, startDelay + (i * perDelay));
      }
    });
  }

  function adjustSizing(byteCount, isGrouped = false) {
    // decide how cramped it is. Measure container width and estimated byte width.
    const wrap = document.getElementById('bitfield-wrap');
    const containerW = wrap.clientWidth || wrap.getBoundingClientRect().width;
    const computed = getComputedStyle(document.documentElement);
    const circle = parseFloat(computed.getPropertyValue('--circle-size')) || 36;
    const gap = parseFloat(computed.getPropertyValue('--gap')) || 10;
    // rough estimate: each byte has 8 bits + padding, but bits arranged in single row; each bit width + gaps
    let byteWidth;
    if (isGrouped) {
      // approximate KB-block width (matches .kb-grid width + container padding)
      byteWidth = 260 + 24; // grid + some padding
    } else {
      byteWidth = (circle * 8) + (7 * 6) + 40; // bit sizes + spacing + padding approx
    }
    const totalWidth = byteCount * byteWidth;

    bitfield.classList.remove('small', 'smaller', 'tiny', 'tinier', 'scaled');

    // We need to scale the circles to fit the available width. Compute a scale factor.
    // Keep a margin so things don't touch the edges.
    const scale = Math.max(0.2, Math.min(1, (containerW * 0.85) / totalWidth));
    const newCircle = Math.max(6, Math.floor(circle * scale));
    bitfield.style.setProperty('--circle-size', `${newCircle}px`);
    bitfield.classList.add('scaled');
    // Also shrink a bit when very crowded
    if (byteCount > 32) bitfield.classList.add('small');
    if (byteCount > 64) bitfield.classList.add('smaller');
  }

  // throttle input handling slightly
  let timeoutId = null;
  bitInput.addEventListener('input', () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const n = parseNumber(bitInput.value);
      render(n);
    }, 140);
  });

  // keyboard stepper: arrow keys increment/decrement the numeric input
  // - ArrowUp / ArrowDown change value by 1
  // - Shift + Arrow -> change by 10
  // - Ctrl  + Arrow -> change by 100
  // - Alt   + Arrow -> change by 1000
  bitInput.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    // stop native cursor movement / selection changes
    e.preventDefault();

    // modifier precedence: Alt (1000) > Ctrl (100) > Shift (10) > none (1)
    const step = e.altKey ? 1000n : (e.ctrlKey ? 100n : (e.shiftKey ? 10n : 1n));
    const dir = e.key === 'ArrowUp' ? 1n : -1n;

    const current = parseNumber(bitInput.value || '0');
    let next = current + (step * dir);
    if (next < 0n) next = 0n;
    bitInput.value = next.toString();
    render(next);
  });

  // when user switches modes update the label and re-render
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      mode = e.target.value;
      if (inputLabel) {
        inputLabel.textContent = mode === 'bitcount' ? 'Enter bit count' : 'Enter integer';
        bitInput.value = '255';
        bitInput.focus();
      }
      // re-render with the new input interpretation
      const n = parseNumber(bitInput.value);
      render(n);
    });
  }

  // initial render
  render(0n);

  // make field accept big numbers via ctrl+v paste
  bitInput.addEventListener('paste', (e) => {
    // allow paste
    setTimeout(() => { bitInput.dispatchEvent(new Event('input')); }, 1);
  });
})();
